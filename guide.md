Fellipe, analisei profundamente todo o repositório `VinDias/Lailai-Adventure`. Abaixo está o **guia completo e sequencial** de tudo o que você precisa fazer para entregar o projeto **Loreflux - Cinematic Comics** conforme prometido ao cliente.

---

# 🗺️ GUIA COMPLETO — Projeto Loreflux (ex-Lailai Adventure)

## 📊 Diagnóstico do Estado Atual do Código

Após a auditoria completa, aqui está o panorama real:

| Área | Status | Detalhe |
|------|--------|---------|
| **Frontend (React/Vite)** | 🟡 Funcional com problemas | Tailwind via CDN, importmap de browser apontando para `esm.sh`, falta plugin React no Vite |
| **Backend (Node/Express)** | 🟡 Estrutura montada | Login usa `mockUser` hardcoded (sem bcrypt real), falta `mongoose.connect()` |
| **MongoDB/Mongoose** | 🔴 Não conectado | Modelos existem (`User.js`, `RefreshToken.js`, `AdminLog.js`) mas `server.js` nunca chama `mongoose.connect()` |
| **Stripe (Pagamentos)** | 🟡 Esqueleto pronto | Rotas existem (`routes/payment.js`, `routes/donation.js`) mas sem fluxo real de checkout completo |
| **Redis/BullMQ (Filas)** | 🟡 Configurado | `queues/videoQueue.js` e `workers/videoWorker.js` existem, precisam de Redis rodando |
| **PWA (manifest/SW)** | 🔴 Quebrado | `manifest.json` referencia ícones inexistentes (`logo192.png`, `logo512.png`), SW na raiz ao invés de `public/` |
| **Tailwind** | 🔴 Via CDN | `index.html` carrega `cdn.tailwindcss.com` — precisa migrar para PostCSS/Vite |
| **Storage S3** | 🟡 Código pronto | `storage.js` usa `@aws-sdk/client-s3` mas o pacote NÃO está no `package.json` |
| **Vite Config** | 🔴 Incompleto | Falta `@vitejs/plugin-react`, falta entry point do `index.tsx`, falta `tailwind.config.js` |

---

## 📋 FASE 1: Configurar o Ambiente Local (Dia 1-2)

### 1.1 — Clonar e instalar

```bash name=terminal-commands.sh
# Clone o fork que você fez
git clone https://github.com/fap233/Lailai-Adventure.git loreflux
cd loreflux

# Crie a branch de trabalho
git checkout -b feat/loreflux-full-setup

# Instale dependências
npm install

# Instale as dependências que FALTAM
npm install @vitejs/plugin-react @aws-sdk/client-s3
npm install -D tailwindcss postcss autoprefixer
```

### 1.2 — Configurar o `.env` local

Use o `.env.zip` que o Vin enviou. Preencha com valores de desenvolvimento:

```dotenv name=.env
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-loreflux-2026
REFRESH_SECRET=dev-refresh-secret-loreflux-2026
MEDIA_TOKEN_SECRET=dev-media-token-secret
FRONTEND_URL=http://localhost:5173
MEDIA_BASE_URL=http://localhost:3000
MONGO_URI=mongodb://localhost:27017/loreflux
STRIPE_SECRET_KEY=sk_test_XXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXX
STRIPE_PRICE_ID=price_XXXXX
REDIS_URL=redis://127.0.0.1:6379
WORKER_CONCURRENCY=2
MAX_ADMIN_COUNT=10
MAX_UPLOAD_SIZE=500mb
```

### 1.3 — Instalar MongoDB e Redis localmente

