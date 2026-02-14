
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = 3000;

// Configuração de Segurança e CORS
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// Middlewares de log
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// --- ROTAS DO SISTEMA ---

app.get('/health', (req, res) => {
  res.json({ status: "active", version: "2.0.0", environment: "development" });
});

app.get('/api/health', (req, res) => {
  res.json({ status: "ok", service: "lailai-api" });
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const mockUser = {
    id: 1,
    email: email || "dev@lailai.com",
    name: "Membro Premium",
    isPremium: true,
    avatar: "https://picsum.photos/seed/lailai/200",
    followingChannelIds: []
  };
  
  res.json({ 
    user: mockUser,
    accessToken: "jwt_access_token_simulated_" + Date.now()
  });
});

app.get('/api/content/series', (req, res) => {
  res.json([
    { 
      id: 1, 
      title: "Samurai Neon", 
      description: "Uma odisseia cyberpunk em 9:16.", 
      cover_image: "https://picsum.photos/seed/neo/1080/1920", 
      genre: "Cyberpunk", 
      content_type: "hqcine" 
    },
    { 
      id: 2, 
      title: "Ecos Urbanos", 
      description: "Documentário vertical sobre metrópoles.", 
      cover_image: "https://picsum.photos/seed/urban/1080/1920", 
      genre: "Documentary", 
      content_type: "vfilm" 
    }
  ]);
});

app.get('/api/content/series/:id', (req, res) => {
  res.json({
    episodes: [
      { 
        id: 101, 
        episode_number: 1, 
        title: "O Despertar", 
        thumbnail: "https://picsum.photos/seed/ep1/400",
        video_url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" 
      }
    ]
  });
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n-----------------------------------------');
  console.log(`🚀 LAILAI BACKEND ONLINE`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log('-----------------------------------------\n');
});
