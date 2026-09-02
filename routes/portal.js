/**
 * Portal do Ilustrador (Fase 5 Bloco 1). Nasce nesta Task 3 só com o painel
 * de números — GET /meu-estudio (canais + contagens) e GET /resumo (as
 * MESMAS agregações de royalties que o admin vê, escopadas ao usuário).
 * Tasks 4/6 estendem este arquivo com CRUD de série/capítulo/upload e
 * mensagens, reaproveitando requireCanalDoUsuario abaixo.
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');

const Channel = require('../models/Channel');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const MensagemPortal = require('../models/MensagemPortal');
const RoyaltyPeriod = require('../models/RoyaltyPeriod');
const { parsePeriod, periodoAtual, buildReport, buildSuperReaderSummary } = require('../services/royaltyReportService');

router.use(verifyToken);

/**
 * Guarda de dono, reutilizável pelas Tasks 4/6: exige que o usuário logado
 * seja ownerId de PELO MENOS UM canal ATIVO. 403 com mensagem clara — nunca
 * 404 (diferente do critério de "ver rascunho" de utils/ownership.js: aqui
 * não há segredo a esconder, só uma área que não existe pra quem não é
 * ilustrador). Anexa req.portalChannels (docs) e req.portalChannelIds
 * (string[]) para as rotas usarem sem reconsultar — Tasks 4/6 encadeiam
 * checagem adicional de posse do recurso específico (série/capítulo) em
 * cima disto.
 */
async function requireCanalDoUsuario(req, res, next) {
  try {
    const canais = await Channel.find({ ownerId: req.user.id, isActive: true }).lean();
    if (canais.length === 0) {
      return res.status(403).json({ error: 'Você não é dono de nenhum canal ativo — o Meu Estúdio é só para ilustradores vinculados a um canal.' });
    }
    req.portalChannels = canais;
    req.portalChannelIds = canais.map(c => String(c._id));
    next();
  } catch (err) {
    logger.error('[Portal] requireCanalDoUsuario', err);
    res.status(500).json({ error: 'Erro ao verificar seus canais.' });
  }
}

// GET /api/portal/meu-estudio — canais do usuário + contagens por canal
router.get('/meu-estudio', requireCanalDoUsuario, async (req, res) => {
  try {
    const canais = await Promise.all(req.portalChannels.map(async (canal) => {
      const seriesDoCanal = await Series.find({ channelId: canal._id }).select('_id isPublished submittedAt').lean();
      const seriesIds = seriesDoCanal.map(s => s._id);
      const seriesPendentes = seriesDoCanal.filter(s => s.submittedAt && !s.isPublished).length;

      const [episodiosPendentes, mensagensNaoLidas] = await Promise.all([
        Episode.countDocuments({
          seriesId: { $in: seriesIds },
          submittedAt: { $ne: null },
          status: { $ne: 'published' },
        }),
        // Thread vigente do usuário: canal + ownerUserId = ele mesmo (o
        // dono atual — troca de dono arquiva a thread anterior, T1), só
        // mensagens do editor, ainda não lidas nem arquivadas.
        MensagemPortal.countDocuments({
          canalId: canal._id,
          ownerUserId: req.user.id,
          autorTipo: 'editor',
          lidaEm: null,
          arquivadaEm: null,
        }),
      ]);

      return {
        channelId: canal._id,
        name: canal.name,
        avatar: canal.avatar ?? null,
        obras: seriesDoCanal.length,
        // "Pendentes de aprovação" = submittedAt preenchido e ainda não
        // publicado, somando séries e capítulos (spec).
        pendentes: seriesPendentes + episodiosPendentes,
        mensagensNaoLidas,
      };
    }));

    res.json({ canais });
  } catch (err) {
    logger.error('[Portal] GET /meu-estudio', err);
    res.status(500).json({ error: 'Erro ao montar o Meu Estúdio.' });
  }
});

// GET /api/portal/resumo?period=YYYY-MM — painel de números, escopado aos
// canais ativos do usuário. Mês corrente: pontos/share do MESMO buildReport
// que o admin usa, NUNCA com R$ (o pool só é verdade no fechamento — decisão
// de contrato, não "melhorar" isso). Período fechado: breakdown do
// RoyaltyPeriod, com R$ (números já confirmados). Super Reader sempre por
// mês, escopado.
router.get('/resumo', requireCanalDoUsuario, async (req, res) => {
  try {
    const periodQuery = req.query.period;
    if (periodQuery !== undefined && parsePeriod(periodQuery) === null) {
      return res.status(400).json({ error: 'period deve estar no formato YYYY-MM.' });
    }

    const mesAtual = periodoAtual();
    const period = periodQuery || mesAtual;
    const isMesAtual = period === mesAtual;
    const canalIds = req.portalChannelIds;

    // Dropdown do frontend: períodos fechados em que algum canal do usuário
    // aparece no breakdown (fechado sem nenhum ponto do dono não entra —
    // não há nada a mostrar nele).
    const periodosFechadosDocs = await RoyaltyPeriod.find({ 'breakdown.channelId': { $in: canalIds } })
      .select('period')
      .sort({ period: -1 })
      .lean();
    const periodosFechadosDisponiveis = periodosFechadosDocs.map(p => p.period);

    let status;
    let canais;

    if (isMesAtual) {
      status = 'aberto';
      const range = parsePeriod(period);
      const report = await buildReport(range);
      canais = report.channels
        .filter(c => c.channelId && canalIds.includes(String(c.channelId)))
        .map(c => ({
          channelId: c.channelId,
          channelName: c.channelName,
          points: c.points,
          share: c.share,
          // SEM amount de propósito — mês corrente nunca mostra R$.
        }));
    } else {
      const fechado = await RoyaltyPeriod.findOne({ period }).lean();
      if (!fechado) {
        return res.status(404).json({ error: `Período ${period} não encontrado ou ainda não fechado.` });
      }
      status = 'fechado';
      canais = (fechado.breakdown || [])
        .filter(b => b.channelId && canalIds.includes(String(b.channelId)))
        .map(b => ({
          channelId: b.channelId,
          channelName: b.channelName,
          points: b.points,
          share: b.share,
          amount: b.amount,
        }));
    }

    const srSummary = await buildSuperReaderSummary(period);
    const superReader = {
      porCanal: srSummary.porCanal
        .filter(c => c.channelId && canalIds.includes(String(c.channelId)))
        .map(({ channelId, channelName, apoios, autorCents }) => ({ channelId, channelName, apoios, autorCents })),
    };

    res.json({ period, status, canais, superReader, periodosFechadosDisponiveis });
  } catch (err) {
    logger.error('[Portal] GET /resumo', err);
    res.status(500).json({ error: 'Erro ao montar o resumo.' });
  }
});

module.exports = router;
