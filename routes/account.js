const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const verifyToken = require('../middlewares/verifyToken');
const { clearAuthCookies } = require('../utils/authCookies');
const logger = require('../utils/logger');
const { maskEmail } = require('../utils/pii');
const bunnyStorage = require('../utils/bunnyStorage');

// Upload de avatar: memória (o buffer vai direto pro sharp), só imagem, 5MB.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Apenas imagens são aceitas.'));
  },
});

const User = require('../models/User');
const Vote = require('../models/Vote');
const SeriesVote = require('../models/SeriesVote');
const Favorite = require('../models/Favorite');
const Channel = require('../models/Channel');
const RefreshToken = require('../models/RefreshToken');
const PasswordResetToken = require('../models/PasswordResetToken');
const ReadingProgress = require('../models/ReadingProgress');
const PushSubscription = require('../models/PushSubscription');
const SuperReaderContribution = require('../models/SuperReaderContribution');
const MensagemPortal = require('../models/MensagemPortal');

/**
 * LGPD — Direitos do titular dos dados (Art. 18).
 *  - GET    /api/account/me/export  → portabilidade/acesso (Art. 18, II e V)
 *  - PUT    /api/account/me/consent → revogação/atualização de consentimento (Art. 8º, §5º)
 *  - DELETE /api/account/me         → eliminação dos dados (Art. 18, VI)
 */

// ─── FOTO DE PERFIL ──────────────────────────────────────────────────────────
// POST /api/account/me/avatar — troca a foto de perfil da conta.
router.post('/me/avatar', verifyToken, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    if (!bunnyStorage.isConfigured() && !bunnyStorage.hasTestUploader()) {
      return res.status(503).json({ error: 'Armazenamento de imagens não configurado.' });
    }

    try {
      // Normaliza qualquer imagem para 512×512 webp — tamanho previsível,
      // sem metadados EXIF (privacidade) e barato de servir pelo CDN.
      const sharp = require('sharp');
      const processed = await sharp(req.file.buffer)
        .rotate() // respeita a orientação EXIF antes de descartá-la
        .resize(512, 512, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      // Nome com sufixo aleatório: troca de foto gera URL nova (evita cache
      // do CDN servindo a foto antiga).
      const remotePath = `lorflux/avatars/${req.user.id}-${Date.now().toString(36)}.webp`;
      const url = await bunnyStorage.uploadBufferToStorage(processed, remotePath, 'image/webp');

      await User.findByIdAndUpdate(req.user.id, { avatar: url });
      res.json({ avatar: url });
    } catch (e) {
      logger.error('[Account] POST /me/avatar', e);
      res.status(500).json({ error: 'Erro ao processar a imagem.' });
    }
  });
});

