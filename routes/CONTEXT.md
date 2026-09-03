# routes/

## Responsabilidade

Endpoints da API REST do Express. Cada arquivo agrupa rotas relacionadas a um domínio específico da aplicação.

---

## Arquivos e Endpoints

### `content.js` — Conteúdo Principal
Rotas públicas e protegidas para consumo de conteúdo.

> **Fase 5, Bloco 1 (Task 2) — "Drafts invisíveis ao público".** Antes deste bloco, um capítulo `draft` dentro de uma série publicada aparecia na busca, na lista de capítulos e no detalhe. Como o portal do ilustrador tem como pilar "nada vai ao ar sem aprovação do Master", as rotas públicas passaram a filtrar por publicado. Regra única em `utils/ownership.js::podeVerRascunho` (admin **ou** dono do canal da série); qualquer outro viewer recebe **404, nunca 403** — 403 confirmaria a existência do rascunho alheio. Superfícies **já seguras antes** e conferidas por teste: `GET /series` (`content.js:108` filtra `isPublished: true`), `GET /agenda` (`content.js:78`), `GET /recommendations` (o service filtra), favoritos (`routes/favorites.js`) e "continuar lendo" (`services/progressService.js:215`).

- `GET /series` — Listagem de séries (filtros por tipo: `hqcine`, `vcine`, `hiqua`); só publicadas
- `GET /series/:id` — Detalhes de uma série. Ganhou `optionalAuth` (`content.js:127`): série `isPublished: false` é **404** para quem não é admin nem dono do canal
- `GET /series/:id/episodes` — Episódios de uma série (`content.js:283`). Série inexistente **ou** rascunho fora do alcance do viewer → `[]` com 200 (contrato antigo preservado, sem confirmar existência). Viewer comum recebe só `status: 'published'`; admin/dono recebem os rascunhos **com** o campo `status` — é disso que a aba Obras do portal depende
- `GET /episodes/:id` — Detalhes de um episódio (`content.js:313`). "Publicado" = `status === 'published'` **E** a série-mãe `isPublished === true`; fora disso, 404 para quem não é admin/dono. **Views e `EngagementEvent` só incrementam dentro do ramo publicado** — admin ou dono revisando o próprio rascunho não infla contador de royalties nem gera telemetria
- `GET /search` — busca; o filtro de episódios ganhou `status: 'published'` (`content.js:40`), além do filtro de série publicada que já existia
- `POST /series/:id/vote` — Sistema de votação (like/dislike) — requer autenticação. Fase 4, Bloco 4: dispara `recommendationService.dispararRecalculo(seriesId, 'voto_serie')` SEMPRE (upsert não distingue voto novo de trocado; recalcular de novo com o mesmo voto é idempotente), inclusive no `E11000` de corrida de dois primeiros-votos simultâneos
- `POST /series`, `PUT /series/:id`, `DELETE /series/:id` — CRUD de séries (admin only). Fase 5, Bloco 1 (Task 7): o corpo do `PUT` foi **extraído** para `services/seriesPublishService.js::applySeriesUpdate` — a rota virou um wrapper fino (`content.js:180-189`) e a Fila de Aprovação chama a MESMA função, para gênero obrigatório/tradução/redisparo não divergirem entre os dois caminhos. Fase 4, Bloco 4: POST/PUT aceitam `tags` (validação do schema — 0 ou 5–15, strings não vazias, `models/Series.js`); `ValidationError` do Mongoose (tags inválidas — mas também qualquer outro campo, ex. `releaseDay`) vira **400** em vez de cair no catch genérico (500) nas duas rotas
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
- `POST /upload-image` (`bunnyWebhook.js:213`) e `POST /upload-image-batch` (`bunnyWebhook.js:283`) — **as duas ÚNICAS rotas de upload abertas ao dono de canal** (Fase 5, Bloco 1, Task 5): `verifyToken` + "admin **OU** dono de canal ativo". Imagem única cai em `lorflux/series/<slug>/covers/`; o lote (até 138 arquivos, `Promise.allSettled`, relatório por arquivo) cai em `lorflux/series/<slug>/panels/`.
  - **O contrato do slug é diferente por perfil** (`resolveUploadSlug`, `bunnyWebhook.js:33`). **Admin**: contrato ANTIGO intacto — `seriesSlug` texto-livre do body, slugificado por `toSlug`. **Dono não-admin**: precisa mandar `seriesId` REAL; o servidor resolve série→canal→`ownerId` (`utils/ownership.js:42`) e **deriva o slug do título da série resolvida** — um `seriesSlug` enviado por não-admin é IGNORADO. Slug de texto livre não dá objeto validável: A escreveria na pasta de B
  - Dois 4xx distintos, de propósito: **403** para quem não é dono de canal nenhum (nada a esconder), **404** para série alheia/inexistente/id malformado (mesmo critério de não confirmar a existência de rascunho alheio)
  - O gate roda **ANTES do multer** — a rejeição de quem não é dono nem gasta banda de upload. Os `await` de Mongo do gate ficam dentro de `try/catch` (falha de infra vira 500 logado, não unhandled rejection)
