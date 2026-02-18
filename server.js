
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
const Stripe = require('stripe');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lailai-ultra-secret-key-2025';
const isProduction = process.env.NODE_ENV === 'production';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Mock Database
let USERS_DB = [
  { id: '1', nome: 'Admin LaiLai', email: 'admin@lailai.com', password: 'admin', role: 'admin', isPremium: true, criadoEm: '2025-01-01' },
  { id: '2', nome: 'Usuário Pro', email: 'user@lailai.com', password: 'user', role: 'user', isPremium: false, criadoEm: '2025-02-15' }
];

const uploadDirs = ['uploads/video-thumbnails', 'uploads/webtoon-thumbnails', 'uploads/webtoon-panels'];
uploadDirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// 1. SEGURANÇA & CORS
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({ 
  origin: isProduction ? process.env.FRONTEND_URL : "http://localhost:5173", 
  credentials: true 
}));

app.use(cookieParser());

// IMPORTANTE: Webhook precisa de body bruto antes do express.json()
app.post('/api/payment/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userEmail = session.customer_email;
    
    // Atualizar usuário no DB
    const userIndex = USERS_DB.findIndex(u => u.email === userEmail);
    if (userIndex !== -1) {
      USERS_DB[userIndex].isPremium = true;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);
      USERS_DB[userIndex].premiumExpiresAt = expiry.toISOString();
      console.log(`[Stripe] Usuário ${userEmail} agora é Premium.`);
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// 2. MIDDLEWARES DE AUTH
const verifyToken = (req, res, next) => {
  const token = req.cookies.adminToken || req.cookies.accessToken || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const requirePremium = (req, res, next) => {
  const user = USERS_DB.find(u => u.id === req.user.id);
  if (!user || !user.isPremium) {
    return res.status(403).json({ message: "Plano premium necessário para acessar este conteúdo." });
  }
  next();
};

// 3. ROTAS DE PAGAMENTO
app.post('/api/payment/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${process.env.DOMAIN || 'http://localhost:5173'}/success`,
      cancel_url: `${process.env.DOMAIN || 'http://localhost:5173'}/premium`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. API ROUTES (EXISTENTES)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS_DB.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: "strict", maxAge: 86400000 };

  res.cookie(user.role === 'admin' ? 'adminToken' : 'accessToken', token, cookieOptions);
  res.json({ user, token });
});

app.get('/api/content/series', (req, res) => {
  res.json([
    { id: 1, title: 'Samurai Neon', genre: 'Cyberpunk', cover_image: 'https://picsum.photos/seed/h1/1080/1920', content_type: 'hqcine', isPremium: false },
    { id: 2, title: 'Experimental X', genre: 'Vfx', cover_image: 'https://picsum.photos/seed/v1/1080/1920', content_type: 'vcine', isPremium: true },
    { id: 3, title: 'Soul Transmit', genre: 'Drama', cover_image: 'https://picsum.photos/seed/w1/160/151', content_type: 'hiqua', isPremium: false }
  ]);
});

app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`🚀 MONETIZED SERVER READY | PORT: ${PORT}`));
