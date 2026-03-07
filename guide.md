# 📋 GUIA COMPLETO — Projeto Loreflux (ex-Lailai Adventure)

> **Última atualização:** 6 de Março de 2026
> **Branch:** `feat/loreflux-full-setup`
> **Stack:** React 19 + Vite 5.4 + Tailwind 3.4 + Node/Express + MongoDB + Stripe

---

## 📊 PANORAMA GERAL DO PROJETO

### Status por Área

| Área | Status | Detalhe |
|------|--------|---------|
| **Frontend (React/Vite)** | ✅ Concluído | Build compila, Tailwind via PostCSS, CSS vars com defaults |
| **Backend (Node/Express)** | ✅ Concluído | MongoDB conectado, auth com bcrypt, JWT access+refresh |
| **Autenticação** | ✅ Concluído | Login, registro, logout, refresh token, seed admin |
| **Stripe (Pagamentos)** | ✅ Concluído | Checkout, webhook, status premium, doações |
| **Rebranding** | ✅ Concluído | LaiLai → Loreflux em 23 arquivos |
| **PWA** | ✅ Concluído | Manifest, service-worker, estrutura de ícones |
| **Bunny.net (Vídeo)** | 🟡 Parcial | Serviço criado, webhook pronto — falta credenciais e testes |
| **API de Conteúdo (CRUD)** | 🔴 Pendente | Só existe GET /api/content/series com dados mock |
| **Admin Dashboard** | 🟡 Parcial | UI existe, stats são mock, sem queries reais |
| **Redis/BullMQ (Filas)** | 🟡 Parcial | Código existe, falta instalar Redis |
| **Storage S3/R2** | 🟡 Parcial | SDK instalado, falta endpoints de upload |
| **Anúncios** | 🟡 Parcial | UI + mock data, sem persistência no banco |
| **Sistema de Canais** | 🔴 Pendente | Endpoints referenciados no frontend, não implementados |
| **Webtoon Panels** | 🔴 Pendente | Modelo tem campo panels[], sem endpoint de upload |

---

## ✅ O QUE JÁ ESTÁ PRONTO

### Infraestrutura
- [x] Vite 5.4 + React plugin v4 + PostCSS/Tailwind compilando
- [x] Express com helmet, cors, compression, rate limiting
- [x] MongoDB Atlas conectado via Mongoose
- [x] Modelos: User, Series, Episode, RefreshToken, AdminLog
- [x] JWT (access 15min + refresh 7d) com revogação no logout
- [x] `.env` preenchido com credenciais de desenvolvimento
- [x] Winston logger com rotação diária
- [x] Sentry configurável (opcional)
- [x] Healthcheck em `/health`
- [x] PM2 ecosystem configurado

### Autenticação
- [x] `POST /api/auth/register` — registro com bcrypt (salt 12)
- [x] `POST /api/auth/login` — login com rate limiting (5 tentativas/10min)
- [x] `POST /api/auth/logout` — revoga todos os refresh tokens
- [x] `POST /api/auth/refresh-token` — renova access token
- [x] `npm run seed:admin` — cria superadmin (vin@loreflux.com)

### Pagamentos (Stripe)
- [x] `POST /api/payment/create-checkout` — cria sessão checkout (subscription)
- [x] `POST /api/payment/webhook` — handler (checkout.completed, subscription.deleted)
- [x] `GET /api/payment/status` — retorna isPremium do usuário
- [x] `POST /donation/create` — doação única (mode=payment)

### Admin
- [x] `POST /api/admin/upload-content` — upload com multer + fila BullMQ
- [x] Admin routes: gerenciamento de usuários
- [x] AdminLog: registro de ações administrativas
- [x] Middleware: requireAdmin, requireRole, requirePremium

### Frontend
- [x] Auth (login/registro)
- [x] HQCine (cinema horizontal em quadrinhos)
- [x] VFilm / VCine (cinema vertical)
- [x] HiQua (webtoons de alta qualidade)
- [x] VerticalPlayer (reprodutor de vídeo vertical)
- [x] WebtoonReader (leitor de painéis scroll)
- [x] Profile, Premium, ThemeToggle, BrandLogo
- [x] Admin Dashboard (UI)
- [x] PWA (instalável, ícones configurados)

---

## 🔴 O QUE FALTA PARA FINALIZAR O PROJETO

### 1. Credenciais e Serviços Externos (depende do cliente)

#### Bunny.net Stream (Hospedagem de Vídeo)
- [ ] Criar conta/library no bunny.net → Stream
- [ ] Obter: `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`
- [ ] Configurar webhook URL no painel Bunny: `https://SEU_DOMINIO/api/bunny/webhook`

