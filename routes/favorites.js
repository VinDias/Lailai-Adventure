const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Series = require('../models/Series');
const verifyToken = require('../middlewares/verifyToken');
const { getFiltroParental } = require('../utils/parentalFilter');
const logger = require('../utils/logger');

// ─── FAVORITOS (lista por conta) ─────────────────────────────────────────────

// GET /api/favorites — lista favoritos do usuário logado
// Fase 5, Bloco 2, Task 4: o fragmento do filtro parental (getFiltroParental
// — {} pra admin) entra no MATCH do populate, junto com isPublished — mesmo
// critério de antes, só que agora a query decide as duas coisas de uma vez.
// O documento Favorite em si NUNCA é apagado por isso: a obra só some da
// LISTA enquanto a tag continuar bloqueada (desbloquear traz de volta).
router.get('/', verifyToken, async (req, res) => {
  try {
    const filtroParental = await getFiltroParental(req.user);
    const favorites = await Favorite.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate({ path: 'seriesId', match: { isPublished: true, ...filtroParental } })
      .lean();

    // Séries deletadas OU que não batem no match (despublicada, fora do
    // catálogo do perfil) viram null no populate — mesmo tratamento pros
    // dois casos, igual já era antes desta task.
    const items = favorites
      .filter(f => f.seriesId)
      .map(f => ({ seriesId: f.seriesId._id, series: f.seriesId }));

    res.json(items);
  } catch (err) {
    logger.error('[Favorites] GET /', err);
    res.status(500).json({ error: 'Erro ao buscar favoritos.' });
  }
});

// POST /api/favorites/:seriesId — adicionar série aos favoritos (idempotente)
router.post('/:seriesId', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.seriesId)) {
      return res.status(400).json({ error: 'ID de série inválido.' });
    }

    const series = await Series.findById(req.params.seriesId).lean();
    if (!series || series.isPublished !== true) {
      return res.status(404).json({ error: 'Série não encontrada.' });
    }

    await Favorite.findOneAndUpdate(
      { userId: req.user.id, seriesId: req.params.seriesId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ favorited: true });

    // Gatilho de recálculo (Etapa 11 do PDF, Fase 4 Bloco 4, Task 5):
    // dispara SEMPRE — a rota é idempotente e sempre responde
    // `favorited: true`, sem saber se criou ou só confirmou um favorito já
    // existente (spec: "se a rota sempre responde favorited:true sem saber
    // se criou, dispare sempre e documente"). Fire-and-forget, molde do
    // push do Bloco 2 — nunca lança, nunca atrasa a resposta.
    require('../services/recommendationService').dispararRecalculo(req.params.seriesId, 'favorito');
  } catch (err) {
    // Upsert não é atômico contra inserts concorrentes: dois toques quase
    // simultâneos (duas abas/aparelhos) podem gerar E11000 — o favorito já
    // existe, então é sucesso idempotente, não erro.
    if (err && err.code === 11000) {
      res.json({ favorited: true });
      require('../services/recommendationService').dispararRecalculo(req.params.seriesId, 'favorito');
      return;
    }
    logger.error('[Favorites] POST /:seriesId', err);
    res.status(500).json({ error: 'Erro ao favoritar série.' });
  }
});

// DELETE /api/favorites/:seriesId — remover série dos favoritos
router.delete('/:seriesId', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.seriesId)) {
      return res.status(400).json({ error: 'ID de série inválido.' });
    }

    await Favorite.deleteOne({ userId: req.user.id, seriesId: req.params.seriesId });
    res.json({ favorited: false });
  } catch (err) {
    logger.error('[Favorites] DELETE /:seriesId', err);
    res.status(500).json({ error: 'Erro ao remover favorito.' });
  }
});

module.exports = router;
