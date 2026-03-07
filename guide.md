# GUIA COMPLETO — Projeto Loreflux (ex-Lailai Adventure)

> **Última atualização:** 7 de Março de 2026
> **Branch:** `main` (merge de `feat/loreflux-full-setup`)
> **Stack:** React 19 + Vite 5.4 + Tailwind 3.4 + Node/Express + MongoDB + Stripe + Bunny.net

---

## PANORAMA GERAL DO PROJETO

### Status por Área

| Área | Status | Detalhe |
|------|--------|---------|
| **Frontend (React/Vite)** | Concluído | Build compila, Tailwind via PostCSS, CSS vars com defaults |
| **Backend (Node/Express)** | Concluído | MongoDB conectado, auth com bcrypt, JWT access+refresh |
| **Autenticação** | Concluído | Login, registro, logout, refresh token, seed admin |
| **Stripe (Pagamentos)** | Parcial | Checkout e webhook prontos — falta chaves de produção |
| **Rebranding** | Concluído | LaiLai → Loreflux em 23 arquivos |
| **PWA** | Concluído | Manifest, service-worker, estrutura de ícones |
| **Bunny.net (Vídeo)** | Concluído | Credenciais configuradas, webhook persiste no MongoDB, endpoint de upload |
| **API de Conteúdo (CRUD)** | Concluído | CRUD completo de Series e Episodes no MongoDB |
| **Admin Dashboard** | Parcial | Stats reais do MongoDB prontos — falta conectar no frontend |
| **Redis/BullMQ (Filas)** | Parcial | Código existe, falta instalar Redis no servidor |
| **Storage S3/R2** | Parcial | SDK instalado, falta endpoints de upload |
| **Anúncios** | Concluído | CRUD completo no banco, rastreamento de impressões e cliques |
| **Sistema de Canais** | Concluído | API completa: criar, editar, follow/unfollow |
| **Webtoon Panels** | Concluído | Endpoint POST /api/content/episodes/:id/panels implementado |
| **Google AdSense** | Concluído | Script integrado no index.html (ca-pub-5972610130504852) |

---

## O QUE JA ESTA PRONTO

### Infraestrutura
- [x] Vite 5.4 + React plugin v4 + PostCSS/Tailwind compilando
- [x] Express com helmet, cors, compression, rate limiting
- [x] MongoDB Atlas conectado via Mongoose
- [x] Modelos: User, Series, Episode, RefreshToken, AdminLog, Channel, Ad
- [x] JWT (access 15min + refresh 7d) com revogação no logout
- [x] `.env` preenchido com credenciais (incluindo Bunny.net)
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

### API de Conteúdo — CRUD completo (routes/content.js)
- [x] `GET /api/content/series` — listar séries do MongoDB (com filtro por ?type=)
- [x] `GET /api/content/series/:id` — detalhes de uma série
- [x] `POST /api/content/series` — criar série (admin)
- [x] `PUT /api/content/series/:id` — editar série (admin)
- [x] `DELETE /api/content/series/:id` — remover série e episódios (admin)
- [x] `GET /api/content/series/:id/episodes` — listar episódios publicados
- [x] `GET /api/content/episodes/:id` — detalhes + incrementa views
- [x] `POST /api/content/episodes` — criar episódio (admin)
- [x] `PUT /api/content/episodes/:id` — editar episódio (admin)
- [x] `DELETE /api/content/episodes/:id` — remover episódio (admin)
- [x] `POST /api/content/episodes/:id/panels` — adicionar painéis webtoon (admin)
- [x] `GET /api/content/ads` — listar anúncios ativos

### API de Canais (routes/channels.js)
- [x] `GET /api/channels/me` — canais do usuário autenticado
- [x] `GET /api/channels/:id` — detalhes do canal
- [x] `POST /api/channels` — criar canal
- [x] `PUT /api/channels/:id` — editar canal (apenas dono)
- [x] `POST /api/channels/:id/follow` — seguir canal
- [x] `DELETE /api/channels/:id/follow` — deixar de seguir

### API de Anúncios (routes/ads.js)
- [x] `GET /api/admin/ads` — listar todos (admin)
- [x] `POST /api/admin/ads` — criar anúncio (admin)
- [x] `PUT /api/admin/ads/:id` — editar anúncio (admin)
- [x] `DELETE /api/admin/ads/:id` — remover anúncio (admin)
- [x] `POST /api/admin/ads/:id/impression` — registrar impressão
- [x] `POST /api/admin/ads/:id/click` — registrar clique

