# Lorflux — Plataforma de Entretenimento Digital

## Visão Geral

**Lorflux** é uma plataforma full-stack de entretenimento digital focada em conteúdo no formato vertical (9:16). Combina três tipos de conteúdo em uma única aplicação:

- **HQCine** — Quadrinhos cinematográficos em formato vertical
- **VCine** — Filmes experimentais verticais
- **Hi-Qua** — Webtoons com suporte a múltiplos idiomas

**Versão**: 2.4.0
**Stack**: React 19 + Vite (frontend) / Node.js + Express (backend) / MongoDB (banco de dados)

---

## Arquitetura

```
Frontend (React 19 + Vite + TypeScript)
    └── comunica com →
Backend (Express + Node.js)
    ├── MongoDB (dados da aplicação)
    ├── Redis + BullMQ (filas de processamento)
    ├── Bunny.net Stream (hospedagem e streaming de vídeo)
    ├── Bunny.net Storage (imagens e assets via CDN)
    ├── Stripe (assinaturas e pagamentos)
    └── AWS S3 / Cloudflare R2 (armazenamento de arquivos)
```

O backend serve tanto a API REST quanto os arquivos estáticos do build do React em produção.

---

## Estrutura de Pastas

| Pasta | Responsabilidade |
|-------|-----------------|
| `src/` | CSS global e ponto de entrada do React |
| `components/` | Componentes React da interface do usuário |
| `hooks/` | Custom hooks React |
| `config/` | Configurações e constantes da aplicação |
| `services/` | Lógica de negócio e integrações com APIs externas |
| `routes/` | Endpoints da API Express |
| `models/` | Schemas MongoDB (Mongoose) |
| `middlewares/` | Middlewares Express (autenticação, autorização, upload) |
| `validators/` | Schemas de validação de dados (Joi) |
| `utils/` | Funções utilitárias (logger, tokens, storage) |
| `queues/` | Configuração de filas BullMQ |
| `workers/` | Processadores de jobs em background |
| `scripts/` | Scripts de setup e manutenção |
| `public/` | Assets estáticos e PWA (ícones, service worker) |

---

## Arquivos Raiz Importantes

| Arquivo | Propósito |
|---------|-----------|
| `server.js` | Inicialização do servidor Express com todas as configurações |
| `storage.js` | Integração com AWS S3 / Cloudflare R2 |
| `types.ts` | Interfaces TypeScript globais da aplicação |
| `vite.config.ts` | Configuração do build com proxy para o backend |
| `tailwind.config.js` | Design system com dark mode e cores customizadas |
| `ecosystem.config.js` | Configuração PM2 para produção (app + worker) |
| `.env.example` | Template com todas as variáveis de ambiente necessárias |
| `manifest.json` | Configuração PWA para instalação mobile |

---

## Funcionalidades Principais

### Sistema de Conteúdo
- Séries com episódios em vídeo (HQCine/VCine) ou painéis de imagem (Hi-Qua)
- Player de vídeo com HLS via Bunny CDN, múltiplas trilhas de áudio e troca de qualidade
- Leitor de webtoon com camadas de tradução (PT, EN, ES, ZH)
- Sistema de votação (like/dislike) por episódio

### Autenticação e Usuários
- Login local (email + senha com bcrypt)
- OAuth (Google, Microsoft)
- JWT com refresh token rotation
- Roles: `user`, `admin`, `superadmin`

### Monetização
- Assinaturas premium via Stripe (R$ 3,99/mês)
- Anúncios em vídeo para usuários não-premium
- Sistema de doações

### Admin Dashboard
- Painel completo de gerenciamento de séries e episódios
- Upload direto para Bunny Stream e Bunny Storage
- **Batch upload de painéis** — zona drag-and-drop com fila visual e progresso por arquivo
- **Gerenciamento de canais de áudio** — modal com Canal 1 (dublagem) e Canal 2 (trilha) por episódio
- Gestão de campanhas publicitárias
- Gestão de usuários e permissões
- Estatísticas de receita e engajamento

### Infraestrutura
- Filas de processamento de vídeo com BullMQ + Redis
- Webhooks Bunny.net para status de transcodificação
- Logging estruturado com Winston (rotação diária, 30 dias)
- Monitoramento de erros via Sentry
- Rate limiting e headers de segurança (Helmet)
- Suporte a PWA com service worker e instalação mobile

---

## Variáveis de Ambiente Necessárias

```env
PORT, NODE_ENV, JWT_SECRET, REFRESH_SECRET, MEDIA_TOKEN_SECRET
FRONTEND_URL, MONGO_URI
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
REDIS_URL
BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME
BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY, BUNNY_STORAGE_HOSTNAME
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME
S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME
SENTRY_DSN, WORKER_CONCURRENCY, MAX_ADMIN_COUNT, MAX_UPLOAD_SIZE
```

---

## Como Rodar Localmente

```bash
npm install
npm run dev       # Frontend (Vite, porta 5173)
npm run server    # Backend (Express, porta 3000)
npm run worker    # Worker de processamento de vídeo
```

## Módulo de Produtividade Admin (implementado em 2026-03-18)

Ver [PLAN.md](PLAN.md) para o plano detalhado. As 3 features foram implementadas:

1. ✅ **Batch Upload de Painéis** — zona drag-and-drop com fila visual, upload de até 138 imagens em lote para Bunny CDN (`POST /api/bunny/upload-image-batch`)
2. ✅ **Upload dos 3 Canais de Áudio** — modal de gerenciamento no admin com auto-save; campos `audioTrack1Url` / `audioTrack2Url` no model `Episode` (`POST /api/bunny/upload-audio` + `PATCH /api/admin/management/episodes/:id/audio`)
3. ✅ **E-mail Profissional** — `services/emailService.js` com nodemailer + templates prontos + guia DNS completo em [EMAIL_SETUP.md](EMAIL_SETUP.md)

---

## Deploy em Produção

```bash
npm run build          # Build do React
npm start              # Inicia via PM2 (app + worker)
npm run seed:admin     # Cria o primeiro usuário admin
npm run validate:env   # Valida variáveis de ambiente
npm run backup         # Backup do banco de dados
```
