const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

// Chaves permitidas na rota pública (sem autenticação)
const PUBLIC_KEYS = [
  'adsense_slot_id', 'adsense_client_id',
  'platform_tagline', 'bunny_cdn_base',
  'premium_price_display', 'premium_cpm_rate',
  'ad_skip_seconds', 'ad_frequency_feed', 'ad_frequency_webtoon',
];

// GET /api/settings/public — configurações públicas (sem auth)
router.get('/public', async (req, res) => {
  try {
    const docs = await Setting.find({ key: { $in: PUBLIC_KEYS } }).lean();
    const result = {};
    docs.forEach(d => { result[d.key] = d.value; });
    res.json(result);
  } catch (err) {
    logger.error('[Settings] GET /public', err);
    res.json({});
  }
});

// GET /api/settings — listar todas (admin)
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const settings = await Setting.find().sort({ group: 1, key: 1 }).lean();
    res.json(settings);
  } catch (err) {
    logger.error('[Settings] GET /', err);
    res.status(500).json({ error: 'Erro ao buscar configurações.' });
  }
});

// PUT /api/settings/:key — criar ou atualizar por chave (admin)
router.put('/:key', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { value, label, group } = req.body;
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { $set: { value: value ?? '', label, group } },
      { upsert: true, new: true, runValidators: true }
    );
    logger.info(`[Admin] Configuração atualizada: ${req.params.key} = ${value}`);
    res.json(setting);
  } catch (err) {
    logger.error('[Settings] PUT /:key', err);
    res.status(500).json({ error: 'Erro ao salvar configuração.' });
  }
});

module.exports = router;
