# GUIA COMPLETO — Projeto Lorflux

> **Última atualização:** 14 de Março de 2026
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
| **Bunny.net (Vídeo)** | Concluído | Upload direto via botão no admin, webhook HLS, CDN configurado |
| **API de Conteúdo (CRUD)** | Concluído | Séries, episódios, painéis, votos, traduções |
| **Admin Dashboard** | Concluído | Stats, séries, episódios, upload de capa/vídeo/painel, anúncios |
| **Sistema de Votos** | Concluído | Like/dislike em vídeos e webtoons, contadores no admin |
| **Seletor de Idioma** | Concluído | PT/EN/ES/ZH no WebtoonReader com translation layers |
| **Switch de Dublagem** | Concluído | Original/Dublagem 1/Dublagem 2 no VerticalPlayer |
| **Google AdSense** | Concluído | Script integrado, ads condicionais para não-premium |
| **Redis/BullMQ (Filas)** | Concluído | Redis instalado e ativo na VPS |
| **Gerenciamento de Anúncios** | Concluído | CRUD completo via UI no Admin (ativar/desativar, editar, deletar) |
| **Tema Claro/Escuro** | Concluído | Toggle no nav e na tela de login, persiste no localStorage, HQCine/VFilm/HiQua adaptam |

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
- [x] Redis instalado e ativo (`redis://localhost:6379`)

### Autenticação
- [x] `POST /api/auth/register` — registro com bcrypt (salt 12)
- [x] `POST /api/auth/login` — retorna `{ user, accessToken }`, token salvo no localStorage
- [x] `POST /api/auth/logout` — revoga todos os refresh tokens
- [x] `POST /api/auth/refresh-token` — renova access token
- [x] `npm run seed:admin` — cria superadmin (vin@lorflux.com)
- [x] Persistência de sessão entre reloads (lorflux_session + lorflux_token)
- [x] Fluxo de registro via UI (Auth.tsx — campo nome, email, senha)

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
- [x] `GET /api/content/ads` — anúncios ativos (para exibição no app)

### Admin Dashboard (frontend + backend)
- [x] Stats reais: usuários, premium, séries, episódios, anúncios, receita estimada
- [x] Gerenciar séries: criar, reordenar, deletar
- [x] Upload de capa da série: clique na thumbnail para substituir (ou arquivo no modal)
- [x] Gerenciar episódios por série: listar, criar, deletar
- [x] Upload de vídeo direto para Bunny Stream via botão 🎬 na lista de episódios (MP4/MOV/MKV até 800 MB)
- [x] Upload de imagem de painel direto para Bunny Storage via área de drop na tela de painéis
- [x] Gerenciar anúncios: criar, editar, ativar/desativar, deletar
- [x] `requireAdmin` aceita roles `admin` e `superadmin`
- [x] Botão Admin visível apenas para `role === 'superadmin'`
- [x] Navegação entre subviews (ADMIN_DASHBOARD, ADMIN_CONTENT, ADMIN_ADS)

### Backend — Rotas Admin (routes/admin.js + routes/ads.js)
- [x] `GET /api/admin/management/stats` — estatísticas do dashboard
- [x] `GET /api/admin/management/content` — listagem de séries com votos/views agregados
- [x] `PUT /api/admin/management/reorder` — reordenar séries (drag & drop)
- [x] `PUT /api/admin/management/update-thumbnail/:id` — upload de capa (multer + MongoDB)
- [x] `GET /api/admin/episodes/:id/metrics` — likes/dislikes por episódio
- [x] `GET/POST/PUT/DELETE /api/admin/ads` — CRUD de anúncios
- [x] `POST /api/admin/ads/:id/impression` — registrar impressão
- [x] `POST /api/admin/ads/:id/click` — registrar clique

### Frontend — Players & Readers
- [x] VerticalPlayer: HLS via Bunny CDN, qualidade adaptativa, 3 trilhas de áudio, like/dislike
- [x] WebtoonReader: scroll de painéis, seletor PT/EN/ES/ZH, translation layers overlay, like/dislike
- [x] Votos ocultos do usuário — contadores só visíveis no admin
- [x] Acesso premium controlado (conteúdo bloqueado para não-assinantes)
- [x] Anúncios condicionais (só para não-premium)

