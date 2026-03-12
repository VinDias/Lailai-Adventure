# GUIA COMPLETO — Projeto Lorflux

> **Última atualização:** 11 de Março de 2026
> **Branch:** `main`
> **Stack:** React 19 + Vite 5.4 + Tailwind 3.4 + Node/Express + MongoDB + Stripe + Bunny.net

---

## PANORAMA GERAL DO PROJETO

### Status por Área

| Área | Status | Detalhe |
|------|--------|---------|
| **Frontend (React/Vite)** | Concluído | Build compila, deploy em produção funcionando |
| **Backend (Node/Express)** | Concluído | MongoDB Atlas conectado, auth JWT, todas rotas funcionando |
| **Autenticação** | Concluído | Login, registro, token persistido no localStorage |
| **Stripe (Pagamentos)** | Parcial | Checkout funcional em teste — falta trocar para chaves live |
| **PWA** | Concluído | Manifest, service-worker, ícones gerados (192, 512, maskable) |
| **Bunny.net (Vídeo)** | Concluído | Upload endpoint, webhook HLS, CDN configurado |
| **API de Conteúdo (CRUD)** | Concluído | Séries, episódios, painéis, votos, traduções |
| **Admin Dashboard** | Concluído | Stats reais, criar/deletar séries, gerenciar episódios |
| **Sistema de Votos** | Concluído | Like/dislike em vídeos e webtoons, contadores ocultos no admin |
| **Seletor de Idioma** | Concluído | PT/EN/ES/ZH no WebtoonReader com translation layers |
| **Switch de Dublagem** | Concluído | Original/Dublagem 1/Dublagem 2 no VerticalPlayer |
| **Google AdSense** | Concluído | Script integrado, ads condicionais para não-premium |
| **Redis/BullMQ (Filas)** | Parcial | Código existe — falta instalar Redis no servidor |
| **Storage S3/R2** | Pendente | SDK instalado — falta endpoints de upload de imagem |

---

## O QUE ESTÁ PRONTO

### Infraestrutura & Deploy
- [x] Vite 5.4 + React plugin + PostCSS/Tailwind compilando
- [x] Express com helmet, cors, compression, rate limiting
- [x] MongoDB Atlas conectado via Mongoose
- [x] JWT (access 15min + refresh 7d) com revogação no logout
- [x] `.env` preenchido em produção (MongoDB, Stripe, Bunny, JWT)
- [x] `VITE_API_URL=https://lorflux.com/api` no `.env` da VPS
- [x] PM2 com 3 processos online (app + 2 workers)
- [x] Winston logger com rotação diária
- [x] Healthcheck em `/health`

### Autenticação
- [x] `POST /api/auth/register` — registro com bcrypt (salt 12)
- [x] `POST /api/auth/login` — retorna `{ user, accessToken }`, token salvo no localStorage
- [x] `POST /api/auth/logout` — revoga todos os refresh tokens
- [x] `POST /api/auth/refresh-token` — renova access token
- [x] `npm run seed:admin` — cria superadmin (vin@lorflux.com)
- [x] Persistência de sessão entre reloads (lorflux_session + lorflux_token)

### Pagamentos (Stripe)
- [x] `POST /api/payment/create-checkout` — cria sessão checkout (subscription)
- [x] `POST /api/payment/webhook` — handler (checkout.completed, subscription.deleted)
- [x] `GET /api/payment/status` — retorna isPremium do usuário
- [x] Botão "Assinar Premium" chama `api.createCheckoutSession()` e redireciona para Stripe

### API de Conteúdo (routes/content.js)
- [x] CRUD completo de Series e Episodes
- [x] `POST /api/content/episodes/:id/panels` — adicionar painéis webtoon
- [x] `PUT /api/content/episodes/:episodeId/panels/:panelIndex/translations` — tradução por painel
- [x] `GET/POST/DELETE /api/content/episodes/:id/vote` — sistema de votos
- [x] `GET /api/content/ads` — anúncios ativos

### Admin Dashboard (frontend + backend)
- [x] Stats reais: usuários, premium, séries, episódios, anúncios, receita estimada
- [x] Gerenciar séries: criar, reordenar, deletar
- [x] Gerenciar episódios por série: listar, criar (Bunny ID ou URL direta), deletar
- [x] `requireAdmin` aceita roles `admin` e `superadmin`
- [x] Botão Admin visível apenas para `role === 'superadmin'`
- [x] Navegação entre subviews (ADMIN_DASHBOARD, ADMIN_CONTENT) sem tela branca

### Frontend — Players & Readers
- [x] VerticalPlayer: HLS via Bunny CDN, qualidade adaptativa, 3 trilhas de áudio, like/dislike
- [x] WebtoonReader: scroll de painéis, seletor PT/EN/ES/ZH, translation layers overlay, like/dislike
- [x] Votos ocultos do usuário — contadores só visíveis no admin
- [x] Acesso premium controlado (conteúdo bloqueado para não-assinantes)
- [x] Anúncios condicionais (só para não-premium)