```bash name=install-services.sh
# MongoDB (Ubuntu/Debian)
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server

# OU use Docker (mais simples)
docker run -d --name mongo -p 27017:27017 mongo:7
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

---

## 📋 FASE 2: Corrigir o Backend — Conectar MongoDB (Dia 2-3)

### 2.1 — Adicionar conexão MongoDB ao `server.js`

O problema CRÍTICO: o `server.js` importa modelos Mongoose mas **nunca chama** `mongoose.connect()`.

```javascript name=server.js url=https://github.com/VinDias/Lailai-Adventure/blob/main/server.js#L14-L16
// Após a linha: dotenv.config();
// ADICIONAR:
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/loreflux')
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => {
    console.error('❌ Erro ao conectar MongoDB:', err);
    process.exit(1);
  });
```

### 2.2 — Corrigir o Login (remover mockUser)

O login atual é hardcoded. Precisa buscar do banco com bcrypt:

```javascript name=server.js
// SUBSTITUIR o endpoint de login (linha ~209) por:
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Conta desativada." });
    }

    const payload = { id: user._id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    logger.info(`Login realizado: ${email}`);
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: user.isPremium,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    logger.error("[Login Error]", err);
    res.status(500).json({ error: "Erro interno." });
  }
});
```

### 2.3 — Adicionar endpoint de Registro

```javascript name=server.js
// ADICIONAR antes do login:
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nome } = req.body;
    if (!email || !password || !nome) {
      return res.status(400).json({ error: "Email, senha e nome são obrigatórios." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Este email já está cadastrado." });
    }

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      nome,
      role: 'user',
      isPremium: false,
      isActive: true,
      provider: 'local'
    });

    const payload = { id: user._id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: '7d' });

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    logger.info(`Novo usuário registrado: ${email}`);
    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        isPremium: false
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    logger.error("[Register Error]", err);
    res.status(500).json({ error: "Erro ao criar conta." });
  }
});
```

### 2.4 — Atualizar o Model `User.js`

O modelo atual está incompleto para o fluxo real:

```javascript name=models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  nome: { type: String, required: true },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['local', 'google', 'microsoft'], default: 'local' },
  providerId: { type: String },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  isActive: { type: Boolean, default: true },
  followingChannelIds: [{ type: Number }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
```

### 2.5 — Criar Script de Seed do Admin (Vin)

```javascript name=scripts/seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/loreflux');
  
  const existing = await User.findOne({ email: 'vin@loreflux.com' });
  if (existing) {
    console.log('Admin já existe.');
    process.exit(0);
  }

  const hash = await bcrypt.hash('SENHA_TEMPORARIA_TROCAR', 12);
  await User.create({
    email: 'vin@loreflux.com',
    passwordHash: hash,
    nome: 'Vin Dias',
    role: 'superadmin',
    isPremium: true,
    isActive: true,
    provider: 'local'
  });

  console.log('✅ Admin criado: vin@loreflux.com');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
```

Adicione ao `package.json`:
```json name=package.json (scripts section)
"seed:admin": "node scripts/seedAdmin.js"
```

---

## 📋 FASE 3: Corrigir o Frontend / Vite / Tailwind (Dia 3-4)

### 3.1 — Corrigir `vite.config.ts`

```typescript name=vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
```

### 3.2 — Migrar Tailwind do CDN para PostCSS

```bash name=terminal.sh
npx tailwindcss init -p
```

```javascript name=tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        loreflux: {
          accent: '#E11D48',
        }
      }
    },
  },
  plugins: [],
};
```

```css name=src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root[data-theme="light"] {
  --bg-color: #ffffff;
  --text-color: #000000;
  --nav-bg: rgba(255, 255, 255, 0.85);
  --apple-bg: #ffffff;
}

:root[data-theme="dark"] {
  --bg-color: #0f0f0f;
  --text-color: #ffffff;
  --nav-bg: rgba(0, 0, 0, 0.85);
  --apple-bg: #0A0A0B;
}

:root {
  --lailai-accent: #E11D48;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  margin: 0;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.3s ease, color 0.3s ease;
}

