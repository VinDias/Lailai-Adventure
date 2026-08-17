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

  const linhas = await ReadingProgress.find({ ...identity, updatedAt: { $gte: corte } })
    .sort({ updatedAt: -1 })
    .limit(200) // teto de segurança antes do agrupamento
    .lean();

  const porObra = new Map();
  for (const linha of linhas) {
    const chave = String(linha.seriesId);
    if (!porObra.has(chave)) porObra.set(chave, linha);
  }

  const candidatas = [...porObra.values()].filter(linha => {
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

module.exports = { saveProgress, buildContinueList };