#### Stripe (Produção)
- [ ] Criar produto "Loreflux Premium" no dashboard Stripe
- [ ] Criar price (ex: R$3,99/mês) e obter o `PRICE_ID` de produção
- [ ] Gerar chaves live: `STRIPE_SECRET_KEY` (sk_live_...) e `STRIPE_WEBHOOK_SECRET`
- [ ] Configurar webhook de produção: `https://SEU_DOMINIO/api/payment/webhook`

#### S3/Cloudflare R2 (Storage de Imagens/Painéis) — Opcional
- [ ] Criar bucket para thumbnails e painéis de webtoon
- [ ] Obter: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME`, `CDN_URL`

#### Redis (Filas de Processamento)
- [ ] Instalar Redis no servidor de produção
- [ ] Configurar `REDIS_URL` no `.env`

#### Domínio e Deploy
- [ ] Definir domínio de produção (ex: loreflux.com)
- [ ] Configurar `FRONTEND_URL` no `.env`
- [ ] Configurar `MEDIA_BASE_URL` no `.env`
- [ ] SSL/HTTPS via Nginx + Let's Encrypt

### 2. Desenvolvimento Backend (implementação necessária)

#### API de Conteúdo — CRUD completo
- [ ] `GET /api/content/series` — listar séries do MongoDB (substituir mock atual)
- [ ] `GET /api/content/series/:id` — detalhes de uma série
- [ ] `POST /api/content/series` — criar série (admin)
- [ ] `PUT /api/content/series/:id` — editar série (admin)
- [ ] `DELETE /api/content/series/:id` — remover série (admin)
- [ ] `GET /api/content/series/:id/episodes` — listar episódios de uma série
- [ ] `GET /api/content/episodes/:id` — detalhes de um episódio
- [ ] `POST /api/content/episodes` — criar episódio (admin)
- [ ] `PUT /api/content/episodes/:id` — editar episódio (admin)
- [ ] `DELETE /api/content/episodes/:id` — remover episódio (admin)
- [ ] `POST /api/content/episodes/:id/panels` — upload de painéis webtoon (admin)

#### API de Canais
- [ ] `GET /api/channels/me` — canais do usuário (substituir fallback mock)
- [ ] `POST /api/channels` — criar canal
- [ ] `GET /api/channels/:id` — detalhes do canal
- [ ] `PUT /api/channels/:id` — editar canal
- [ ] `POST /api/channels/:id/follow` — seguir canal
- [ ] `DELETE /api/channels/:id/follow` — deixar de seguir

#### API de Anúncios
- [ ] `GET /api/content/ads` — listar anúncios ativos (substituir fallback mock)
- [ ] `POST /api/admin/ads` — criar anúncio (admin)
- [ ] `PUT /api/admin/ads/:id` — editar anúncio (admin)
- [ ] `DELETE /api/admin/ads/:id` — remover anúncio (admin)

#### Bunny.net Integration
- [ ] Completar webhook handler (persistir status do vídeo no MongoDB)
- [ ] Endpoint para iniciar upload de vídeo via Bunny API
- [ ] Atualizar Episode com bunnyVideoId e video_url após processamento

#### Admin Dashboard — Dados Reais
- [ ] Substituir stats mock por aggregation queries do MongoDB
- [ ] Total de usuários, premium ativos, receita, uploads
- [ ] Listagem de conteúdo com paginação

### 3. Desenvolvimento Frontend (ajustes necessários)

- [ ] Conectar feeds (HQCine, VCine, HiQua) à API real ao invés de mock data
- [ ] Remover dependência de MOCK_EPISODES, MOCK_CHANNELS, MOCK_ADS quando API estiver pronta
- [ ] Implementar player com URL real do Bunny.net CDN
- [ ] Admin Dashboard: conectar a endpoints reais de stats
- [ ] Tela de upload de conteúdo para admin

### 4. Conteúdo (depende do cliente)

- [ ] Vídeos para HQCine e VCine (formato vertical 9:16 recomendado)
- [ ] Thumbnails (1080x1920px recomendado)
- [ ] Painéis de webtoon para Hi-Qua (até 120 por episódio)
- [ ] Metadados de séries: títulos, descrições, gêneros
- [ ] Ícones PWA reais (192px, 512px, maskable 512px) com logo Loreflux

### 5. Infraestrutura de Produção

- [ ] Servidor VPS/Cloud (Node.js 18+, MongoDB, Redis, Nginx)
- [ ] PM2 com ecosystem.config.js (já configurado)
- [ ] Nginx como reverse proxy (porta 443 → 3000)
- [ ] Backup automático (script scripts/backup.sh já existe)
- [ ] Monitoramento (Sentry DSN opcional)
- [ ] CI/CD (GitHub Actions ou similar)

---

## 🔑 VARIÁVEIS DE AMBIENTE

```env
# ✅ Já configuradas no .env
MONGO_URI=mongodb+srv://...
NODE_ENV=development
JWT_SECRET=...
REFRESH_SECRET=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
FRONTEND_URL=http://localhost:5173
PORT=3000

