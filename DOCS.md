# Lorflux - Documentação de Operação

## Acesso ao Painel Admin

1. Acesse `https://lorflux.com` e faça login com as credenciais de superadmin
2. O painel admin estará disponível na navegação para usuários com role `admin` ou `superadmin`
3. Credenciais iniciais do admin:
   - **Email:** `vin@lorflux.com`
   - **Senha:** Definida no seed (trocar após primeiro login)

Para criar o admin inicial:
```bash
npm run seed:admin
```

---

## Upload de Vídeo (HQCine / VCine)

1. Acesse o painel admin → **Upload Content**
2. Selecione o tipo: `video`
3. Selecione a seção: `HQCINE` ou `VCINE`
4. Preencha título e metadados
5. Faça upload do arquivo de vídeo e thumbnail
6. O vídeo será enfileirado para processamento via BullMQ
7. Após processamento, o status muda para `published`

### Via Bunny.net Stream
- Vídeos são enviados para o Bunny.net via API
- O processamento (transcode) é feito automaticamente pelo Bunny
- Quando o encode termina, um webhook notifica o backend (`/api/bunny/webhook`)
- As URLs de embed e diretas são geradas automaticamente

---

## Upload de Webtoon (Hi-Qua)

1. Acesse o painel admin → **Upload Content**
2. Selecione o tipo: `panels`
3. Selecione a seção: `HIQUA`
4. Faça upload dos painéis (até 120 imagens por episódio)
5. Os painéis são armazenados via S3/R2

---

## Configurar Chaves Stripe em Produção

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Desative o **Test Mode**
3. Copie as chaves de produção:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → `whsec_...`
4. Crie um **Product** com preço recorrente (R$ 3,99/mês) e copie o `STRIPE_PRICE_ID`
5. Configure o webhook em produção:
   - URL: `https://api.lorflux.com/api/payment/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.deleted`
6. Atualize as variáveis no servidor de produção

---

## Adicionar Novos Admins

Via MongoDB:
```javascript
// No shell do MongoDB
db.users.updateOne(
  { email: "email@exemplo.com" },
  { $set: { role: "admin" } }
)
```

Ou crie um novo seed script modificando `scripts/seedAdmin.js`.

**Limite:** Máximo de `MAX_ADMIN_COUNT` admins (configurável no `.env`, padrão: 10).

---

## URLs dos Serviços

| Serviço | URL |
|---------|-----|
| **Frontend (Vercel)** | `https://lorflux.com` |
| **Backend API** | `https://api.lorflux.com` |
| **MongoDB Atlas** | Configurado em `MONGO_URI` no `.env` |
| **Bunny.net Stream** | Dashboard em [bunny.net](https://bunny.net) |
| **Stripe Dashboard** | [dashboard.stripe.com](https://dashboard.stripe.com) |
| **Cloudflare DNS** | [dash.cloudflare.com](https://dash.cloudflare.com) |
| **Sentry (Monitoramento)** | Configurado em `SENTRY_DSN` no `.env` |

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão: 3000) |
| `NODE_ENV` | `development` ou `production` |
| `JWT_SECRET` | Chave secreta para tokens JWT |
| `REFRESH_SECRET` | Chave secreta para refresh tokens |
| `MONGO_URI` | URI de conexão MongoDB |
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook Stripe |
| `STRIPE_PRICE_ID` | ID do preço da assinatura |
| `REDIS_URL` | URL de conexão Redis |
| `BUNNY_API_KEY` | API Key do Bunny.net |
| `BUNNY_LIBRARY_ID` | ID da library Bunny.net |
| `BUNNY_CDN_HOSTNAME` | Hostname CDN do Bunny.net |
| `FRONTEND_URL` | URL do frontend |

---

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Frontend (Vite dev server)
npm run server       # Backend (Express)
npm run worker       # Video worker (BullMQ)

# Produção
npm run build        # Build do frontend
npm run start        # Inicia via PM2
npm run stop         # Para via PM2
npm run restart      # Reinicia via PM2

# Utilitários
npm run seed:admin   # Criar admin inicial
npm run validate:env # Validar variáveis de ambiente
npm run backup       # Backup do projeto
```