- `POST /upload`, `POST /upload-video`, `POST /upload-audio` — seguem **admin-only explícito** (`bunnyWebhook.js:141`, `:429`, `:371`). Abrir vídeo/áudio ao dono reabriria o buraco do "vídeo grátis" que o gate de temporada da 5.1 vai cobrar — qualquer mudança nesse sentido está errada por definição enquanto o gate não existir
- `GET /signed-url` (`bunnyWebhook.js:562`) — `optionalAuth`; além do fail-closed de `BUNNY_TOKEN_KEY` que já existia, Fase 5 Bloco 1 (Task 2): só assina vídeo de episódio **publicado em série publicada**; fora disso exige admin/dono do canal (mesmo `podeVerRascunho` das rotas de conteúdo), senão 404. Sem isso, um `bunnyVideoId` vazado daria playback de rascunho

### `ads.js` — Anúncios
- `GET /ads` — Lista anúncios ativos
- `POST /ads` — Cria nova campanha (admin only)
- Controle de ativação e agendamento

### `channels.js` — Canais de Criadores
Montado em `/api/channels`. Fase 5, Bloco 1 (Task 1): o canal deixou de ser criável por qualquer usuário — vincular um canal a um ilustrador é decisão do Master.
- `GET /` — lista canais **ativos** (`verifyToken` + `requireAdmin`); `.select('name ownerId')`, sem `isActive` no shape (por isso um canal recém-desativado some da lista do admin no próximo refetch — o `CanaisPanel` mantém o estado "inativo" só localmente)
- `GET /me` — `verifyToken`; canais ativos do usuário logado. **Devolve o documento cru, `followers[]` incluído** (dívida registrada — ver "Dívidas conhecidas" ao final)
- `GET /:id` — **público** com `optionalAuth` (`channels.js:42`). Shape pinado da Fase 5: `followersCount` (número) + `isFollowing` (bool, `false` para anônimo), **sem** o array `followers[]` (`channels.js:49-53`). Canal `isActive: false` → 404
- `POST /` — **admin-only** (`channels.js:64`, era `verifyToken` puro). Mudança de comportamento deliberada: sem ela qualquer leitor viraria "ilustrador" pelo critério derivado. O canal nasce com `ownerId: req.user.id` (o próprio admin) — vincular ao ilustrador é o passo seguinte, pelo `ownerEmail` do PUT
- `PUT /:id` — `verifyToken`, com dois ramos (`channels.js:84`). **Admin**: edita qualquer canal (busca por `findById`, sem filtro de dono) e é o ÚNICO que processa `ownerEmail` — resolve e-mail→`User` (lowercase + trim; e-mail inexistente → 404 sem salvar nada), e, se for troca real, **arquiva a thread de mensagens ANTES de trocar `ownerId`** (`channels.js:108-109`). `ownerEmail` do mesmo dono vigente é no-op (não arquiva). **Não-admin**: escopado a si (`findOne` com `ownerId`) e `ownerEmail` no body → **403 sempre**, nunca ignorado em silêncio (`channels.js:89-91`). Resposta devolve o doc cru com `followers[]`
- `POST /:id/desativar` — **nova**, admin-only (`channels.js:129`): `isActive: false`. É a porta de saída que destrava a exclusão de conta do dono (LGPD). Não existe rota de reativar
- `POST /:id/follow` · `DELETE /:id/follow` — seguir/deixar de seguir (`verifyToken`, `$addToSet`/`$pull`); devolvem `{ success, followers: <contagem> }`. Inalteradas neste bloco; **não checam `isActive`** (é possível seguir um canal desativado, que o `GET /:id` já 404 esconde — cosmético, registrado)

