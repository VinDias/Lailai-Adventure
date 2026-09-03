const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const User = require('../models/User');
const MensagemPortal = require('../models/MensagemPortal');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const optionalAuth = require('../middlewares/optionalAuth');
const logger = require('../utils/logger');

function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.role === 'superadmin');
}

// GET /api/channels — lista todos os canais ativos (admin)
// Usado pelo formulário de séries (vínculo de canal/ilustrador — Fase 3).
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const channels = await Channel.find({ isActive: true }).select('name ownerId').sort({ name: 1 }).lean();
    res.json(channels);
  } catch (err) {
    logger.error('[Channels] GET /', err);
    res.status(500).json({ error: 'Erro ao listar canais.' });
  }
});

// GET /api/channels/me — canais do usuário autenticado
// Sem followers[] (userIds de leitores são dado pessoal — mesmo critério do
// GET /:id público; o dono não precisa da lista, só de contagem se um dia
// precisar de algo).
router.get('/me', verifyToken, async (req, res) => {
  try {
    const channels = await Channel.find({ ownerId: req.user.id, isActive: true }).select('-followers').lean();
    res.json(channels);
  } catch (err) {
    logger.error('[Channels] GET /me', err);
    res.status(500).json({ error: 'Erro ao buscar canais.' });
  }
});

// GET /api/channels/:id — detalhes de um canal (público)
// Shape pinado (Fase 5 Bloco 1): followersCount (número) + isFollowing
// (bool, false se anônimo) — o array followers[] (userIds, dado pessoal)
// NÃO é devolvido. optionalAuth: token é opcional, só afeta isFollowing.
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('ownerId', 'nome avatar')
      .lean();
    if (!channel || !channel.isActive) return res.status(404).json({ error: 'Canal não encontrado.' });

    const followers = channel.followers || [];
    const followersCount = followers.length;
    const isFollowing = !!(req.user && followers.some(f => f.toString() === req.user.id));
    const { followers: _followers, ...canalPublico } = channel;

    res.json({ ...canalPublico, followersCount, isFollowing });
  } catch (err) {
    logger.error('[Channels] GET /:id', err);
    res.status(500).json({ error: 'Erro ao buscar canal.' });
  }
});

// POST /api/channels — criar canal (admin-only: vincular um canal a um
// ilustrador é decisão do Master, nunca autopromoção — ver spec Fase 5
// Bloco 1, "Quem é ilustrador")
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, avatar, banner } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório.' });

    const channel = await Channel.create({ ownerId: req.user.id, name, description, avatar, banner });
    logger.info(`[Channel] Criado: ${name} por userId ${req.user.id}`);
    res.status(201).json(channel);
  } catch (err) {
    logger.error('[Channels] POST /', err);
    res.status(500).json({ error: 'Erro ao criar canal.' });
  }
});

// PUT /api/channels/:id — editar canal
// Admin: edita QUALQUER canal (sem filtro de ownerId) e é o ÚNICO que
// processa `ownerEmail` (resolve e-mail→User, troca ownerId — arquiva a
// thread de mensagens do dono anterior, LGPD). Não-admin: segue escopado a
// si mesmo (findOne com ownerId) e, se enviar `ownerEmail`, leva 403 SEMPRE
// — nunca é silenciosamente ignorado (spec Fase 5 Bloco 1).
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, avatar, banner, ownerEmail } = req.body;
    const admin = isAdmin(req.user);

    if (!admin && ownerEmail !== undefined) {
      return res.status(403).json({ error: 'Apenas administradores podem transferir a titularidade do canal.' });
    }

    const channel = admin
      ? await Channel.findById(req.params.id)
      : await Channel.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado ou sem permissão.' });

    if (admin && ownerEmail !== undefined) {
      const novoDono = await User.findOne({ email: String(ownerEmail).toLowerCase().trim() });
      if (!novoDono) return res.status(404).json({ error: 'Usuário com esse e-mail não encontrado.' });

      // ownerEmail do MESMO dono vigente (ex.: form do admin pré-populado)
      // não é troca — no-op: não arquiva a thread nem mexe em ownerId.
      const mesmoDono = channel.ownerId && channel.ownerId.equals(novoDono._id);
      if (!mesmoDono) {
        // Troca de dono arquiva a thread vigente ANTES de mudar ownerId — o
        // histórico privado do ex-dono não pode vazar para o sucessor.
        await MensagemPortal.arquivarThreadDoCanal(channel._id);
        channel.ownerId = novoDono._id;
      }
    }

    if (name) channel.name = name;
    if (description !== undefined) channel.description = description;
    if (avatar !== undefined) channel.avatar = avatar;
    if (banner !== undefined) channel.banner = banner;

    await channel.save();
    // followers[] fora da resposta — mesmo critério do GET /:id público.
    const { followers: _followers, ...semFollowers } = channel.toObject();
    res.json(semFollowers);
  } catch (err) {
    logger.error('[Channels] PUT /:id', err);
    res.status(500).json({ error: 'Erro ao atualizar canal.' });
  }
});

// POST /api/channels/:id/desativar — desativa o canal (admin-only)
// Desbloqueia a exclusão de conta do ex-dono (LGPD, Task 8) sem apagar obra
// publicada nem órfãozar o canal.
router.post('/:id/desativar', verifyToken, requireAdmin, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true, select: '-followers' }
    );
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json(channel);
  } catch (err) {
    logger.error('[Channels] POST /:id/desativar', err);
    res.status(500).json({ error: 'Erro ao desativar canal.' });
  }
});

// POST /api/channels/:id/follow — seguir canal
router.post('/:id/follow', verifyToken, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { followers: req.user.id } },
      { new: true }
    );
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json({ success: true, followers: channel.followers.length });
  } catch (err) {
    logger.error('[Channels] POST /:id/follow', err);
    res.status(500).json({ error: 'Erro ao seguir canal.' });
  }
});

// DELETE /api/channels/:id/follow — deixar de seguir
router.delete('/:id/follow', verifyToken, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { $pull: { followers: req.user.id } },
      { new: true }
    );
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json({ success: true, followers: channel.followers.length });
  } catch (err) {
    logger.error('[Channels] DELETE /:id/follow', err);
    res.status(500).json({ error: 'Erro ao deixar de seguir canal.' });
  }
});

module.exports = router;
