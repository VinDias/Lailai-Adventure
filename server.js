
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
const sanitizeMongo = require("./middlewares/sanitizeMongo");
const { setAuthCookies, clearAuthCookies } = require("./utils/authCookies");
const { isValidEmail, isNonEmptyString, validatePassword } = require("./validators/authValidator");
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
// Em produção apenas origens explícitas são aceitas; localhost só fora de produção.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://lorflux.com",
  "https://www.lorflux.com",
];
if (!isProduction) {
  allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
}
const allowedOriginSet = new Set(allowedOrigins.filter(Boolean));
app.use(cors({
  origin: (origin, callback) => {
    // Requisições sem Origin (apps nativos, curl, health checks) são permitidas.
    if (!origin || allowedOriginSet.has(origin)) return callback(null, true);
    callback(new Error('CORS: origem não permitida'));
  },
  credentials: true
}));

// 5. PROTEÇÃO EXTRA STRIPE WEBHOOK (DEVE VIR ANTES DO express.json)
// Só o /webhook precisa do body raw para validar a assinatura do Stripe.
// As demais rotas de /api/payment (create-checkout, status...) precisam do JSON parser
// e por isso são montadas depois dele em "10. DEMAIS ROTAS".
app.use("/api/payment/webhook", express.raw({ type: 'application/json' }));

// 6. SEGURANÇA E PERFORMANCE GLOBAL
app.disable("x-powered-by");

// Content-Security-Policy: defesa em profundidade contra XSS/clickjacking.
// Permite explicitamente Google AdSense, Google Fonts e mídia via CDN (Bunny).
const GOOGLE_ADS = [
  "https://pagead2.googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://*.google.com",
  "https://*.doubleclick.net",
  "https://*.googleadservices.com",
  "https://adservice.google.com",
];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      scriptSrc: ["'self'", "https://accounts.google.com", ...GOOGLE_ADS],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.google.com", "https://*.doubleclick.net", "https://googleads.g.doubleclick.net"],
      workerSrc: ["'self'", "blob:"],
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // O popup do Google Sign-In (GIS) precisa conversar com a janela que o abriu;
  // o default "same-origin" do helmet quebraria o fluxo de login.
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // strict-origin-when-cross-origin: envia URL completa em same-origin,
  // só a origin em cross-origin HTTPS→HTTPS (necessário pro Bunny aceitar
  // o Referer e satisfazer Allowed domains + Block direct url file access),
  // e nada em HTTPS→HTTP. É o default WhatWG moderno.
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
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

// Limita rotas sensíveis de conta (cadastro, recuperação e redefinição de senha)
// para mitigar brute-force de tokens, criação de contas em massa e email-bombing.
const accountLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: "Muitas solicitações. Tente novamente mais tarde." }
    });

app.use("/api", globalLimiter);

// 8. CONFIGURAÇÕES EXPRESS E PARSERS
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Sanitização anti-NoSQL injection em body/query/params (após o parsing do JSON).
app.use(sanitizeMongo);

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

// Middleware Global de Verificação de Conta Ativa (apenas em /api)
// Decodifica o token (cookie ou Bearer) e bloqueia contas desativadas mesmo
// que ainda possuam um access token válido (revogação efetiva em até 15 min).
app.use("/api", async (req, res, next) => {
  const token = req.cookies?.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token || !process.env.JWT_SECRET) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.id) {
      const u = await User.findById(decoded.id).select('isActive').lean();
      if (u && u.isActive === false) {
        return res.status(403).json({ error: "Sua conta foi desativada." });
      }
    }
  } catch (e) { /* token inválido/expirado: deixa a rota tratar */ }
  next();
});

// 10. DEMAIS ROTAS E ENDPOINTS
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));
app.use("/api/admin/management", require("./routes/admin"));
app.use("/api/admin/users", require("./routes/adminManagement"));
app.use("/api/admin/ads", require("./routes/ads"));
app.use("/api/admin/royalties", require("./routes/royalties"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/bunny", require("./routes/bunnyWebhook"));
app.use("/api/content", require("./routes/content"));
app.use("/api/channels", require("./routes/channels"));
app.use("/api/favorites", require("./routes/favorites"));
app.use("/api/account", require("./routes/account"));

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
    clearAuthCookies(res);
    res.json({ message: "Sessão encerrada com segurança em todos os dispositivos." });
  } catch (err) {
    logger.error("[Logout Error]", err);
    res.status(500).json({ error: "Erro ao processar logout." });
  }
});

