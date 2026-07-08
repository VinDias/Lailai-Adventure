const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Series = require('../models/Series');
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');

// ─── FAVORITOS (lista por conta) ─────────────────────────────────────────────

// GET /api/favorites — lista favoritos do usuário logado
router.get('/', verifyToken, async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('seriesId')
      .lean();

    // Séries deletadas viram null no populate; despublicadas ficam fora do
    // catálogo e portanto também não devem aparecer na lista (mesmo critério do /search)
    const items = favorites
      .filter(f => f.seriesId && f.seriesId.isPublished !== false)
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
    if (!series || series.isPublished === false) {
      return res.status(404).json({ error: 'Série não encontrada.' });
    }

    await Favorite.findOneAndUpdate(
      { userId: req.user.id, seriesId: req.params.seriesId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ favorited: true });
  } catch (err) {
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
