// Helpers de dono/admin — quem enxerga conteúdo ainda não publicado.
//
// Fase 5 Bloco 1, Task 2 ("Drafts invisíveis ao público"): as rotas públicas
// de conteúdo (routes/content.js) e a de signed-url (routes/bunnyWebhook.js)
// precisam do MESMO critério pra decidir quem vê um rascunho — admin sempre,
// e o dono do canal ao qual a série pertence. Centralizado aqui pras duas
// rotas não divergirem (e a Task 5, guarda de dono nos uploads, reusa).
const Channel = require('../models/Channel');

function isAdminUser(user) {
  return !!user && (user.role === 'admin' || user.role === 'superadmin');
}

// Admin sempre pode ver o rascunho. Sem admin, só o dono do canal da série
// (channelId → Channel.ownerId) pode — qualquer outro viewer (anônimo ou
// logado não-dono) NÃO pode. Quem chama trata o "não" como 404 (nunca 403),
// pra não confirmar a existência do rascunho a quem não tem acesso.
async function podeVerRascunho(user, channelId) {
  if (isAdminUser(user)) return true;
  if (!user || !channelId) return false;
  const canal = await Channel.findById(channelId).select('ownerId').lean();
  return !!(canal && canal.ownerId && canal.ownerId.toString() === user.id);
}

module.exports = { isAdminUser, podeVerRascunho };
