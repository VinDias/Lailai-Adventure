// Helpers de dono/admin — quem enxerga conteúdo ainda não publicado.
//
// Fase 5 Bloco 1, Task 2 ("Drafts invisíveis ao público"): as rotas públicas
// de conteúdo (routes/content.js) e a de signed-url (routes/bunnyWebhook.js)
// precisam do MESMO critério pra decidir quem vê um rascunho — admin sempre,
// e o dono do canal ao qual a série pertence. Centralizado aqui pras duas
// rotas não divergirem (e a Task 5, guarda de dono nos uploads, reusa).
const Channel = require('../models/Channel');
const Series = require('../models/Series');

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

// Fase 5 Bloco 1, Task 5 (uploads com guarda de dono): upload-image e
// upload-image-batch distinguem dois 4xx diferentes pra não-admin. Primeiro
// perguntam "esse usuário é dono de ALGUM canal ativo?" — se não, 403 (não
// há segredo a esconder: só não existe área de upload pra ele, mesmo
// critério de requireCanalDoUsuario em routes/portal.js).
async function temCanalAtivo(userId) {
  if (!userId) return false;
  const canal = await Channel.findOne({ ownerId: userId, isActive: true }).select('_id').lean();
  return !!canal;
}

// Segunda pergunta, só feita depois de confirmar temCanalAtivo: a série
// ALVO (seriesId real do body) pertence a um canal ATIVO DESTE usuário?
// Retorna a série (com title, para derivar o slug do storage) ou null —
// série inexistente, sem canal, OU de outro dono viram o MESMO null, que
// quem chama trata como 404 (nunca confirma a existência da série alheia).
async function serieDeCanalAtivoDoUsuario(userId, seriesId) {
  if (!seriesId) return null;
  let series;
  try {
    series = await Series.findById(seriesId).select('title channelId').lean();
  } catch (e) {
    return null; // ObjectId inválido (CastError) também não confirma nada — 404
  }
  if (!series || !series.channelId) return null;
  const canal = await Channel.findOne({ _id: series.channelId, ownerId: userId, isActive: true }).select('_id').lean();
  return canal ? series : null;
}

module.exports = { isAdminUser, podeVerRascunho, temCanalAtivo, serieDeCanalAtivoDoUsuario };