### Tema Claro/Escuro
- [x] `useTheme` hook — persiste em localStorage, aplica classe `.dark` no `<html>`
- [x] `ThemeToggle` no nav (todas as páginas) e na tela de login
- [x] CSS variables: `:root` = claro, `.dark` = escuro para bg, texto, nav, cards, bordas
- [x] HQCine, VFilm, HiQua e Auth usam `bg-[var(--bg-color)]` — respondem ao tema
- [x] Admin Dashboard permanece sempre escuro (intencional — ferramenta interna)
- [x] Players e readers (VerticalPlayer, WebtoonReader) permanecem sempre escuros (intencional)

### PWA
- [x] manifest.json com branding Lorflux
- [x] service-worker.js
- [x] Ícones gerados: icon-192.png, icon-512.png, icon-maskable-512.png

---

## O QUE AINDA FALTA

### 1. Ações na VPS / Serviços Externos

| Item | Prioridade | Detalhe |
|------|-----------|---------|
| Stripe live | Média | Trocar `sk_test_` por `sk_live_` no `.env` da VPS + `STRIPE_PRICE_ID` real |
| Ícones PWA reais | Baixa | Substituir os placeholders em `public/icons/` por arte real do Lorflux |

### 2. Conteúdo (depende do cliente)

- [ ] Vídeos para HQCine e VCine — usar o botão 🎬 no admin para envio direto ao Bunny Stream
- [ ] Thumbnails das séries e episódios
- [ ] Painéis de webtoon para Hi-Qua — usar upload na tela de painéis (JPEG/PNG/WebP)
- [ ] Camadas de tradução por painel (PT já é o original; EN/ES/ZH são imagens overlay via API)

---

## FLUXO PARA ADICIONAR CONTEÚDO

### HQCine / VCine (vídeo)
1. Admin → Gerenciar Conteúdo → Nova Série (tipo `hqcine` ou `vcine`)
2. Clicar na thumbnail da série para fazer upload da capa
3. Clicar no ícone de lista na série → Novo Episódio → preencher título e descrição (vídeo é opcional aqui)
4. **Upload de vídeo:** na lista de episódios, clicar no ícone 🎬 (Film) ao lado do episódio → selecionar arquivo MP4/MOV/MKV (até 800 MB) → o upload vai direto para o Bunny Stream e o status muda para `processing`
5. O webhook do Bunny atualiza automaticamente o `video_url` (HLS) quando o encoding terminar
6. O player usa `https://vz-fbaa1d24-d2c.b-cdn.net/{bunnyVideoId}/playlist.m3u8`

### Hi-Qua (webtoon — painéis)
1. Admin → Nova Série (tipo `hiqua`)
2. Criar episódio (sem vídeo)
3. Clicar no ícone 📖 (BookOpen) para gerenciar painéis
4. **Upload de painel (recomendado):** clicar na área tracejada "Upload de imagem para Bunny CDN" → selecionar imagem JPEG/PNG/WebP → upload vai direto para o Bunny Storage e o painel é adicionado automaticamente
5. **Ou via URL:** colar a URL no campo e clicar "Adicionar"
6. Repetir para cada painel (ordem é sequencial automática)
7. Máximo: 138 painéis por episódio (formatos suportados: 22, 83 e 138 painéis)
8. Para traduções: `PUT /api/content/episodes/:id/panels/:index/translations` com `{ language, imageUrl }`

> **Nota sobre o leitor:** os painéis são exibidos em scroll vertical contínuo sem corte — CSS garante `gap-0` e `leading-none` em cada painel.

### Anúncios
1. Admin → Anúncios → Novo Anúncio
2. Preencher título, URL da imagem, link de destino, anunciante, datas de início/fim
3. Anúncios ativos aparecem automaticamente para usuários não-premium
4. Use o toggle para ativar/desativar sem deletar

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
REDIS_URL=redis://localhost:6379      # configurado
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

## HISTORICO DE COMMITS

| Hash | Descrição |
|------|-----------|
| `646e112` | feat: googleapis, Stripe checkout, ícones PWA |
| `3e13918` | fix: token persistence e offline detection |
| `e5d54a6` | fix: requireAdmin aceita superadmin, AdminDashboard subviews |
| `990cca1` | feat: gerenciamento de episódios no Admin |
| `568a399` | feat: registro de usuários, upload de thumbnail, admin ads UI |
| `2cc770f` | feat: thumbnail upload for series in admin panel |
| `b1467b3` | fix: theme toggle position, dark/light mode CSS variables |
| `34a4eb1` | fix: use CSS variable for main content backgrounds to support light mode |
