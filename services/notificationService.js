/**
 * Push de capítulo novo para quem favoritou a série (Web Push / VAPID).
 * Disparado (fire-and-forget) pelos 6 pontos que tornam um episódio consumível:
 * criação já publicada, edição para publicado, republicação da série, anexo de
 * painéis, webhook do Bunny (Status 4) e sincronização manual do status Bunny.
 * Test seam no mesmo padrão de utils/bunnyStorage.js: __setTransportForTests
 * injeta o transporte e o web-push real nunca é tocado em teste.
 */
const webpush = require('web-push');
const logger = require('../utils/logger');
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const Favorite = require('../models/Favorite');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const { passaFiltroParental } = require('../utils/parentalFilter');

const BATCH_SIZE = 10;
const DEAD_STATUS_CODES = [404, 410];

let testTransport = null;
let vapidReady = false;
let publicKey = null;

/** Configura o VAPID uma vez. Produção sem chaves = envio desativado com erro
 *  no log (nunca derruba o boot); dev sem chaves = par efêmero com aviso. */
function ensureVapid() {
  if (vapidReady) return publicKey !== null;
  vapidReady = true;
  let { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[Push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push DESATIVADO. Gere com: npx web-push generate-vapid-keys');
      return false;
    }
    const par = webpush.generateVAPIDKeys();
    pub = par.publicKey; priv = par.privateKey;
    logger.warn('[Push] Chaves VAPID efêmeras (dev): inscrições não sobrevivem ao restart.');
  }
  webpush.setVapidDetails(subject || 'mailto:contato@lorflux.com', pub, priv);
  publicKey = pub;
  return true;
}

function getVapidPublicKey() { return ensureVapid() ? publicKey : null; }

async function enviar(sub, payload) {
  if (testTransport) return testTransport(sub, payload);
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys }, payload,
  );
}

/** Monta o payload (string JSON) do push de capítulo novo. */
function montarPayload(series, episode) {
  const rotulo = series.content_type === 'hiqua' ? 'Capítulo' : 'Episódio';
  return JSON.stringify({
    title: series.title,
    body: `${rotulo} ${episode.episode_number} disponível`,
    url: `/?abrir=${series._id}&tipo=${series.content_type}`,
    tag: String(series._id),
  });
}

/**
 * Envia o push de "capítulo novo" para quem favoritou a série do episódio.
 * Envio único por episódio (claim atômico via notificationSentAt). Melhor
 * esforço: falha de uma subscription não impede as demais nem derruba a rota
 * que publicou. Semântica: "o capítulo está consumível" — série publicada
 * *e* conteúdo presente (painéis ou vídeo). Guarda centralizada aqui, não
 * em cada rota chamadora: todo caminho atual e futuro herda de graça.
 */
async function notifyEpisodePublished(episodeId) {
  // Sem transporte nenhum (nem teste, nem VAPID configurado): nada a fazer.
  // Checado ANTES do claim — não faz sentido consumir o envio único sem enviar.
  if (!testTransport && !ensureVapid()) return null;

  const episode = await Episode.findOneAndUpdate(
    { _id: episodeId, notificationSentAt: null },
    { $set: { notificationSentAt: new Date() } },
  );
  if (!episode) return null; // já enviado por outro caminho (claim perdido)

  const series = await Series.findById(episode.seriesId);
  if (!series || !series.isPublished) {
    // Desfaz o claim: obra despublicada não consome o envio único — se for
    // publicada depois, o próximo caminho de publicação pode notificar.
    await Episode.updateOne({ _id: episodeId }, { $set: { notificationSentAt: null } });
    return null;
  }

  // Episódio marcado "published" mas ainda sem conteúdo consumível (esqueleto
  // criado pelo admin antes de subir painéis/vídeo) não notifica. Mesmo
  // padrão da série despublicada: desfaz o claim — quando o conteúdo chegar
  // (painéis anexados ou webhook do Bunny com o vídeo pronto), o próximo
  // caminho de publicação notifica de verdade.
  const temConteudo = (episode.panels && episode.panels.length > 0) || !!episode.video_url;
  if (!temConteudo) {
    await Episode.updateOne({ _id: episodeId }, { $set: { notificationSentAt: null } });
    return null;
  }

  const userIds = await Favorite.find({ seriesId: series._id }).distinct('userId');

  // Fase 5, Bloco 2, Task 5: audiência cruzada com o filtro parental —
  // predicado PURO (passaFiltroParental, SEM exceção admin/dono: quem
  // bloqueou a tag da própria obra não recebe o push dela, autoinfligido e
  // coerente com "listas filtram todos" — spec "Push de capítulo novo"). A
  // obra "eliminada da experiência" não pode apitar com título e deep link
  // na tela de bloqueio de quem bloqueou. `series` (findById sem select, já
  // carregado acima) traz content_rating/tags completos — nunca undefined
  // aqui. Carrega o `parental` de TODOS os favoritadores em UMA query e
  // descarta quem não passa ANTES de buscar PushSubscription (quem não vai
  // receber não precisa de mais uma query).
  // Um userId sem User correspondente (conta apagada — ou um favoritador que
  // nunca tem subdocumento `parental` gravado) NÃO é descartado por
  // ausência: `.get(...) ?? null` cai no mesmo "young sem bloqueio" que
  // passaFiltroParental(null, serie) já trata como caso ausente — filtrar
  // pela PRESENÇA de um User doc, em vez de pelo valor do parental, seria
  // uma segunda semântica (silenciosamente mais restritiva) fora da spec.
  const usuarios = await User.find({ _id: { $in: userIds } }).select('parental').lean();
  const parentalPorUsuario = new Map(usuarios.map((usuario) => [String(usuario._id), usuario.parental]));
  const idsPermitidos = userIds.filter((id) => passaFiltroParental(parentalPorUsuario.get(String(id)) ?? null, series));

  const subscriptions = await PushSubscription.find({ userId: { $in: idsPermitidos } });

  const payload = montarPayload(series, episode);

  let enviados = 0;
  let removidos = 0;

  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const lote = subscriptions.slice(i, i + BATCH_SIZE);
    const resultados = await Promise.allSettled(lote.map((sub) => enviar(sub, payload)));

    await Promise.all(resultados.map(async (resultado, idx) => {
      if (resultado.status === 'fulfilled') {
        enviados += 1;
        return;
      }
      const sub = lote[idx];
      const statusCode = resultado.reason && resultado.reason.statusCode;
      try {
        if (DEAD_STATUS_CODES.includes(statusCode)) {
          await PushSubscription.deleteOne({ _id: sub._id });
          removidos += 1;
        } else {
          logger.error(`[Push] Falha ao enviar para subscription ${sub._id}: ${resultado.reason && resultado.reason.message}`);
        }
      } catch (erroPoda) {
        // Falha ao PODAR (ex.: erro transitório de banco) não pode travar o
        // restante do lote — é melhor esforço, igual à falha de envio em si.
        logger.error(`[Push] Falha ao remover subscription morta ${sub._id}: ${erroPoda && erroPoda.message}`);
      }
    }));
  }

  return { enviados, removidos };
}

/** Injeção exclusiva de testes (mesmo padrão do bunnyStorage/translationService). */
function __setTransportForTests(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTransportForTests só pode ser usado em NODE_ENV=test');
  }
  testTransport = fn;
}

module.exports = {
  getVapidPublicKey,
  notifyEpisodePublished,
  __setTransportForTests,
};
