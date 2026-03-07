const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const Episode = require('../models/Episode');

// Status codes de encoding do Bunny.net
// 0 = Created, 1 = Uploaded, 2 = Processing, 3 = Transcoding, 4 = Finished, 5 = Error, 6 = UploadFailed
const BUNNY_STATUS_MAP = {
  0: 'draft',
  1: 'processing',
  2: 'processing',
  3: 'processing',
  4: 'published',
  5: 'draft',
  6: 'draft'
};

router.post('/webhook', express.json(), async (req, res) => {
  const { VideoGuid, Status, VideoLibraryId } = req.body;

  logger.info(`[Bunny Webhook] Video ${VideoGuid} status: ${Status}`);

  if (!VideoGuid || Status === undefined) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const mongoStatus = BUNNY_STATUS_MAP[Status] || 'draft';
    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;
    const libraryId = process.env.BUNNY_LIBRARY_ID;

    const updateData = { status: mongoStatus };

    if (Status === 4 && cdnHostname) {
      // Monta a URL HLS padrão do Bunny Stream
      updateData.video_url = `https://${cdnHostname}/${VideoGuid}/playlist.m3u8`;
    }

    const episode = await Episode.findOneAndUpdate(
      { bunnyVideoId: VideoGuid },
      { $set: updateData },
      { new: true }
    );

    if (episode) {
      logger.info(`[Bunny Webhook] Episódio "${episode.title}" atualizado para status: ${mongoStatus}`);
    } else {
      logger.warn(`[Bunny Webhook] Nenhum episódio encontrado com bunnyVideoId: ${VideoGuid}`);
    }
  } catch (err) {
    logger.error('[Bunny Webhook Error]', err);
  }

  res.json({ received: true });
});

// Endpoint para iniciar upload de vídeo via Bunny API
router.post('/upload', async (req, res) => {
  const verifyToken = require('../middlewares/verifyToken');
  const requireAdmin = require('../middlewares/requireAdmin');

  verifyToken(req, res, async () => {
    requireAdmin(req, res, async () => {
      try {
        const { title, episodeId } = req.body;
        if (!title || !episodeId) {
          return res.status(400).json({ error: 'title e episodeId são obrigatórios.' });
        }

        const apiKey = process.env.BUNNY_API_KEY;
        const libraryId = process.env.BUNNY_LIBRARY_ID;

        if (!apiKey || !libraryId) {
          return res.status(500).json({ error: 'Credenciais Bunny.net não configuradas.' });
        }

        // Cria o vídeo na biblioteca do Bunny Stream
        const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
          method: 'POST',
          headers: {
            'AccessKey': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title })
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error('[Bunny Upload Error]', errText);
          return res.status(502).json({ error: 'Erro ao criar vídeo no Bunny Stream.' });
        }

        const bunnyVideo = await response.json();
        const { guid: bunnyVideoId } = bunnyVideo;

        // Salva o bunnyVideoId no episódio
        await Episode.findByIdAndUpdate(episodeId, {
          bunnyVideoId,
          status: 'processing'
        });

        // Retorna a URL de upload TUS (protocolo usado pelo Bunny)
        const uploadUrl = `https://video.bunnycdn.com/tusupload`;

        logger.info(`[Bunny] Vídeo criado: ${bunnyVideoId} para episódio ${episodeId}`);

        res.json({
          success: true,
          bunnyVideoId,
          uploadUrl,
          libraryId,
          headers: {
            AuthorizationSignature: '',
            AuthorizationExpire: '',
            VideoId: bunnyVideoId,
            LibraryId: libraryId
          }
        });
      } catch (err) {
        logger.error('[Bunny Upload Init Error]', err);
        res.status(500).json({ error: 'Erro interno.' });
      }
    });
  });
});

module.exports = router;
