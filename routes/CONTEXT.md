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
- `POST /series/:id/vote` — Sistema de votação (like/dislike) — requer autenticação. Fase 4, Bloco 4: dispara `recommendationService.dispararRecalculo(seriesId, 'voto_serie')` SEMPRE (upsert não distingue voto novo de trocado; recalcular de novo com o mesmo voto é idempotente), inclusive no `E11000` de corrida de dois primeiros-votos simultâneos
- `POST /series`, `PUT /series/:id`, `DELETE /series/:id` — CRUD de séries (admin only). Fase 4, Bloco 4: POST/PUT aceitam `tags` (validação do schema — 0 ou 5–15, strings não vazias, `models/Series.js`); `ValidationError` do Mongoose (tags inválidas — mas também qualquer outro campo, ex. `releaseDay`) vira **400** em vez de cair no catch genérico (500) nas duas rotas
- `GET /recommendations?type=hqcine\|vcine\|hiqua` (Fase 4, Bloco 4) — lista de séries publicadas do tipo, ordenada pela recomendação 50/30/20 (`services/recommendationService.buildRecommendations`). `optionalAuth` + identidade anônima (`utils/requestIdentity`, mesmo header `X-Anonymous-Id` do progresso) alimentam a Afinidade do leitor. Qualquer falha do serviço (score ausente, agregação etc.) NUNCA vira 500 direto — degrada para a MESMA query manual do `GET /series` (`order_index` asc, `createdAt` desc); só se o próprio fallback falhar (ex. banco fora do ar) é que responde 500. `type` fora do enum → 400
- Republicação de série (`isPublished` falso→verdadeiro no PUT) também dispara `dispararRecalculo(seriesId, 'capitulo_publicado')` — mesmo gatilho fire-and-forget dos "6 pontos de publicação" do algoritmo (Fase 4, Bloco 4, mesmo conjunto do push do Bloco 2): republicação de série (3º) + `POST /episodes` (1º) + `PUT /episodes/:id` (2º) + `POST /episodes/:id/panels` (4º), todos neste arquivo, mais o webhook de status do Bunny (5º) e a sincronização manual do status Bunny (6º) em `bunnyWebhook.js`. A abertura de episódio (`GET /episodes/:id`, view/read) **NÃO** dispara recálculo síncrono — coberta só pela varredura de 24h (RULING da T5: rota mais quente do backend)

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
- `POST /webhook` — Webhook Stripe para confirmar pagamentos e ativar premium. No `checkout.session.completed` (Fase 4, Bloco 3): **antes** do caminho Premium, `if (session.metadata?.tipo === 'super_reader')` delega a `superReaderService.registrarContribuicao(session)` e retorna — não é assinatura, não pode cair na busca por `stripeCustomerId`. Falha na gravação cai no catch geral (500) e o Stripe reenvia (o upsert do serviço absorve o retry). Guard adicionado durante o Bloco 3 (achado ao testar o webhook do Super Reader, corrigido de imediato — bug pré-existente, não exclusivo do Super Reader): sessão sem `customer` (ex. doação avulsa, "send test webhook" do painel Stripe) é ignorada com `warn` em vez de cair em `findOne({stripeCustomerId: customerId})` com `customerId` undefined — esse filtro casaria qualquer usuário sem o campo e promoveria um usuário arbitrário a Premium. Fase 4, Bloco 4: o caminho Super Reader só chega em `registrarContribuicao` depois do guard de `payment_status` (segue só se ausente ou `'paid'` — Pix/boleto com `payment_status` diferente retorna cedo sem gravar); logo depois de gravar, dispara `recommendationService.dispararRecalculo(contribuicao.seriesId, 'super_reader')` fire-and-forget, sem `await` (o webhook do Stripe não pode esperar o recálculo pra responder)

