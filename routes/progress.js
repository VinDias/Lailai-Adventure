const express = require('express');
const optionalAuth = require('../middlewares/optionalAuth');
const getIdentity = require('../utils/requestIdentity');
const progressService = require('../services/progressService');
const { getFiltroParental } = require('../utils/parentalFilter');
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

// GET /api/me/progress/:episodeId — progresso de UM episódio, sem as regras
// do carrossel (poda/dedupe/teto) — usado pela restauração de "onde parei"
// no leitor/player, que precisa da linha exata, não de uma versão podada.
router.get('/progress/:episodeId', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  try {
    res.json(await progressService.getProgressForEpisode(identity, req.params.episodeId));
  } catch (err) {
    logger.error('[Progresso] GET /progress/:episodeId', err);
    res.status(500).json({ error: 'Erro ao buscar o progresso.' });
  }
});

// GET /api/me/continue — o carrossel "Continuar". `?contentType=` filtra por
// aba e aplica o teto de 20 só dentro dela (ver docstring de buildContinueList).
// Fase 5, Bloco 2, Task 4: o fragmento do filtro parental é calculado UMA
// vez aqui (a partir de `req.user` — `{}` para visitante/admin, ver
// utils/parentalFilter) e passado pro service, que o mescla no Series.find
// final.
router.get('/continue', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  const { contentType } = req.query;

  try {
    const filtroParental = await getFiltroParental(req.user);
    res.json(await progressService.buildContinueList(identity, contentType, filtroParental));
  } catch (err) {
    logger.error('[Progresso] GET /continue', err);
    res.status(500).json({ error: 'Erro ao montar a lista de continuar.' });
  }
});

// POST /api/me/progress/claim — leva o histórico do visitante para a conta
router.post('/progress/claim', async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Só uma conta pode reivindicar progresso.' });
  }

  const { anonymousId } = req.body || {};
  const identidadeVisitante = getIdentity({ headers: { 'x-anonymous-id': anonymousId } });
  if (!identidadeVisitante) {
    return res.status(400).json({ error: 'anonymousId inválido.' });
  }

  try {
    const resumo = await progressService.claimAnonymousProgress(req.user.id, anonymousId);
    res.json(resumo);
  } catch (err) {
    logger.error('[Progresso] POST /progress/claim', err);
    res.status(500).json({ error: 'Erro ao migrar o progresso.' });
  }
});

module.exports = router;
