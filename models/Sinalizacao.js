const mongoose = require('mongoose');
const { MOTIVOS, DESCRICAO_MAX, ehGrave } = require('../utils/curadoriaLimiares');

/**
 * Sinalização de um leitor sobre uma OBRA (Fase 5 Bloco 3). Regra 5 do Vin:
 * uma conta = uma sinalização por obra (unique abaixo). `valida` é decidido
 * na escrita (consumo real p/ motivo normal; graves sempre válidas);
 * `contaCriadaEm` é snapshot de User.createdAt para a idade mínima ser
 * aplicada NA AVALIAÇÃO sem join. `ipHash` é o mesmo pseudonymize do
 * engagementLogger — só vira contagem agregada (ipsDistintos) na fila do
 * admin, nunca sai de lá. `revisadaEm` fecha o ciclo: sinalização revisada
 * não conta mais (a obra volta a acumular do zero).
 */
const SinalizacaoSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  motivo: { type: String, enum: MOTIVOS, required: true },
  grave: { type: Boolean, required: true },
  descricao: { type: String, maxlength: DESCRICAO_MAX, default: null },
  valida: { type: Boolean, required: true },
  invalidaMotivo: { type: String, enum: ['sem_consumo', 'abuso', null], default: null },
  contaCriadaEm: { type: Date, required: true },
  ipHash: { type: String, default: '' },
  revisadaEm: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

SinalizacaoSchema.index({ userId: 1, seriesId: 1 }, { unique: true });
// Contagens por obra (S, S_grave, semConsumo) e o updateMany de revisadaEm
// ao fechar um caso — sem isto cada avaliação varreria a coleção inteira.
SinalizacaoSchema.index({ seriesId: 1, revisadaEm: 1, valida: 1 });

// `grave` é DERIVADO do motivo (spec rev.3, decisão "Modelo Sinalizacao") —
// nunca aceito do caller, para não abrir brecha de o leitor (ou um bug na
// rota) marcar uma categoria não-grave como grave e furar a prioridade
// máxima da fila.
SinalizacaoSchema.pre('validate', function (next) {
  this.grave = ehGrave(this.motivo);
  next();
});

module.exports = mongoose.model('Sinalizacao', SinalizacaoSchema);
