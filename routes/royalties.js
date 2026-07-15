const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

const EngagementEvent = require('../models/EngagementEvent');
const RoyaltyPeriod = require('../models/RoyaltyPeriod');
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const Setting = require('../models/Setting');
const User = require('../models/User');

// Razão pontos/consumidores-únicos acima disso vira alerta de anomalia no relatório.
const ANOMALY_RATIO = 20;

router.use(verifyToken, requireAdmin);

function parsePeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const [year, month] = period.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

async function getSettingNumber(key, fallback) {
  const doc = await Setting.findOne({ key }).lean();
  const value = parseFloat(doc?.value);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Monta o relatório do período: pontos válidos (view/read não-flagged) por
 * canal, share, alertas de anomalia e o pool sugerido (regra híbrida:
 * impressões÷1000 × CPM + assinantes premium ativos × valor-por-assinante).
 */
async function buildReport(range) {
  // Pontos por série + consumidores únicos (userId ou ipHash) para anomalia
  const perSeries = await EngagementEvent.aggregate([
    { $match: {
      type: { $in: ['view', 'read'] },
      flagged: false,
      seriesId: { $ne: null },
      createdAt: { $gte: range.start, $lt: range.end },
    } },
    { $group: {
      _id: '$seriesId',
      points: { $sum: 1 },
      consumers: { $addToSet: { $ifNull: ['$userId', '$ipHash'] } },
    } },
  ]);

  const seriesIds = perSeries.map(s => s._id);
  const seriesDocs = await Series.find({ _id: { $in: seriesIds } }).select('title channelId').lean();
  const seriesById = new Map(seriesDocs.map(s => [String(s._id), s]));

  // Agrupa por canal
  const byChannel = new Map();
  for (const row of perSeries) {
    const serie = seriesById.get(String(row._id));
    const channelKey = serie?.channelId ? String(serie.channelId) : 'none';
    if (!byChannel.has(channelKey)) {
      byChannel.set(channelKey, { channelId: serie?.channelId ?? null, points: 0, consumers: 0, series: [] });
    }
    const ch = byChannel.get(channelKey);
    ch.points += row.points;
    ch.consumers += row.consumers.length;
    ch.series.push({ seriesId: row._id, title: serie?.title ?? '(série removida)', points: row.points });
  }

  const channelIds = [...byChannel.values()].map(c => c.channelId).filter(Boolean);
  const channelDocs = await Channel.find({ _id: { $in: channelIds } }).select('name').lean();
  const channelNames = new Map(channelDocs.map(c => [String(c._id), c.name]));

  const totalPoints = [...byChannel.values()].reduce((sum, c) => sum + c.points, 0);
  const channels = [...byChannel.entries()].map(([key, c]) => ({
    channelId: c.channelId,
    channelName: c.channelId ? (channelNames.get(key) ?? '(canal removido)') : 'Sem canal',
    points: c.points,
    share: totalPoints > 0 ? c.points / totalPoints : 0,
    anomaly: c.consumers > 0 && c.points / c.consumers > ANOMALY_RATIO,
    series: c.series.sort((a, b) => b.points - a.points),
  })).sort((a, b) => b.points - a.points);

  // Pool sugerido (híbrido — o admin confirma/ajusta no fechamento)
  const [adImpressions, cpm, perSub] = await Promise.all([
    EngagementEvent.countDocuments({
      type: 'ad_impression', flagged: false,
      createdAt: { $gte: range.start, $lt: range.end },
    }),
    getSettingNumber('premium_cpm_rate', 0),
    getSettingNumber('royalty_premium_per_sub', 0),
  ]);
  const now = new Date();
  const premiumUsers = await User.countDocuments({
    isPremium: true,
    $or: [{ premiumExpiresAt: null }, { premiumExpiresAt: { $gt: now } }],
  });
  const poolSuggested = (adImpressions / 1000) * cpm + premiumUsers * perSub;

  return { channels, totalPoints, adImpressions, premiumUsers, cpm, perSub, poolSuggested };
}

// GET /api/admin/royalties/report?period=YYYY-MM
router.get('/report', async (req, res) => {
  try {
    const range = parsePeriod(req.query.period);
    if (!range) return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });

    const report = await buildReport(range);
    const closed = await RoyaltyPeriod.findOne({ period: req.query.period }).lean();
    res.json({ period: req.query.period, ...report, closedPeriod: closed || null });
  } catch (err) {
    logger.error('[Royalties] GET /report', err);
    res.status(500).json({ error: 'Erro ao montar o relatório.' });
  }
});

