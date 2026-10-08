const mongoose = require('mongoose');

/**
 * Registro do resumo semanal que JÁ saiu para uma conta (Fase 6, T6).
 *
 * Existe por um motivo só: o resumo não pode sair duas vezes. A varredura
 * roda de hora em hora (o processo reinicia a cada deploy, então um
 * `setInterval` de 7 dias nunca dispararia) e todo tique do dia de envio
 * encontra os mesmos destinatários. O índice único (userId, periodo) é o que
 * transforma "mandar o resumo" em operação idempotente.
 *
 * O registro é criado ANTES do envio — mesmo padrão do `notificationSentAt`
 * do push de capítulo novo (services/notificationService.js): quem consegue
 * criar, envia. Se o SMTP falhar, o serviço APAGA o registro, devolvendo a
 * vez para o próximo tique.
 *
 * `periodo` é a semana ISO ('2026-W41'), não uma data: duas varreduras em
 * dias diferentes da mesma semana reconhecem o mesmo período.
 */
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  periodo: { type: String, required: true },
  obras: { type: Number, default: 0 },
  capitulos: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ userId: 1, periodo: 1 }, { unique: true });

module.exports = mongoose.model('EnvioNovidades', schema);
