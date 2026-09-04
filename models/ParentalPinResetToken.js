const mongoose = require('mongoose');

// Fase 5, Bloco 2 (Task 3) — recuperação do PIN de proteção. Mesmo shape do
// PasswordResetToken (molde da spec, seção "Recuperação de PIN"): token
// opaco por e-mail, TTL de 1h via `expires` do Mongo. A confirmação
// (POST /api/parental/pin/recuperar/confirmar) NÃO troca o PIN — ela o
// REMOVE (usuário define um novo depois), então este token não carrega
// nenhum valor de PIN, só a intenção "sou eu, deixa eu tirar o PIN".
const schema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: '1h' } // TTL: expira em 1 hora
});

module.exports = mongoose.model('ParentalPinResetToken', schema);
