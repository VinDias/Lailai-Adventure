
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

dotenv.config();
const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lailai-ultra-secret-key-2025';

// Criar diretórios de upload se não existirem
const uploadDirs = [
  'uploads/video-thumbnails',
  'uploads/webtoon-thumbnails'
];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middlewares de Produção
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// Servir estáticos
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=31536000');
    res.set('X-Content-Type-Options', 'nosniff');
  }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// --- CONFIGURAÇÃO MULTER ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 } // Default 2MB
});

// --- MIDDLEWARES DE AUTH ---
const authenticateToken = (req, res, next) => {
  const token = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// --- ROTAS DE THUMBNAIL ---

// Upload Thumbnail Vídeo (1080x1920)
app.post('/api/admin/upload-video-thumbnail', authenticateToken, upload.single('thumbnail'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  try {
    const metadata = await sharp(req.file.buffer).metadata();
    
    // Validação Estrita 1080x1920 e 2MB
    if (metadata.width !== 1080 || metadata.height !== 1920) {
      return res.status(400).json({ error: "Thumbnail deve ser exatamente 1080x1920 e até 2MB." });
    }

    const fileName = `video-${Date.now()}.webp`;
    const filePath = path.join('uploads/video-thumbnails', fileName);

    await sharp(req.file.buffer)
      .webp({ quality: 80 })
      .toFile(filePath);

    res.json({ url: `/uploads/video-thumbnails/${fileName}` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar imagem.' });
  }
});

// Upload Thumbnail Webtoon (160x151)
app.post('/api/admin/upload-webtoon-thumbnail', authenticateToken, upload.single('thumbnail'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  try {
    const metadata = await sharp(req.file.buffer).metadata();
    
    // Validação Estrita 160x151 e 500KB
    if (metadata.width !== 160 || metadata.height !== 151) {
      return res.status(400).json({ error: "Thumbnail deve ser exatamente 160x151 e até 500KB." });
    }

    if (req.file.size > 500 * 1024) {
      return res.status(400).json({ error: "Thumbnail deve ser até 500KB." });
    }

    const fileName = `webtoon-${Date.now()}.webp`;
    const filePath = path.join('uploads/webtoon-thumbnails', fileName);

    await sharp(req.file.buffer)
      .webp({ quality: 80 })
      .toFile(filePath);

    res.json({ url: `/uploads/webtoon-thumbnails/${fileName}` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar imagem.' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- ROTAS DE AUTH ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = { 
    id: '1', 
    nome: 'Usuário Pro', 
    email, 
    isPremium: true, 
    provider: 'local',
    avatar: 'https://picsum.photos/seed/lailai/200',
    criadoEm: new Date().toISOString()
  };
  const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
  
  res.cookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
  res.json({ user, accessToken });
});

app.get('/api/content/series', (req, res) => {
  res.json([
    {
      id: 1,
      title: 'Samurai Neon: O Despertar',
      genre: 'Cyberpunk',
      description: 'Uma jornada épica masterizada em H.264.',
      thumbnail_url: 'https://picsum.photos/seed/v1/1080/1920',
      content_type: 'hqcine',
      isPremium: false,
    },
    {
      id: 2,
      title: 'Ecos de Amanhã',
      genre: 'Sci-Fi',
      description: 'Exclusivo para membros LaiLai Premium.',
      thumbnail_url: 'https://picsum.photos/seed/v2/1080/1920',
      content_type: 'vfilm',
      isPremium: true,
    }
  ]);
});

app.listen(PORT, () => {
  console.log(`🚀 LAILAI BACKEND ON: http://localhost:${PORT}`);
});
