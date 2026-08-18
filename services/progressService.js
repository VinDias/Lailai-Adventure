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

/**
 * Progresso de UM episódio específico, sem nenhuma das regras do carrossel
 * "Continuar" (poda de 90 dias, uma linha por obra, filtro de VCine, teto de
 * 20 obras, remoção de obra concluída). Usado pela restauração de "onde
 * parei" no leitor/player: `buildContinueList` é deliberadamente lossy — pra
 * caber num carrossel — e por isso não serve para essa pergunta, que é sobre
 * um episódio só.
 *
 * Devolve a linha crua (`.lean()`) ou `null` quando não há progresso salvo.
 */
async function getProgressForEpisode(identity, episodeId) {
  if (!mongoose.Types.ObjectId.isValid(episodeId)) return null;
  const doc = await ReadingProgress.findOne({ ...identity, episodeId }).lean();
  return doc || null;
}

const DIAS_DE_PODA = 90;
const TETO_DO_CARROSSEL = 20;
const VCINE_MIN = 0.1;
const VCINE_MAX = 0.9;
const TIPOS_VALIDOS = ['hqcine', 'vcine', 'hiqua'];

/**
 * Monta o carrossel "Continuar" aplicando, nesta ordem:
 *  1. descarta o que está parado há mais de 90 dias
 *  2. mantém uma linha por obra — a de atualização mais recente
 *  3. no VCine, só o que está entre 10% e 90% (vídeo curto é consumo de rolagem)
 *  4. remove a obra cujo último episódio publicado já foi concluído
 *  5. corta em 20 obras
 *
 * `contentType`, se informado, filtra por aba ANTES do agrupamento — o teto
 * de 20 (regra 5) passa a valer só dentro daquele tipo. Sem isso, um usuário
 * com 20+ obras em andamento numa aba via as outras abas vazias: o teto
 * global era ocupado inteiro por um só tipo de conteúdo antes do cliente
 * filtrar (o que ele fazia depois, localmente).
 */
async function buildContinueList(identity, contentType) {
  const corte = new Date(Date.now() - DIAS_DE_PODA * 24 * 60 * 60 * 1000);

  // aggregate() não faz cast automático de string para ObjectId como find()
  // faz. O userId chega como string do JWT (req.user.id) — sem converter, o
  // $match abaixo não casaria com nada e a lista voltaria vazia, em
  // silêncio. O anonymousId já é string por natureza e vai direto.
  const filtroIdentidade = identity.userId
    ? { userId: new mongoose.Types.ObjectId(String(identity.userId)) }
    : { anonymousId: identity.anonymousId };
  // Achado da re-revisão (segurança): `contentType` vem cru de req.query e ia
  // direto para dentro do $match. Com o query parser 'extended' do Express
  // (padrão, não trocado em server.js), `?contentType[$ne]=hiqua` chega como
  // OBJETO — {'$ne': 'hiqua'} — e um valor assim, sem checagem, vira operador
  // Mongo dentro do aggregate (o `sanitizeMongo` global cobre req.query, mas
  // uma whitelist aqui não depende disso: mesmo sem ele, `.includes()` contra
  // um objeto nunca dá match). Só os 3 tipos válidos passam; qualquer outra
  // coisa (string sem sentido, objeto, array) é tratada como "sem filtro" —
  // mesmo comportamento de contentType ausente, em vez de devolver lista
  // vazia em silêncio (valor de string inválida) ou, pior, repassar um
  // operador ao banco.
  const filtroTipo = TIPOS_VALIDOS.includes(contentType) ? { contentType } : {};

  // Uma linha por obra — a mais recente —, deduplicada dentro do próprio
  // Mongo antes de qualquer limite. Feito em JS depois de um find().limit(N),
  // o limite contaria linhas de progresso, não obras: um usuário que releu
  // dezenas de capítulos de uma única série (muitas linhas recentes) podia
  // empurrar para fora uma segunda obra com só 1 linha, porém ainda dentro da
  // janela de poda. Agrupando antes de limitar, o teto passa a contar obras.
  const porObra = await ReadingProgress.aggregate([
    { $match: { ...filtroIdentidade, ...filtroTipo, updatedAt: { $gte: corte } } },
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

  // Episódio DA PRÓPRIA linha (não o último da obra, que é a consulta acima):
  // é o que alimenta o rótulo "Cap. 2" / "Ep. 2" do carrossel. Em uma consulta
  // só para todas as candidatas (evita N+1 dentro do laço abaixo, mesmo padrão
  // da consulta de `ultimos`). find() casta string para ObjectId sozinho, ao
  // contrário do aggregate() usado acima.
  const episodiosDasLinhas = await Episode.find({ _id: { $in: candidatas.map(l => l.episodeId) } })
    .select('episode_number')
    .lean();
  const episodioPorId = new Map(
    episodiosDasLinhas.map(e => [String(e._id), { episode_number: e.episode_number }]),
  );

  // isPublished: true — despublicar é a alavanca de emergência do cliente
  // (pedido de terceiros, direitos, conteúdo problemático); sem esse filtro
  // a obra continuava aparecendo (e abrindo de verdade) no "Continuar",
  // inconsistente com o catálogo (routes/content.js) e os favoritos
  // (routes/favorites.js), que já filtram por isPublished.
  const series = await Series.find({ _id: { $in: idsDasObras }, isPublished: true })
    .select('title cover_image content_type')
    .lean();
  const obraPorId = new Map(series.map(s => [String(s._id), s]));

  const resultado = [];
  for (const linha of candidatas) {
    const chave = String(linha.seriesId);
    const chaveEpisodio = String(linha.episodeId);
    const terminouOUltimo = linha.completed && ultimoPorObra.get(chave) === chaveEpisodio;
    if (terminouOUltimo) continue;

    const obra = obraPorId.get(chave);
    if (!obra) continue; // obra removida do catálogo

    // Dado órfão (episódio apagado depois do progresso salvo): a linha
    // continua no carrossel — só o rótulo omite o capítulo, em vez de a obra
    // inteira sumir por causa de um episódio que não existe mais.
    const episodio = episodioPorId.get(chaveEpisodio) || null;

    resultado.push({ ...linha, series: obra, episode: episodio });
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
      // { timestamps: false }: sem isso, o schema (`{ timestamps: true }`)
      // carimba `updatedAt: now` em TODA linha migrada, apagando a data
      // original de cada uma. Como `buildContinueList` ordena por
      // `updatedAt` pra escolher a linha mais recente de cada obra, todas as
      // linhas migradas empatando na mesma "agora" faz o Mongo escolher
      // arbitrariamente entre elas — o "Continuar" podia apontar pro
      // capítulo 1 de quem já tinha lido até o 7 antes de criar a conta.
      await ReadingProgress.updateOne(
        { _id: visitante._id },
        { $set: { userId }, $unset: { anonymousId: '' } },
        { timestamps: false },
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

module.exports = { saveProgress, getProgressForEpisode, buildContinueList, claimAnonymousProgress };
