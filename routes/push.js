/**
 * Rotas de inscrição push (Web Push / VAPID). Um único router com caminhos
 * completos, montado uma vez em `app.use('/api', ...)` — mistura rota pública
 * (`/push/public-key`) com rotas autenticadas (`/me/push/...`).
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');
const PushSubscription = require('../models/PushSubscription');
const { getVapidPublicKey } = require('../services/notificationService');

function endpointValido(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint) return false;
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:' && !!u.hostname) return true;
    // http:// só é aceito em teste (ambiente de teste não serve HTTPS).
    if (process.env.NODE_ENV === 'test' && u.protocol === 'http:' && !!u.hostname) return true;
    return false;
  } catch {
    return false;
  }
}

function chaveValida(v) {
  return typeof v === 'string' && v.length > 0;
}

// GET /api/push/public-key — sem auth. Pode devolver publicKey: null em
// produção mal configurada (sem chaves VAPID); o front trata.
router.get('/push/public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// POST /api/me/push/subscribe — upsert por endpoint. O aparelho passa a
// pertencer a quem está logado nele agora (takeover de dono é intencional).
router.post('/me/push/subscribe', verifyToken, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpointValido(endpoint) || !keys || !chaveValida(keys.p256dh) || !chaveValida(keys.auth)) {
      return res.status(400).json({ error: 'Dados de inscrição de push inválidos.' });
    }

    const userId = req.user.id;
    const existiaAntes = await PushSubscription.exists({ endpoint });

    try {
      await PushSubscription.findOneAndUpdate(
        { endpoint },
        { $set: { userId, keys, endpoint } },
        { upsert: true },
      );
    } catch (err) {
      // Corrida: dois registros quase simultâneos do mesmo aparelho (duas abas,
      // dois service workers) podem estourar E11000 no upsert mesmo com
      // { upsert: true } — o índice único de endpoint não é atômico contra
      // inserts concorrentes. Trata como sucesso: o documento já existe (foi
      // o concorrente que criou), refaz o findOneAndUpdate sem upsert.
      // Mesmo padrão de services/progressService.js (comentário sobre E11000).
      if (err && err.code === 11000) {
        await PushSubscription.findOneAndUpdate(
          { endpoint },
          { $set: { userId, keys, endpoint } },
        );
      } else {
        throw err;
      }
    }

    res.status(existiaAntes ? 200 : 201).json({ subscribed: true });
  } catch (err) {
    logger.error('[Push] POST /me/push/subscribe', err);
    res.status(500).json({ error: 'Erro ao registrar inscrição de push.' });
  }
});

// DELETE /api/me/push/subscribe — remove só o endpoint do próprio usuário.
router.delete('/me/push/subscribe', verifyToken, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'endpoint é obrigatório.' });
    }

    const resultado = await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
    res.json({ removed: resultado.deletedCount });
  } catch (err) {
    logger.error('[Push] DELETE /me/push/subscribe', err);
    res.status(500).json({ error: 'Erro ao remover inscrição de push.' });
  }
});

// GET /api/me/push/status — thisDevice (endpoint da query pertence ao
// logado) e anyDevice (o logado tem alguma inscrição, em qualquer aparelho).
router.get('/me/push/status', verifyToken, async (req, res) => {
  try {
    const { endpoint } = req.query;
    const userId = req.user.id;

    const [thisDevice, anyDevice] = await Promise.all([
      (typeof endpoint === 'string' && endpoint)
        ? PushSubscription.exists({ endpoint, userId })
        : Promise.resolve(false),
      PushSubscription.exists({ userId }),
    ]);

    res.json({ thisDevice: !!thisDevice, anyDevice: !!anyDevice });
  } catch (err) {
    logger.error('[Push] GET /me/push/status', err);
    res.status(500).json({ error: 'Erro ao consultar status de push.' });
  }
});

module.exports = router;
