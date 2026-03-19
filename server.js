
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const Sentry = require("@sentry/node");

// Configurações Iniciais
dotenv.config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux')
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => {
    console.error('❌ Erro ao conectar MongoDB:', err);
    process.exit(1);
  });

// 0. PROTEÇÃO CONTRA CRASH E VALIDAÇÃO DE AMBIENTE
process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

if (!process.env.NODE_ENV) {
  throw new Error("NODE_ENV not defined. Please check your environment configuration.");
}

if (process.env.NODE_ENV === "production" && process.env.DEBUG === "true") {
  throw new Error("DEBUG mode cannot run in production environment for security reasons.");
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 1. COMPATIBILIDADE COM NGINX (PROXY REVERSO)
app.set("trust proxy", 1);

// Importação de Modelos e Utils
const logger = require("./utils/logger");
const upload = require("./middlewares/uploadConfig");
const verifyToken = require("./middlewares/verifyToken");
const requireAdmin = require("./middlewares/requireAdmin");
const videoQueue = require("./queues/videoQueue");
const { createContentFolder } = require("./utils/storageManager");
const { createContentSchema } = require("./validators/contentValidator");
const RefreshToken = require("./models/RefreshToken");
const AdminLog = require("./models/AdminLog");
const verifyMediaToken = require("./middlewares/verifyMediaToken");
const User = require("./models/User");

// 2. MONITORAMENTO DE ERROS (SENTRY PROFISSIONAL)
if (process.env.SENTRY_DSN) {
  Sentry.init({ 
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development'
  });
  app.use(Sentry.Handlers.requestHandler());
}

// 3. HEALTHCHECK SISTEM
app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    env: process.env.NODE_ENV
  });
});

// 4. CONFIGURAÇÃO SEGURA DE CORS
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173", 
  credentials: true 
}));

// 5. PROTEÇÃO EXTRA STRIPE WEBHOOK (DEVE VIR ANTES DO express.json)
const paymentRoutes = require("./routes/payment");
// O webhook dentro de paymentRoutes já usa express.raw, 
// mas garantimos que nada o consumiu antes.
app.use("/api/payment", paymentRoutes);

// 6. SEGURANÇA E PERFORMANCE GLOBAL
app.disable("x-powered-by");
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// 7. RATE LIMITS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Muitas requisições originadas deste IP." }
});

const loginLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 5,
      message: { error: "Muitas tentativas de login. Tente novamente em 10 minutos." }
    });

app.use("/api", globalLimiter);

// 8. CONFIGURAÇÕES EXPRESS E PARSERS
app.use(cookieParser());
app.use(express.json({ limit: process.env.MAX_UPLOAD_SIZE || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 9. PROTEÇÃO ANTI-HOTLINK E ARQUIVOS ESTÁTICOS
app.use("/uploads/videos", verifyMediaToken, express.static(path.join(__dirname, "uploads/videos"), {
  dotfiles: "deny",
  index: false,
  maxAge: "7d"
}));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  dotfiles: "deny",
  index: false,
  maxAge: "7d"
}));

app.use("/thumbnails", express.static(path.join(__dirname, "uploads/thumbnails"), {
  maxAge: "30d"
}));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Middleware Global de Verificação de Conta Ativa
app.use(async (req, res, next) => {
  if (req.user && req.user.id) {
    try {
      const u = await User.findById(req.user.id);
      if (u && !u.isActive) {
        return res.status(403).json({ message: "Your account has been disabled." });
      }
    } catch (e) { /* silent fail for mock compat */ }
  }
  next();
});

// 10. DEMAIS ROTAS E ENDPOINTS
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));
app.use("/api/admin/management", require("./routes/admin"));
app.use("/api/admin/users", require("./routes/adminManagement"));
app.use("/api/admin/ads", require("./routes/ads"));
app.use("/api/bunny", require("./routes/bunnyWebhook"));
app.use("/api/content", require("./routes/content"));
app.use("/api/channels", require("./routes/channels"));

// ADMIN METRICS — likes/dislikes por episódio
app.get('/api/admin/episodes/:id/metrics', verifyToken, requireAdmin, async (req, res) => {
  try {
    const Vote = require('./models/Vote');
    const [likes, dislikes] = await Promise.all([
      Vote.countDocuments({ episodeId: req.params.id, type: 'like' }),
      Vote.countDocuments({ episodeId: req.params.id, type: 'dislike' })
    ]);
    res.json({ likes, dislikes, total: likes + dislikes });
  } catch (err) {
    logger.error('[Admin] GET /admin/episodes/:id/metrics', err);
    res.status(500).json({ error: 'Erro ao buscar métricas.' });
  }
});

