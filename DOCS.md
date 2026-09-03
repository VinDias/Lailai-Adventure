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
- Valor mínimo de apoio, em **centavos** (500 = R$5,00; Super Reader é BRL apenas — ver seção acima)
- Chave `superReaderMinCents` na coleção `Setting`, configurável via `PUT /api/settings/:key` com token admin — **não** existe campo para ela no painel de configurações admin (`components/Admin/AdminDashboard.tsx`, formulário hardcoded com as 9 chaves de `PUBLIC_KEYS`); adicionar esse campo ao painel é dívida de produto registrada aqui
  ```bash
  curl -X PUT https://api.lorflux.com/api/settings/superReaderMinCents -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" -d '{"value":"1000"}'
  ```
- **Ausente ou inválido** (não-inteiro ou ≤ 0) → o backend usa o default **500** automaticamente (`services/superReaderService.js`) — não é obrigatório criar a chave para o recurso funcionar

### Comportamento sem `STRIPE_SECRET_KEY`
- `GET /api/superreader/min` e `GET /api/superreader/me` funcionam normalmente — não tocam no Stripe
- `POST /api/superreader/create-session` falha: o serviço tenta montar o cliente Stripe só na primeira chamada real (lazy) e lança um erro simples (sem `.status`) quando a chave não está configurada; a rota devolve **500** genérico (`"Erro ao criar a sessão de apoio."`) ao cliente — o motivo real (`STRIPE_SECRET_KEY não configurada`) fica só no log do servidor

---

## Algoritmo de Recomendação — Score e Tags (Fase 4, Bloco 4)

Score por obra (0–100) e distribuição 50/30/20 nos 3 feeds (HQCine/VCine/Hi-Qua). Reaproveita a infraestrutura existente — **nenhuma variável de ambiente nova**.

### Nenhum passo manual pós-deploy
O primeiro boot depois do deploy já dispara a varredura inicial sozinho: `server.js` chama `recommendationService.iniciarVarreduraPeriodica()` ao conectar no MongoDB, que checa se existe alguma série publicada sem `SeriesScore` (ou com score vencido, mais velho que 24h) e, se sim, roda `computeAllScores()` em segundo plano — os scores **nascem sozinhos**, sem seed nem comando manual. Depois disso, a varredura se repete a cada 24h e cada ação forte (voto, favorito, Super Reader, capítulo publicado, conclusão de leitura) recalcula a obra afetada na hora.

### Curadoria de tags é opcional e progressiva
Tags internas (`Series.tags`) alimentam só a Afinidade do algoritmo — nunca aparecem para o leitor (o campo `genre` continua sendo o rótulo visível). Acervo sem tags (`tags: []`, o default) funciona normalmente: toda obra sem tags recebe **12,5 pts neutros** de Afinidade (metade dos 25 possíveis), em vez de ser penalizada por falta de curadoria. Adicionar tags a uma obra é opcional e pode ser feito aos poucos, série por série, no admin (chips no formulário de criar/editar série, mínimo 5 quando informadas) — não é passo obrigatório do deploy nem exige tocar o acervo inteiro de uma vez.

### Setting de limiares de penalização NÃO existe
Os limiares das penalizações (retenção baixa <30% da escala, abandono ≥60% dos leitores presos no capítulo 1, inatividade >60 dias sem capítulo novo) estão fixos em código (`services/recommendationService.js`) — **não existe** nenhuma chave em `Setting` nem rota para ajustá-los em produção. Registrado como dívida na spec (`docs/superpowers/specs/2026-08-20-algoritmo-recomendacao-design.md`, seção "Fora de escopo"); mudar um limiar hoje exige editar o código e fazer deploy.

---

## Portal do Ilustrador (Fase 5, Bloco 1)

Cada ilustrador com conta própria vinculada a um canal: página pública com botão Seguir, painel com os números dele, upload dos próprios capítulos (que só entram no ar depois da aprovação do Master) e mensagem privada editor↔ilustrador. Reaproveita a infraestrutura existente — **nenhuma variável de ambiente nova, nenhuma chave nova, nenhum passo de migração**.

### Nenhum passo manual pós-deploy
Os campos novos (`Series.content_rating_sugerida`, `Series.submittedAt`, `Episode.submittedAt`) têm `default: null` e a coleção `mensagemportals` nasce vazia no primeiro uso — o Mongoose aplica o schema sozinho, sem script de migração. O acervo existente continua funcionando como está.

### Como vincular um ilustrador a um canal (é o único passo operacional)
"Ilustrador" **não é um role** — é derivado de ser dono de um canal ativo. São dois passos no painel admin, nesta ordem:

1. **Criar o canal** — `POST /api/channels` virou **admin-only** neste bloco (antes, qualquer usuário autenticado criava canal; sem essa mudança qualquer leitor se autopromoveria a ilustrador). O canal nasce com o próprio admin como dono.
2. **Transferir a titularidade** — painel admin → **Canais** → selecionar o canal → campo **"E-mail do dono (transferir titularidade)"** → Transferir. O e-mail precisa ser de um usuário **já cadastrado** no Lorflux; e-mail sem conta responde "Usuário com esse e-mail não encontrado." Feito isso, o cartão **"Meu Estúdio"** aparece sozinho na aba Conta desse usuário no próximo carregamento.

> **A transferência arquiva a thread de mensagens do dono anterior.** É intencional (LGPD): o sucessor não lê o histórico privado do antecessor. O admin continua vendo tudo em Canais → Mensagens. Transferir para o **mesmo** e-mail já vigente é no-op e não arquiva nada.

### Revogar um ilustrador
Painel admin → **Canais** → **Desativar canal**. O canal some do catálogo público (`GET /api/channels/:id` passa a responder 404), o ex-dono perde o acesso a todo o portal (403) e a exclusão de conta dele deixa de ser bloqueada. As obras publicadas **continuam no ar** — desativar canal nunca apaga conteúdo.

- **Não existe rota de reativar canal.** Reativar hoje exige `isActive: true` direto no MongoDB (`db.channels.updateOne({_id: ...}, {$set: {isActive: true}})`). Dívida registrada — desative com essa consciência.
- Transferir a titularidade para outra pessoa é a alternativa a desativar, quando a obra deve continuar tendo um dono ativo.

### O que o Master precisa fazer para uma obra ir ao ar
Painel admin → **Aprovações** (badge na sidebar = itens pendentes). Nada enviado pelo ilustrador entra no catálogo sozinho.
- **Gênero é obrigatório para aprovar uma série** — a obra do portal nasce sem gênero (o formulário do ilustrador não tem esse campo, por decisão de contrato) e o botão Aprovar fica desabilitado até o Master preencher. Tags são opcionais (0 ou 5–15) e podem ser preenchidas na mesma tela.
- **Aprove a série antes do capítulo.** Aprovar um capítulo de série ainda não publicada responde 400 com essa orientação.
- **Devolver** limpa o marcador de envio (a obra volta a ser editável pelo ilustrador) e cria automaticamente a mensagem do editor na thread dele, já apontando qual obra/capítulo. Devolver uma série **não** devolve os capítulos dela em cascata.
- Aprovar e devolver ficam registrados no `AdminLog` (`APROVAR_SERIE_PORTAL`, `APROVAR_EPISODIO_PORTAL`, `DEVOLVER_SERIE_PORTAL`, `DEVOLVER_EPISODIO_PORTAL`).
- O card da fila mostra capa/thumbnail, descrição, classificação sugerida e a contagem de painéis — **não** um leitor página a página. Para revisar as páginas de um capítulo antes de aprovar, use **Gerenciar Conteúdo** (que lista também as séries não publicadas).

### O painel de números do ilustrador não mostra R$ no mês corrente
Decisão de contrato, não limitação técnica: o mês em aberto mostra **pontos, views válidas e % de share**, sem valor em reais, porque o pool só é confirmado no fechamento (`POST /api/admin/royalties/close`). R$ aparece só em períodos **fechados**, lidos do `RoyaltyPeriod.breakdown` filtrado ao canal, mais os apoios de Super Reader por mês. São exatamente os mesmos números do relatório admin (mesmas funções, em `services/royaltyReportService.js`) — não existe segundo cálculo que possa divergir na hora de pagar.

### Uploads: o que o ilustrador pode e não pode subir
- **Pode**: imagens (capa, thumbnail de capítulo, painéis) — `POST /api/bunny/upload-image` e `/upload-image-batch` aceitam admin **ou** dono do canal da série alvo. O ilustrador manda o `seriesId`; **o servidor deriva a pasta do storage do título da série** e ignora qualquer caminho informado no corpo.
- **Não pode**: vídeo e áudio (`/upload`, `/upload-video`, `/upload-audio` seguem admin-only). Abrir vídeo ao ilustrador antes do gate de temporada da 5.1 reabriria o buraco do "vídeo grátis".
- As abas **CINECOMICS** e **VERTICALSHOW** aparecem no portal **bloqueadas**, com o aviso "Publicação mediante contratação de temporada — em breve". Não há checkout nem upload por trás delas neste bloco.

### Efeito colateral esperado no catálogo antigo
A partir deste deploy as rotas públicas passam a filtrar por publicado (busca, detalhe de série, lista e detalhe de capítulo, `signed-url`). Se hoje existir no ar algum **capítulo `draft` dentro de uma série publicada**, ele deixará de aparecer para o leitor — isso é a correção, não uma regressão. Para colocá-lo de volta no ar, publique o capítulo normalmente pelo admin. Admin e dono do canal continuam vendo os próprios rascunhos, e abrir um rascunho **não** conta view nem gera evento de royalties.

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