### `portal.js` — Portal do Ilustrador (Fase 5, Bloco 1)
Montado em `/api/portal` (`server.js:262`). `router.use(verifyToken)` no topo (`portal.js:23`) + `requireCanalDoUsuario` em **toda** rota.
- `requireCanalDoUsuario` (`portal.js:35`) — exige ser `ownerId` de ≥1 canal com `isActive: true`; senão **403** (aqui não há segredo a esconder: a área simplesmente não existe para quem não é ilustrador). Anexa `req.portalChannels` / `req.portalChannelIds`, que as rotas usam sem reconsultar
- Posse do recurso ESPECÍFICO (série/capítulo) é checada por `serieDoDono` (`portal.js:214`) e `episodioDoDono` (`portal.js:227`), que devolvem `null` tanto para inexistente quanto para alheio → a rota responde **404** (nunca 403 — A não distingue "não existe" de "é de B")
- `GET /meu-estudio` (`portal.js:51`) — canais do usuário + contagens: obras, `pendentes` (séries e capítulos com `submittedAt` e ainda não publicados) e `mensagensNaoLidas`
- `GET /resumo?period=YYYY-MM` (`portal.js:101`) — painel de números, pelas MESMAS agregações do relatório admin (`services/royaltyReportService.js`), escopadas aos canais do usuário. **Mês corrente: pontos/views válidas/share %, SEM R$** (decisão de contrato — o pool só é verdade no fechamento); períodos FECHADOS trazem `amount` do `RoyaltyPeriod.breakdown` filtrado ao canal. Super Reader vem sempre por mês. Período inexistente → 404; `period` malformado → 400
- `GET /series` (`portal.js:179`) — lista as próprias séries (rascunho/em análise/publicada), `createdAt` desc, `select` de 9 campos leves (sem `translations`/`tags`). Não estava na tabela de rotas da spec: foi acrescentada na Task 9 porque sem listagem a aba Obras não sobrevive a um reload. Os capítulos continuam vindo de `GET /api/content/series/:id/episodes`, que já é dono-aware
- `POST /series` (`portal.js:241`) — cria série **draft**. Allowlist `PORTAL_SERIES_FIELDS` = `title, description, cover_image, content_rating_sugerida` (`portal.js:204`); `content_type: 'hiqua'` e `isPublished: false` **pinados depois do spread** (`portal.js:272-273`), então body malicioso é ignorado. `genre` e `tags` ficam de fora de propósito (o Master preenche na aprovação). `channelId` só é exigido quando o dono tem >1 canal ativo
- `PUT /series/:id` (`portal.js:292`) — só em rascunho **NÃO submetido**; publicada ou já submetida → **403** ("peça o ajuste ao editor pela thread"). Mantém o pilar "nada muda no ar sem aprovação"
- `POST /series/:id/episodios` (`portal.js:330`) — capítulo novo, `status: 'draft'` forçado; allowlist `PORTAL_EPISODE_FIELDS` = `title, description, episode_number, thumbnail` (`portal.js:207`) — `status`/`bunnyVideoId`/campos de vídeo nunca entram. Vale para série draft **e** publicada (capítulo novo em obra no ar é o fluxo normal)
- `POST /episodios/:id/paineis` (`portal.js:370`) — reusa `services/episodePanelService.addPanels`, a MESMA função da rota admin (logo `translationLayers` funciona de graça). 403 se o episódio não é `draft` **ou** se já está submetido
- `POST /series/:id/enviar` (`portal.js:397`) — exige capa + ≥1 capítulo draft com painéis; marca `submittedAt`
- `POST /episodios/:id/enviar` (`portal.js:446`) — exige ≥1 painel e que a série já esteja publicada OU já submetida (enviar a série não envia os capítulos em cascata). **Materializa o fallback do thumbnail aqui**: sem thumbnail, vira o `image_url` do 1º painel (`portal.js:467-469`)
- `GET /mensagens` · `POST /mensagens` (`portal.js:527` e `:577`) — thread VIGENTE do dono (`ownerUserId = req.user.id`, `arquivadaEm: null`); histórico de antecessor nunca aparece. GET marca como lidas as do editor na thread inteira; paginação `limit` (padrão 100, teto 200) + `before` (ISO). No POST, só `texto` (e `canalId` condicional) entram no documento — `refTipo/refId/autorTipo/autorUserId/ownerUserId` do body são sempre ignorados

