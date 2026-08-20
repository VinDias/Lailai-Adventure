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

## Super Reader — Apoio Direto ao Autor (Fase 4, Bloco 3)

Apoio direto do leitor ao autor de uma obra (80% autor / 20% plataforma), separado da assinatura Premium. Reaproveita a integração Stripe já existente — **nenhuma variável de ambiente nova**.

### Nenhuma configuração nova de Stripe
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PRICE_ID*` já estão documentados acima (seção "Configurar Chaves Stripe em Produção") e em `.env.example` — o Super Reader usa a mesma `STRIPE_SECRET_KEY`, sem chave própria
- O webhook `POST /api/payment/webhook` já assinado para o Premium **não precisa de nenhuma mudança**: o evento `checkout.session.completed` que ele já recebe é o mesmo evento que o Super Reader trata (a rota distingue pelo `metadata.tipo === 'super_reader'` da sessão). Só confira no painel do Stripe que o endpoint de produção continua com esse evento marcado — nada a adicionar

### Setting opcional: `superReaderMinCents`
- Valor mínimo de apoio, em **centavos**, por moeda (500 = R$5,00/US$5,00/€5,00)
- Chave `superReaderMinCents` na coleção `Setting` (mesmo painel de configurações admin)
- **Ausente ou inválido** (não-inteiro ou ≤ 0) → o backend usa o default **500** automaticamente (`services/superReaderService.js`) — não é obrigatório criar a chave para o recurso funcionar

### Comportamento sem `STRIPE_SECRET_KEY`
- `GET /api/superreader/min` e `GET /api/superreader/me` funcionam normalmente — não tocam no Stripe
- `POST /api/superreader/create-session` falha: o serviço tenta montar o cliente Stripe só na primeira chamada real (lazy) e lança um erro simples (sem `.status`) quando a chave não está configurada; a rota devolve **500** genérico (`"Erro ao criar a sessão de apoio."`) ao cliente — o motivo real (`STRIPE_SECRET_KEY não configurada`) fica só no log do servidor

---

## Ativar Notificações Push na VPS

### Gerar Chaves VAPID (uma única vez)

Chaves VAPID identificam seu servidor aos provedores de push (Firefox, Chrome, etc) e habilitam criptografia de ponta a ponta. **Gere-as uma única vez por instância de produção e guarde com segurança.**

1. **Na VPS (`/var/www/lorflux`)**, execute:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Você receberá:
   ```
   Public Key: B3d...xyz
   Private Key: 2Qw...abc
   ```

2. **Adicione ao `.env` em produção:**
   ```env
   VAPID_PUBLIC_KEY=B3d...xyz
   VAPID_PRIVATE_KEY=2Qw...abc
   VAPID_SUBJECT=mailto:contato@lorflux.com
   ```
   - `VAPID_SUBJECT` é seu e-mail ou URL (obrigatório; padronizado para o contato da empresa)
   - A chave privada é sensível — nunca compartilhe em logs ou repositórios

3. **Instale a dependência (se não incluída):**
   ```bash
   npm install
   ```

4. **Rode o backfill de episódios legados (uma vez, idempotente):**
   ```bash
   node scripts/backfillNotificationSentAt.js
   ```
   Marca o acervo já publicado como notificado, para que o primeiro edit de
   um episódio antigo (ex.: trocar a thumbnail) não dispare um push falso de
   "capítulo novo" para quem favoritou. Rodar de novo não faz nada (idempotente).

5. **Reinicie o PM2:**
   ```bash
   npm run restart
   # ou
   pm2 restart all
   ```

### Aviso Crítico

**Trocar VAPID_PRIVATE_KEY invalida TODAS as inscrições ativas.** Antes de regerar:
- Notifique usuários sobre qualquer interrupção de notificações
- Faça backup do `.env` anterior (caso seja necessário reverter temporariamente)
- `PushSubscription` não tem TTL nem expira sozinha: o `notificationService` só remove uma inscrição quando o envio falha com 404/410 (endpoint morto), o que uma chave trocada não necessariamente causa. Ou seja, inscrições antigas podem ficar paradas no banco sem receber nada até o usuário reabrir o app e reativar manualmente (o toggle da Conta ou o cartão pós-favorito criam uma inscrição nova)

### Se Push Ficar Desativado

Se as variáveis VAPID não estiverem no `.env`:
- O app funciona normalmente (todos os recursos disponíveis) — a ausência de push nunca derruba o boot
- Em produção, `notificationService.notifyEpisodePublished` fica desativado (log de erro, sem lançar) — nada é enviado, mas a publicação do episódio segue normal
- Em desenvolvimento, um par de chaves efêmero é gerado a cada start (aviso no log) — inscrições não sobrevivem a um restart
- Reiniciar o PM2 com as chaves corretas reativa o push

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
