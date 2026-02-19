
const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const requireAdmin = require("../middlewares/requireAdmin");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// Configuração de upload para thumbnails administrativas
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/thumbnails"));
  },
  filename: (req, file, cb) => {
    cb(null, `thumb-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// Mock DB handler (em produção usar pooling de banco real)
// Assume-se que a estrutura da tabela content foi alterada para incluir order_index

router.put("/reorder", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { items } = req.body; 
    // Em produção: loop de UPDATE no banco de dados
    console.log("[Admin] Reordenando itens:", items);
    res.json({ success: true, message: "Ordem atualizada com sucesso." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update-thumbnail/:id", verifyToken, requireAdmin, upload.single("thumbnail"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    
    const thumbnailPath = `/uploads/thumbnails/${req.file.filename}`;
    console.log(`[Admin] Thumbnail do item ${req.params.id} atualizada para ${thumbnailPath}`);
    
    res.json({ success: true, url: thumbnailPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/content/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    console.log(`[Admin] Removendo conteúdo ID: ${req.params.id}`);
    res.json({ success: true, message: "Conteúdo removido permanentemente." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard-stats", verifyToken, requireAdmin, async (req, res) => {
  res.json({
    totalUsers: 1250,
    premiumUsers: 450,
    activeAds: 12,
    monthlyRevenue: 1795.50,
    serverStorage: "45GB / 100GB"
  });
});

module.exports = router;
