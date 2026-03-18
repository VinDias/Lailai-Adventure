const express = require('express');
const router = express.Router();
const Ad = require('../models/Ad');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

// GET /api/admin/ads — listar todos os anúncios (admin)
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 }).lean();
    res.json(ads);
  } catch (err) {
    logger.error('[Ads] GET /', err);
    res.status(500).json({ error: 'Erro ao buscar anúncios.' });
  }
});

// POST /api/admin/ads — criar anúncio (admin)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, image_url, link_url, advertiser, startsAt, endsAt } = req.body;
    if (!title || !image_url) {
      return res.status(400).json({ error: 'title e image_url são obrigatórios.' });
    }

    const ad = await Ad.create({ title, image_url, link_url, advertiser, startsAt, endsAt });
    logger.info(`[Admin] Anúncio criado: ${title}`);
    res.status(201).json(ad);
  } catch (err) {
    logger.error('[Ads] POST /', err);
    res.status(500).json({ error: 'Erro ao criar anúncio.' });
  }
});

// PUT /api/admin/ads/:id — editar anúncio (admin)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado.' });
    res.json(ad);
  } catch (err) {
    logger.error('[Ads] PUT /:id', err);
    res.status(500).json({ error: 'Erro ao atualizar anúncio.' });
  }
});

// DELETE /api/admin/ads/:id — remover anúncio (admin)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndDelete(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado.' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[Ads] DELETE /:id', err);
    res.status(500).json({ error: 'Erro ao remover anúncio.' });
  }
});

// POST /api/admin/ads/:id/impression — registrar impressão
router.post('/:id/impression', async (req, res) => {
  Ad.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } })
    .exec()
    .catch(err => logger.error(`[Ads] Erro ao registrar impressão do anúncio ${req.params.id}`, err));
  res.json({ ok: true });
});

// POST /api/admin/ads/:id/click — registrar clique
router.post('/:id/click', async (req, res) => {
  Ad.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } })
    .exec()
    .catch(err => logger.error(`[Ads] Erro ao registrar clique do anúncio ${req.params.id}`, err));
  res.json({ ok: true });
});

module.exports = router;
