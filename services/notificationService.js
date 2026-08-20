/**
 * Push de capítulo novo para quem favoritou a série (Web Push / VAPID).
 * Disparado (fire-and-forget) pelos 3 caminhos que publicam um episódio.
 * Test seam no mesmo padrão de utils/bunnyStorage.js: __setTransportForTests
 * injeta o transporte e o web-push real nunca é tocado em teste.
 */
const webpush = require('web-push');
const logger = require('../utils/logger');
const Episode = require('../models/Episode');
const Series = require('../models/Series');
const Favorite = require('../models/Favorite');
const PushSubscription = require('../models/PushSubscription');

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
 * que publicou.
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

  const userIds = await Favorite.find({ seriesId: series._id }).distinct('userId');
  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } });

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
      if (DEAD_STATUS_CODES.includes(statusCode)) {
        await PushSubscription.deleteOne({ _id: sub._id });
        removidos += 1;
      } else {
        logger.error(`[Push] Falha ao enviar para subscription ${sub._id}: ${resultado.reason && resultado.reason.message}`);
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