### `adminPortal.js` — Portal do Ilustrador, lado do EDITOR (Fase 5, Bloco 1)
Montado em `/api/admin` **puro** (`server.js:256`), não em `/api/admin/mensagens` — a spec pina os caminhos como filhos diretos de `/admin`. Toda rota é `verifyToken` + `requireAdmin`.
- `GET /mensagens/:canalId` (`adminPortal.js:77`) — todas as threads do canal agrupadas por (`ownerUserId`, `arquivadaEm`), **vigente primeiro** e arquivadas da mais recente para a mais antiga; o admin vê tudo. Abrir marca como lidas as do ilustrador no canal inteiro
- `POST /mensagens/:canalId` (`adminPortal.js:123`) — mensagem do editor. `ownerUserId` vem SEMPRE de `channel.ownerId` resolvido no servidor, nunca do body. `refTipo`/`refId` opcionais, validados como PAR e **contra o canal** por `validarRef` (`adminPortal.js:35`) — apontar a mensagem para a obra de outro canal é 400
- `GET /aprovacoes` (`adminPortal.js:172`) — fila de pendentes. Shape **flat** com `tipo: 'series'|'episode'`, ordenada por `submittedAt` ASC, sem N+1 (4 queries constantes). Cada card traz o preview que o Master usa para decidir: capa/thumbnail, descrição, `content_rating_sugerida`, `genre`/`tags` atuais, canal, e — no episódio — `panelCount` e o `isPublished` da série-mãe
- `POST /aprovacoes/series/:id/aprovar` (`adminPortal.js:251`) — `genre`/`tags` são opcionais no body (o Master preenche na mesma ação). Delega a `applySeriesUpdate` com `isPublished: true` + `submittedAt: null`: gênero final ausente → **400** sem meio-publicar; tags inválidas → 400. Registra `APROVAR_SERIE_PORTAL` no `AdminLog`
- `POST /aprovacoes/episodes/:id/aprovar` (`adminPortal.js:299`) — exige série já publicada (senão 400, "aprove a série primeiro"). Publica e dispara **inline** o mesmo par push + recálculo dos outros pontos de publicação de episódio (`adminPortal.js:319-322`) — é o 7º ponto, com as mesmas assinaturas dos 6 da Fase 4. Registra `APROVAR_EPISODIO_PORTAL`
- `POST /aprovacoes/:tipo/:id/devolver` (`adminPortal.js:347`) — genérica. Aceita `series`, `episode` e também o plural `episodes` (normalizado para o singular ANTES de qualquer gravação, `adminPortal.js:354` — simetria com a URL da rota de aprovar). Limpa `submittedAt` (a obra volta a ser editável/reenviável), cria a `MensagemPortal` do editor com `refTipo/refId` apontando o recurso, e registra `DEVOLVER_SERIE_PORTAL`/`DEVOLVER_EPISODIO_PORTAL`. **NÃO** toca `isPublished`/`status` e **não** cascateia para os capítulos da série

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
- `GET /me/export` — export de dados (LGPD; inclui `readingProgress` com `percent` e `position`). Fase 4 Bloco 3: inclui `superReaderContributions` (`seriesTitle`, `amountCents`, `currency`, `createdAt` — sem `stripeSessionId` nem os campos de share, que são detalhe contábil do repasse ao autor, não dado sobre o titular). Fase 5 Bloco 1: inclui `portalMessages` (`account.js:96` e `:157`) — mensagens do portal em que o titular é autor **OU** dono da thread, **inclusive de threads já arquivadas** (ele era o dono vigente quando escreveu/recebeu; a troca de dono não revoga o direito de acesso aos próprios dados). Sem `autorUserId`/`ownerUserId` crus: `autorTipo` já diz quem escreveu, sem expor o id de terceiros. `channels` ganhou `isActive` (`account.js:122`) — canal desativado ainda é vínculo do titular
- `DELETE /me` — exclusão de conta com limpeza de engajamento (inclui `ReadingProgress`). Fase 4 Bloco 3: `SuperReaderContribution` NÃO é apagada — é **anonimizada** (`updateMany({userId}, {$set: {userId: null}})`), pois o valor repassado ao autor é registro contábil do relatório de royalties (soma por canal/período, não por usuário). Fase 5 Bloco 1 (Task 8), três mudanças:
  1. **409 se o titular é dono de canal ATIVO** (`account.js:218-222`), checado **antes de qualquer efeito colateral** — inclusive antes do cancel da assinatura no Stripe, para que o request bloqueado seja atômico. A porta de saída existe e é do editor: `POST /api/channels/:id/desativar` **ou** transferir a titularidade (`PUT /api/channels/:id` com `ownerEmail`) — qualquer um dos dois desbloqueia. Bloqueio sem porta de saída seria negativa permanente do Art. 18 VI
  2. **`Channel.deleteMany({ownerId})` foi REMOVIDO.** Canais **inativos** do titular são **transferidos ao admin mais antigo** (`role` admin/superadmin, menor `createdAt` — `account.js:233-256`), nunca apagados: obra publicada jamais some com a conta do ex-dono. O lookup do admin roda **antes** do bloco do Stripe, para o abort de 500 (nenhum admin no sistema) não acontecer com a assinatura já cancelada
  3. `MensagemPortal.deleteMany({ autorUserId })` (`account.js:285`) — só as mensagens **autoradas** pelo titular (comunicação privada dele). As do editor na mesma thread ficam
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
- **Ownership: 403 vs 404.** Padrão adotado na Fase 5, Bloco 1 e válido para tudo que vier depois: **403** = "essa área não existe para você" (não é ilustrador, não é admin) — não há segredo a esconder; **404** = "esse recurso específico não é seu" (série/capítulo/canal de outro dono, ou inexistente) — 403 aqui confirmaria a existência do rascunho alheio. Ver `routes/portal.js:35` (403) contra `portal.js:214`/`:227` (404)

