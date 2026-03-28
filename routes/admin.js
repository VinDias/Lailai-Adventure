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
const Vote = require("../models/Vote");

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

    // Agrega likes/dislikes e views por série
    const seriesIds = series.map(s => s._id);
    const episodes = await Episode.find({ seriesId: { $in: seriesIds } }, 'seriesId views').lean();

    const episodeIdsBySeriesId = {};
    const viewsBySeriesId = {};
    for (const ep of episodes) {
      const key = String(ep.seriesId);
      if (!episodeIdsBySeriesId[key]) episodeIdsBySeriesId[key] = [];
      episodeIdsBySeriesId[key].push(ep._id);
      viewsBySeriesId[key] = (viewsBySeriesId[key] || 0) + (ep.views || 0);
    }

    const allEpisodeIds = episodes.map(e => e._id);
    const [likeAgg, dislikeAgg] = await Promise.all([
      Vote.aggregate([
        { $match: { episodeId: { $in: allEpisodeIds }, type: 'like' } },
        { $lookup: { from: 'episodes', localField: 'episodeId', foreignField: '_id', as: 'ep' } },
        { $unwind: '$ep' },
        { $group: { _id: '$ep.seriesId', count: { $sum: 1 } } }
      ]),
      Vote.aggregate([
        { $match: { episodeId: { $in: allEpisodeIds }, type: 'dislike' } },
        { $lookup: { from: 'episodes', localField: 'episodeId', foreignField: '_id', as: 'ep' } },
        { $unwind: '$ep' },
        { $group: { _id: '$ep.seriesId', count: { $sum: 1 } } }
      ])
    ]);

    const likesMap = Object.fromEntries(likeAgg.map(a => [String(a._id), a.count]));
    const dislikesMap = Object.fromEntries(dislikeAgg.map(a => [String(a._id), a.count]));

    const enriched = series.map(s => ({
      ...s,
      totalViews: viewsBySeriesId[String(s._id)] || 0,
      totalLikes: likesMap[String(s._id)] || 0,
      totalDislikes: dislikesMap[String(s._id)] || 0
    }));

    res.json({ series: enriched, total, page, pages: Math.ceil(total / limit) });
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

    await Series.findByIdAndUpdate(req.params.id, { cover_image: thumbnailPath });

    res.json({ success: true, url: thumbnailPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ATUALIZAR CANAIS DE ÁUDIO DE UM EPISÓDIO
router.patch("/episodes/:id/audio", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { audioTrack1Url, audioTrack1Lang, audioTrack2Url, audioTrack2Lang,
            audioTrack3Url, audioTrack3Lang, audioTrack4Url, audioTrack4Lang, hlsAudioLabels } = req.body;
    const update = {};
    if (audioTrack1Url !== undefined) update.audioTrack1Url = audioTrack1Url;
    if (audioTrack1Lang !== undefined) update.audioTrack1Lang = audioTrack1Lang;
    if (audioTrack2Url !== undefined) update.audioTrack2Url = audioTrack2Url;
    if (audioTrack2Lang !== undefined) update.audioTrack2Lang = audioTrack2Lang;
    if (audioTrack3Url !== undefined) update.audioTrack3Url = audioTrack3Url;
    if (audioTrack3Lang !== undefined) update.audioTrack3Lang = audioTrack3Lang;
    if (audioTrack4Url !== undefined) update.audioTrack4Url = audioTrack4Url;
    if (audioTrack4Lang !== undefined) update.audioTrack4Lang = audioTrack4Lang;
    if (Array.isArray(hlsAudioLabels)) update.hlsAudioLabels = hlsAudioLabels;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo de áudio fornecido.' });
    }

    const episode = await Episode.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    logger.info(`[Admin] Áudio do episódio "${episode.title}" atualizado.`);
    res.json({
      success: true,
      audioTrack1Url: episode.audioTrack1Url, audioTrack1Lang: episode.audioTrack1Lang,
      audioTrack2Url: episode.audioTrack2Url, audioTrack2Lang: episode.audioTrack2Lang,
      audioTrack3Url: episode.audioTrack3Url, audioTrack3Lang: episode.audioTrack3Lang,
      audioTrack4Url: episode.audioTrack4Url, audioTrack4Lang: episode.audioTrack4Lang,
      hlsAudioLabels: episode.hlsAudioLabels,
    });
  } catch (err) {
    logger.error('[Admin Audio Update Error]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