### `superReader.js` — Apoio Direto ao Autor (Fase 4, Bloco 3)
Montado em `/api/superreader`. Rotas finas por cima de `services/superReaderService.js` — toda validação/regra de negócio vive no serviço.
- `POST /create-session` — `verifyToken`; body `{ seriesId, amountCents, currency }`. `userId` SEMPRE vem do token (`req.user.id`), nunca do body. Delega a `criarSessaoDeApoio` (valida `amountCents` inteiro ≥ mínimo, moeda somente `brl` — decisão da revisão final: o relatório de repasse agrega sem separar moeda; multimoeda é dívida —, série existe/publicada/com `channelId`; cria a sessão Stripe `mode: 'payment'`) e devolve `{ url }`. Erros de validação (`err.status`) viram o status certo (400/404); qualquer outro erro vira 500
- `GET /me` — `verifyToken`; devolve `{ superReader: boolean, contribuicoes: [{ seriesTitle, amountCents, currency, createdAt }] }` a partir das próprias `SuperReaderContribution` (mais recente primeiro). `superReader` é derivado (existe ≥ 1 contribuição), sem campo novo em `User`. Nunca devolve `stripeSessionId` nem os campos de share (autor/plataforma); série apagada vira `seriesTitle: null` (populate, mesmo padrão de `routes/favorites.js`)
- `GET /min` — sem auth; devolve `{ minCents }` via `services/superReaderService.js::lerMinimoCents()` (não via `PUBLIC_KEYS` de `routes/settings.js` — aquela rota devolve `Setting.value` cru, sem validar/aplicar o fallback default 500)

### `bunnyWebhook.js` — Integração Bunny.net
Montado em `/api/bunny`.
- `POST /webhook` — Recebe eventos do Bunny Stream (transcodificação concluída/falha) e atualiza `Episode.status` no MongoDB. Fase 4, Bloco 4: quando o status do Bunny publica o episódio (Status 4), dispara `recommendationService.dispararRecalculo(episode.seriesId, 'capitulo_publicado')` — 5º dos "6 pontos de publicação" (mesmo conjunto do push do Bloco 2; os outros ficam em `content.js` — POST/PUT episódio, POST panels, republicação de série — e um 6º aqui mesmo, na sincronização manual do status Bunny)
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
- `POST /:seriesId` — adiciona (upsert idempotente; corrida E11000 tratada como sucesso). Fase 4, Bloco 4: dispara `recommendationService.dispararRecalculo(seriesId, 'favorito')` SEMPRE (na resposta de sucesso E no `E11000`) — a rota é idempotente e sempre responde `favorited: true` sem saber se criou ou só confirmou um favorito já existente
- `DELETE /:seriesId` — remove

### `account.js` — Conta e LGPD
Montado em `/api/account`.
- `PUT /me/consent` — consentimento de marketing
- `GET /me/export` — export de dados (LGPD; inclui `readingProgress` com `percent` e `position`). Fase 4 Bloco 3: inclui `superReaderContributions` (`seriesTitle`, `amountCents`, `currency`, `createdAt` — sem `stripeSessionId` nem os campos de share, que são detalhe contábil do repasse ao autor, não dado sobre o titular)
- `DELETE /me` — exclusão de conta com limpeza de engajamento (inclui `ReadingProgress`). Fase 4 Bloco 3: `SuperReaderContribution` NÃO é apagada — é **anonimizada** (`updateMany({userId}, {$set: {userId: null}})`), pois o valor repassado ao autor é registro contábil do relatório de royalties (soma por canal/período, não por usuário)
- `POST /me/avatar` — upload de foto de perfil (multer memória → sharp 512×512 webp → Bunny Storage `lorflux/avatars/`)

