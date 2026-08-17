const ReadingProgress = require('../models/ReadingProgress');

/**
 * Regras de progresso e do carrossel "Continuar", isoladas do Express para
 * poderem ser testadas direto.
 */

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

  // upsert manual: precisamos do hook de validação, que roda no save() e é quem
  // calcula `completed` e garante a regra de identidade única.
  const doc = await ReadingProgress.findOne({ ...identity, episodeId });
  if (doc) {
    doc.seriesId = seriesId;
    doc.contentType = contentType;
    doc.percent = percent;
    doc.position = position;
    await doc.save();
    return doc;
  }
  return ReadingProgress.create({ ...identity, seriesId, episodeId, contentType, percent, position });
}

module.exports = { saveProgress };
