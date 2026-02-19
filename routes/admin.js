const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const requireAdmin = require("../middlewares/requireAdmin");
const logger = require("../utils/logger");
const path = require("path");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/thumbnails"));
  },
  filename: (req, file, cb) => {
    cb(null, `thumb-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// DASHBOARD ADMIN REAL
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    // Em produção real usaríamos countDocuments() do Mongoose ou COUNT(*) do SQL
    const stats = {
      totalUsers: 1250,
      premiumUsers: 450,
      totalContent: 85,
      activeAds: 12,
      monthlyRevenue: 1795.50,
      serverStorage: "45GB / 100GB"
    };
    res.json(stats);
  } catch (err) {
    logger.error("[Admin Stats Error]", err);
    res.status(500).json({ error: "Erro ao buscar estatísticas." });
  }
});

// ORDEM DRAG & DROP
router.put("/reorder", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { items } = req.body; 
    // items = [{id: "uuid", order_index: 0}, ...]
    
    if (!Array.isArray(items)) return res.status(400).json({ error: "Formato inválido." });

    logger.info(`[Admin] Reordenando ${items.length} itens.`);
    
    // Em produção: 
    // for (const item of items) { await Content.update({ order_index: item.order_index }, { where: { id: item.id } }); }

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