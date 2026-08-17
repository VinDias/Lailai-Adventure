const express = require('express');
const optionalAuth = require('../middlewares/optionalAuth');
const getIdentity = require('../utils/requestIdentity');
const progressService = require('../services/progressService');
const logger = require('../utils/logger');

const router = express.Router();

// Todas as rotas aceitam conta OU visitante.
router.use(optionalAuth);

function exigirIdentidade(req, res) {
  const identity = getIdentity(req);
  if (!identity) {
    res.status(400).json({ error: 'Envie um token de conta ou o cabeçalho X-Anonymous-Id.' });
    return null;
  }
  return identity;
}

// PUT /api/me/progress — salva onde o usuário parou
router.put('/progress', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  try {
    const doc = await progressService.saveProgress(identity, req.body);
    res.json(doc);
  } catch (err) {
    if (err.status === 400 || err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Progresso] PUT /progress', err);
    res.status(500).json({ error: 'Erro ao salvar o progresso.' });
  }
});

// GET /api/me/continue — o carrossel "Continuar"
router.get('/continue', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  try {
    res.json(await progressService.buildContinueList(identity));
  } catch (err) {
    logger.error('[Progresso] GET /continue', err);
    res.status(500).json({ error: 'Erro ao montar a lista de continuar.' });
  }
});

module.exports = router;