::-webkit-scrollbar { width: 0; display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

.premium-text {
  background: linear-gradient(135deg, var(--text-color) 0%, #86868B 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.animate-apple {
  animation: apple-in 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes apple-in {
  from { opacity: 0; transform: scale(0.95) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.video-card-hover:hover {
  box-shadow: 0 0 30px rgba(225, 29, 72, 0.2);
}
```

### 3.3 — Limpar o `index.html`

Remover o CDN do Tailwind, o importmap, e os scripts externos desnecessários:

```html name=index.html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#000000">
    <meta name="description" content="Loreflux - Cinematic Comics. Plataforma de streaming vertical e webtoons.">
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <title>Loreflux - Cinematic Comics</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
</body>
</html>
```

### 3.4 — Importar o CSS no `index.tsx`

```tsx name=index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './src/index.css'; // Tailwind compilado

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(err => {
      console.warn("Service Worker registration failed: ", err);
    });
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 📋 FASE 4: Corrigir o PWA (Dia 4-5)

### 4.1 — Criar pasta `public/` com ícones

```bash name=terminal.sh
mkdir -p public/icons

# Gere ícones a partir do logo do Loreflux (peça ao Vin ou crie placeholder)
# Precisa de: icon-192.png, icon-512.png, icon-maskable-512.png
```

### 4.2 — Atualizar `manifest.json` → mover para `public/`

```json name=public/manifest.json
{
  "name": "Loreflux - Cinematic Comics",
  "short_name": "Loreflux",
  "description": "O futuro é aqui. Plataforma de cinematic storytelling.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 4.3 — Mover `service-worker.js` para `public/`

```bash name=terminal.sh
mv service-worker.js public/service-worker.js
```

---

## 📋 FASE 5: Stripe — Assinaturas e Doações (Dia 5-7)

### 5.1 — Configurar Stripe Test Mode

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Ative o **Test Mode**
3. Copie as chaves `sk_test_...` e `pk_test_...`
4. Crie um **Product** > **Price** (R$ 3,99/mês recorrente) e copie o `price_...`
5. Configure o **Webhook** apontando para `https://SEU_DOMINIO/api/payment/webhook` com o evento `checkout.session.completed`

### 5.2 — Completar `routes/payment.js`

O arquivo já existe mas precisa do fluxo completo:

```javascript name=routes/payment.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const verifyToken = require('../middlewares/verifyToken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Criar sessão de checkout
router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.nome });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?payment=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error("[Stripe Checkout Error]", err);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento." });
  }
});

// Webhook do Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error("[Webhook Signature Error]", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerId = session.customer;

    const user = await User.findOne({ stripeCustomerId: customerId });
    if (user) {
      user.isPremium = true;
      user.stripeSubscriptionId = session.subscription;
      user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await user.save();
      logger.info(`✅ Premium ativado para: ${user.email}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
      user.isPremium = false;
      user.stripeSubscriptionId = null;
      await user.save();
      logger.info(`❌ Premium cancelado para: ${user.email}`);
    }
  }

  res.json({ received: true });
});

// Status da assinatura
router.get('/status', verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({
    isPremium: user?.isPremium || false,
    premiumExpiresAt: user?.premiumExpiresAt || null
  });
});

module.exports = router;
```

### 5.3 — Completar `routes/donation.js`

```javascript name=routes/donation.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');

router.post('/create', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body; // valor em centavos (ex: 500 = R$ 5,00)
    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Valor mínimo de doação: R$ 1,00" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: 'Doação para Loreflux' },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?donation=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?donation=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error("[Donation Error]", err);
    res.status(500).json({ error: "Erro ao processar doação." });
  }
});

