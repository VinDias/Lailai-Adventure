const mongoose = require('mongoose');
const ReadingProgress = require('../models/ReadingProgress');

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

module.exports = { saveProgress };
