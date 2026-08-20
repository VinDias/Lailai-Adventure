const mongoose = require('mongoose');

/**
 * Registro de apoio direto ao autor via Super Reader (Fase 4, Bloco 3).
 * Criado SÓ no webhook do Stripe (checkout.session.completed com
 * metadata.tipo === 'super_reader') — sessão criada != pagamento feito, e o
 * webhook é o único ponto que o Stripe garante após o pagamento de fato.
 * A divisão 80/20 é calculada e CONGELADA aqui (authorShareCents/
 * platformShareCents): mudar a regra no futuro não reescreve o passado.
 * Separado do pool mensal de royalties (RoyaltyPeriod) — não entra nele.
 */
const SuperReaderContributionSchema = new mongoose.Schema({
  // null = contribuição anonimizada (exclusão de conta, LGPD). O registro
  // contábil do relatório de royalties permanece; sem o vínculo pessoal,
  // deixa de ser dado pessoal.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  // Canal do autor no momento do apoio — congelado (Series.channelId pode
  // mudar depois; o relatório soma por este campo, não pelo atual da série).
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  amountCents: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['brl', 'usd', 'eur'] },
  authorShareCents: { type: Number, required: true },   // 80% congelado
  platformShareCents: { type: Number, required: true }, // o resto (20%)
  stripeSessionId: { type: String, required: true, unique: true },
  period: { type: String, required: true }, // 'YYYY-MM' — mês do PAGAMENTO (webhook)
}, { timestamps: true });

// Soma do relatório admin por canal/período (RoyaltiesPanel, seção Super Reader).
SuperReaderContributionSchema.index({ channelId: 1, period: 1 });
// Lista de contribuições do próprio usuário (GET /api/superreader/me).
SuperReaderContributionSchema.index({ userId: 1 });

module.exports = mongoose.model('SuperReaderContribution', SuperReaderContributionSchema);
