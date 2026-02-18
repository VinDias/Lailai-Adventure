
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

// Mock Database
let USERS_DB = [
  { id: '1', nome: 'Admin LaiLai', email: 'admin@lailai.com', password: 'admin', role: 'admin', isPremium: true, criadoEm: '2025-01-01' },
  { id: '2', nome: 'Usuário Pro', email: 'user@lailai.com', password: 'user', role: 'user', isPremium: false, criadoEm: '2025-02-15' }
];

// Segurança
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: isProduction ? process.env.FRONTEND_URL : "http://localhost:5173", credentials: true }));
app.use(cookieParser());

// ROTAS DE PAGAMENTO (Injetadas antes do express.json() para suportar body bruto no webhook)
app.use("/api/payment", require("./routes/payment"));

app.use(express.json());

// API ROUTES EXISTENTES
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS_DB.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, isPremium: user.isPremium }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
  res.cookie('accessToken', token, { httpOnly: true, secure: isProduction, sameSite: "strict" });
  res.json({ user, token });
});

app.get('/api/content/series', (req, res) => {
  res.json([
    { id: 1, title: 'Samurai Neon', genre: 'Cyberpunk', cover_image: 'https://picsum.photos/seed/h1/1080/1920', content_type: 'hqcine', isPremium: false },
    { id: 2, title: 'Experimental X', genre: 'Vfx', cover_image: 'https://picsum.photos/seed/v1/1080/1920', content_type: 'vcine', isPremium: true },
    { id: 3, title: 'Soul Transmit', genre: 'Drama', cover_image: 'https://picsum.photos/seed/w1/160/151', content_type: 'hiqua', isPremium: false }
  ]);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 MONETIZATION SERVER READY | PORT: ${PORT}`));
