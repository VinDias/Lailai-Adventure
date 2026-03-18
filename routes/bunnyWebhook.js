const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const Episode = require('../models/Episode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Apenas imagens são permitidas.'));
  }
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tmpDir = path.join(__dirname, '../uploads/tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, `bunny-${Date.now()}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 800 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Apenas MP4, MOV e MKV são permitidos.'));
  }
});

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

// POST /api/bunny/upload-image — upload de imagem para Bunny Storage
router.post('/upload-image', (req, res) => {
  const verifyToken = require('../middlewares/verifyToken');
  const requireAdmin = require('../middlewares/requireAdmin');

  verifyToken(req, res, () => {
    requireAdmin(req, res, () => {
      imageUpload.single('image')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const storageZone = process.env.BUNNY_STORAGE_ZONE;
        const storageKey = process.env.BUNNY_STORAGE_KEY;

        if (!storageZone || !storageKey) {
          return res.status(500).json({ error: 'BUNNY_STORAGE_ZONE e BUNNY_STORAGE_KEY não configurados no .env.' });
        }

        try {
          const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
          const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const remotePath = `lorflux/${filename}`;

          const uploadRes = await fetch(`https://storage.bunnycdn.com/${storageZone}/${remotePath}`, {
            method: 'PUT',
            headers: { 'AccessKey': storageKey, 'Content-Type': 'application/octet-stream' },
            body: req.file.buffer
          });

          if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            logger.error('[Bunny Storage] Erro no upload:', errText);
            return res.status(502).json({ error: 'Erro ao enviar imagem para Bunny Storage.' });
          }

          const cdnHostname = process.env.BUNNY_STORAGE_HOSTNAME || `${storageZone}.b-cdn.net`;
          const url = `https://${cdnHostname}/${remotePath}`;
          logger.info(`[Bunny Storage] Imagem enviada: ${url}`);
          res.json({ url });
        } catch (err) {
          logger.error('[Bunny Storage Upload Error]', err);
          res.status(500).json({ error: 'Erro interno ao fazer upload.' });
        }
      });
    });
  });
});

// POST /api/bunny/upload-image-batch — upload em lote de imagens para Bunny Storage (até 138 painéis)
router.post('/upload-image-batch', (req, res) => {
  const verifyToken = require('../middlewares/verifyToken');
  const requireAdmin = require('../middlewares/requireAdmin');

  verifyToken(req, res, () => {
    requireAdmin(req, res, () => {
      const batchUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024, files: 138 },
        fileFilter: (req, file, cb) => {
          const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
          allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Arquivo "${file.originalname}" não é uma imagem válida.`));
        }
      });

      batchUpload.array('images', 138)(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const storageZone = process.env.BUNNY_STORAGE_ZONE;
        const storageKey = process.env.BUNNY_STORAGE_KEY;

        if (!storageZone || !storageKey) {
          return res.status(500).json({ error: 'BUNNY_STORAGE_ZONE e BUNNY_STORAGE_KEY não configurados no .env.' });
        }

        const cdnHostname = process.env.BUNNY_STORAGE_HOSTNAME || `${storageZone}.b-cdn.net`;

        const uploadOne = async (file, index) => {
          try {
            const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
            const filename = `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.${ext}`;
            const remotePath = `lorflux/panels/${filename}`;

            const uploadRes = await fetch(`https://storage.bunnycdn.com/${storageZone}/${remotePath}`, {
              method: 'PUT',
              headers: { 'AccessKey': storageKey, 'Content-Type': 'application/octet-stream' },
              body: file.buffer
            });

            if (!uploadRes.ok) {
              const errText = await uploadRes.text();
              logger.error(`[Bunny Batch] Falha no arquivo "${file.originalname}":`, errText);
              return { success: false, filename: file.originalname, index, error: 'Erro no Bunny Storage.' };
            }

            const url = `https://${cdnHostname}/${remotePath}`;
            return { success: true, filename: file.originalname, index, url };
          } catch (e) {
            logger.error(`[Bunny Batch] Exceção no arquivo "${file.originalname}":`, e);
            return { success: false, filename: file.originalname, index, error: e.message };
          }
        };

        const settled = await Promise.allSettled(req.files.map((f, i) => uploadOne(f, i)));
        const results = settled.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message });

        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        logger.info(`[Bunny Batch] Lote concluído: ${successCount} ok, ${failCount} falhas de ${results.length} arquivos`);
        res.json({ results, successCount, failCount, total: results.length });
      });
    });
  });
});

// POST /api/bunny/upload-video — upload de vídeo para Bunny Stream
router.post('/upload-video', (req, res) => {
  const verifyToken = require('../middlewares/verifyToken');
  const requireAdmin = require('../middlewares/requireAdmin');

  verifyToken(req, res, () => {
    requireAdmin(req, res, () => {
      videoUpload.single('video')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const apiKey = process.env.BUNNY_API_KEY;
        const libraryId = process.env.BUNNY_LIBRARY_ID;
        const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;

        if (!apiKey || !libraryId) {
          fs.unlink(req.file.path, () => {});
          return res.status(500).json({ error: 'BUNNY_API_KEY e BUNNY_LIBRARY_ID não configurados no .env.' });
        }

        const { episodeId, title } = req.body;
        if (!episodeId || !title) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ error: 'episodeId e title são obrigatórios.' });
        }

        try {
          // 1. Cria o vídeo na biblioteca Bunny Stream
          const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
            method: 'POST',
            headers: { 'AccessKey': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          });

          if (!createRes.ok) throw new Error('Erro ao criar vídeo no Bunny Stream.');
          const { guid: bunnyVideoId } = await createRes.json();

          // 2. Faz upload do arquivo para o Bunny Stream via axios (streaming do disco)
          const fileStream = fs.createReadStream(req.file.path);
          const stat = fs.statSync(req.file.path);

          await axios.put(
            `https://video.bunnycdn.com/library/${libraryId}/videos/${bunnyVideoId}`,
            fileStream,
            {
              headers: {
                'AccessKey': apiKey,
                'Content-Type': 'application/octet-stream',
                'Content-Length': stat.size
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            }
          );

          fs.unlink(req.file.path, () => {});

          // 3. Atualiza o episódio no banco
          await Episode.findByIdAndUpdate(episodeId, { bunnyVideoId, status: 'processing' });

          const videoUrl = cdnHostname ? `https://${cdnHostname}/${bunnyVideoId}/playlist.m3u8` : null;
          logger.info(`[Bunny Stream] Vídeo enviado: ${bunnyVideoId} para episódio ${episodeId}`);
          res.json({ success: true, bunnyVideoId, videoUrl });
        } catch (err) {
          fs.unlink(req.file.path, () => {});
          logger.error('[Bunny Video Upload Error]', err);
          res.status(500).json({ error: err.message || 'Erro ao enviar vídeo.' });
        }
      });
    });
  });
});

module.exports = router;