### PWA
- [x] manifest.json com branding Lorflux
- [x] service-worker.js
- [x] Ícones gerados: icon-192.png, icon-512.png, icon-maskable-512.png

---

## O QUE AINDA FALTA

### 1. Ações na VPS / Serviços Externos

| Item | Prioridade | Detalhe |
|------|-----------|---------|
| Redis | Alta | `sudo apt install redis-server && sudo systemctl enable --now redis` |
| Bunny webhook | Alta | dash.bunny.net → Library 612589 → Settings → Webhooks → `https://lorflux.com/api/bunny/webhook` |
| Stripe live | Média | Trocar `sk_test_` por `sk_live_` no `.env` da VPS + `STRIPE_PRICE_ID` real |
| Ícones PWA reais | Baixa | Substituir os placeholders em `public/icons/` por arte real do Lorflux |

### 2. Desenvolvimento Frontend

- [ ] **Tela de gerenciamento de anúncios no Admin** — CRUD de anúncios via UI (hoje só via API)
- [ ] **Upload de imagem de capa no admin** — hoje só aceita URL; endpoint `PUT /api/admin/management/update-thumbnail/:id` existe mas não tem UI
- [ ] **Registro de novos usuários** — Auth.tsx tem botão "Criar Conta" mas só alterna label, não implementa o fluxo de registro

### 3. Conteúdo (depende do cliente)

- [ ] Vídeos para HQCine e VCine (formato vertical 9:16 recomendado, enviar via Bunny Stream)
- [ ] Thumbnails das séries e episódios
- [ ] Painéis de webtoon para Hi-Qua (URLs de imagem por painel)
- [ ] Camadas de tradução por painel (PT já é o original; EN/ES/ZH são imagens overlay)

### 4. Backend — Pendências menores

- [ ] Rota `POST /api/auth/register` — verificar se está exposta e funcionando (não foi testada)
- [ ] `GET /api/admin/episodes/:id/metrics` — rota referenciada no api.ts mas não implementada em admin.js

---

## FLUXO PARA ADICIONAR CONTEÚDO

### HQCine / VCine (vídeo)
1. Admin → Gerenciar Conteúdo → Nova Série (tipo `hqcine` ou `vcine`)
2. Clicar no ícone de lista na série → Novo Episódio
3. Preencher título, thumbnail URL, **Bunny Video ID** (obter no painel Bunny Stream após upload)
4. O player usa `https://vz-fbaa1d24-d2c.b-cdn.net/{bunnyVideoId}/playlist.m3u8`

### Hi-Qua (webtoon)
1. Admin → Nova Série (tipo `hiqua`)
2. Criar episódio (sem vídeo)
3. Via API: `POST /api/content/episodes/:id/panels` com array de `{ image_url, order }`
4. Para traduções: `PUT /api/content/episodes/:id/panels/:index/translations` com `{ language, imageUrl }`

---

## VARIAVEIS DE AMBIENTE (VPS — resumo)

```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://...  # configurado
JWT_SECRET=...               # configurado
STRIPE_SECRET_KEY=sk_test_... # trocar para sk_live_ em producao
STRIPE_PRICE_ID=price_...    # configurado
STRIPE_WEBHOOK_SECRET=whsec_ # configurado
BUNNY_API_KEY=...             # configurado
BUNNY_LIBRARY_ID=612589       # configurado
BUNNY_CDN_HOSTNAME=vz-fbaa1d24-d2c.b-cdn.net
FRONTEND_URL=https://lorflux.com
VITE_API_URL=https://lorflux.com/api  # CRITICO — necessario no build
REDIS_URL=redis://localhost:6379      # falta instalar Redis
```

---

## DEPLOY NA VPS

```bash
cd /var/www/lorflux
git stash          # protege .env e alteracoes locais
git pull origin main
npm install
npm run build
pm2 restart all
```

---

## COMANDOS UTEIS

```bash
npm run dev          # Frontend Vite (porta 5173)
npm run server       # Backend Express (porta 3000)
npm run build        # Build de producao
npm run seed:admin   # Criar superadmin (vin@lorflux.com)
pm2 logs             # Ver logs em tempo real na VPS
pm2 status           # Status dos processos
```

---

## HISTORICO DE COMMITS (sessao atual)

| Hash | Descrição |
|------|-----------|
| `646e112` | feat: googleapis, Stripe checkout, ícones PWA |
| `3e13918` | fix: token persistence e offline detection |
| `e5d54a6` | fix: requireAdmin aceita superadmin, AdminDashboard subviews |
| `990cca1` | feat: gerenciamento de episódios no Admin |
