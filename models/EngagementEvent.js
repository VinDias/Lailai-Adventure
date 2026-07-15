const mongoose = require('mongoose');

/**
 * Log APPEND-ONLY com cadeia de hash — base auditável do Motor de Royalties.
 *
 * NUNCA edite ou delete documentos desta coleção: cada evento carrega o hash
 * do anterior (prevHash) e a rota admin de verificação re-percorre a cadeia —
 * qualquer alteração quebra a verificação a partir daquele seq.
 *
 * Eventos fraudulentos são marcados com flagged/flagReason e permanecem NO
 * log (auditoria), mas ficam FORA do cálculo de royalties.
 *
 * LGPD: IP e User-Agent são pseudonimizados (sha256 + salt) antes de gravar.
 */
const EngagementEventSchema = new mongoose.Schema({
  seq: { type: Number, required: true, unique: true },
  type: { type: String, enum: ['view', 'read', 'ad_impression', 'ad_click'], required: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
  episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Episode' },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ipHash: { type: String, default: '' },
  uaHash: { type: String, default: '' },
  flagged: { type: Boolean, default: false },
  flagReason: { type: String, default: '' },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
  createdAt: { type: Date, required: true }
});

// Consultas do anti-fraude e do relatório
EngagementEventSchema.index({ episodeId: 1, type: 1, createdAt: -1 });
EngagementEventSchema.index({ ipHash: 1, createdAt: -1 });
EngagementEventSchema.index({ type: 1, flagged: 1, createdAt: -1 });

module.exports = mongoose.model('EngagementEvent', EngagementEventSchema);
