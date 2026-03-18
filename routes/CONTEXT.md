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
Endpoints exclusivos para administradores.
- `GET /stats` — Estatísticas do dashboard (usuários, receita, conteúdo)
- `GET /content` — Listagem paginada de todo o conteúdo
- Gerenciamento de séries e episódios (criação, edição, exclusão)

### `adminManagement.js` — Gestão de Usuários Admin
- Modificação de roles e permissões de usuários
- Registro de auditoria de ações administrativas (`AdminLog`)

### `payment.js` — Pagamentos Stripe
- `POST /checkout` — Cria sessão de checkout Stripe para assinatura premium
- `POST /webhook` — Webhook Stripe para confirmar pagamentos e ativar premium

### `bunnyWebhook.js` — Integração Bunny.net
- Webhook receptor de eventos do Bunny Stream (transcodificação de vídeo concluída, falha, etc.)
- Upload de imagens de painéis para Bunny Storage
- Valida assinatura dos webhooks recebidos
- Atualiza status de transcodificação nos episódios

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
