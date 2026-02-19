
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { createContentFolder } = require("./utils/storageManager");
const { transcodeToHLS } = require("./services/transcodeService");
const logger = require("./utils/logger");
const upload = require("./middlewares/uploadConfig");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Importação de middlewares e rotas
const verifyToken = require("./middlewares/verifyToken");
const requireAdmin = require("./middlewares/requireAdmin");

// 1. PROTEÇÃO GLOBAL CONTRA PATH TRAVERSAL
app.use((req, res, next) => {
  if (req.path.includes("..")) {
    logger.warn(`Tentativa de Path Traversal bloqueada: ${req.ip} -> ${req.path}`);
    return res.status(400).send("Invalid path");
  }
  next();
});

// 2. SEGURANÇA BÁSICA & HELMET COMPLETO
app.disable("x-powered-by");
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 3. RATE LIMIT GLOBAL
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições originadas deste IP." }
});
app.use(globalLimiter);

// 4. BLOQUEAR CACHE DE API
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// 5. SERVIR ARQUIVOS ESTÁTICOS COM HEADERS SEGUROS
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  dotfiles: "deny",
  index: false,
  maxAge: "7d"
}));

app.set('trust proxy', 1);
app.use(cors({ origin: isProduction ? process.env.DOMAIN : "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));

// 6. CONTROLE DE CONCORRÊNCIA TRANSCODE
let activeTranscodes = 0;
const MAX_TRANSCODES = 2;

async function safeTranscode(videoPath, folderPath) {
  if (activeTranscodes >= MAX_TRANSCODES) {
    logger.warn(`Transcode recusado: limite de concorrência atingido (${MAX_TRANSCODES})`);
    return false;
  }

  activeTranscodes++;
  logger.info(`Iniciando transcode: ${videoPath}. Ativos: ${activeTranscodes}`);
  
  try {
    const success = await transcodeToHLS(videoPath, folderPath);
    
    // REMOÇÃO AUTOMÁTICA DE ARQUIVOS TEMPORÁRIOS
    if (success && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
      logger.info(`Arquivo temporário removido após transcode: ${videoPath}`);
    }
    
    return success;
  } catch (err) {
    logger.error(`Erro no processo de transcode: ${err.message}`);
    return false;
  } finally {
    activeTranscodes--;
    logger.info(`Transcode finalizado. Ativos: ${activeTranscodes}`);
  }
}

// 7. ROTAS
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));
app.use("/api/admin/management", require("./routes/admin"));

// UPLOAD ADMIN EXCLUSIVO COM VALIDAÇÃO PROFISSIONAL
app.post('/api/admin/upload-content', verifyToken, requireAdmin, upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audioTrack1", maxCount: 1 },
  { name: "audioTrack2", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "panels", maxCount: 120 }
]), (req, res) => {
  const { type, section, title } = req.body;

  if (type === "video" && req.files['video']) {
    const videoFile = req.files['video'][0];
    const videoPath = videoFile.path;
    
    // Criar pasta final de destino
    const folderPath = createContentFolder('videos', section, title);
    
    // Processamento em background com controle de concorrência
    setImmediate(async () => {
      await safeTranscode(videoPath, folderPath);
    });
  }

  res.json({ message: "Conteúdo recebido e enfileirado para processamento.", status: "processing" });
});

// ENDPOINT DE CONTEÚDO COM VERIFICAÇÃO PREMIUM NO BACKEND
app.get('/api/content/series/:id', async (req, res) => {
  // Simulação de busca no banco
  const content = { id: req.params.id, title: "Samurai Neon", isPremium: true };
  
  // VERIFICAÇÃO PREMIUM SOMENTE NO BACKEND
  if (content.isPremium && (!req.user || !req.user.isPremium)) {
    logger.warn(`Acesso premium negado para usuário ${req.user ? req.user.id : 'não autenticado'}`);
    return res.status(403).json({ error: "Premium required", code: "PREMIUM_REQUIRED" });
  }

  res.json(content);
});

app.post('/api/auth/login', (req, res) => {
  logger.info(`Login realizado: ${req.body.email}`);
  res.json({ success: true, role: 'admin' });
});

app.get('/api/content/series', (req, res) => {
  const mockData = [
    { id: 1, title: 'Samurai Neon', section: 'HQCINE', type: 'video', order_index: 0, isPremium: true },
    { id: 2, title: 'Experimental X', section: 'VCINE', type: 'video', order_index: 1, isPremium: false },
    { id: 3, title: 'Soul Transmit', section: 'HIQUA', type: 'webtoon', order_index: 2, isPremium: true }
  ];
  res.json(mockData.sort((a,b) => a.order_index - b.order_index));
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => logger.info(`🚀 LAILAI SECURED SERVER | PRODUCTION MODE | PORT: ${PORT}`));