# ❌ Faltam — precisam do cliente
BUNNY_API_KEY=
BUNNY_LIBRARY_ID=
BUNNY_CDN_HOSTNAME=

# ⚠️ Opcionais — para produção
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_NAME=
CDN_URL=
REDIS_URL=redis://localhost:6379
SENTRY_DSN=
MEDIA_BASE_URL=
MAX_ADMIN_COUNT=10
MAX_UPLOAD_SIZE=10mb
```

---

## 🗄️ MODELOS DO BANCO DE DADOS

### User
```
email (unique), passwordHash, nome, avatar, provider, role,
isPremium, premiumExpiresAt, stripeCustomerId, stripeSubscriptionId,
isActive, followingChannelIds[]
```

### Series
```
title, genre, description, cover_image, isPremium,
content_type (hqcine|vcine|hiqua), order_index, isPublished
```

### Episode
```
seriesId (ref), episode_number, title, description,
video_url, bunnyVideoId, thumbnail, duration,
panels[], isPremium, status (draft|processing|published),
views, order_index
```

### RefreshToken
```
userId, token, createdAt
```

### AdminLog
```
adminId, action, targetId, details, timestamp
```

---

## 🛠️ COMANDOS

```bash
npm run dev          # Frontend Vite (porta 5173)
npm run server       # Backend Express (porta 3000)
npm run build        # Build de produção
npm run seed:admin   # Criar superadmin
npm run validate:env # Validar variáveis de ambiente
npm run worker       # Worker de processamento de vídeo
npm run start        # PM2 produção (start all)
npm run backup       # Backup do banco
```

---

## 📁 ESTRUTURA DO PROJETO

```
├── index.html              # Entry point HTML
├── index.tsx               # React root mount
├── App.tsx                 # Componente principal (ViewMode routing)
├── types.ts                # Interfaces TypeScript
├── constants.tsx           # Constantes globais
├── server.js               # Express backend
├── vite.config.ts          # Configuração Vite + proxy
├── tailwind.config.js      # Configuração Tailwind
├── src/index.css           # Tailwind directives + CSS vars
├── components/
│   ├── Auth.tsx            # Login/Registro
│   ├── HQCine.tsx          # Feed cinema em quadrinhos
│   ├── VFilm.tsx           # Feed cinema vertical
│   ├── HiQua.tsx           # Feed webtoons
│   ├── VerticalPlayer.tsx  # Player de vídeo vertical
│   ├── WebtoonReader.tsx   # Leitor de painéis
│   ├── Profile.tsx         # Perfil do usuário
│   ├── Premium.tsx         # Tela de assinatura
│   ├── Admin/
│   │   └── AdminDashboard.tsx
│   └── ...
├── services/
│   ├── api.ts              # Cliente API (fetch + fallback mock)
│   ├── mockData.ts         # Dados mock (substituir por API real)
│   └── ...
├── models/                 # Mongoose models
├── routes/                 # Express routes
├── middlewares/            # Auth, admin, upload, media token
├── queues/                 # BullMQ video queue
├── workers/                # Video processing worker
├── scripts/                # Admin seed, backup, env validation
├── utils/                  # Logger, storage manager, media token
└── validators/             # Joi content validation
```

---

## 📝 HISTÓRICO DE COMMITS (branch feat/loreflux-full-setup)

1. `e3974e5` — connect MongoDB, fix login with bcrypt, add register endpoint
2. `97e78a6` — update User model with Stripe/provider fields, add admin seed script
3. `526b879` — fix Vite config with React plugin, migrate Tailwind from CDN to PostCSS
4. `3e9297d` — clean index.html, import Tailwind CSS in index.tsx
5. `d90864e` — fix PWA manifest with Loreflux branding, setup public/icons
6. `8e6345b` — complete Stripe checkout, webhook, subscription status, donations
7. *(último)* — fix: resolve white screen (HTML, CSS vars, Tailwind config, Vite host)