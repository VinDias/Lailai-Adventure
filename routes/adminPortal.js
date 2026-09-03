/**
 * Portal do Ilustrador — lado do EDITOR (Fase 5 Bloco 1, Task 6). Mensagens
 * por canal (thread vigente + arquivadas — o admin vê tudo). Montado em
 * `/api/admin` (server.js), NÃO em `/api/admin/mensagens`: a Task 7 acrescenta
 * `GET /admin/aprovacoes` + `POST /admin/aprovacoes/:tipo/:id/(aprovar|devolver)`
 * neste MESMO arquivo, e a spec pina os dois caminhos como filhos diretos de
 * `/admin` (`/admin/mensagens/:canalId`, `/admin/aprovacoes`) — terreno
 * arrumado para não precisar remontar nada na T7.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');

const Channel = require('../models/Channel');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const MensagemPortal = require('../models/MensagemPortal');

const REF_TIPOS = ['series', 'episode'];

/**
 * Valida refTipo/refId do POST admin (item 4 da Task 6): os dois são
 * opcionais, mas só como PAR (um sem o outro é erro); refTipo precisa estar
 * no enum; refId precisa ser um ObjectId válido; e o recurso referenciado
 * precisa PERTENCER ao canal informado — senão o editor apontaria a mensagem
 * (e, na Task 7, a devolução) para a obra errada, mesmo sem querer.
 * Devolve { refTipo, refId } prontos para gravar, ou { error }.
 */
async function validarRef(refTipo, refId, canalId) {
  if (refTipo === undefined && refId === undefined) {
    return { refTipo: null, refId: null };
  }
  if (!refTipo || !refId) {
    return { error: 'refTipo e refId devem ser enviados juntos.' };
  }
  if (!REF_TIPOS.includes(refTipo)) {
    return { error: 'refTipo deve ser "series" ou "episode".' };
  }
  if (!mongoose.Types.ObjectId.isValid(refId)) {
    return { error: 'refId inválido.' };
  }

  if (refTipo === 'series') {
    const series = await Series.findById(refId).select('channelId').lean();
    if (!series || !series.channelId || String(series.channelId) !== String(canalId)) {
      return { error: 'refId não corresponde a uma série deste canal.' };
    }
  } else {
    const episode = await Episode.findById(refId).select('seriesId').lean();
    if (!episode) return { error: 'refId não corresponde a um episódio deste canal.' };
    const series = await Series.findById(episode.seriesId).select('channelId').lean();
    if (!series || !series.channelId || String(series.channelId) !== String(canalId)) {
      return { error: 'refId não corresponde a um episódio deste canal.' };
    }
  }

  return { refTipo, refId };
}

// GET /api/admin/mensagens/:canalId — TODAS as threads do canal (vigente +
// arquivadas — o admin vê tudo, diferente do dono comum que só vê a
// vigente). Shape: agrupado por thread { ownerUserId, arquivadaEm } — vigente
// primeiro (no máximo uma), depois as arquivadas da transferência mais
// recente para a mais antiga; mensagens de cada thread em ordem ASC.
//
// DECISÃO (lidaEm simétrico — espelha GET /api/portal/mensagens): abrir esta
// tela marca como lida TODA mensagem do ILUSTRADOR ainda não lida NO CANAL
// INTEIRO — vigente E arquivadas. Não faz sentido manter uma thread arquivada
// eternamente "não lida": o admin já está vendo o histórico completo aqui.
// Mensagens do PRÓPRIO editor nunca são tocadas.
router.get('/mensagens/:canalId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const canal = await Channel.findById(req.params.canalId).lean();
    if (!canal) return res.status(404).json({ error: 'Canal não encontrado.' });

    await MensagemPortal.updateMany(
      { canalId: canal._id, autorTipo: 'ilustrador', lidaEm: null },
      { $set: { lidaEm: new Date() } }
    );

    const mensagens = await MensagemPortal.find({ canalId: canal._id }).sort({ createdAt: 1 }).lean();

    const threadsPorChave = new Map();
    for (const msg of mensagens) {
      const chave = `${msg.ownerUserId}:${msg.arquivadaEm ? new Date(msg.arquivadaEm).toISOString() : 'vigente'}`;
      if (!threadsPorChave.has(chave)) {
        threadsPorChave.set(chave, {
          ownerUserId: msg.ownerUserId,
          vigente: !msg.arquivadaEm,
          arquivadaEm: msg.arquivadaEm || null,
          mensagens: [],
        });
      }
      threadsPorChave.get(chave).mensagens.push(msg);
    }

    const threads = [...threadsPorChave.values()].sort((a, b) => {
      if (a.vigente !== b.vigente) return a.vigente ? -1 : 1;
      if (a.vigente) return 0; // só pode haver uma thread vigente por canal
      return new Date(b.arquivadaEm) - new Date(a.arquivadaEm);
    });

    res.json({ canalId: canal._id, threads });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Canal não encontrado.' });
    logger.error('[AdminPortal] GET /mensagens/:canalId', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens do canal.' });
  }
});

// POST /api/admin/mensagens/:canalId — cria mensagem do EDITOR na thread do
// DONO ATUAL do canal. ownerUserId é SEMPRE resolvido aqui a partir do
// channel.ownerId — nunca vem do body (ownerId é required no schema de
// Channel; mesmo um canal sem ilustrador "de verdade" vinculado tem um
// ownerId válido — a mensagem cai na thread desse dono, o que é o
// comportamento correto). refTipo/refId opcionais e validados por validarRef.
router.post('/mensagens/:canalId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const canal = await Channel.findById(req.params.canalId).lean();
    if (!canal) return res.status(404).json({ error: 'Canal não encontrado.' });

    const texto = req.body.texto;
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ error: 'texto é obrigatório.' });
    }

    const refResolvido = await validarRef(req.body.refTipo, req.body.refId, canal._id);
    if (refResolvido.error) {
      return res.status(400).json({ error: refResolvido.error });
    }

    const mensagem = await MensagemPortal.create({
      canalId: canal._id,
      ownerUserId: canal.ownerId,
      autorTipo: 'editor',
      autorUserId: req.user.id,
      texto,
      refTipo: refResolvido.refTipo,
      refId: refResolvido.refId,
    });

    res.status(201).json(mensagem);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'CastError') return res.status(404).json({ error: 'Canal não encontrado.' });
    logger.error('[AdminPortal] POST /mensagens/:canalId', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

module.exports = router;