// LOGOUT SEGURO COM REVOGAÇÃO
app.post('/api/auth/logout', verifyToken, async (req, res) => {
  try {
    await RefreshToken.deleteMany({ userId: req.user.id });
    res.clearCookie('accessToken');
    res.json({ message: "Sessão encerrada com segurança em todos os dispositivos." });
  } catch (err) {
    logger.error("[Logout Error]", err);
    res.status(500).json({ error: "Erro ao processar logout." });
  }
});

// UPLOAD ADMIN COM FILA E LOG DE AÇÕES
app.post('/api/admin/upload-content', verifyToken, requireAdmin, upload.fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "panels", maxCount: 120 }
]), async (req, res) => {
  try {
    const { error } = createContentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { type, section, title } = req.body;

    if (type === "video" && req.files['video']) {
      const videoFile = req.files['video'][0];
      const folderPath = createContentFolder('videos', section, title);
      
      await videoQueue.add("process-video", {
        inputPath: videoFile.path,
        outputPath: folderPath
      });
      
      await AdminLog.create({
        adminId: req.user.id,
        action: "UPLOAD_VIDEO",
        targetId: title,
        details: { section, type }
      });

      logger.info(`[Admin] ${req.user.email} enviou vídeo: ${title}`);
    }

    res.json({ 
      success: true, 
      message: "Conteúdo recebido e enfileirado para processamento assíncrono.",
      status: "queued"
    });
  } catch (err) {
    logger.error("[Upload Error]", err);
    res.status(500).json({ error: "Erro interno ao processar upload." });
  }
});

// REGISTRO DE NOVO USUÁRIO
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nome } = req.body;
    if (!email || !password || !nome) {
      return res.status(400).json({ error: "Email, senha e nome são obrigatórios." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Este email já está cadastrado." });
    }

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      nome,
      role: 'user',
      isPremium: false,
      isActive: true,
      provider: 'local'
    });

    const payload = { id: user._id, email: user.email, role: user.role, isPremium: false, premiumExpiresAt: null };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    logger.info(`Novo usuário registrado: ${email}`);

    // Envia e-mail de boas-vindas de forma assíncrona (não bloqueia a resposta)
    const { sendWelcome } = require('./services/emailService');
    sendWelcome(user).catch(err => logger.error('[Email] Falha ao enviar boas-vindas:', err.message));

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: false
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    logger.error("[Register Error]", err);
    res.status(500).json({ error: "Erro ao criar conta." });
  }
});

// LOGIN COM BCRYPT E MONGODB
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Conta desativada." });
    }

    const payload = { id: user._id, email: user.email, role: user.role, isPremium: user.isPremium, premiumExpiresAt: user.premiumExpiresAt };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    logger.info(`Login realizado: ${email}`);
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: user.isPremium,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    logger.error("[Login Error]", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post('/api/auth/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.sendStatus(401);

  const stored = await RefreshToken.findOne({ token: refreshToken });
  if (!stored) return res.status(403).json({ error: "Token revogado ou inexistente." });

  try {
    const verified = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const newAccessToken = jwt.sign({ id: verified.id, email: verified.email, role: verified.role, isPremium: verified.isPremium, premiumExpiresAt: verified.premiumExpiresAt }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ error: "Refresh token expirado." });
  }
});

// ESQUECI MINHA SENHA — gera token e envia e-mail
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Sempre responde 200 para não revelar se o e-mail existe
    if (!user) return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link em breve.' });

    const crypto = require('crypto');
    const PasswordResetToken = require('./models/PasswordResetToken');

    await PasswordResetToken.deleteMany({ userId: user._id });
    const token = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.create({ userId: user._id, token });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/redefinir-senha?token=${token}`;
    const { sendPasswordReset } = require('./services/emailService');
    await sendPasswordReset(user, resetUrl);

    res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link em breve.' });
  } catch (err) {
    logger.error('[ForgotPassword]', err);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

// REDEFINIR SENHA — valida token e salva nova senha
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    const PasswordResetToken = require('./models/PasswordResetToken');
    const stored = await PasswordResetToken.findOne({ token });
    if (!stored) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);
    await User.findByIdAndUpdate(stored.userId, { passwordHash });
    await PasswordResetToken.deleteMany({ userId: stored.userId });
    await RefreshToken.deleteMany({ userId: stored.userId.toString() });

    res.json({ message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    logger.error('[ResetPassword]', err);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// Handlers de Erro Sentry
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// 11. FRONTEND STATIC SERVING & FALLBACK
app.use(express.static(path.join(__dirname, "frontend-dist")));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/health")) return next();
  
  // Tenta servir index.html do frontend-dist primeiro
  const frontendPath = path.join(__dirname, "frontend-dist", "index.html");
  if (fs.existsSync(frontendPath)) {
    return res.sendFile(frontendPath);
  }
  
  // Fallback para pasta dist original
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => logger.info(`🚀 LORFLUX PROD-READY SERVER | PORT: ${PORT} | ENV: ${process.env.NODE_ENV}`));
}

module.exports = app;
