const mongoose = require('mongoose');
const ReadingProgress = require('../models/ReadingProgress');
const Episode = require('../models/Episode');
const Series = require('../models/Series');

/**
 * Regras de progresso e do carrossel "Continuar", isoladas do Express para
 * poderem ser testadas direto.
 */

/** Aplica os dados novos sobre um documento já existente (roda o hook de validação). */
async function aplicarEsalvar(doc, { seriesId, contentType, percent, position }) {
  doc.seriesId = seriesId;
  doc.contentType = contentType;
  doc.percent = percent;
  doc.position = position;
  await doc.save();
  return doc;
}

/** Salva (ou atualiza) o progresso de um episódio para a identidade dada. */
async function saveProgress(identity, dados) {
  const { seriesId, episodeId, contentType, percent, position = 0 } = dados;

  if (typeof percent !== 'number' || percent < 0 || percent > 1) {
    const err = new Error('percent deve ser um número entre 0 e 1.');
    err.status = 400;
    throw err;
  }
  if (!seriesId || !episodeId || !contentType) {
    const err = new Error('seriesId, episodeId e contentType são obrigatórios.');
    err.status = 400;
    throw err;
  }
  // Formato inválido de ObjectId vira CastError do Mongoose (sem .status, sem
  // ValidationError) — barramos aqui para responder 400, igual ao padrão já
  // usado em routes/favorites.js.
  if (!mongoose.Types.ObjectId.isValid(seriesId) || !mongoose.Types.ObjectId.isValid(episodeId)) {
    const err = new Error('seriesId ou episodeId inválido.');
    err.status = 400;
    throw err;
  }

  // upsert manual: precisamos do hook de validação, que roda no save()/create() e
  // é quem calcula `completed` e garante a regra de identidade única.
  const doc = await ReadingProgress.findOne({ ...identity, episodeId });
  if (doc) {
    return aplicarEsalvar(doc, { seriesId, contentType, percent, position });
  }

  try {
    return await ReadingProgress.create({ ...identity, seriesId, episodeId, contentType, percent, position });
  } catch (err) {
    // Corrida: outro PUT quase simultâneo (player que salva periodicamente, duas
    // abas ou dois aparelhos) criou o mesmo documento entre o nosso findOne e o
    // nosso create — os índices únicos parciais do modelo barram com E11000. O
    // progresso não pode se perder aqui: buscamos o documento que o concorrente
    // acabou de criar e aplicamos nossa atualização por cima dele.
    if (err.code === 11000) {
      const concorrente = await ReadingProgress.findOne({ ...identity, episodeId });
      if (concorrente) {
        return aplicarEsalvar(concorrente, { seriesId, contentType, percent, position });
      }
    }
    throw err;
  }
}

const DIAS_DE_PODA = 90;
const TETO_DO_CARROSSEL = 20;
const VCINE_MIN = 0.1;
const VCINE_MAX = 0.9;

/**
 * Monta o carrossel "Continuar" aplicando, nesta ordem:
 *  1. descarta o que está parado há mais de 90 dias
 *  2. mantém uma linha por obra — a de atualização mais recente
 *  3. no VCine, só o que está entre 10% e 90% (vídeo curto é consumo de rolagem)
 *  4. remove a obra cujo último episódio publicado já foi concluído
 *  5. corta em 20 obras
 */
