const mongoose = require('mongoose');

/** Acima disso o episódio conta como concluído (créditos e rodapé fazem quase
 *  ninguém chegar aos 100%). */
const COMPLETED_THRESHOLD = 0.9;

/**
 * Progresso de leitura/reprodução — um documento por (identidade, episódio).
 *
 * Identidade é `userId` OU `anonymousId`, nunca os dois: o visitante sem conta
 * também acumula progresso, e no cadastro esses documentos são reatribuídos à
 * conta (ver services/progressService.claimAnonymousProgress).
 */
const ReadingProgressSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  anonymousId: { type: String },
  seriesId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episodeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Episode', required: true },
  contentType: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  position:    { type: Number, default: 0, min: 0 },
  percent:     { type: Number, required: true, min: 0, max: 1 },
  completed:   { type: Boolean, default: false },
}, { timestamps: true });

ReadingProgressSchema.pre('validate', function (next) {
  const temUsuario = Boolean(this.userId);
  const temVisitante = Boolean(this.anonymousId);
  if (temUsuario === temVisitante) {
    return next(new Error('Informe userId OU anonymousId — nunca os dois, nunca nenhum.'));
  }
  this.completed = this.percent >= COMPLETED_THRESHOLD;
  next();
});

// Um registro por episódio para cada identidade. partialFilterExpression (e não
// sparse) porque o índice é composto: sparse só ignoraria o documento sem
// nenhum dos dois campos.
ReadingProgressSchema.index(
  { userId: 1, episodeId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
ReadingProgressSchema.index(
  { anonymousId: 1, episodeId: 1 },
  { unique: true, partialFilterExpression: { anonymousId: { $exists: true } } },
);

// Carrossel
ReadingProgressSchema.index({ userId: 1, updatedAt: -1 });
ReadingProgressSchema.index({ anonymousId: 1, updatedAt: -1 });
ReadingProgressSchema.index({ userId: 1, seriesId: 1, updatedAt: -1 });

// LGPD: progresso de visitante expira em 180 dias sem uso. Conta não expira —
// quem apaga é o usuário, pelo Centro de Privacidade.
ReadingProgressSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 180 * 24 * 60 * 60,
    partialFilterExpression: { anonymousId: { $exists: true } },
  },
);

module.exports = mongoose.model('ReadingProgress', ReadingProgressSchema);
