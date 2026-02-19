
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createContentFolder } = require("./utils/storageManager");
const { transcodeToHLS } = require("./services/transcodeService");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// EXPOR PASTA DE UPLOADS PARA O PLAYER ACESSAR M3U8/TS
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// CONFIGURAÇÃO DO STORAGE COM PASTAS DINÂMICAS E VALIDAÇÃO DE SEÇÃO
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = (file.fieldname === 'panels' || req.body.type === 'webtoon') ? 'webtoons' : 'videos';
    const section = req.body.section || 'default';
    const folder = createContentFolder(type, section, req.body.title);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Aumentado para 500MB para vídeos brutos
});

// 1. RATE LIMITING
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Muitas requisições." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10
});

// 2. SEGURANÇA
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: isProduction ? process.env.DOMAIN : "http://localhost:5173", credentials: true }));
app.use(cookieParser());

// 3. ROTAS DE PAGAMENTO
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));

// ROTA DE UPLOAD COM VALIDAÇÃO E TRANSCODIFICAÇÃO (Objetivo)
app.post('/api/admin/upload-content', upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audioTrack1", maxCount: 1 },
  { name: "audioTrack2", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "panels", maxCount: 120 }
]), (req, res) => {
  const { type, section } = req.body;

  // Validação básica
  if (type === "webtoon" && section !== "HIQUA") {
    return res.status(400).json({ error: "Webtoons can only be published in HI-QUA section" });
  }
  if (type === "video" && section === "HIQUA") {
    return res.status(400).json({ error: "Videos cannot be published in HI-QUA section" });
  }

  // Se for vídeo, disparar transcodificação HLS em background
  if (type === "video" && req.files['video']) {
    const videoFile = req.files['video'][0];
    const videoPath = videoFile.path;
    const folderPath = path.dirname(videoPath);

    // Execução NÃO BLOQUEANTE
    setImmediate(async () => {
      try {
        const success = await transcodeToHLS(videoPath, folderPath);
        if (!success) console.warn(`[HLS] Falha ao gerar HLS para: ${videoFile.filename}. Fallback para MP4 ativo.`);
      } catch (err) {
        console.error("[HLS] Erro no processo de background:", err.message);
      }
    });
  }

  res.json({ 
    message: "Conteúdo recebido e processamento de mídia iniciado.", 
    files: req.files,
    location: `uploads/${type}/${section.toLowerCase()}`
  });
});

app.use(express.json({ limit: '10kb' }));

// 5. API ROUTES
app.post('/api/auth/login', loginLimiter, (req, res) => {
  res.json({ success: true });
});

app.get('/api/content/series', globalLimiter, (req, res) => {
  const filter = req.query.section;
  const mockData = [
    { id: 1, title: 'Samurai Neon', section: 'HQCINE', type: 'video' },
    { id: 2, title: 'Experimental X', section: 'VCINE', type: 'video' },
    { id: 3, title: 'Soul Transmit', section: 'HIQUA', type: 'webtoon' }
  ];
  const filtered = filter ? mockData.filter(i => i.section === filter) : mockData;
  res.json(filtered);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 MONETIZED SERVER SECURED | PORT: ${PORT}`));