module.exports = router;
```

---

## 📋 FASE 6: Rebranding LaiLai → Loreflux (Dia 5)

### Arquivos para atualizar o nome:

| Arquivo | Alterar |
|---------|---------|
| `manifest.json` | `name` e `short_name` → Loreflux |
| `index.html` | `<title>` → Loreflux |
| `metadata.json` | `name` e `description` → Loreflux |
| `package.json` | `name` → `loreflux-platform` |
| `ecosystem.config.js` | `name` → `loreflux-app` e `loreflux-video-worker` |
| `server.js` | Log message → Loreflux |
| `README.md` | Reescrever com novo branding |
| Todos os `localStorage` keys | `lailai_pro_session` → `loreflux_session` |

---

## 📋 FASE 7: Integração Bunny.net Stream (Dia 7-8)

### 7.1 — Criar conta e Library na Bunny.net

1. Acesse [bunny.net](https://bunny.net) → Stream → Create Library
2. Copie a **API Key** e o **Library ID**
3. Adicione ao `.env`:

```dotenv name=.env (adicionar)
BUNNY_API_KEY=sua-api-key
BUNNY_LIBRARY_ID=seu-library-id
BUNNY_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net
```

### 7.2 — Criar serviço Bunny

```javascript name=services/bunnyService.js
const axios = require('axios');

const BUNNY_API = 'https://video.bunnycdn.com/library';

class BunnyService {
  constructor() {
    this.apiKey = process.env.BUNNY_API_KEY;
    this.libraryId = process.env.BUNNY_LIBRARY_ID;
    this.cdnHost = process.env.BUNNY_CDN_HOSTNAME;
  }

  async createVideo(title) {
    const res = await axios.post(
      `${BUNNY_API}/${this.libraryId}/videos`,
      { title },
      { headers: { AccessKey: this.apiKey } }
    );
    return res.data; // { guid, ... }
  }

