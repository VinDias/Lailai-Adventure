const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');

// GET /api/channels/me — canais do usuário autenticado
router.get('/me', verifyToken, async (req, res) => {
  try {
    const channels = await Channel.find({ ownerId: req.user.id, isActive: true }).lean();
    res.json(channels);
  } catch (err) {
    logger.error('[Channels] GET /me', err);
    res.status(500).json({ error: 'Erro ao buscar canais.' });
  }
});

// GET /api/channels/:id — detalhes de um canal
router.get('/:id', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('ownerId', 'nome avatar')
      .lean();
    if (!channel || !channel.isActive) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json(channel);
  } catch (err) {
    logger.error('[Channels] GET /:id', err);
    res.status(500).json({ error: 'Erro ao buscar canal.' });
  }
});

// POST /api/channels — criar canal
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, avatar, banner } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório.' });

    const channel = await Channel.create({ ownerId: req.user.id, name, description, avatar, banner });
    logger.info(`[Channel] Criado: ${name} por ${req.user.email}`);
    res.status(201).json(channel);
  } catch (err) {
    logger.error('[Channels] POST /', err);
    res.status(500).json({ error: 'Erro ao criar canal.' });
  }
});

// PUT /api/channels/:id — editar canal (apenas dono)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const channel = await Channel.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado ou sem permissão.' });

    const { name, description, avatar, banner } = req.body;
    if (name) channel.name = name;
    if (description !== undefined) channel.description = description;
    if (avatar !== undefined) channel.avatar = avatar;
    if (banner !== undefined) channel.banner = banner;

    await channel.save();
    res.json(channel);
  } catch (err) {
    logger.error('[Channels] PUT /:id', err);
    res.status(500).json({ error: 'Erro ao atualizar canal.' });
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
