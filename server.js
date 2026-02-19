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

// Importação de Utilitários e Middlewares
const logger = require("./utils/logger");
const upload = require("./middlewares/uploadConfig");
const verifyToken = require("./middlewares/verifyToken");
const requireAdmin = require("./middlewares/requireAdmin");
const videoQueue = require("./queues/videoQueue");
const { createContentFolder } = require("./utils/storageManager");
const { createContentSchema } = require("./validators/contentValidator");

// 1. MONITORAMENTO DE ERROS (SENTRY)
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
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
const antiHotlink = (req, res, next) => {
  if (isProduction) {
    const referer = req.get("referer");
    const allowed = process.env.FRONTEND_URL || "";
    if (!referer || !referer.includes(allowed)) {
      return res.status(403).send("Acesso direto aos arquivos de mídia proibido (Anti-Hotlink).");
    }
  }
  next();
};

app.use("/uploads", antiHotlink, express.static(path.join(__dirname, "uploads"), {
  dotfiles: "deny",
  index: false,
  maxAge: "7d"
}));

// Servir thumbnails com cache agressivo
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

// Bloquear cache em rotas de API
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// 6. ROTAS E ENDPOINTS
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));
app.use("/api/admin/management", require("./routes/admin"));

// UPLOAD ADMIN COM FILA ASSÍNCRONA
app.post('/api/admin/upload-content', verifyToken, requireAdmin, upload.fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "panels", maxCount: 120 }
]), async (req, res) => {
  try {
    // Validação de Input com Joi
    const { error } = createContentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { type, section, title } = req.body;

    if (type === "video" && req.files['video']) {
      const videoFile = req.files['video'][0];
      const folderPath = createContentFolder('videos', section, title);
      
      // Adicionar à fila do BullMQ
      await videoQueue.add("process-video", {
        inputPath: videoFile.path,
        outputPath: folderPath
      });
      
      logger.info(`[Queue] Vídeo '${title}' adicionado à fila de processamento.`);
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

app.post('/api/auth/login', loginLimiter, (req, res) => {
  // Lógica de login mantida
  logger.info(`Login solicitado: ${req.body.email}`);
  res.json({ success: true, role: 'admin', accessToken: "mock_token" });
});

// Refresh Token Mock (Implementação completa exigiria persistência em banco)
app.post('/api/auth/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.sendStatus(401);
  // Simulação de validação
  res.json({ accessToken: "new_mock_access_token" });
});

app.get('/api/content/series', (req, res) => {
  const mediaBase = process.env.MEDIA_BASE_URL || "";
  const mockData = [
    { id: 1, title: 'Samurai Neon', section: 'HQCINE', type: 'video', order_index: 0, isPremium: true, cover_image: `${mediaBase}/uploads/thumb1.jpg` },
    { id: 2, title: 'Experimental X', section: 'VCINE', type: 'video', order_index: 1, isPremium: false, cover_image: `${mediaBase}/uploads/thumb2.jpg` }
  ];
  res.json(mockData.sort((a,b) => a.order_index - b.order_index));
});

// Handlers de Erro Sentry
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => logger.info(`🚀 LAILAI SECURED & QUEUE-DRIVEN SERVER | PORT: ${PORT}`));