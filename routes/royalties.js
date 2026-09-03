const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

const EngagementEvent = require('../models/EngagementEvent');
const RoyaltyPeriod = require('../models/RoyaltyPeriod');
// buildReport/buildSuperReaderSummary saíram daqui para
// services/royaltyReportService.js na Fase 5 Bloco 1 (Task 3) — o portal do
// ilustrador (routes/portal.js) precisa das MESMAS agregações. Comportamento
// idêntico: só mudou o endereço das funções (mesma lógica, mesmos campos).
const { parsePeriod, buildReport, buildSuperReaderSummary } = require('../services/royaltyReportService');

router.use(verifyToken, requireAdmin);

// GET /api/admin/royalties/report?period=YYYY-MM
router.get('/report', async (req, res) => {
  try {
    const range = parsePeriod(req.query.period);
    if (!range) return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });

    const report = await buildReport(range);
    const srSummary = await buildSuperReaderSummary(req.query.period);
    // Shape público da spec: só channelId/channelName/apoios/autorCents por
    // canal (plataformaCents por canal fica interno, usado só no CSV).
    const superReader = {
      porCanal: srSummary.porCanal.map(({ channelId, channelName, apoios, autorCents }) => ({ channelId, channelName, apoios, autorCents })),
      totalAutorCents: srSummary.totalAutorCents,
      totalPlataformaCents: srSummary.totalPlataformaCents,
      totalApoios: srSummary.totalApoios,
    };
    const closed = await RoyaltyPeriod.findOne({ period: req.query.period }).lean();
    res.json({ period: req.query.period, ...report, superReader, closedPeriod: closed || null });
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

    // Bloco separado: apoio Super Reader (80% autor / 20% plataforma), fora
    // do pool acima — não mexe em nenhuma linha/coluna já existente.
    const srSummary = await buildSuperReaderSummary(req.query.period);
    lines.push('');
    lines.push('Super Reader (direto ao autor)');
    lines.push('canal;apoios;autor;plataforma');
    for (const c of srSummary.porCanal) {
      const nome = (c.channelName ?? '(canal removido)').replace(/;/g, ',');
      lines.push(`${nome};${c.apoios};${(c.autorCents / 100).toFixed(2)};${(c.plataformaCents / 100).toFixed(2)}`);
    }
    lines.push(`TOTAL;${srSummary.totalApoios};${(srSummary.totalAutorCents / 100).toFixed(2)};${(srSummary.totalPlataformaCents / 100).toFixed(2)}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="royalties-${req.query.period}.csv"`);
    res.send('﻿' + lines.join('\n')); // BOM para o Excel abrir acentos corretamente
  } catch (err) {
    logger.error('[Royalties] GET /export.csv', err);
    res.status(500).json({ error: 'Erro ao exportar CSV.' });
  }
});

module.exports = router;
