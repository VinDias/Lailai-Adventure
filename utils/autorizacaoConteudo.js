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

// Campos do episódio que podem aparecer numa LISTA para quem não tem direito
// ao conteúdo pago. É uma lista do que PODE sair, não do que não pode: campo
// de mídia acrescentado ao schema amanhã (um .ddls, uma legenda, um MP4) fica
// fora por padrão, em vez de vazar até alguém lembrar de tirar.
const CAMPOS_DE_VITRINE = [
  '_id', 'seriesId', 'episode_number', 'title', 'description', 'translations',
  'thumbnail', 'duration', 'isPremium', 'status', 'order_index', 'views',
  'createdAt', 'updatedAt',
];

function vitrineDoEpisodio(episodio, motivo) {
  const vitrine = {};
  for (const campo of CAMPOS_DE_VITRINE) {
    if (episodio[campo] !== undefined) vitrine[campo] = episodio[campo];
  }
  // panels vazio (e não ausente): o cliente lê `ep.panels?.length` e
  // `ep.panels?.[0]` em vários pontos; o array vazio mantém o formato.
  vitrine.panels = [];
  // O convite que a tela deve mostrar ao abrir: o mesmo código do 403 de
  // GET /episodes/:id e de /api/bunny/signed-url.
  vitrine.bloqueio = motivo;
  return vitrine;
}

/**
 * Episódios de UMA obra, prontos para sair numa lista. A decisão continua
 * sendo de autorizarConteudo; aqui só se aplica o resultado a cada item.
 *
 * Episódio pago sem direito NÃO some: a lista é a vitrine (título, número,
 * capa, selo Premium) e a tela precisa dela para vender. Sai sem nenhuma
 * mídia e com `bloqueio`. Episódio gratuito sai como está.
 *
 * Antes desta função (até 19/11/2026) GET /api/content/series/:id/episodes
 * devolvia o documento inteiro, com as URLs dos painéis e do vídeo, a
 * qualquer um: o 403 do detalhe do episódio era contornável pela lista.
 *
 * @param user      req.user (pode ser undefined)
 * @param serie     doc da série COM content_rating, tags, channelId e isPremium
 * @param episodios docs lean dos episódios dessa série
 */
async function episodiosParaLista(user, serie, episodios) {
  // A resposta da porta para "episódio pago desta obra" é a mesma para todos
  // os episódios pagos dela (o que varia entre eles é só ser pago ou não),
  // então a porta é consultada uma vez, e só se houver episódio pago.
  let decisaoDoPago = null;
  const resultado = [];
  for (const episodio of episodios) {
    const ehPago = serie?.isPremium === true || episodio.isPremium === true;
    if (!ehPago) {
      resultado.push(episodio);
      continue;
    }
    if (!decisaoDoPago) {
      decisaoDoPago = await autorizarConteudo(user, { serie, episodio: { isPremium: true } });
    }
    resultado.push(decisaoDoPago.ok ? episodio : vitrineDoEpisodio(episodio, decisaoDoPago.motivo));
  }
  return resultado;
}

module.exports = { autorizarConteudo, responderBloqueio, episodiosParaLista, CAMPOS_DE_VITRINE };
