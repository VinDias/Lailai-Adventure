
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ffmpeg = require('fluent-ffmpeg');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

// Segurança e CORS - Apenas origem do Frontend
app.use(helmet());
app.use(cors({ 
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true 
}));
app.use(express.json());

// Rota de Health Check para diagnóstico
app.get('/api/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proteção Anti-DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Muitas requisições. Tente novamente em 15 minutos." }
});
app.use('/api/', limiter);

// Mock Database (Para persistência local sem Postgres durante desenvolvimento)
let seriesDB = [];

// Rotas de Produção
app.get('/api/content/series', (req, res) => {
  res.json(seriesDB);
});

app.post('/api/content/series', (req, res) => {
  const newSeries = { id: Date.now(), ...req.body };
  seriesDB.push(newSeries);
  res.status(201).json(newSeries);
});

// Middleware de Autenticação
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    next();
  } catch (e) {
    res.status(401).json({ error: "Token inválido" });
  }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ---------------------------------------------------
  🚀 LaiLai Production Server v1.1
  ✅ Health Check: http://localhost:${PORT}/api/health
  📡 API Base: http://localhost:${PORT}/api
  ---------------------------------------------------
  `);
});