async function buildContinueList(identity) {
  const corte = new Date(Date.now() - DIAS_DE_PODA * 24 * 60 * 60 * 1000);

  // aggregate() não faz cast automático de string para ObjectId como find()
  // faz. O userId chega como string do JWT (req.user.id) — sem converter, o
  // $match abaixo não casaria com nada e a lista voltaria vazia, em
  // silêncio. O anonymousId já é string por natureza e vai direto.
  const filtroIdentidade = identity.userId
    ? { userId: new mongoose.Types.ObjectId(String(identity.userId)) }
    : { anonymousId: identity.anonymousId };

  // Uma linha por obra — a mais recente —, deduplicada dentro do próprio
  // Mongo antes de qualquer limite. Feito em JS depois de um find().limit(N),
  // o limite contaria linhas de progresso, não obras: um usuário que releu
  // dezenas de capítulos de uma única série (muitas linhas recentes) podia
  // empurrar para fora uma segunda obra com só 1 linha, porém ainda dentro da
  // janela de poda. Agrupando antes de limitar, o teto passa a contar obras.
  const porObra = await ReadingProgress.aggregate([
    { $match: { ...filtroIdentidade, updatedAt: { $gte: corte } } },
    { $sort: { updatedAt: -1 } },
    { $group: { _id: '$seriesId', linha: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$linha' } },
    { $sort: { updatedAt: -1 } },
    { $limit: 100 }, // folga confortável sobre o teto de 20 (regra 5)
  ]);

  const candidatas = porObra.filter(linha => {
    if (linha.contentType !== 'vcine') return true;
    return linha.percent >= VCINE_MIN && linha.percent <= VCINE_MAX;
  });
  if (candidatas.length === 0) return [];

  const idsDasObras = candidatas.map(l => new mongoose.Types.ObjectId(String(l.seriesId)));

  // Último episódio de cada obra, em uma consulta só (evita N+1).
  const ultimos = await Episode.aggregate([
    { $match: { seriesId: { $in: idsDasObras } } },
    { $sort: { episode_number: -1 } },
    { $group: { _id: '$seriesId', ultimoId: { $first: '$_id' } } },
  ]);
  const ultimoPorObra = new Map(ultimos.map(u => [String(u._id), String(u.ultimoId)]));

  const series = await Series.find({ _id: { $in: idsDasObras } })
    .select('title cover_image content_type')
    .lean();
  const obraPorId = new Map(series.map(s => [String(s._id), s]));

  const resultado = [];
  for (const linha of candidatas) {
    const chave = String(linha.seriesId);
    const terminouOUltimo = linha.completed && ultimoPorObra.get(chave) === String(linha.episodeId);
    if (terminouOUltimo) continue;

    const obra = obraPorId.get(chave);
    if (!obra) continue; // obra removida do catálogo

    resultado.push({ ...linha, series: obra });
    if (resultado.length >= TETO_DO_CARROSSEL) break;
  }

  return resultado;
}

/**
 * Funde o documento do visitante com o da conta que já existe para o mesmo
 * episódio: vence o MAIOR percentual (ver docstring de claimAnonymousProgress).
 * Quando o visitante vence, `.save()` roda para o hook recalcular `completed`.
 * O documento do visitante é sempre removido ao final, tenha vencido ou não.
 */
async function fundirNoExistente(visitante, existente) {
  if (visitante.percent > existente.percent) {
    existente.percent = visitante.percent;
    existente.position = visitante.position;
    await existente.save(); // recalcula `completed` no hook
  }
  await ReadingProgress.deleteOne({ _id: visitante._id });
}

/**
 * Transfere o histórico do visitante para a conta, no cadastro ou no login.
 *
 * Episódio que só o visitante tem é reatribuído (não duplicado). Episódio que os
 * dois têm é fundido pelo MAIOR percentual — e não pela data mais recente: quem
 * leu bastante no celular ontem e abriu o app no computador hoje sem ler nada não
 * pode perder o avanço.
 *
 * Idempotente: rodar de novo com o mesmo identificador não muda mais nada.
 */
async function claimAnonymousProgress(userId, anonymousId) {
  const doVisitante = await ReadingProgress.find({ anonymousId }).lean();
  if (doVisitante.length === 0) return { movidos: 0, fundidos: 0 };

  const daConta = await ReadingProgress.find({
    userId,
    episodeId: { $in: doVisitante.map(d => d.episodeId) },
  });
  const contaPorEpisodio = new Map(daConta.map(d => [String(d.episodeId), d]));

  let movidos = 0;
  let fundidos = 0;

  for (const visitante of doVisitante) {
    const existente = contaPorEpisodio.get(String(visitante.episodeId));

    if (existente) {
      await fundirNoExistente(visitante, existente);
      fundidos++;
      continue;
    }

    try {
      await ReadingProgress.updateOne(
        { _id: visitante._id },
        { $set: { userId }, $unset: { anonymousId: '' } },
      );
      movidos++;
    } catch (err) {
      // Corrida: `daConta` foi lido de uma vez no início, mas a escrita de cada
      // item acontece depois, num laço — se entre o snapshot e este updateOne
      // um concorrente (ex.: um PUT /api/me/progress da própria conta quase ao
      // mesmo tempo do cadastro) criar o documento {userId, episodeId} para
      // este mesmo episódio, o índice único parcial barra a reatribuição com
      // E11000. Mesma classe de corrida que saveProgress já trata: buscamos o
      // concorrente e tratamos como fusão genuína, sem abortar os itens já
      // processados nem devolver 500 com contadores perdidos.
      if (err.code === 11000) {
        const concorrente = await ReadingProgress.findOne({ userId, episodeId: visitante.episodeId });
        if (concorrente) {
          await fundirNoExistente(visitante, concorrente);
          fundidos++;
          continue;
        }
      }
      throw err;
    }
  }

  return { movidos, fundidos };
}

module.exports = { saveProgress, buildContinueList, claimAnonymousProgress };
