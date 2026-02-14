
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

// --- CONFIGURAÇÃO DE SEGURANÇA ---
app.use(helmet({
  contentSecurityPolicy: false, // Permitir carregamento de mídias de diversos domínios em dev
}));

const corsOptions = {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// --- MONITORAMENTO ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    environment: process.env.NODE_ENV || 'development',
    services: {
      stripe: !!process.env.STRIPE_SECRET_KEY ? "connected" : "simulated",
      storage: !!process.env.S3_ENDPOINT ? "connected" : "local_mock"
    },
    timestamp: new Date().toISOString() 
  });
});

// --- RATE LIMITING ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Aumentado para suportar navegação rápida de catálogo
  message: { error: "Muitas requisições. Tente novamente mais tarde." }
});
app.use('/api/', limiter);

// --- BANCO DE DADOS EM MEMÓRIA (MOCK PERSISTENTE) ---
let seriesDB = [];
let episodesDB = [];

// --- MIDDLEWARE DE AUTH ---
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'lailai_master_key_2024');
    next();
  } catch (e) {
    res.status(401).json({ error: "Sessão expirada ou inválida" });
  }
};

// --- ROTAS DE CONTEÚDO ---
app.get('/api/content/series', (req, res) => {
  res.json(seriesDB);
});

app.post('/api/content/series', authenticate, (req, res) => {
  const newSeries = { id: Date.now(), ...req.body, created_at: new Date() };
  seriesDB.push(newSeries);
  res.status(201).json(newSeries);
});

app.get('/api/content/series/:id', (req, res) => {
  const series = seriesDB.find(s => s.id === parseInt(req.params.id));
  if (!series) return res.status(404).json({ error: "Série não encontrada" });
  const episodes = episodesDB.filter(e => e.series_id === series.id);
  res.json({ ...series, episodes });
});

app.post('/api/content/episodes', authenticate, (req, res) => {
  const newEp = { id: Date.now(), ...req.body };
  episodesDB.push(newEp);
  res.status(201).json(newEp);
});

// --- TRATAMENTO GLOBAL DE ERROS ---
app.use((err, req, res, next) => {
  console.error(`[SERVER ERROR] ${err.stack}`);
  res.status(err.status || 500).json({
    error: "Erro interno do servidor",
    message: process.env.NODE_ENV === 'development' ? err.message : "Algo deu errado."
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═════════════════════════════════════════════════════╗
  ║          LAILAI PREMIUM VERTICAL CINEMA             ║
  ╠═════════════════════════════════════════════════════╣
  ║  🚀 Status: Rodando Localmente                      ║
  ║  📡 API: http://localhost:${PORT}/api                 ║
  ║  🛠  Modo: ${process.env.NODE_ENV || 'Development'}               ║
  ╚═════════════════════════════════════════════════════╝
  `);
});
