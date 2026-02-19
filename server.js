
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

// Importação de middlewares e rotas novas
const verifyToken = require("./middlewares/verifyToken");
const requireAdmin = require("./middlewares/requireAdmin");

// SEGURANÇA BÁSICA
app.disable("x-powered-by");
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// EXPOR PASTA DE UPLOADS
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
  limits: { fileSize: 500 * 1024 * 1024 }
});

// RATE LIMITING APRIMORADO
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Muitas requisições. Tente novamente mais tarde." }
});

app.use("/api", apiLimiter);
app.set('trust proxy', 1);
app.use(cors({ origin: isProduction ? process.env.DOMAIN : "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));

// ROTAS PÚBLICAS/USUÁRIO
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment"));
app.use("/donation", require("./routes/donation"));

// ROTAS ADMINISTRATIVAS PROTEGIDAS (Admin Only)
app.use("/api/admin/management", require("./routes/admin"));

app.post('/api/admin/upload-content', verifyToken, requireAdmin, upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audioTrack1", maxCount: 1 },
  { name: "audioTrack2", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "panels", maxCount: 120 }
]), (req, res) => {
  const { type, section } = req.body;

  if (type === "video" && req.files['video']) {
    const videoFile = req.files['video'][0];
    const videoPath = videoFile.path;
    const folderPath = path.dirname(videoPath);

    setImmediate(async () => {
      try {
        await transcodeToHLS(videoPath, folderPath);
      } catch (err) {
        console.error("[HLS] Erro no transcode:", err.message);
      }
    });
  }

  res.json({ message: "Conteúdo publicado com sucesso pelo administrador.", files: req.files });
});

app.get("/api/admin/files", verifyToken, requireAdmin, (req, res) => {
  const baseDir = path.join(__dirname, "uploads");
  const requestedPath = req.query.path || "";
  const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(baseDir, safePath);

  if (!fullPath.startsWith(baseDir)) return res.status(403).json({ error: "Access denied" });

  fs.readdir(fullPath, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).json({ error: "Cannot read directory" });
    res.json(files.map(file => ({ name: file.name, isDirectory: file.isDirectory() })));
  });
});

app.post('/api/auth/login', (req, res) => {
  // Mock login: em produção, injetar role: 'admin' no JWT se o usuário for administrador
  res.json({ success: true, role: 'admin' });
});

app.get('/api/content/series', (req, res) => {
  const mockData = [
    { id: 1, title: 'Samurai Neon', section: 'HQCINE', type: 'video', order_index: 0 },
    { id: 2, title: 'Experimental X', section: 'VCINE', type: 'video', order_index: 1 },
    { id: 3, title: 'Soul Transmit', section: 'HIQUA', type: 'webtoon', order_index: 2 }
  ];
  res.json(mockData.sort((a,b) => a.order_index - b.order_index));
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 LAILAI SECURED SERVER | ADMIN EXCLUSIVE MODE | PORT: ${PORT}`));
