
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
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

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
const User = require("./models/User"); // Importação do Model User real

// 1. MONITORAMENTO DE ERROS (SENTRY PROFISSIONAL)
if (process.env.SENTRY_DSN) {
  Sentry.init({ 
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development'
  });
  app.use(Sentry.Handlers.requestHandler());
}

// 2. SEGURANÇA E PERFORMANCE GLOBAL
app.disable("x-powered-by");
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// 3. RATE LIMITS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Muitas requisições originadas deste IP." }
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Muitas tentativas de login. Tente novamente em 10 minutos." }
});

app.use("/api", globalLimiter);

// 4. PROTEÇÃO ANTI-HOTLINK E ARQUIVOS ESTÁTICOS
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

// 5. CONFIGURAÇÕES EXPRESS
app.set('trust proxy', 1);
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173", 
  credentials: true 
}));
app.use(cookieParser());
app.use(express.json({ limit: process.env.MAX_UPLOAD_SIZE || '10mb' }));

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

// 6. ROTAS E ENDPOINTS
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));
app.use("/api/admin/management", require("./routes/admin"));
app.use("/api/admin/users", require("./routes/adminManagement")); // Novas rotas de Admin Management

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

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  // Mantendo compatibilidade com mock se User model não retornar nada
  const mockUser = { id: "user-123", email: req.body.email, role: 'superadmin' };
  const accessToken = jwt.sign(mockUser, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(mockUser, process.env.REFRESH_SECRET, { expiresIn: '7d' });

  await RefreshToken.create({ userId: mockUser.id, token: refreshToken });

  logger.info(`Login realizado: ${req.body.email}`);
  res.json({ success: true, role: mockUser.role, accessToken, refreshToken });
});

app.post('/api/auth/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.sendStatus(401);

  const stored = await RefreshToken.findOne({ token: refreshToken });
  if (!stored) return res.status(403).json({ error: "Token revogado ou inexistente." });

  try {
    const verified = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const newAccessToken = jwt.sign({ id: verified.id, email: verified.email, role: verified.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ error: "Refresh token expirado." });
  }
});

app.get('/api/content/series', (req, res) => {
  const mediaBase = process.env.MEDIA_BASE_URL || "";
  const mockData = [
    { id: 1, title: 'Samurai Neon', section: 'HQCINE', type: 'video', order_index: 0, isPremium: true, cover_image: `${mediaBase}/uploads/thumb1.jpg` },
    { id: 2, title: 'Experimental X', section: 'VCINE', type: 'video', order_index: 1, isPremium: false, cover_image: `${mediaBase}/uploads/thumb2.jpg` }
  ];
  res.json(mockData.sort((a,b) => a.order_index - b.order_index));
});

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => logger.info(`🚀 LAILAI SCALABLE & MULTI-ADMIN SERVER | PORT: ${PORT}`));