// POST /api/admin/royalties/close — fecha o período com o pool confirmado
router.post('/close', async (req, res) => {
  try {
    const { period, poolFinal } = req.body;
    const range = parsePeriod(period);
    if (!range) return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });
    const pool = Number(poolFinal);
    if (!Number.isFinite(pool) || pool < 0) {
      return res.status(400).json({ error: 'poolFinal deve ser um número ≥ 0.' });
    }

    const existing = await RoyaltyPeriod.findOne({ period }).lean();
    if (existing) return res.status(409).json({ error: `O período ${period} já foi fechado.` });

    const report = await buildReport(range);
    const doc = await RoyaltyPeriod.create({
      period,
      poolSuggested: report.poolSuggested,
      poolFinal: pool,
      status: 'closed',
      breakdown: report.channels.map(c => ({
        channelId: c.channelId,
        channelName: c.channelName,
        points: c.points,
        share: c.share,
        amount: Math.round(c.share * pool * 100) / 100,
      })),
      closedAt: new Date(),
      closedBy: req.user.id,
    });

    logger.info(`[Royalties] Período ${period} fechado: pool R$ ${pool} (sugerido R$ ${report.poolSuggested.toFixed(2)})`);
    res.status(201).json(doc);
  } catch (err) {
    // Corrida entre dois fechamentos simultâneos: o índice único decide.
    if (err && err.code === 11000) return res.status(409).json({ error: 'Período já fechado.' });
    logger.error('[Royalties] POST /close', err);
    res.status(500).json({ error: 'Erro ao fechar o período.' });
  }
});

// GET /api/admin/royalties/periods — períodos fechados
router.get('/periods', async (req, res) => {
  try {
    const periods = await RoyaltyPeriod.find().sort({ period: -1 }).lean();
    res.json(periods);
  } catch (err) {
    logger.error('[Royalties] GET /periods', err);
    res.status(500).json({ error: 'Erro ao listar períodos.' });
  }
});

// GET /api/admin/royalties/verify-integrity — re-percorre a cadeia de hash
router.get('/verify-integrity', async (req, res) => {
  try {
    const { computeHash } = require('../services/engagementLogger');
    let lastHash = 'GENESIS';
    let checked = 0;

    const cursor = EngagementEvent.find().sort({ seq: 1 }).lean().cursor();
    for await (const ev of cursor) {
      const expected = computeHash({ ...ev, createdAt: new Date(ev.createdAt) });
      if (ev.prevHash !== lastHash || ev.hash !== expected) {
        return res.json({ ok: false, checked, brokenAt: ev.seq });
      }
      lastHash = ev.hash;
      checked++;
    }
    res.json({ ok: true, checked });
  } catch (err) {
    logger.error('[Royalties] GET /verify-integrity', err);
    res.status(500).json({ error: 'Erro ao verificar integridade.' });
  }
});

// GET /api/admin/royalties/export.csv?period=YYYY-MM
router.get('/export.csv', async (req, res) => {
  try {
    const range = parsePeriod(req.query.period);
    if (!range) return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });

    const closed = await RoyaltyPeriod.findOne({ period: req.query.period }).lean();
    const report = await buildReport(range);
    const pool = closed ? closed.poolFinal : report.poolSuggested;

    const lines = ['canal;pontos;share;valor;status'];
    for (const c of report.channels) {
      const amount = (c.share * pool).toFixed(2);
      lines.push(`${c.channelName.replace(/;/g, ',')};${c.points};${(c.share * 100).toFixed(2)}%;${amount};${closed ? 'fechado' : 'sugerido'}`);
    }
    lines.push(`TOTAL;${report.totalPoints};100%;${pool.toFixed(2)};${closed ? 'fechado' : 'sugerido'}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="royalties-${req.query.period}.csv"`);
    res.send('﻿' + lines.join('\n')); // BOM para o Excel abrir acentos corretamente
  } catch (err) {
    logger.error('[Royalties] GET /export.csv', err);
    res.status(500).json({ error: 'Erro ao exportar CSV.' });
  }
});

module.exports = router;
