# routes/

## Responsabilidade

Endpoints da API REST do Express. Cada arquivo agrupa rotas relacionadas a um domínio específico da aplicação.

---

## Arquivos e Endpoints

### `content.js` — Conteúdo Principal
Rotas públicas e protegidas para consumo de conteúdo.
- `GET /series` — Listagem de séries (filtros por tipo: `hqcine`, `vcine`, `hiqua`)
- `GET /series/:id` — Detalhes de uma série
- `GET /series/:id/episodes` — Episódios de uma série (publicados/não publicados conforme role)
- `POST /series/:id/vote` — Sistema de votação (like/dislike) — requer autenticação
- `POST /series`, `PUT /series/:id`, `DELETE /series/:id` — CRUD de séries (admin only)

### `admin.js` — Painel Administrativo
Endpoints exclusivos para administradores. Montado em `/api/admin/management`.
- `GET /stats` — Estatísticas do dashboard (usuários, receita, conteúdo)
- `GET /content` — Listagem paginada de todo o conteúdo
- `PUT /reorder` — Reordenação de séries via drag & drop
- `PUT /update-thumbnail/:id` — Troca de capa de série
- `PATCH /episodes/:id/audio` — Atualiza `audioTrack1Url` e/ou `audioTrack2Url` de um episódio

### `adminManagement.js` — Gestão de Usuários Admin
- Modificação de roles e permissões de usuários
- Registro de auditoria de ações administrativas (`AdminLog`)

### `payment.js` — Pagamentos Stripe
- `POST /checkout` — Cria sessão de checkout Stripe para assinatura premium
- `POST /webhook` — Webhook Stripe para confirmar pagamentos e ativar premium

### `bunnyWebhook.js` — Integração Bunny.net
Montado em `/api/bunny`.
- `POST /webhook` — Recebe eventos do Bunny Stream (transcodificação concluída/falha) e atualiza `Episode.status` no MongoDB
- `POST /upload` — Cria vídeo na biblioteca Bunny Stream e retorna URL TUS para upload direto
- `POST /upload-video` — Upload de arquivo de vídeo direto para o Bunny Stream via multipart
- `POST /upload-image` — Upload de imagem única para Bunny Storage (`lorflux/`)
- `POST /upload-image-batch` — Upload em lote de até 138 imagens para Bunny Storage (`lorflux/panels/`) — processa em paralelo via `Promise.allSettled`, retorna relatório por arquivo
- `POST /upload-audio` — Upload de arquivo de áudio (MP3/AAC/M4A/OGG/WAV, máx 200MB) para Bunny Storage (`lorflux/audio/`)

### `ads.js` — Anúncios
- `GET /ads` — Lista anúncios ativos
- `POST /ads` — Cria nova campanha (admin only)
- Controle de ativação e agendamento

### `channels.js` — Canais de Criadores
- `GET /channels` — Lista canais
- `POST /channels` — Criação de canal
- Atualização de metadados, avatar, banner e contagem de seguidores

### `donation.js` — Doações
- `POST /donate` — Processa uma doação

### `mobilePayment.js` — Pagamento Mobile
- Integração com processador de pagamento alternativo para dispositivos móveis

### `favorites.js` — Meus Favoritos
Montado em `/api/favorites` (todas com `verifyToken`).
- `GET /` — lista favoritos da conta (filtra séries despublicadas/deletadas, critério `isPublished === true`)
- `POST /:seriesId` — adiciona (upsert idempotente; corrida E11000 tratada como sucesso)
- `DELETE /:seriesId` — remove

### `account.js` — Conta e LGPD
Montado em `/api/account`.
- `PUT /me/consent` — consentimento de marketing
- `GET /me/export` — export de dados (LGPD)
- `DELETE /me` — exclusão de conta com limpeza de engajamento
- `POST /me/avatar` — upload de foto de perfil (multer memória → sharp 512×512 webp → Bunny Storage `lorflux/avatars/`)

### `settings.js` — Configurações
- `GET /public` — settings públicas (tagline, anúncios, `google_client_id` vindo do env quando configurado)
- `GET /`, `PUT /:key` — CRUD (admin)

### `royalties.js` — Motor de Royalties (Fase 3)
Montado em `/api/admin/royalties` (tudo `verifyToken` + `requireAdmin`).
- `GET /report?period=YYYY-MM` — pontos válidos por canal (view/read não-flagged), share, pool sugerido (impressões÷1000×`premium_cpm_rate` + premium ativos×`royalty_premium_per_sub`), alertas de anomalia
- `POST /close` — fecha o período com `poolFinal` confirmado (snapshot em `RoyaltyPeriod`)
- `GET /periods` — períodos fechados
- `GET /verify-integrity` — re-percorre a cadeia de hash do log de eventos
- `GET /export.csv?period=YYYY-MM` — CSV do relatório

---

## Padrões

- Todas as rotas são montadas no `server.js` sob o prefixo `/api`
- Rotas protegidas usam os middlewares `verifyToken`, `requireAdmin` ou `requirePremium`
- Arquivos `.js` (CommonJS) — o backend não usa TypeScript
- Validação de dados via `validators/contentValidator.js` (Joi)
- **Rotas de autenticação vivem no `server.js`** (não nesta pasta): register, login, `POST /api/auth/google` (Google Identity Services — verifica ID token, vincula por e-mail verificado, dormente sem `GOOGLE_CLIENT_ID`), refresh-token, logout, forgot/reset-password, `/auth/me`
