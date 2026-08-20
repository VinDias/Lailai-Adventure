const mongoose = require('mongoose');

/**
 * Inscrição de push de UM aparelho de UM usuário (vários aparelhos = vários
 * documentos). Sem TTL: endpoint morto (404/410 no envio) é removido na hora
 * pelo notificationService.
 */
const PushSubscriptionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
}, { timestamps: true });

PushSubscriptionSchema.index({ userId: 1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
