/**
 * Rotas do leitor para o Super Reader (Fase 4, Bloco 3) — apoio direto ao
 * autor de uma obra. Rotas FINAS por cima de services/superReaderService.js
 * (Task 1): toda validação e regra de negócio vive lá; aqui só HTTP (auth,
 * parse de body, mapeamento de erro).
 * Spec: docs/superpowers/specs/2026-08-20-super-reader-design.md
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');
const SuperReaderContribution = require('../models/SuperReaderContribution');
const { criarSessaoDeApoio, lerMinimoCents } = require('../services/superReaderService');

// POST /api/superreader/create-session — exige login (o PDF pede login para
// apoiar; o selo também precisa de dono). userId SEMPRE vem do token
// (req.user.id, mesmo campo que routes/push.js usa), NUNCA do body — o corpo
// não pode forjar em nome de quem apoia.
router.post('/create-session', verifyToken, async (req, res) => {
  try {
    const { seriesId, amountCents, currency } = req.body || {};
    const resultado = await criarSessaoDeApoio({
      userId: req.user.id,
      role: req.user.role,
      seriesId,
      amountCents,
      currency,
    });
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    logger.error('[SuperReader] POST /create-session', err);
    res.status(500).json({ error: 'Erro ao criar a sessão de apoio.' });
  }
});

// GET /api/superreader/me — selo (derivado: existe >= 1 contribuição própria,
// sem campo novo em User) + lista das próprias contribuições, mais recente
// primeiro. seriesTitle vem de populate; série apagada vira null no populate
// (mesmo padrão de routes/favorites.js), não explode a rota. Nunca devolve
// stripeSessionId nem os campos de share (autor/plataforma) — só o que a
// Conta do leitor precisa mostrar.
router.get('/me', verifyToken, async (req, res) => {
  try {
    const contribuicoes = await SuperReaderContribution.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('seriesId amountCents currency createdAt')
      .populate('seriesId', 'title')
      .lean();

    res.json({
      superReader: contribuicoes.length > 0,
      contribuicoes: contribuicoes.map((c) => ({
        seriesTitle: c.seriesId?.title ?? null,
        amountCents: c.amountCents,
        currency: c.currency,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    logger.error('[SuperReader] GET /me', err);
    res.status(500).json({ error: 'Erro ao buscar suas contribuições.' });
  }
});

// GET /api/superreader/min — sem auth (frontend monta os botões de valor).
// Rota própria em vez de entrar no PUBLIC_KEYS de routes/settings.js: aquela
// rota devolve Setting.value cru (String, pode conter lixo — "abc", "-10",
// "500.5"); o mínimo precisa passar por lerMinimoCents(), que já valida e
// aplica o fallback (default 500). Ver relatório da Task 2 para o registro
// completo desta decisão.
router.get('/min', async (req, res) => {
  try {
    res.json({ minCents: await lerMinimoCents() });
  } catch (err) {
    logger.error('[SuperReader] GET /min', err);
    res.status(500).json({ error: 'Erro ao buscar o mínimo de apoio.' });
  }
});

module.exports = router;