// ─── EXPORTAÇÃO / ACESSO AOS DADOS ───────────────────────────────────────────
router.get('/me/export', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const [votes, seriesVotes, favorites, channels, readingProgress, pushSubscriptions, superReaderContributions, portalMessages] = await Promise.all([
      Vote.find({ userId: req.user.id }).lean(),
      SeriesVote.find({ userId: req.user.id }).lean(),
      Favorite.find({ userId: req.user.id }).lean(),
      Channel.find({ ownerId: req.user.id }).lean(),
      ReadingProgress.find({ userId: req.user.id }).lean(),
      PushSubscription.find({ userId: req.user.id }).lean(),
      SuperReaderContribution.find({ userId: req.user.id })
        .select('seriesId amountCents currency createdAt')
        .populate('seriesId', 'title')
        .lean(),
      // Fase 5 Bloco 1 (LGPD, Task 8): mensagens do portal em que o usuário
      // é autor OU dono da thread — inclusive de threads JÁ ARQUIVADAS (ele
      // era o dono vigente quando escreveu/recebeu; a troca de dono não
      // revoga o direito de acesso aos próprios dados, Art. 18 II/V).
      MensagemPortal.find({ $or: [{ autorUserId: req.user.id }, { ownerUserId: req.user.id }] })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        consent: user.consent || null,
      },
      votes: votes.map(v => ({ episodeId: v.episodeId, type: v.type, createdAt: v.createdAt })),
      seriesVotes: seriesVotes.map(v => ({ seriesId: v.seriesId, type: v.type, createdAt: v.createdAt })),
      favorites: favorites.map(f => ({ seriesId: f.seriesId, createdAt: f.createdAt })),
      // Vínculo de canal (Fase 5 Bloco 1, LGPD): canais onde o titular é
      // ownerId — inclui isActive (canal desativado ainda é vínculo dele,
      // até ser transferido).
      channels: channels.map(c => ({ id: c._id, name: c.name, description: c.description, isActive: c.isActive, createdAt: c.createdAt })),
      readingProgress: readingProgress.map(p => ({
        seriesId: p.seriesId,
        episodeId: p.episodeId,
        contentType: p.contentType,
        percent: p.percent,
        // O segundo exato onde o titular parou de assistir também é dado
        // dele (LGPD, Art. 18) — faltava no export, que trazia só o percentual.
        position: p.position,
        completed: p.completed,
        updatedAt: p.updatedAt,
      })),
      // Sem `keys`: são segredo criptográfico do transporte (Web Push), não
      // dado informativo sobre o titular — endpoint e data bastam para o
      // export (LGPD, Art. 18).
      pushSubscriptions: pushSubscriptions.map(s => ({
        endpoint: s.endpoint,
        createdAt: s.createdAt,
      })),
      // Sem stripeSessionId nem os campos de share (autor/plataforma): são
      // detalhe contábil do repasse ao autor, não dado informativo sobre o
      // titular (mesma lógica das keys de push acima). seriesTitle vem de
      // populate; série apagada vira null (mesmo padrão de
      // routes/superReader.js GET /me) — não explode o export.
      superReaderContributions: superReaderContributions.map(c => ({
        seriesTitle: c.seriesId?.title ?? null,
        amountCents: c.amountCents,
        currency: c.currency,
        createdAt: c.createdAt,
      })),
      // Mensagens do Portal do Ilustrador (Fase 5 Bloco 1, LGPD): autoradas
      // OU recebidas pelo titular, mesmo de threads arquivadas. Sem
      // autorUserId/ownerUserId crus — autorTipo já diz quem escreveu
      // ('ilustrador' é o próprio titular; 'editor' é a Lorflux) sem expor o
      // id de terceiros no export.
      portalMessages: portalMessages.map(m => ({
        canalId: m.canalId,
        autorTipo: m.autorTipo,
        texto: m.texto,
        refTipo: m.refTipo,
        refId: m.refId,
        arquivadaEm: m.arquivadaEm,
        createdAt: m.createdAt,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-lorflux.json"');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    logger.error('[Account] GET /me/export', err);
    res.status(500).json({ error: 'Erro ao exportar dados.' });
  }
});

// ─── ATUALIZAR/REVOGAR CONSENTIMENTO ─────────────────────────────────────────
router.put('/me/consent', verifyToken, async (req, res) => {
  try {
    const { marketing } = req.body;
    if (typeof marketing !== 'boolean') {
      return res.status(400).json({ error: 'O campo "marketing" deve ser booleano.' });
    }
    await User.findByIdAndUpdate(req.user.id, { 'consent.marketing': marketing });
    res.json({ success: true, marketing });
  } catch (err) {
    logger.error('[Account] PUT /me/consent', err);
    res.status(500).json({ error: 'Erro ao atualizar consentimento.' });
  }
});

// ─── EXCLUSÃO DE CONTA (DIREITO AO ESQUECIMENTO) ─────────────────────────────
router.delete('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // Confirmação por senha para contas locais (evita exclusão acidental/CSRF).
    if (user.provider === 'local') {
      const { password } = req.body;
      if (typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Confirme sua senha para excluir a conta.' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash || '');
      if (!ok) return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const userId = user._id;

    // LGPD (Fase 5 Bloco 1, Task 8): dono de canal ATIVO não pode excluir a
    // conta — a obra publicada não pode ficar sem dono. Checado ANTES de
    // qualquer efeito colateral (Stripe, deletes) para que o request
    // bloqueado seja atômico: nada é tocado quando barrado aqui. Porta de
    // saída: o editor desativa o canal (POST /channels/:id/desativar) ou
    // transfere a titularidade (PUT /channels/:id ownerEmail) — qualquer um
    // dos dois desbloqueia a exclusão. 409 (não 400): não é o corpo do
    // request que está errado, é o estado atual da conta que impede a ação.
    const temCanalAtivo = await Channel.exists({ ownerId: userId, isActive: true });
    if (temCanalAtivo) {
      return res.status(409).json({
        error: 'Você é dono de um canal ativo. Para excluir sua conta, transfira a titularidade do canal ou peça ao editor para desativá-lo.',
      });
    }

    // Canais INATIVOS do usuário NUNCA são apagados (obra publicada não pode
    // sumir com a conta do ex-dono, spec Fase 5 Bloco 1) — são transferidos
    // ao primeiro usuário admin (role admin/superadmin, o de createdAt mais
    // antigo) como dono "guarda-chuva" até o editor decidir um novo
    // ilustrador. Se nenhum admin existir (teoricamente impossível: o
    // sistema sempre tem ao menos um), aborta em vez de órfãozar o canal.
    // O LOOKUP do admin roda ANTES do cancel do Stripe: o abort de 500 não
    // pode acontecer com a assinatura já cancelada (achado da revisão da T8).
    const canaisInativos = await Channel.find({ ownerId: userId, isActive: false }).select('_id').lean();
    let primeiroAdmin = null;
    if (canaisInativos.length > 0) {
      primeiroAdmin = await User.findOne({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 });
      if (!primeiroAdmin) {
        logger.error(`[Account] DELETE /me: exclusão abortada — nenhum admin disponível para receber canais de ${maskEmail(user.email)}.`);
        return res.status(500).json({ error: 'Erro ao excluir conta: nenhum administrador disponível para receber seus canais.' });
      }
    }

    // Best-effort: cancela a assinatura no Stripe para cessar o tratamento/cobrança.
    if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (e) {
        logger.warn('[Account] Falha ao cancelar assinatura Stripe na exclusão:', e.message);
      }
    }

    if (canaisInativos.length > 0) {
      await Channel.updateMany(
        { _id: { $in: canaisInativos.map(c => c._id) } },
        { $set: { ownerId: primeiroAdmin._id } }
      );
    }

    await Promise.all([
      Vote.deleteMany({ userId }),
      SeriesVote.deleteMany({ userId }),
      Favorite.deleteMany({ userId }),
      // Channel.deleteMany REMOVIDO (Fase 5 Bloco 1): canal inativo é
      // transferido ao admin acima — nunca apagado; canal ativo já bloqueou
      // a exclusão mais acima. Obra publicada jamais some com a conta.
      ReadingProgress.deleteMany({ userId }),
      PushSubscription.deleteMany({ userId }),
      Channel.updateMany({ followers: userId }, { $pull: { followers: userId } }),
      RefreshToken.deleteMany({ userId: userId.toString() }),
      PasswordResetToken.deleteMany({ userId }),
      // Log de royalties é append-only (cadeia de hash): eventos não podem ser
      // deletados, mas o vínculo com a conta é removido — o userId fica fora
      // do hash justamente para permitir esta desvinculação LGPD.
      require('../models/EngagementEvent').updateMany({ userId }, { $unset: { userId: 1 } }),
      // SuperReaderContribution NÃO é apagada: o valor repassado ao autor é
      // registro contábil do relatório de royalties (soma por canal/período,
      // não por usuário). Anonimiza (userId: null) em vez de deletar — sem o
      // vínculo pessoal, deixa de ser dado pessoal (LGPD).
      SuperReaderContribution.updateMany({ userId }, { $set: { userId: null } }),
      // Mensagens do portal autoradas pelo usuário são comunicação privada
      // dele — apagadas. As do EDITOR na mesma thread ficam (autoria do
      // editor, não dele) — preservam o histórico do canal para o admin/
      // próximo dono, mesmo órfãs de interlocutor.
      MensagemPortal.deleteMany({ autorUserId: userId }),
    ]);

    await User.findByIdAndDelete(userId);
    clearAuthCookies(res);

    logger.info(`[Account] Conta excluída (LGPD): ${maskEmail(user.email)}`);
    res.json({ success: true, message: 'Sua conta e seus dados foram excluídos permanentemente.' });
  } catch (err) {
    logger.error('[Account] DELETE /me', err);
    res.status(500).json({ error: 'Erro ao excluir conta.' });
  }
});

module.exports = router;
