const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const requireAdmin = require("../middlewares/requireAdmin");
const logger = require("../utils/logger");
const path = require("path");
const multer = require("multer");
const User = require("../models/User");
const Series = require("../models/Series");
const Episode = require("../models/Episode");
const Ad = require("../models/Ad");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/thumbnails"));
  },
  filename: (req, file, cb) => {
    cb(null, `thumb-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// DASHBOARD ADMIN — DADOS REAIS DO MONGODB
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [totalUsers, premiumUsers, totalSeries, totalEpisodes, activeAds] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isPremium: true }),
      Series.countDocuments({ isPublished: true }),
      Episode.countDocuments({ status: 'published' }),
      Ad.countDocuments({ isActive: true })
    ]);

    const PRICE_BRL = 3.99;
    const estimatedRevenue = +(premiumUsers * PRICE_BRL).toFixed(2);

    res.json({
      totalUsers,
      premiumUsers,
      totalSeries,
      totalEpisodes,
      totalContent: totalSeries + totalEpisodes,
      activeAds,
      estimatedMonthlyRevenue: estimatedRevenue
    });
  } catch (err) {
    logger.error("[Admin Stats Error]", err);
    res.status(500).json({ error: "Erro ao buscar estatísticas." });
  }
});

// LISTAGEM DE CONTEÚDO COM PAGINAÇÃO (admin)
router.get("/content", verifyToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [series, total] = await Promise.all([
      Series.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Series.countDocuments()
    ]);

    res.json({ series, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("[Admin Content Error]", err);
    res.status(500).json({ error: "Erro ao buscar conteúdo." });
  }
});

// ORDEM DRAG & DROP
router.put("/reorder", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Formato inválido." });

    await Promise.all(
      items.map(item => Series.findByIdAndUpdate(item.id, { order_index: item.order_index }))
    );

    logger.info(`[Admin] Reordenando ${items.length} itens.`);
    res.json({ success: true, message: "Ordem atualizada com sucesso." });
  } catch (err) {
    logger.error("[Admin Reorder Error]", err);
    res.status(500).json({ error: err.message });
  }
});

router.put("/update-thumbnail/:id", verifyToken, requireAdmin, upload.single("thumbnail"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    const mediaBase = process.env.MEDIA_BASE_URL || "";
    const thumbnailPath = `${mediaBase}/uploads/thumbnails/${req.file.filename}`;

    res.json({ success: true, url: thumbnailPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