---

## Dívidas conhecidas (Fase 5, Bloco 1 — triadas na revisão final, não bloqueantes)

- **`followers[]` cru fora do `GET /:id`**: `GET /api/channels/me`, a resposta do `PUT /api/channels/:id` e a de `POST /:id/desativar` devolvem o documento cru, com o array de userIds dos seguidores. Só o dono do canal e o admin alcançam essas três respostas, e o shape público já foi corrigido — mas o mesmo argumento de dado pessoal vale aqui. Fix pequeno (projeção/`select` nas três) para um bloco futuro
- **CastError → 500 em id malformado**: `GET /api/channels/:id`, `POST /:id/desativar`, `PUT /:id`, `POST|DELETE /:id/follow`, `GET /api/content/series/:id`, `PUT /api/portal/series/:id` e `POST /api/portal/episodios/:id/paineis` respondem **500** (não 404) quando o `:id` não é um ObjectId válido — o `CastError` cai no catch genérico. Sem vazamento e sem crash, mas o status está errado. `routes/adminPortal.js` já trata (`if (err.name === 'CastError') → 404`) e é o padrão a seguir
- **`podeVerRascunho` não checa `isActive`**: o dono de um canal DESATIVADO continua enxergando os próprios rascunhos pelas rotas de conteúdo (`GET /content/series/:id` etc.), embora o portal inteiro já lhe responda 403. É consistente com "não apagar obra de ninguém", mas é uma decisão implícita
- **Sem rota de reativar canal** e `GET /api/channels` não devolve inativos: um canal desativado desaparece da UI do admin no próximo remount, levando junto a porta de entrada para as threads arquivadas. Fix natural: `?includeInactive` + `isActive` no `select` + rota de reativar
- **Item submetido de canal desativado continua aprovável**: a fila (`adminPortal.js:172`) não filtra por `isActive`, então o Master pode publicar a obra de um ilustrador já revogado. É defensável (a decisão é do Master), mas é comportamento não especificado
- **`cover_image` e `panels[].image_url` aceitam qualquer string**: os formulários do portal são upload-only (nenhum campo de URL), mas um request forjado pelo próprio dono grava URL externa. Não é XSS (as duas viram `src` de `<img>`); o risco real é hotlink/pixel de rastreamento em conteúdo publicado. Validar host contra o CDN do Bunny é candidato natural do Bloco 2/5.1
