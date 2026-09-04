const User = require('../models/User');

/**
 * Admin "guarda-chuva": o usuário admin/superadmin de createdAt mais antigo.
 * Critério nascido em routes/account.js (Fase 5 Bloco 1 — recebe canais
 * inativos na exclusão de conta) e reutilizado pela curadoria (Bloco 3) como
 * autor do aviso automático ao artista: MensagemPortal exige autorUserId
 * real e autorTipo do enum — não existe conta "sistema". Devolve null se não
 * houver admin (o chamador decide o que fazer).
 */
async function primeiroAdmin() {
  return User.findOne({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 });
}

module.exports = { primeiroAdmin };
