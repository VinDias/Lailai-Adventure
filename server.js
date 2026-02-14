
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = 3000; // Porta fixa para ambiente local conforme solicitado

// --- GESTÃO DE SEGURANÇA NO BOOT ---
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ [CRITICAL] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ [CRITICAL] Uncaught Exception thrown:", err);
});

// --- CONFIGURAÇÃO DE AMBIENTE E FALLBACKS ---
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'lailai_local_secret_key_2024_dev';
const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

// Mock de Banco de Dados para Modo Local
let seriesDB = [
  { id: 1, title: "Samurai Neon", description: "O futuro é vertical.", cover_image: "https://picsum.photos/seed/neo/1080/1920", genre: "Cyberpunk", content_type: "hqcine" },
  { id: 2, title: "Ecos da Cidade", description: "Drama urbano.", cover_image: "https://picsum.photos/seed/city/1080/1920", genre: "Drama", content_type: "vfilm" }
];
let episodesDB = [
  { id: 101, series_id: 1, episode_number: 1, title: "O Despertar", video_url: "https://v.ftcdn.net/05/56/67/02/700_F_556670233_G9O8h6e9r6M1X6P2A2D9qG6v9zL6x8P9_ST.mp4", thumbnail: "https://picsum.photos/seed/ep1/200" }
];

// --- MIDDLEWARES ---
app.use(helmet({
  contentSecurityPolicy: false, // Necessário para carregar vídeos de CDNs externas em dev
}));

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(express.json());

// --- MONITORAMENTO (HEALTH CHECK) ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    mode: NODE_ENV,
    services: {
      database: "local_memory_active",
      stripe: STRIPE_CONFIGURED ? "connected" : "simulation_mode"
    },
    uptime: process.uptime()
  });
});

// --- RATE LIMITING ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Muitas requisições. Modo Local estendido." }
});
app.use('/api/', limiter);

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Acesso negado. Token ausente." });

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
};

// --- ROTAS DE CONTEÚDO (CRUD SIMULADO) ---
app.get('/api/content/series', (req, res) => {
  res.json(seriesDB);
});

app.get('/api/content/series/:id', (req, res) => {
  const series = seriesDB.find(s => s.id === parseInt(req.params.id));
  if (!series) return res.status(404).json({ error: "Série não encontrada" });
  const episodes = episodesDB.filter(e => e.series_id === series.id);
  res.json({ ...series, episodes });
});

app.post('/api/content/series', authenticate, (req, res) => {
  const newSeries = { id: Date.now(), ...req.body };
  seriesDB.push(newSeries);
  res.status(201).json(newSeries);
});

app.get('/api/content/episodes', (req, res) => {
  res.json(episodesDB);
});

// --- TRATAMENTO GLOBAL DE ERROS ---
app.use((err, req, res, next) => {
  console.error("🔥 Error Handler:", err.message);
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: NODE_ENV === 'development' ? err.message : "Erro no servidor local."
  });
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 LAILAI BACKEND STARTED
  -----------------------------------------
  Environment: ${NODE_ENV}
  Port:        ${PORT}
  Database:    LOCAL FALLBACK ACTIVE
  Stripe:      ${STRIPE_CONFIGURED ? 'CONFIGURED' : 'SIMULATION MODE'}
  Health:      http://localhost:${PORT}/api/health
  -----------------------------------------
  Aguardando conexões do Frontend Vite...
  `);
});
