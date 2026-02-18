
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 1. RATE LIMITING (Hardening)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Muitas requisições. Tente novamente mais tarde." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." }
});

// 2. CONFIGURAÇÕES DE SEGURANÇA
app.set('trust proxy', 1);
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({ 
  origin: isProduction ? process.env.DOMAIN : "http://localhost:5173", 
  credentials: true 
}));

app.use(cookieParser());

// 3. ROTAS DE PAGAMENTO (Stripe + Mobile In-App)
app.use("/api/payment", require("./routes/payment"));
app.use("/mobile", require("./routes/mobilePayment")); // Adicionado suporte mobile

app.use(express.json({ limit: '10kb' }));

// Mock Database
let USERS_DB = [
  { id: '1', nome: 'Admin LaiLai', email: 'admin@lailai.com', password: 'admin', role: 'admin', isPremium: true, criadoEm: '2025-01-01' },
  { id: '2', nome: 'Usuário Pro', email: 'user@lailai.com', password: 'user', role: 'user', isPremium: false, criadoEm: '2025-02-15' }
];

// 4. MIDDLEWARE DE VALIDAÇÃO PREMIUM
const validatePremiumStatus = async (req, res, next) => {
  if (req.user && req.user.isPremium && req.user.premiumExpiresAt) {
    if (new Date() > new Date(req.user.premiumExpiresAt)) {
      const userIndex = USERS_DB.findIndex(u => u.id === req.user.id);
      if (userIndex !== -1) {
        USERS_DB[userIndex].isPremium = false;
        req.user.isPremium = false;
      }
    }
  }
  next();
};

// 5. API ROUTES
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = USERS_DB.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, isPremium: user.isPremium, premiumExpiresAt: user.premiumExpiresAt }, 
    process.env.JWT_SECRET || 'secret-production-key', 
    { expiresIn: '24h' }
  );

  res.cookie('accessToken', token, { 
    httpOnly: true, 
    secure: isProduction, 
    sameSite: "strict",
    maxAge: 86400000 
  });

  res.json({ user, token });
});

app.get('/api/content/series', globalLimiter, (req, res) => {
  res.json([
    { id: 1, title: 'Samurai Neon', genre: 'Cyberpunk', cover_image: 'https://picsum.photos/seed/h1/1080/1920', content_type: 'hqcine', isPremium: false },
    { id: 2, title: 'Experimental X', genre: 'Vfx', cover_image: 'https://picsum.photos/seed/v1/1080/1920', content_type: 'vcine', isPremium: true },
    { id: 3, title: 'Soul Transmit', genre: 'Drama', cover_image: 'https://picsum.photos/seed/w1/160/151', content_type: 'hiqua', isPremium: false }
  ]);
});

app.use((err, req, res, next) => {
  console.error(`[Error Handler]: ${err.stack}`);
  res.status(500).json({ 
    error: "Erro interno do servidor.",
    message: isProduction ? "Ocorreu um erro inesperado." : err.message
  });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 MONETIZED SERVER SECURED | PORT: ${PORT}`));