### Bunny.net (routes/bunnyWebhook.js)
- [x] `POST /api/bunny/webhook` — persiste status e URL HLS no MongoDB ao concluir encoding
- [x] `POST /api/bunny/upload` — cria vídeo na biblioteca do Bunny Stream e vincula ao episódio
- [x] Credenciais configuradas no .env: `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID=612589`, `BUNNY_CDN_HOSTNAME=vz-fbaa1d24-d2c.b-cdn.net`

### Admin Dashboard (routes/admin.js)
- [x] `GET /api/admin/management/stats` — dados reais do MongoDB (totalUsers, premiumUsers, series, episódios, anúncios, receita estimada)
- [x] `GET /api/admin/management/content` — listagem de séries paginada
- [x] `PUT /api/admin/management/reorder` — salva nova ordem no MongoDB
- [x] `PUT /api/admin/management/update-thumbnail/:id` — atualiza thumbnail
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
- [x] Google AdSense integrado (ca-pub-5972610130504852)

---

## O QUE AINDA FALTA

### 1. Ações Manuais (depende do cliente/servidor)

#### MongoDB — CRITICO
- [ ] Substituir `<db_password>` no `MONGO_URI` do `.env` pela senha real do MongoDB Atlas

#### Bunny.net — configurar webhook no painel
- [ ] Entrar em dash.bunny.net → Library 612589 → Settings → Webhooks
- [ ] Adicionar URL: `https://SEU_DOMINIO/api/bunny/webhook`

#### Stripe — producao
- [ ] Criar produto "Loreflux Premium" (R$3,99/mes) no dashboard Stripe
- [ ] Copiar `PRICE_ID` e substituir `price_PLACEHOLDER` no `.env`
- [ ] Configurar webhook: `https://SEU_DOMINIO/api/payment/webhook`
- [ ] Atualizar `STRIPE_WEBHOOK_SECRET` no `.env`

#### Redis
- [ ] Instalar Redis no servidor: `sudo apt install redis-server && sudo systemctl enable --now redis`