### `progress.js` — Progresso de Leitura e "Continuar" (Fase 4)
Montado em `/api/me`. Todas as rotas aceitam conta OU visitante (`optionalAuth` + `utils/requestIdentity.js`).
- `PUT /progress` — grava (upsert) onde o usuário parou. Fase 4, Bloco 4: `services/progressService.dispararSeConcluido` dispara `recommendationService.dispararRecalculo(seriesId, 'progresso_concluido')` quando o documento SALVO tem `completed: true` (não todo save — a maioria tem `completed: false`); releitura de quem já concluiu pode re-disparar, aceito e idempotente
- `GET /progress/:episodeId` — progresso de UM episódio específico, sem as regras de poda/dedupe/teto do carrossel — devolve a linha crua ou `null`. Usado pela restauração de "onde parei" no `WebtoonReader`/`VerticalPlayer` (a lista de `/continue` é lossy demais para essa pergunta)
- `GET /continue` — carrossel "Continuar"; aceita `?contentType=hqcine|vcine|hiqua` para filtrar e aplicar o teto de 20 obras só dentro daquele tipo
- `POST /progress/claim` — migra o histórico do visitante (`anonymousId`) para a conta no login/cadastro

### `push.js` — Notificações Push (Fase 4, Bloco 2)
Um único router montado uma vez em `/api` — mistura rota pública com rotas autenticadas.
- `GET /push/public-key` — SEM auth; devolve `{ publicKey }` (pode vir `null` se VAPID não estiver configurado em produção — o front trata)
- `POST /me/push/subscribe` — `verifyToken`; upsert por `endpoint` (`{ endpoint, keys: { p256dh, auth } }` no body); o aparelho passa a pertencer a quem está logado nele agora (takeover de dono é intencional); devolve `{ subscribed: true }` (200 se já existia, 201 se novo)
- `DELETE /me/push/subscribe` — `verifyToken`; remove só o endpoint do próprio usuário (`{ endpoint }` no body); devolve `{ removed: <deletedCount 0 ou 1> }`
- `GET /me/push/status` — `verifyToken`; `?endpoint=` opcional; devolve `{ thisDevice, anyDevice }` (`thisDevice` = esse endpoint pertence ao logado; `anyDevice` = o logado tem alguma inscrição, em qualquer aparelho)

### `settings.js` — Configurações
- `GET /public` — settings públicas (tagline, anúncios, `google_client_id` vindo do env quando configurado)
- `GET /`, `PUT /:key` — CRUD (admin)

### `royalties.js` — Motor de Royalties (Fase 3)
Montado em `/api/admin/royalties` (tudo `verifyToken` + `requireAdmin`).
- `GET /report?period=YYYY-MM` — pontos válidos por canal (view/read não-flagged), share, pool sugerido (impressões÷1000×`premium_cpm_rate` + premium ativos×`royalty_premium_per_sub`), alertas de anomalia. Fase 4 Bloco 3: resposta ganha `superReader: { porCanal: [{channelId, channelName, apoios, autorCents}], totalAutorCents, totalPlataformaCents, totalApoios }` — soma de `SuperReaderContribution` (`authorShareCents`/`platformShareCents`) por canal no período, **fora** de `poolSuggested` e do `breakdown` (apoio direto ao autor, não entra no pool mensal)
- `POST /close` — fecha o período com `poolFinal` confirmado (snapshot em `RoyaltyPeriod`); Super Reader não participa (sem alteração nesta rota)
- `GET /periods` — períodos fechados
- `GET /verify-integrity` — re-percorre a cadeia de hash do log de eventos
- `GET /export.csv?period=YYYY-MM` — CSV do relatório. Fase 4 Bloco 3: bloco separado ao final do arquivo (linha em branco + cabeçalho "Super Reader (direto ao autor)" + `canal;apoios;autor;plataforma`, valores em decimal `.toFixed(2)`) — não altera nenhuma linha/coluna existente do CSV do pool

---

## Padrões

- Todas as rotas são montadas no `server.js` sob o prefixo `/api`
- Rotas protegidas usam os middlewares `verifyToken`, `requireAdmin` ou `requirePremium`
- Arquivos `.js` (CommonJS) — o backend não usa TypeScript
- Validação de dados via `validators/contentValidator.js` (Joi)
- **Rotas de autenticação vivem no `server.js`** (não nesta pasta): register, login, `POST /api/auth/google` (Google Identity Services — verifica ID token, vincula por e-mail verificado, dormente sem `GOOGLE_CLIENT_ID`), refresh-token, logout, forgot/reset-password, `/auth/me`
