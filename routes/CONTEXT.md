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

---

## Padrões

- Todas as rotas são montadas no `server.js` sob o prefixo `/api`
- Rotas protegidas usam os middlewares `verifyToken`, `requireAdmin` ou `requirePremium`
- Arquivos `.js` (CommonJS) — o backend não usa TypeScript
- Validação de dados via `validators/contentValidator.js` (Joi)
