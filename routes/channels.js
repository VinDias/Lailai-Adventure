const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const User = require('../models/User');
const MensagemPortal = require('../models/MensagemPortal');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const optionalAuth = require('../middlewares/optionalAuth');
const logger = require('../utils/logger');
const { responderCastError } = require('../utils/routeErrors');

function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.role === 'superadmin');
}

// GET /api/channels — lista canais (admin). Sem `?includeInactive=true`,
// só ATIVOS (regressão do shape antigo — usado pelo formulário de séries,
// vínculo de canal/ilustrador — Fase 3). Com `includeInactive=true` (Fase 5
// Bloco 2, Task 8 — higiene do Bloco 1: desativar não tinha inversa e o
// canal desativado simplesmente sumia da UI do admin, levando junto a porta
// de entrada para as threads arquivadas), devolve TODOS, com `isActive` no
// select — a rota já é admin-only (middleware abaixo), então o parâmetro só
// tem efeito pra quem já passou por `requireAdmin`.
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const filter = includeInactive ? {} : { isActive: true };
    const channels = await Channel.find(filter).select('name ownerId isActive').sort({ name: 1 }).lean();
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
// Fase 5 Bloco 2, Task 8: canal INATIVO segue 404 para público/não-admin,
// mas o ADMIN enxerga (necessário para o CanaisPanel buscar o detalhe
// completo — dono populado etc. — de um canal listado via
// `?includeInactive=true`); `isActive` já vem no shape por spread do doc.
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('ownerId', 'nome avatar')
      .lean();
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
    if (!channel.isActive && !isAdmin(req.user)) return res.status(404).json({ error: 'Canal não encontrado.' });

    const followers = channel.followers || [];
    const followersCount = followers.length;
    const isFollowing = !!(req.user && followers.some(f => f.toString() === req.user.id));
    const { followers: _followers, ...canalPublico } = channel;

    res.json({ ...canalPublico, followersCount, isFollowing });
  } catch (err) {
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
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
    // Fix round (Fase 5 Bloco 2, Task 8): campo tipado recebendo um valor
    // não-castável (ex.: name como array) faz Channel.create() rodar a
    // validação completa do documento e lançar ValidationError (com um
    // CastError ANINHADO em err.errors.<campo>) — diferente do CastError
    // TOPO DE PILHA que findByIdAndUpdate({runValidators:true}) lança (esse
    // sim tratado por responderCastError, ver PUT /:id abaixo). Sem isto,
    // caía no catch genérico e virava 500 em vez de 400.
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
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
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
    // Fix round (Fase 5 Bloco 2, Task 8): `channel.save()` valida o
    // documento inteiro — name/description/avatar/banner recebendo um valor
    // não-castável (ex.: array) lança ValidationError (CastError aninhado em
    // err.errors.<campo>), NUNCA um CastError no topo (esse já foi tratado
    // acima, para o `:id` da própria rota malformado). Mesmo padrão de
    // routes/content.js POST /series.
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
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
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
    logger.error('[Channels] POST /:id/desativar', err);
    res.status(500).json({ error: 'Erro ao desativar canal.' });
  }
});

// POST /api/channels/:id/reativar — reativa o canal (admin-only)
// Fase 5 Bloco 2, Task 8 (higiene do Bloco 1 — cortesia registrada, não
// faturável): a desativação nunca teve inversa; o canal desativado
// simplesmente sumia da UI do admin (GET / só listava ativos), levando
// junto a única porta de entrada para as threads arquivadas dele.
//
// DECISÃO (documentada, não implementação implícita): reativar NÃO
// desarquiva nenhuma MensagemPortal. A thread arquivada pertence ao ex-dono
// (arquivada no momento da transferência de titularidade — ver PUT /:id
// acima, `MensagemPortal.arquivarThreadDoCanal`); o dono ATUAL do canal já
// tem a própria thread vigente, intacta. Reativar só muda `isActive` — é
// puramente o inverso de desativar, sem efeito nenhum em MensagemPortal.
router.post('/:id/reativar', verifyToken, requireAdmin, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: true } },
      { new: true, select: '-followers' }
    );
    if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json(channel);
  } catch (err) {
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
    logger.error('[Channels] POST /:id/reativar', err);
    res.status(500).json({ error: 'Erro ao reativar canal.' });
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
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
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
    if (responderCastError(err, res, 'Canal não encontrado.')) return;
    logger.error('[Channels] DELETE /:id/follow', err);
    res.status(500).json({ error: 'Erro ao deixar de seguir canal.' });
  }
});

module.exports = router;
