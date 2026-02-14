
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Config
dotenv.config();
const app = express();
const PORT = 3000; 

// Middlewares de Segurança
// Desativamos CSP rigoroso em dev para evitar bloqueios de recursos externos (fotos, vídeos)
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cookieParser());
app.use(express.json());

// CORS Robusto: Em desenvolvimento, permitimos tudo para evitar "Failed to fetch"
app.use(cors({
  origin: true, // Reflete a origem da requisição (muito útil em dev)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

// Logger de Requisições para depuração
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Rotas de Saúde (Obrigatórias para o frontend validar conexão)
const healthCheck = (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    uptime: process.uptime(),
    server: "LaiLai-Vertical-Cinema" 
  });
};

app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// --- API ROUTES ---

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const accessToken = "dev_token_" + Math.random().toString(36).substr(2);
  
  res.cookie('refreshToken', 'mock_refresh_token', {
    httpOnly: true,
    secure: false, // Localhost
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ 
    user: { 
      id: 1, 
      email: email || "dev@lailai.com", 
      name: "Usuário Teste", 
      isPremium: true, 
      isEmailVerified: true,
      followingChannelIds: [] 
    },
    accessToken 
  });
});

app.get('/api/content/series', (req, res) => {
  res.json([
    { 
      id: 1, 
      title: "Samurai Neon", 
      description: "Vertical Cinema Experience", 
      cover_image: "https://picsum.photos/seed/neo/1080/1920", 
      genre: "Cyberpunk", 
      content_type: "hqcine", 
      is_published: true 
    }
  ]);
});

app.get('/api/content/episodes', (req, res) => {
  res.json([
    {
      id: 101,
      episode_number: 1,
      title: "O Despertar",
      video_url: "https://v.ftcdn.net/05/56/67/02/700_F_556670233_G9O8h6e9r6M1X6P2A2D9qG6v9zL6x8P9_ST.mp4",
      thumbnail: "https://picsum.photos/seed/ep1/400",
      series_title: "Samurai Neon"
    }
  ]);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ ERRO INTERNO:", err.message);
  res.status(500).json({ error: "Erro interno no servidor" });
});

// Inicialização
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n-----------------------------------------');
  console.log(`🚀 LAILAI API ONLINE`);
  console.log(`🔗 Endpoint: http://localhost:${PORT}/api`);
  console.log(`🏥 Health:   http://localhost:${PORT}/health`);
  console.log('-----------------------------------------\n');
});