// SESSÃO ATUAL — usado pelo frontend para restaurar a sessão sem guardar tokens
// no localStorage (os dados vêm do banco, refletindo role/premium atualizados).
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('email nome role isPremium premiumExpiresAt avatar isActive provider consent')
      .lean();
    if (!user || user.isActive === false) return res.status(401).json({ error: "Sessão inválida." });
    res.json({
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        avatar: user.avatar,
        provider: user.provider,
        consent: { marketing: !!(user.consent && user.consent.marketing) },
      },
    });
  } catch (err) {
    logger.error("[Auth/me Error]", err);
    res.status(500).json({ error: "Erro ao carregar sessão." });
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

      logger.info(`[Admin] userId ${req.user.id} enviou vídeo: ${title}`);
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
app.post('/api/auth/register', accountLimiter, async (req, res) => {
  try {
    const { email, password, nome, acceptedTerms } = req.body;
    if (!isValidEmail(email) || !isNonEmptyString(password) || !isNonEmptyString(nome)) {
      return res.status(400).json({ error: "Email, senha e nome são obrigatórios." });
    }
    const pwd = validatePassword(password);
    if (!pwd.valid) return res.status(400).json({ error: pwd.message });

    // LGPD: consentimento explícito aos Termos e à Política de Privacidade é
    // pré-requisito do tratamento de dados na criação da conta.
    if (acceptedTerms !== true) {
      return res.status(400).json({ error: "É necessário aceitar os Termos de Uso e a Política de Privacidade." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "Este email já está cadastrado." });
    }

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      nome: String(nome).trim().slice(0, 120),
      role: 'user',
      isPremium: false,
      isActive: true,
      provider: 'local',
      consent: {
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        ip: req.ip,
      },
    });

    const payload = { id: user._id, email: user.email, role: user.role, isPremium: false, premiumExpiresAt: null };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });
    setAuthCookies(res, { accessToken, refreshToken });

    logger.info(`Novo usuário registrado: ${require('./utils/pii').maskEmail(normalizedEmail)}`);

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
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Mesmo sem usuário, executa um compare "dummy" para mitigar timing/user enumeration.
    const bcrypt = require('bcrypt');
    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

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
    setAuthCookies(res, { accessToken, refreshToken });

    logger.info(`Login realizado: ${require('./utils/pii').maskEmail(user.email)}`);
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: user.isPremium,
        // Sem este campo, isPremiumActive() no cliente considera qualquer
        // isPremium=true como vitalício e premium expirado não vê anúncios
        // durante toda a sessão pós-login.
        premiumExpiresAt: user.premiumExpiresAt,
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