  async uploadVideo(videoId, fileBuffer) {
    await axios.put(
      `${BUNNY_API}/${this.libraryId}/videos/${videoId}`,
      fileBuffer,
      {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': 'application/octet-stream'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
  }

  getEmbedUrl(videoId) {
    return `https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}`;
  }

  getDirectUrl(videoId) {
    return `https://${this.cdnHost}/${videoId}/play_720p.mp4`;
  }
}

module.exports = new BunnyService();
```

### 7.3 — Webhook Bunny (notificação de processamento concluído)

```javascript name=routes/bunnyWebhook.js
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
// Futuramente: atualizar o status do vídeo no MongoDB quando processamento terminar

router.post('/webhook', express.json(), (req, res) => {
  const { VideoGuid, Status } = req.body;
  
  logger.info(`[Bunny Webhook] Video ${VideoGuid} status: ${Status}`);
  
  if (Status === 4) { // 4 = Finished encoding
    // TODO: Atualizar no MongoDB o status do vídeo para "published"
    logger.info(`✅ Vídeo ${VideoGuid} processado e pronto para publicação`);
  }

  res.json({ received: true });
});

module.exports = router;
```

---

## 📋 FASE 8: Deploy na Vercel + Cloudflare (Dia 9-11)

### 8.1 — Separar Frontend e Backend

A arquitetura final deve ser:
- **Frontend (React/Vite)** → Vercel
- **Backend (Node/Express)** → Servidor Linux (Hostinger VPS ou Railway/Render)

### 8.2 — Deploy Frontend na Vercel

```bash name=terminal.sh
# Instale Vercel CLI
npm i -g vercel

# Na raiz do projeto
vercel

# Configurar:
# Framework: Vite
# Build Command: npm run build
# Output Directory: dist
```

### 8.3 — Variáveis de ambiente na Vercel

Vá em **Settings > Environment Variables** e adicione:
- `VITE_API_URL` = `https://api.loreflux.com` (URL do backend)

### 8.4 — Cloudflare DNS

1. Adicione o domínio no Cloudflare
2. Configure os registros DNS:
   - `A` → `loreflux.com` → IP do servidor backend
   - `CNAME` → `www` → `cname.vercel-dns.com` (se frontend na Vercel)
3. Ative **Proxy (nuvem laranja)** para CDN e proteção DDoS
4. Em **SSL/TLS**: selecione **Full (strict)**
5. Em **Page Rules**: Force HTTPS em `http://*loreflux.com/*`

---

## 📋 FASE 9: Painel Administrativo (Dia 10-11)

O componente `components/Admin/AdminDashboard.tsx` já existe. Precisa ser conectado ao backend real. O painel deve permitir:

1. **Upload de vídeos** → via Bunny API
2. **Upload de painéis de webtoon** → via S3/R2
3. **Ver estatísticas** → total de usuários, assinantes, receita
4. **Gerenciar conteúdo** → listar, editar, excluir séries/episódios

### Criar modelos MongoDB para Conteúdo:

```javascript name=models/Series.js
const mongoose = require('mongoose');

const SeriesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  genre: { type: String, required: true },
  description: { type: String },
  cover_image: { type: String },
  isPremium: { type: Boolean, default: false },
  content_type: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  order_index: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
```

```javascript name=models/Episode.js
const mongoose = require('mongoose');

const EpisodeSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episode_number: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String },
  video_url: { type: String }, // URL Bunny.net para hqcine/vcine
  bunnyVideoId: { type: String }, // GUID do Bunny
  thumbnail: { type: String },
  duration: { type: Number },
  panels: [{ image_url: String, order: Number }], // Para hiqua (webtoon)
  isPremium: { type: Boolean, default: false },
  status: { type: String, enum: ['processing', 'published', 'draft'], default: 'draft' },
  views: { type: Number, default: 0 },
  order_index: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Episode', EpisodeSchema);
```

---

## 📋 FASE 10: Google AdSense (Dia 11)

### 10.1 — Registrar no Google AdSense
1. Acesse [adsense.google.com](https://adsense.google.com)
2. Adicione o site `loreflux.com`
3. Cole o código de verificação no `<head>` do `index.html`
4. Substitua `ca-pub-SEU_CLIENT_ID` pelo ID real

### 10.2 — O componente `Ads.tsx` já existe
Verifique se está usando o slot correto do AdSense e se funciona com bloqueadores.

---

## 📋 FASE 11: Testes e Documentação (Dia 12)

### 11.1 — Checklist Final

- [ ] `npm run build` compila sem erros
- [ ] Login/Registro funcionando com MongoDB
- [ ] Assinatura Premium via Stripe (test mode)
- [ ] Doação via Stripe funcionando
- [ ] Upload de vídeo pelo painel admin
- [ ] Vídeo aparece na aba correta (HQCine, VCine)
- [ ] Webtoon painéis carregando na aba Hi-Qua
- [ ] PWA instalável (testar em Android via Chrome)
- [ ] Manifesto sem erros no DevTools > Application
- [ ] Service Worker registrado
- [ ] SSL funcionando (cadeado verde)
- [ ] Rate limiting protegendo endpoints
- [ ] `.env` no `.gitignore` (já está ✅)

### 11.2 — Documentação para o Vin

Crie um `DOCS.md` com:
- Como fazer login no painel admin
- Como fazer upload de vídeo/webtoon
- Como configurar as chaves Stripe em produção
- Como adicionar novos admins
- URLs dos serviços (Vercel, MongoDB Atlas, Bunny.net)

---

## 📌 Resumo da Ordem de Execução

| Dia | Tarefa |
|-----|--------|
| **1-2** | Ambiente local + MongoDB + Redis rodando |
| **2-3** | Conectar MongoDB, corrigir login/registro, seed admin |
| **3-4** | Vite config + migrar Tailwind para PostCSS + limpar index.html |
| **4-5** | PWA (manifest, ícones, service worker) + Rebranding Loreflux |
| **5-7** | Stripe completo (assinatura + doações + webhooks) |
| **7-8** | Bunny.net Stream (upload, webhook, player) |
| **9** | Deploy Backend (VPS/Railway) |
| **10-11** | Deploy Frontend (Vercel) + Cloudflare + Painel Admin |
| **11** | AdSense + testes finais |
| **12** | Documentação + entrega ao Vin |

---

Esse é o mapa completo. Cada fase depende da anterior. Comece pela **Fase 1** agora e, se precisar que eu gere o código de alguma fase específica como Pull Request no repositório, me avise! 🚀