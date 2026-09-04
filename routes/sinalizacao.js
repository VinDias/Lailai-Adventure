/**
 * Fase 5 Bloco 3 — sinalização de conteúdo pelo LEITOR (montado em
 * /api/content, ao lado de routes/content.js). Regra 5 do Vin: uma conta =
 * uma sinalização por obra (unique do model; para sempre, mesmo após o caso
 * ser revisado). Regra 8: esta rota nunca devolve contagem nem existência
 * de caso — só o estado do PRÓPRIO usuário.
 *
 * Visibilidade: mesma composição de GET /content/series/:id
 * (content.js:173-186), mas isPublished é exigido para TODOS (inclusive
 * admin/dono): rascunho e obra despublicada pela curadoria não podem
 * acumular sinal nem confirmar existência -> 404 sem write.
 */
const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const User = require('../models/User');
const Sinalizacao = require('../models/Sinalizacao');
const EngagementEvent = require('../models/EngagementEvent');
const verifyToken = require('../middlewares/verifyToken');
const sinalizacaoLimiter = require('../middlewares/sinalizacaoLimiter');
const { serieVisivelPara } = require('../utils/parentalFilter');
const { responderCastError } = require('../utils/routeErrors');
const { pseudonymize } = require('../services/engagementLogger');
const curadoriaService = require('../services/curadoriaService');
const L = require('../utils/curadoriaLimiares');
const logger = require('../utils/logger');

const NAO_ENCONTRADA = 'Série não encontrada.';

// Devolve a série publicada e visível, ou responde 404 e devolve null.
async function serieSinalizavel(req, res) {
  const series = await Series.findById(req.params.id).lean();
  if (!series || !series.isPublished || !(await serieVisivelPara(req.user, series))) {
    res.status(404).json({ error: NAO_ENCONTRADA });
    return null;
  }
  return series;
}

router.post('/series/:id/sinalizar', verifyToken, sinalizacaoLimiter, async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!L.MOTIVOS.includes(motivo)) {
      return res.status(400).json({ error: 'motivo inválido.' });
    }
    const descricao = req.body.descricao === undefined || req.body.descricao === null ? null : String(req.body.descricao).trim() || null;
    if (descricao && descricao.length > L.DESCRICAO_MAX) {
      return res.status(400).json({ error: `descricao deve ter no máximo ${L.DESCRICAO_MAX} caracteres.` });
    }
    if (L.MOTIVOS_COM_DESCRICAO_OBRIGATORIA.includes(motivo) && !descricao) {
      return res.status(400).json({ error: 'Descreva o motivo da sinalização.' });
    }

    const series = await serieSinalizavel(req, res);
    if (!series) return;

    if (series.channelId) {
      const canal = await Channel.findById(series.channelId).select('ownerId').lean();
      if (canal && String(canal.ownerId) === String(req.user.id)) {
        return res.status(400).json({ error: 'Você não pode sinalizar a própria obra.', code: 'propria_obra' });
      }
    }

    const existente = await Sinalizacao.findOne({ userId: req.user.id, seriesId: series._id }).select('_id').lean();
    if (existente) return res.json({ jaSinalizada: true });

    const usuario = await User.findById(req.user.id).select('createdAt').lean();
    if (!usuario) return res.status(401).json({ error: 'Sessão inválida.' });

    // Graves não exigem consumo (o titular de direitos reconhece a cópia
    // pela capa); motivo normal exige consumo REAL = evento não-flagged do
    // próprio usuário na obra. ReadingProgress não vale: PUT /me/progress
    // aceita ids arbitrários sem barreira.
    const grave = L.ehGrave(motivo);
    let valida = true;
    let invalidaMotivo = null;
    if (!grave) {
      const consumo = await EngagementEvent.exists({ seriesId: series._id, userId: usuario._id, type: { $in: ['view', 'read'] }, flagged: false });
      if (!consumo) { valida = false; invalidaMotivo = 'sem_consumo'; }
    }

    try {
      await Sinalizacao.create({
        seriesId: series._id, userId: usuario._id, motivo, grave, descricao, valida, invalidaMotivo,
        // Contas anteriores ao `timestamps` do schema de User não têm createdAt.
        contaCriadaEm: usuario.createdAt || usuario._id.getTimestamp(),
        ipHash: pseudonymize(req.ip),
      });
    } catch (err) {
      // Corrida de duplo clique: a outra requisição gravou — mesmo 200.
      if (err && err.code === 11000) return res.json({ jaSinalizada: true });
      throw err;
    }

    res.status(201).json({ jaSinalizada: false });
    if (valida) curadoriaService.dispararAvaliacao(series._id);
  } catch (err) {
    if (responderCastError(err, res, NAO_ENCONTRADA)) return;
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    logger.error('[Sinalizacao] POST /series/:id/sinalizar', err);
    res.status(500).json({ error: 'Erro ao registrar sinalização.' });
  }
});

router.get('/series/:id/sinalizacao', verifyToken, async (req, res) => {
  try {
    const series = await serieSinalizavel(req, res);
    if (!series) return;
    const minha = await Sinalizacao.findOne({ userId: req.user.id, seriesId: series._id }).select('motivo').lean();
    res.json({ jaSinalizada: !!minha, motivo: minha ? minha.motivo : null });
  } catch (err) {
    if (responderCastError(err, res, NAO_ENCONTRADA)) return;
    logger.error('[Sinalizacao] GET /series/:id/sinalizacao', err);
    res.status(500).json({ error: 'Erro ao buscar sinalização.' });
  }
});

module.exports = router;