// LOGIN COM GOOGLE (Google Identity Services) — recebe o ID token emitido pelo
// botão do GIS, verifica a assinatura junto ao Google e cria/vincula a conta.
// Requer GOOGLE_CLIENT_ID no ambiente (o mesmo client ID usado no frontend);
// sem ele a rota fica dormente (503) e o botão nem aparece no app.
app.post('/api/auth/google', accountLimiter, async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: "Login com Google não está configurado." });
    }
    const { credential } = req.body;
    if (!isNonEmptyString(credential)) {
      return res.status(400).json({ error: "Credencial do Google ausente." });
    }

    const { verifyGoogleIdToken } = require('./utils/googleTokenVerifier');
    let payload;
    try {
      payload = await verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID);
    } catch {
      return res.status(401).json({ error: "Credencial do Google inválida." });
    }
    if (!payload || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ error: "E-mail do Google não verificado." });
    }

    const normalizedEmail = payload.email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      if (!user.isActive) return res.status(403).json({ error: "Conta desativada." });
      // Vincula o Google a uma conta existente pelo e-mail (verificado pelo
      // Google). O login por e-mail/senha continua funcionando normalmente.
      let changed = false;
      if (!user.providerId) { user.providerId = payload.sub; changed = true; }
      if (!user.avatar && payload.picture) { user.avatar = payload.picture; changed = true; }
      if (changed) await user.save();
    } else {
      // Conta nova via Google. O aceite dos Termos/Privacidade é apresentado
      // junto ao botão ("Ao continuar com o Google, você aceita...") —
      // registrado aqui para a trilha de consentimento LGPD, como no cadastro.
      user = await User.create({
        email: normalizedEmail,
        nome: String(payload.name || normalizedEmail.split('@')[0]).trim().slice(0, 120),
        avatar: payload.picture || '',
        role: 'user',
        isPremium: false,
        isActive: true,
        provider: 'google',
        providerId: payload.sub,
        consent: {
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          ip: req.ip,
        },
      });
      logger.info(`Novo usuário via Google: ${require('./utils/pii').maskEmail(normalizedEmail)}`);
    }

    const tokenPayload = { id: user._id, email: user.email, role: user.role, isPremium: user.isPremium, premiumExpiresAt: user.premiumExpiresAt };
    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });
    setAuthCookies(res, { accessToken, refreshToken });

    logger.info(`Login Google realizado: ${require('./utils/pii').maskEmail(user.email)}`);
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt ?? null,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    logger.error("[Google Login Error]", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post('/api/auth/refresh-token', async (req, res) => {
  // Aceita o token via cookie httpOnly (preferencial) ou body (compat. legado/mobile).
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  // Defesa contra NoSQL injection: o token DEVE ser uma string.
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return res.status(401).json({ error: "Refresh token ausente." });
  }

  const stored = await RefreshToken.findOne({ token: refreshToken });
  if (!stored) return res.status(403).json({ error: "Token revogado ou inexistente." });

  try {
    const verified = jwt.verify(refreshToken, process.env.REFRESH_SECRET);

    // Revalida o estado atual do usuário (conta ativa, role e premium do banco).
    const user = await User.findById(verified.id).select('email role isPremium premiumExpiresAt isActive').lean();
    if (!user || user.isActive === false) {
      await RefreshToken.deleteOne({ _id: stored._id });
      clearAuthCookies(res);
      return res.status(403).json({ error: "Sessão inválida." });
    }

    // Rotação de refresh token: invalida o antigo e emite um novo.
    const payload = { id: verified.id, email: user.email, role: user.role, isPremium: user.isPremium, premiumExpiresAt: user.premiumExpiresAt };
    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.deleteOne({ _id: stored._id });
    await RefreshToken.create({ userId: verified.id, token: newRefreshToken });
    setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ error: "Refresh token expirado." });
  }
});

// ESQUECI MINHA SENHA — gera token e envia e-mail
app.post('/api/auth/forgot-password', accountLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!isNonEmptyString(email)) return res.status(400).json({ error: 'E-mail obrigatório.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
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
app.post('/api/auth/reset-password', accountLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    // Defesa contra NoSQL injection: token e senha DEVEM ser strings.
    if (typeof token !== 'string' || token.length === 0 || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }
    const pwd = validatePassword(password);
    if (!pwd.valid) return res.status(400).json({ error: pwd.message });

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

// Páginas públicas exigidas pela Google Play (URLs limpas, sem .html)
const sendStaticPage = (file) => (req, res) => {
  const fd = path.join(__dirname, "frontend-dist", file);
  if (fs.existsSync(fd)) return res.sendFile(fd);
  res.sendFile(path.join(__dirname, 'dist', file));
};
app.get('/privacidade', sendStaticPage('privacidade.html'));
app.get('/termos', sendStaticPage('termos.html'));

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

// 12. HANDLER GLOBAL DE ERROS (JSON) — evita vazar stack/HTML de erro
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && /CORS/.test(err.message || "")) {
    return res.status(403).json({ error: "Origem não permitida." });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload muito grande." });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: "Falha no upload do arquivo." });
  }
  logger.error("[Unhandled Route Error]", err);
  res.status(err?.status || 500).json({ error: "Erro interno do servidor." });
});

if (require.main === module) {
  app.listen(PORT, () => logger.info(`🚀 LORFLUX PROD-READY SERVER | PORT: ${PORT} | ENV: ${process.env.NODE_ENV}`));
}

module.exports = app;
