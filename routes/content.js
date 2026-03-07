const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

// ─── SERIES ────────────────────────────────────────────────────────────────

// GET /api/content/series — listar séries publicadas
router.get('/series', async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { isPublished: true };
    if (type) filter.content_type = type;

    const series = await Series.find(filter)
      .sort({ order_index: 1, createdAt: -1 })
      .lean();

    res.json(series);
  } catch (err) {
    logger.error('[Content] GET /series', err);
    res.status(500).json({ error: 'Erro ao buscar séries.' });
  }
});

// GET /api/content/series/:id — detalhes de uma série
router.get('/series/:id', async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).lean();
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });
    res.json(series);
  } catch (err) {
    logger.error('[Content] GET /series/:id', err);
    res.status(500).json({ error: 'Erro ao buscar série.' });
  }
});

// POST /api/content/series — criar série (admin)
router.post('/series', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, cover_image, isPremium, content_type, order_index, isPublished } = req.body;
    if (!title || !genre || !content_type) {
      return res.status(400).json({ error: 'title, genre e content_type são obrigatórios.' });
    }

    const series = await Series.create({ title, genre, description, cover_image, isPremium, content_type, order_index, isPublished });
    logger.info(`[Admin] Série criada: ${title}`);
    res.status(201).json(series);
  } catch (err) {
    logger.error('[Content] POST /series', err);
    res.status(500).json({ error: 'Erro ao criar série.' });
  }
});

// PUT /api/content/series/:id — editar série (admin)
router.put('/series/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const series = await Series.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });
    res.json(series);
  } catch (err) {
    logger.error('[Content] PUT /series/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar série.' });
  }
});

// DELETE /api/content/series/:id — remover série (admin)
router.delete('/series/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const series = await Series.findByIdAndDelete(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });
    // Remove episódios associados
    await Episode.deleteMany({ seriesId: req.params.id });
    res.json({ success: true, message: 'Série e episódios removidos.' });
  } catch (err) {
    logger.error('[Content] DELETE /series/:id', err);
    res.status(500).json({ error: 'Erro ao remover série.' });
  }
});

// ─── EPISODES ───────────────────────────────────────────────────────────────

// GET /api/content/series/:id/episodes — episódios de uma série
router.get('/series/:id/episodes', async (req, res) => {
  try {
    const filter = { seriesId: req.params.id, status: 'published' };
    const episodes = await Episode.find(filter)
      .sort({ order_index: 1, episode_number: 1 })
      .lean();
    res.json(episodes);
  } catch (err) {
    logger.error('[Content] GET /series/:id/episodes', err);
    res.status(500).json({ error: 'Erro ao buscar episódios.' });
  }
});

// GET /api/content/episodes/:id — detalhes de um episódio
router.get('/episodes/:id', async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id).populate('seriesId', 'title content_type').lean();
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    // Incrementa views de forma não bloqueante
    Episode.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    res.json(episode);
  } catch (err) {
    logger.error('[Content] GET /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao buscar episódio.' });
  }
});

// POST /api/content/episodes — criar episódio (admin)
router.post('/episodes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { seriesId, episode_number, title, description, video_url, bunnyVideoId, thumbnail, duration, isPremium, order_index } = req.body;
    if (!seriesId || !episode_number || !title) {
      return res.status(400).json({ error: 'seriesId, episode_number e title são obrigatórios.' });
    }

    const episode = await Episode.create({ seriesId, episode_number, title, description, video_url, bunnyVideoId, thumbnail, duration, isPremium, order_index });
    logger.info(`[Admin] Episódio criado: ${title} (série: ${seriesId})`);
    res.status(201).json(episode);
  } catch (err) {
    logger.error('[Content] POST /episodes', err);
    res.status(500).json({ error: 'Erro ao criar episódio.' });
  }
});

// PUT /api/content/episodes/:id — editar episódio (admin)
router.put('/episodes/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await Episode.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    res.json(episode);
  } catch (err) {
    logger.error('[Content] PUT /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar episódio.' });
  }
});

// DELETE /api/content/episodes/:id — remover episódio (admin)
router.delete('/episodes/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await Episode.findByIdAndDelete(req.params.id);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    res.json({ success: true, message: 'Episódio removido.' });
  } catch (err) {
    logger.error('[Content] DELETE /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao remover episódio.' });
  }
});

// POST /api/content/episodes/:id/panels — adicionar painéis webtoon (admin)
router.post('/episodes/:id/panels', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { panels } = req.body; // [{ image_url, order }]
    if (!Array.isArray(panels) || panels.length === 0) {
      return res.status(400).json({ error: 'panels deve ser um array não vazio.' });
    }

    const episode = await Episode.findByIdAndUpdate(
      req.params.id,
      { $push: { panels: { $each: panels } } },
      { new: true }
    );
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    res.json({ success: true, panelCount: episode.panels.length, episode });
  } catch (err) {
    logger.error('[Content] POST /episodes/:id/panels', err);
    res.status(500).json({ error: 'Erro ao adicionar painéis.' });
  }
});

// GET /api/content/ads — anúncios ativos (delegado ao ads router, mas mantemos compatibilidade)
router.get('/ads', async (req, res) => {
  try {
    const Ad = require('../models/Ad');
    const ads = await Ad.find({ isActive: true }).lean();
    res.json(ads);
  } catch (err) {
    res.json([]); // fallback vazio se modelo não existir ainda
  }
});

module.exports = router;