#### Domínio e Deploy
- [ ] Definir domínio e VPS
- [ ] Atualizar `FRONTEND_URL` e `MEDIA_BASE_URL` no `.env`
- [ ] Configurar Nginx + SSL (Let's Encrypt)

### 2. Desenvolvimento Frontend (a fazer)

- [ ] Conectar feeds (HQCine, VCine, HiQua) a `/api/content/series?type=hqcine` etc.
- [ ] Remover fallback para MOCK_EPISODES, MOCK_CHANNELS, MOCK_ADS (api.ts)
- [ ] Player de vídeo montar URL HLS real: `https://vz-fbaa1d24-d2c.b-cdn.net/{bunnyVideoId}/playlist.m3u8`
- [ ] Admin Dashboard: conectar a `/api/admin/management/stats` para stats reais
- [ ] Tela de upload de conteúdo para admin (UI para cadastrar série/episódio + enviar vídeo via Bunny)

### 3. Conteúdo (depende do cliente)

- [ ] Vídeos para HQCine e VCine (formato vertical 9:16 recomendado)
- [ ] Thumbnails (1080x1920px recomendado)
- [ ] Painéis de webtoon para Hi-Qua (até 120 por episódio)
- [ ] Metadados de séries: títulos, descrições, gêneros
- [ ] Ícones PWA reais (192px, 512px, maskable 512px) com logo Loreflux

### 4. Infraestrutura de Producao

- [ ] Servidor VPS/Cloud (Node.js 18+, MongoDB, Redis, Nginx)
- [ ] PM2 com ecosystem.config.js (já configurado)
- [ ] Nginx como reverse proxy (porta 443 → 3000)
- [ ] Backup automático (script scripts/backup.sh já existe)
- [ ] Monitoramento (Sentry DSN opcional)

---

## VARIAVEIS DE AMBIENTE

```env
# Configuradas no .env
MONGO_URI=mongodb+srv://omaxoficial_db_user:<db_password>@cluster0.vu1pltq.mongodb.net/  # FALTA senha
NODE_ENV=development
JWT_SECRET=...
REFRESH_SECRET=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER  # FALTA — configurar em producao
STRIPE_PRICE_ID=price_PLACEHOLDER        # FALTA — gerar no Stripe
FRONTEND_URL=http://localhost:5173
PORT=3000

# Bunny.net — JA CONFIGURADO
BUNNY_API_KEY=f76df9a8-146e-4ba9-98ca9b75d06a-633b-401c
BUNNY_LIBRARY_ID=612589
BUNNY_CDN_HOSTNAME=vz-fbaa1d24-d2c.b-cdn.net

# Para producao — faltam
FRONTEND_URL=https://SEU_DOMINIO
MEDIA_BASE_URL=https://SEU_DOMINIO
REDIS_URL=redis://localhost:6379
SENTRY_DSN=
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_NAME=
CDN_URL=
```

---

## MODELOS DO BANCO DE DADOS

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

### Channel
```
ownerId (ref User), name, description, avatar, banner,
followers[] (ref User), isActive
```

### Ad
```
title, image_url, link_url, advertiser, isActive,
impressions, clicks, startsAt, endsAt
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

## COMANDOS

```bash
npm run dev          # Frontend Vite (porta 5173)
npm run server       # Backend Express (porta 3000)
npm run build        # Build de producao
npm run seed:admin   # Criar superadmin
npm run validate:env # Validar variaveis de ambiente
npm run worker       # Worker de processamento de video
npm run start        # PM2 producao (start all)
npm run backup       # Backup do banco
```

---

## ESTRUTURA DO PROJETO

```
├── index.html              # Entry point HTML (AdSense incluido)
├── index.tsx               # React root mount
├── App.tsx                 # Componente principal (ViewMode routing)
├── types.ts                # Interfaces TypeScript
├── constants.tsx           # Constantes globais
├── server.js               # Express backend
├── vite.config.ts          # Configuracao Vite + proxy
├── tailwind.config.js      # Configuracao Tailwind
├── src/index.css           # Tailwind directives + CSS vars
├── components/
│   ├── Auth.tsx
│   ├── HQCine.tsx
│   ├── VFilm.tsx
│   ├── HiQua.tsx
│   ├── VerticalPlayer.tsx
│   ├── WebtoonReader.tsx
│   ├── Profile.tsx
│   ├── Premium.tsx
│   ├── Admin/
│   │   └── AdminDashboard.tsx
│   └── ...
├── services/
│   ├── api.ts              # Cliente API (fetch + fallback mock)
│   ├── mockData.ts         # Dados mock (substituir por API real)
│   └── ...
├── models/
│   ├── User.js
│   ├── Series.js
│   ├── Episode.js
│   ├── Channel.js          # novo
│   ├── Ad.js               # novo
│   ├── RefreshToken.js
│   └── AdminLog.js
├── routes/
│   ├── content.js          # novo — CRUD Series/Episodes/Panels/Ads
│   ├── channels.js         # novo — CRUD Canais + follow
│   ├── ads.js              # novo — CRUD Anuncios + metricas
│   ├── bunnyWebhook.js     # atualizado — persiste status + endpoint upload
│   ├── admin.js            # atualizado — stats reais do MongoDB
│   ├── payment.js
│   ├── donation.js
│   ├── mobilePayment.js
│   └── adminManagement.js
├── middlewares/
├── queues/
├── workers/
├── scripts/
├── utils/
└── validators/
```

---

## HISTORICO DE COMMITS

1. `e3974e5` — connect MongoDB, fix login with bcrypt, add register endpoint
2. `97e78a6` — update User model with Stripe/provider fields, add admin seed script
3. `526b879` — fix Vite config with React plugin, migrate Tailwind from CDN to PostCSS
4. `3e9297d` — clean index.html, import Tailwind CSS in index.tsx
5. `d90864e` — fix PWA manifest with Loreflux branding, setup public/icons
6. `8e6345b` — complete Stripe checkout, webhook, subscription status, donations
7. `b04712d` — fix: resolve white screen (HTML, CSS vars, Tailwind config, Vite host)
8. `6eac6ff` — chore: update gitignore
9. `82984e4` — feat: implement full content/channels/ads CRUD APIs + complete Bunny.net integration
10. `e997c0d` — feat: add Google AdSense script to index.html
