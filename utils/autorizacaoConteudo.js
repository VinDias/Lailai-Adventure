// Porta ÚNICA de autorização de leitura (Fase 6, T1). Spec:
// docs/superpowers/specs/2026-10-06-fase6-assinatura-acesso-design.md
//
// Ordem fixada pelo cliente (PDF de 25/09, seção 7): publicação →
// classificação → autenticação → Premium. A publicação continua onde já
// estava, em cada rota; esta função cobre os três últimos degraus, para que
// NENHUMA superfície decida sozinha (era assim que o Premium virava enfeite:
// routes/content.js entregava tudo e só o cliente escondia).
//
// Devolve SEMPRE { ok, motivo } — quem chama traduz o motivo em HTTP, porque
// o código varia de propósito:
//   'classificacao'          → 404 (esconder: o leitor não precisa saber que existe)
//   'login_necessario'       → 403 (convidar a criar conta)
//   'assinatura_necessaria'  → 403 (convidar a assinar)
const { serieVisivelPara } = require('./parentalFilter');
const { assinaturaAtivaDoUsuario } = require('./assinatura');
const { isAdminUser } = require('./ownership');
const Channel = require('../models/Channel');

/** Dono do canal da obra enxerga a própria obra, inclusive paga. */
async function ehDonoDaObra(user, serie) {
  if (!user || !serie?.channelId) return false;
  const canal = await Channel.findById(serie.channelId).select('ownerId').lean();
  return !!(canal && canal.ownerId && canal.ownerId.toString() === user.id);
}

/**
 * @param user     req.user (pode ser undefined — visitante)
 * @param serie    doc da série COM content_rating, tags e isPremium
 * @param episodio doc do episódio (opcional; isPremium do episódio soma ao da série)
 */
async function autorizarConteudo(user, { serie, episodio } = {}) {
  if (!serie) return { ok: false, motivo: 'classificacao' };

  if (!(await serieVisivelPara(user, serie))) {
    return { ok: false, motivo: 'classificacao' };
  }

  const ehPago = serie.isPremium === true || episodio?.isPremium === true;
  if (!ehPago) return { ok: true };

  if (isAdminUser(user)) return { ok: true };
  if (await ehDonoDaObra(user, serie)) return { ok: true };

  if (!user) return { ok: false, motivo: 'login_necessario' };
  if (!(await assinaturaAtivaDoUsuario(user.id))) {
    return { ok: false, motivo: 'assinatura_necessaria' };
  }

  return { ok: true };
}

/**
 * Resposta HTTP do bloqueio pago. Leva título e capa de propósito: a tela
 * precisa mostrar O QUE está sendo oferecido ao convidar a pessoa a criar
 * conta ou assinar. Nada além disso sai daqui (sem painéis, sem vídeo).
 */
function responderBloqueio(res, motivo, serie) {
  const mensagens = {
    login_necessario: 'Crie uma conta para ter acesso.',
    assinatura_necessaria: 'Conteúdo exclusivo para assinantes.',
  };
  return res.status(403).json({
    error: mensagens[motivo],
    code: motivo,
    obra: serie ? { title: serie.title, cover_image: serie.cover_image } : undefined,
  });
}

module.exports = { autorizarConteudo, responderBloqueio };
