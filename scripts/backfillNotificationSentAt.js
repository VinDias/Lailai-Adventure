/**
 * Backfill de `notificationSentAt` para episódios legados — roda uma vez na VPS.
 *
 * Episódios publicados ANTES desta branch não têm o campo `notificationSentAt`
 * (a feature de push é nova). No filtro do claim atômico de
 * `notificationService.notifyEpisodePublished` — `{ notificationSentAt: null }`
 * — o MongoDB casa tanto "campo ausente" quanto "campo null". Sem este
 * backfill, o primeiro `PUT /api/content/episodes/:id` que resultar em
 * `status: 'published'` para um episódio antigo (ex.: só trocar a thumbnail,
 * sem mexer no vídeo) dispara um push falso "Episódio N disponível" para
 * quem favoritou a série.
 *
 * Marca só os episódios JÁ publicados (`status: 'published'`). Rascunhos ou
 * em processamento de antes do deploy que forem publicados DEPOIS (ex.:
 * vídeo ainda processando no Bunny, webhook chega só após o deploy) DEVEM
 * continuar com o campo ausente/null — é para esses que a notificação
 * legítima precisa sair quando o conteúdo ficar pronto.
 *
 * Idempotente: rodar de novo não altera nada (documentos já marcados saem do
 * filtro `notificationSentAt: null`).
 *
 * Requisito: MONGO_URI no .env.
 * Uso: node scripts/backfillNotificationSentAt.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Episode = require('../models/Episode');

async function backfillNotificationSentAt() {
  const resultado = await Episode.updateMany(
    { status: 'published', notificationSentAt: null },
    { $set: { notificationSentAt: new Date() } },
  );
  return resultado.modifiedCount;
}

if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux');
    const marcados = await backfillNotificationSentAt();
    console.log(`✅ ${marcados} episódio(s) legado(s) marcado(s) como já notificado(s) (notificationSentAt).`);
    await mongoose.disconnect();
    process.exit(0);
  })();
}

module.exports = { backfillNotificationSentAt };
