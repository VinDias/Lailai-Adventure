# models/

## Responsabilidade

Schemas Mongoose que definem a estrutura dos dados no MongoDB. Cada arquivo corresponde a uma coleção do banco de dados.

---

## Schemas

### `User.js`
Usuários da plataforma.
- Campos: `email`, `passwordHash`, `name`, `avatar`
- OAuth: suporte a login via Google e Microsoft
- Roles: `user` | `admin` | `superadmin`
- Premium: `isPremium` (boolean), `premiumExpiresAt` (Date)
- Stripe: `stripeCustomerId`, `stripeSubscriptionId`
- Lista de canais seguidos
- `parental` (Fase 5, Bloco 2) — subdocumento irmão de `consent` (`models/User.js:46-52`), a "Classificação etária e Preferências de conteúdo" do leitor (nomenclatura da UI — **NUNCA** "controle parental" no rótulo). Campos: `classificacaoEtaria` (enum `kids|teen|young`, **default `young`** — quem nunca gravou preferência vê tudo), `tagsBloqueadas` (`[String]`, slugs de `utils/tagsVocabulario.json`), `pinHash`, `pinTentativas` (default 0), `pinBloqueadoAte` (default `null`)
  - `pinHash` tem **`select: false`** (`models/User.js:49`) — fica fora de TODA query por padrão, inclusive `.lean()`; só `routes/parental.js` e `routes/account.js` `DELETE /me` fazem `.select('+parental.pinHash')` para comparar
  - `tagsBloqueadas` **não** é validada contra o vocabulário no schema, de propósito: quem valida é a rota `PUT /api/parental` contra o vocabulário vigente na hora da escrita — um slug removido/renomeado no futuro não pode quebrar a leitura de documentos já salvos
  - **`routes/adminManagement.js:40`** remove o subdoc `parental` inteiro da listagem de usuários **por pós-processamento**, não por projeção: `-parental` na string de projeção COLIDE com o `select:false` de `parental.pinHash` e o Mongo recusa a query com *"Path collision at parental.pinHash"*. Preferências são privadas — nem superadmin vê (letra do PDF de 26/08)
  - `pinTentativas`/`pinBloqueadoAte` são o rate limit do PIN **persistido no próprio usuário** (`services/parentalPinService.js`) — não em memória: sobrevive a restart do processo, e a chave é o `userId` (a rota já exige a própria sessão)

### `ParentalPinResetToken.js` (Fase 5, Bloco 2)
Recuperação do PIN de proteção — mesmo shape de `PasswordResetToken`: `userId`, `token` (opaco, `unique`), `createdAt` com **TTL de 1h** (`expires: '1h'`, `models/ParentalPinResetToken.js:12`). A confirmação (`POST /api/parental/pin/recuperar/confirmar`) **REMOVE** o PIN (o usuário define um novo depois) em vez de trocá-lo, então o token não carrega valor de PIN nenhum. `routes/parental.js:226` ainda checa a expiração **explicitamente** (o TTL do Mongo roda em varredura periódica, não é instantâneo) e `deleteMany` por usuário depois de confirmar, o que também barra o reuso.

### `Series.js`
Séries de conteúdo (container de episódios).
- Campos: `title`, `genre`, `description`, `cover_image`
- `genre` (Fase 5, Bloco 1) — **required CONDICIONAL a `isPublished`** (`models/Series.js:52`: `required: function () { return this.isPublished === true; }`), não mais `required: true` fixo. A série criada pelo portal do ilustrador nasce sem gênero (o Master preenche na aprovação); publicar sem gênero continua barrado. **ATENÇÃO**: `required: function()` NÃO enxerga o documento persistido no caminho de `findByIdAndUpdate` — quem publica por update precisa validar o ESTADO FINAL na aplicação (é o que `services/seriesPublishService.js:63` faz)
- Tipo: `hqcine` | `vcine` | `hiqua`
- `isPremium` (boolean) — se a série é exclusiva para assinantes
- `order_index` — ordenação manual na listagem
- `isPublished` — controla visibilidade pública (default `false`; catálogo exige `true` estrito)
- `translations` — `{ en|es|zh: { genre, description } }`, preenchido automaticamente pelo `translationService` no save (título NÃO é traduzido — decisão do cliente)
- `channelId` (Fase 3) — ref ao `Channel` do ilustrador; agrupa a obra no relatório de royalties
- `releaseDay` (Fase 4, Bloco 2) — dia da semana quando novos episódios são esperados (0–6: Dom–Sáb, ou null); usado pela agenda `GET /api/content/agenda` (não há notificação programada — o push de capítulo novo dispara na publicação, não no releaseDay)
- `content_rating_sugerida` (Fase 5, Bloco 1) — `String` enum `kids|teen|young`, `default: null` (`models/Series.js:61`). Classificação **sugerida pelo ilustrador** no formulário do portal; aparece no card da Fila de Aprovação para o Master decidir. Vira classificação oficial (`content_rating`) só no Bloco 2
- `submittedAt` (Fase 5, Bloco 1) — `Date`, `default: null` (`models/Series.js:75`). Marcador de "Enviar para aprovação": não-null = aguardando o Master. A Fila (`routes/adminPortal.js:181`) lista só `submittedAt != null` **e** `isPublished: false` — o draft que o próprio admin cria pelo fluxo antigo nunca tem este campo e por isso fica fora da fila por construção. Aprovar zera (`routes/adminPortal.js:290`); devolver também zera, devolvendo a obra ao estado editável (`routes/adminPortal.js:419`)
- `tags` (Fase 4, Bloco 4; **regra reescrita na Fase 5, Bloco 2**) — `[String]`, `default: []` (`models/Series.js:82-91`). Duas funções independentes (letra do PDF de 31/08): alimenta a Afinidade do algoritmo de recomendação (`services/recommendationService.js`) **e** é o alvo do filtro pessoal do leitor (`User.parental.tagsBloqueadas`). Continua **nunca exibida ao leitor na obra** (`genre` é o rótulo visível; o leitor só vê os rótulos do vocabulário nas Preferências de conteúdo). Validação (`validateTags`, `models/Series.js:40-45`): **0 a 8** tags, **todas slugs do vocabulário fechado** (`utils/tagsVocabulario.js::isSlugValido`) — o **mínimo de 5 do Bloco 4 foi REVOGADO** pelo PDF ("até 8", sem mínimo). Efeito colateral aceito e registrado na spec: `temaForte` do algoritmo dispara mais fácil com conjuntos pequenos (1 tag × 1 tag igual = 100% > 50% = conflito). Normalização (`normalizeTags`, trim + minúsculas + dedupe) vive no **setter** do schema, não em `pre('validate')` — `findByIdAndUpdate(..., { runValidators: true })` roda setters no cast do update mas NÃO dispara hooks de documento, então só o setter cobre create E update. Acervo com tags livres antigas precisa de `scripts/migrarTagsVocabulario.js` (ver `DOCS.md`)
- `content_rating` (Fase 5, Bloco 2) — `String` enum `kids|teen|young`, `default: null` (`models/Series.js:71`). Classificação etária **OFICIAL**, definida só pelo Master (form do admin e Fila de Aprovação); o portal do ilustrador **não** escreve neste campo (só em `content_rating_sugerida`). A exigência "aprovar exige classificação" mora **na rota** do aprovar (`routes/adminPortal.js:284-286`, mensagem PINADA `'Classificação etária é obrigatória para aprovar'`), **nunca** em `applySeriesUpdate` — o `PUT` admin do acervo continua publicando sem rating. Semântica do filtro é **POSITIVA**: `null` OU campo ausente (acervo pré-Bloco-2) contam como "não classificada" e aparecem só para `young`. Documento sem o campo é corrigido pelo backfill idempotente do boot (`services/parentalBackfill.js`) — o Mongoose só aplica `default` em `create()`/`save()`, nunca retroativamente

### `Episode.js`
Episódios de uma série.
- Referência para `Series`
- `episode_number`, `title`, `description`, `duration`
- Vídeo: `video_url`, `bunnyVideoId`, `thumbnail`
- Webtoon: array de objetos `panels` (`image_url`, `order`, `translationLayers[]`)
- Áudio: `audioTrack1Url`..`audioTrack4Url` + labels — consumidos pelo `VerticalPlayer`
- `isPremium`, `status` (`draft` | `processing` | `published`)
- `views`, `order_index`, `webtoonLanguageLabels`
- `translations` — `{ en|es|zh: { description } }`, automático via `translationService`
- `notificationSentAt` (Fase 4, Bloco 2) — timestamp de quando o push foi disparado; `null` até o primeiro disparo; previne re-envios em reprocessamento
- `submittedAt` (Fase 5, Bloco 1) — `Date`, `default: null` (`models/Episode.js:46`); mesmo mecanismo de `Series.submittedAt`, em nível de capítulo. Um capítulo submetido continua com `status: 'draft'` — por isso `routes/portal.js:381` recusa (403) painéis novos em episódio com `submittedAt` preenchido: sem isso o ilustrador anexaria o painel N+1 enquanto o Master revisa os N primeiros, e ele iria ao ar sem revisão

### `Ad.js`
Campanhas publicitárias próprias (interstitial + banner de feed).
- `title`, `image_url` (obrigatória; capa/fallback), `video_url` (opcional — interstitial toca vídeo), `link_url`, `advertiser`
- `isActive` + janela de veiculação `startsAt`/`endsAt` (endsAt inclusivo até o fim do dia)
- Métricas: `impressions`, `clicks` (registradas pelo AdComponent/Ads via `/api/admin/ads/:id/impression|click`)

### `Favorite.js`
Lista "Meus Favoritos" por conta — índice único composto (`userId`, `seriesId`).

### `SeriesVote.js`
Curtida única por obra — índice único composto (`userId`, `seriesId`), `type: like|dislike` (UI só usa like).

### `EngagementEvent.js` (Fase 3)
Log **append-only com cadeia de hash** (sha256 encadeado por `seq`/`prevHash`) — telemetria auditável de `view`/`read`/`ad_impression`/`ad_click`, base do Motor de Royalties.
- `seq` único via counter atômico (`Counter.js`); append serializado em processo (app roda em fork único no PM2)
- `ipHash`/`uaHash` pseudonimizados com salt (LGPD) — nunca IP puro
- Anti-fraude no log: `flagged`/`flagReason` (`dedupe` 6h, `burst` 60s) — evento flagged fica NO log e FORA do cálculo
- NUNCA editar/deletar documentos desta coleção — a verificação de integridade re-percorre a cadeia
- **Índice novo da Fase 5, Bloco 3 (curadoria)** — `{ seriesId, userId, type, flagged }` com `partialFilterExpression: { seriesId: { $exists: true } }` (`models/EngagementEvent.js:46-49`), somando-se aos 3 que já existiam (`:32-34`). Serve às duas leituras da curadoria: o volume V da obra (`curadoriaService.contarConsumidoresUnicos`) e o "consumo real" do sinalizador (`routes/sinalizacao.js:85`) — sem ele, cada sinalização varreria a coleção mais volumosa do app. **É SÓ ÍNDICE: nenhum documento é tocado**, então o append-only e a cadeia de hash continuam intactos. O filtro é PARCIAL porque os eventos de anúncio (`ad_impression`/`ad_click`) nascem sem `seriesId` e entrariam na chave só para ocupar espaço; toda query consumidora filtra por um `seriesId` concreto, o que implica `$exists:true` e mantém o índice elegível — pinado por `explain` em `tests/backend/curadoriaService.test.js:607-633`. O plano continua com um FETCH depois do IXSCAN (igualdade a `null` nunca é coberta por índice), o ganho é sair do COLLSCAN

### `RoyaltyPeriod.js` (Fase 3)
Fechamento mensal de royalties: `period` (YYYY-MM, único), `poolSuggested` (CPM + assinaturas), `poolFinal` (confirmado pelo admin), `breakdown[{channelId, channelName, points, share, amount}]`, `status: draft|closed`.

### `Counter.js` (Fase 3)
Sequências atômicas (`findOneAndUpdate` + `$inc`) — usado pelo `seq` do EngagementEvent.

### `Vote.js`
Engajamento dos usuários com conteúdo.
- Referências para `User` e episódio/vídeo
- `voteType`: `like` | `dislike`
- Timestamp da ação

### `Channel.js`
Canal do ilustrador — a unidade de agrupamento das obras no relatório de royalties (Fase 3) e o vínculo que define quem é ilustrador (Fase 5, Bloco 1).
- `ownerId` — ref `User`, **`required`**; é o dono do canal. Não existe role "ilustrador": ser ilustrador é **derivado** de ser `ownerId` de ≥1 canal com `isActive: true` (`utils/ownership.js:31`, `routes/portal.js:35`)
- `name` (`required`), `description`, `avatar`, `banner` — os nomes dos campos são `avatar`/`banner`, **não** `avatarUrl`/`bannerUrl`
- `followers` — `[ObjectId ref User]`; contagem é `followers.length`, não existe campo `followerCount`. `GET /api/channels/:id` (público) devolve `followersCount` + `isFollowing` e **remove** o array (`routes/channels.js:49-53`) — os userIds dos seguidores são dado pessoal
- `isActive` — `Boolean`, `default: true`. `false` desliga o canal do portal inteiro (todas as rotas de `routes/portal.js` e o gate de upload de imagem passam a responder 403) e desbloqueia a exclusão de conta do dono (LGPD, `routes/account.js:218`). Só admin desativa (`POST /api/channels/:id/desativar`, `routes/channels.js:129`); **não existe rota de reativar** — reativar hoje é edição direta no banco (dívida registrada)
- `timestamps: true`
- Não existe campo `isMonetized`

### `MensagemPortal.js` (Fase 5, Bloco 1)
Mensagem privada editor↔ilustrador do Portal do Ilustrador. Sem anexos, sem e-mail — só texto dentro do app.
- `canalId` — ref `Channel`, `required`, `index: true`
- `ownerUserId` — ref `User`, `required`; **é o dono VIGENTE quando a mensagem foi criada** e é o que define a "thread". A chave de thread é o par (`canalId`, `ownerUserId`) + `arquivadaEm: null`
- `autorTipo` — enum `editor|ilustrador`, `required`; `autorUserId` — ref `User`, `required`. Nenhum dos dois vem do body: o lado do ilustrador fixa `'ilustrador'` + `req.user.id` (`routes/portal.js:587-592`) e o lado do editor fixa `'editor'` + `canal.ownerId` resolvido no servidor (`routes/adminPortal.js:138-146`)
- `refTipo` (enum `series|episode`, `default: null`) + `refId` (`ObjectId`, `default: null`) — apontam a mensagem para uma obra/capítulo. Preenchidos automaticamente na devolução da Fila de Aprovação (`routes/adminPortal.js:389-397`) e validados como PAR contra o canal em `validarRef` (`routes/adminPortal.js:35`). A curadoria do Bloco 3 reusa este par
- `texto` — `String`, `required`, `maxlength: 2000` (2001 caracteres → `ValidationError` → 400)
- `lidaEm` — `Date`, `default: null`. Marca simétrica: abrir a thread no portal marca como lidas as do EDITOR (`routes/portal.js:553-556`), abrir no admin marca as do ILUSTRADOR (`routes/adminPortal.js:82-85`). O contador de não lidas de `GET /portal/meu-estudio` conta só `autorTipo: 'editor'`, `lidaEm: null`, `arquivadaEm: null` na thread vigente (`routes/portal.js:67-73`)
- `arquivadaEm` — `Date`, `default: null`. A **troca de dono arquiva a thread inteira ANTES de trocar o `ownerId`** (`routes/channels.js:108-109`), então o sucessor abre uma thread nova e nunca lê o histórico privado do antecessor (LGPD). O admin vê tudo, vigente e arquivadas (`routes/adminPortal.js:87`)
- `statics.arquivarThreadDoCanal(canalId, agora = new Date())` (`models/MensagemPortal.js:27`) — `agora` injetável para teste determinístico
- `timestamps: true`. Sem índice composto próprio além do `canalId` — as consultas são sempre escopadas por canal
- **LGPD**: na exclusão de conta, só as mensagens **autoradas** pelo titular são apagadas (`routes/account.js:285`); as do editor na mesma thread ficam (autoria de outro). O export inclui autoradas E recebidas, inclusive arquivadas, sem os ObjectIds de terceiros (`routes/account.js:96` e `:157`)

### `RefreshToken.js`
Gerenciamento de refresh tokens JWT.
- Referência para `User`
- `token` (string única)
- `expiresAt` — data de expiração para invalidação

### `AdminLog.js`
Auditoria de ações administrativas.
- Registra qual admin fez qual ação e quando
- Usado por `adminManagement.js`

### `ReadingProgress.js` (Fase 4)
Progresso de leitura/reprodução — um documento por (identidade, episódio).
- Identidade é `userId` OU `anonymousId`, nunca os dois (hook `pre('validate')` recusa os dois ou nenhum)
- `seriesId`, `episodeId`, `contentType` (`hqcine`|`vcine`|`hiqua`), `position` (segundos, vídeo), `percent` (0..1)
- `completed` — calculado automaticamente no hook a partir de `percent >= 0.9`
- Índices únicos parciais `{userId, episodeId}` e `{anonymousId, episodeId}` (nunca sparse — o índice é composto)
- Índice TTL (`expireAfterSeconds: 180 dias`, `partialFilterExpression: anonymousId exists`) — só visitante expira; conta não expira (LGPD: quem apaga é o usuário, pelo Centro de Privacidade)
- Ver `services/progressService.js` para as regras de gravação e do carrossel "Continuar"

### `PushSubscription.js` (Fase 4, Bloco 2)
Inscrição de push de UM aparelho de UM usuário (vários aparelhos = vários documentos).
- `userId` — ref para `User`
- `endpoint` — único GLOBAL (não composto com `userId`); reinscrição do mesmo endpoint (`findOneAndUpdate` upsert) troca o dono para quem está logado nele agora (takeover intencional, ver `routes/push.js`)
- `keys.p256dh`, `keys.auth` (credenciais Web Push API)
- Sem TTL — não expira por tempo; endpoint morto (404/410 no envio) é removido na hora pelo `notificationService`
- Índice extra em `userId` (para consultas por usuário)

### `SuperReaderContribution.js` (Fase 4, Bloco 3)
Registro de apoio direto ao autor de uma obra — criado **só no webhook** do Stripe (`checkout.session.completed` com `metadata.tipo === 'super_reader'`), nunca na criação da sessão. Separado do pool mensal de royalties (`RoyaltyPeriod`), não entra nele.
- `userId` — ref `User`, `default: null`; **`null` = contribuição anonimizada** (exclusão de conta, LGPD — o registro contábil permanece para o relatório, mas sem vínculo pessoal deixa de ser dado pessoal)
- `seriesId` — ref `Series`, `required`
- `channelId` — ref `Channel`, `required`; canal do autor **congelado no momento do apoio** (o relatório soma por este campo, não pelo `channelId` atual da série)
- `amountCents` — `Number`, `required`, `min: 1`
- `currency` — `String`, enum `brl|usd|eur`
- `authorShareCents` — `Number`, `required`; 80% congelado no registro (`Math.round(amountCents * 0.8)`)
- `platformShareCents` — `Number`, `required`; o resto (`amountCents - authorShareCents`)
- `stripeSessionId` — `String`, `required`, **unique** (idempotência: o Stripe reenvia webhooks, o upsert por este campo não duplica)
- `period` — `String` `'YYYY-MM'`, `required`; mês do **pagamento** (webhook), não da criação da sessão
- `timestamps: true`
- Índices (3): `stripeSessionId` unique (implícito do `unique: true` no campo); `{ channelId: 1, period: 1 }` (soma do relatório admin por canal/período); `{ userId: 1 }` (lista das próprias contribuições em `GET /api/superreader/me`)

### `SeriesScore.js` (Fase 4, Bloco 4)
Score pré-computado por obra — algoritmo de recomendação (`services/recommendationService.js`). **1 documento por série** (`seriesId` unique). Guarda só os componentes calculáveis SEM o contexto do leitor — Qualidade + Retenção + Descoberta = "parte por obra" (65 pts); Afinidade (25 pts, por leitor) e Diversidade (10 pts, pela lista) NÃO entram aqui, são calculadas no request.
- `seriesId` — ref `Series`, `required`, **unique**
- `contentType` — denormalizado de `Series.content_type`, só para a varredura por tipo não precisar de `$lookup`
- `scoreFinal` — `Number 0–100`: reescala `(qualidade+retencao+descoberta)/65×100`, **JÁ APÓS** as penalizações. A ORDENAÇÃO da recomendação usa os **componentes crus** (65 pts + afinidade 25), não este reescalado — ele é só exibição/painel/a escala 0–100 do PDF
- `qualidade` (0–30), `retencao` (0–25), `descoberta` (0–10) — componentes crus, pré-penalização
- `potentialScore` — `Number 0–100`, escala própria (não soma com os 65 pts)
- `confidence` — `Number 0–1` (`n/(n+20)`); NÃO altera `scoreFinal` nem `potentialScore`, usado só na ordenação da recomendação
- `leitoresUnicos` — `Number`, identidades distintas (`userId` OU `anonymousId`) em `ReadingProgress` da série
- `penalizacoes` — `[String]`, ex. `['retencao_baixa']`; vazio = nenhuma aplicada
- `computedAt` — `Date` da última varredura/recálculo desta série
- `timestamps: true`
- Índices (2): `seriesId` unique (implícito); `{ contentType: 1, scoreFinal: -1 }` — varredura por tipo ordenada pelo melhor score (feeds e timer de 24h consultam por aqui)

### `Sinalizacao.js` (Fase 5, Bloco 3 — Curadoria)
Sinalização de um LEITOR sobre uma OBRA (nunca sobre um episódio — a unidade do Vin é a obra). Campos (`models/Sinalizacao.js:14-25`): `seriesId`, `userId`, `motivo` (enum dos 6 de `utils/curadoriaLimiares.js`), `grave`, `descricao` (`maxlength: DESCRICAO_MAX`), `valida`, `invalidaMotivo` (`sem_consumo|abuso|null`), `contaCriadaEm`, `ipHash`, `revisadaEm`, `createdAt` (`timestamps` só de criação, `:25`).
- **`unique { userId, seriesId }`** (`:27`) — a regra 5 do Vin ("uma conta = uma sinalização por obra") garantida pelo BANCO, e **para sempre**: nem depois de o caso ser revisado a mesma conta sinaliza de novo (consequência conhecida, item 11 da lista a comunicar ao Vin). A rota trata o `E11000` como 200 `jaSinalizada`
- **Os outros dois índices servem a coisas diferentes**: `{ seriesId, revisadaEm, valida }` (`:30`) é o das CONTAGENS de uma obra (S/S_grave/semConsumo) e do `updateMany` de `revisadaEm` ao fechar o caso; `{ revisadaEm, valida, seriesId, grave }` (`:42`) é o da varredura de CANDIDATAS do `reavaliarPendentes`, cujo `$match {revisadaEm:null, valida:true}` **não tem `seriesId`** e por isso não conseguia usar o índice anterior (prefixado por `seriesId`) — o `explain` provava COLLSCAN numa query que roda a cada abertura da fila, no boot e uma vez por dia (pino em `tests/backend/curadoriaService.test.js:639-653`)
- **`grave` é DERIVADO do motivo** em `pre('validate')` (`:48-51`), nunca aceito do caller: senão o leitor (ou um bug na rota) marcaria uma categoria não-grave como grave e furaria a prioridade máxima da fila
- `valida` é decidido na ESCRITA (consumo real para motivo normal, graves sempre válidas) e a idade mínima da conta é aplicada só na AVALIAÇÃO — por isso o `contaCriadaEm` é snapshot, evitando um join com `User` a cada contagem
- **LGPD**: é dado do LEITOR — entra no export do titular e é apagada com a conta (`routes/account.js:122` e `:361`); `ipHash` e `contaCriadaEm` nunca saem no export, só viram agregado (`ipsDistintos`/`contasRecentes`) na fila do admin

### `CasoCuradoria.js` (Fase 5, Bloco 3 — Curadoria)
O CASO da Fila de Revisão — a unidade com que o curador trabalha. Guarda **só agregados**: nunca `userId` de leitor, nunca descrição (regra 8; as descrições ficam em `Sinalizacao` e só o admin as lê, anonimizadas). Campos em `models/CasoCuradoria.js:20-54`: `seriesId`, `emAberto`, `status` (`aberto|aguardando_artista|fechado`), `prioridade`, `abertoEm`, `gatilho {tipo, S, V, limiar}`, `resumoMotivos`, `mensagemAvisoId`, `avisoArtista` (`pendente|enviado|sem_canal|falhou`, nasce `'pendente'` e o 2º write grava o resultado), `decisao`, `motivoDecisao` (o texto do curador que VAI ao artista; `observacao` é interna), `sinalizacoesAbusivas`, `decididoPor`, `decisaoEm`, `observacao`, `reivindicadoEm`.
- **"1 caso aberto por obra" é garantido pelo BANCO**: `index({ seriesId: 1 }, { unique: true, partialFilterExpression: { emAberto: true } })` (`:56-59`). É igualdade booleana, e não `$in`/`$ne`, porque essas formas no `partialFilterExpression` exigem MongoDB ≥ 6 e a versão da VPS não está confirmada (molde: `models/ReadingProgress.js`). Mais dois índices: `{ emAberto, prioridade, abertoEm }` para a fila (`:60`) e `{ seriesId, decisao, decisaoEm }` para o `removidaPelaCuradoria` da Fila de Aprovação (`:63`)
- **`emAberto` é DERIVADO do `status`** em `pre('validate')` (`:71-74`) — `true` em `aberto`/`aguardando_artista`, `false` em `fechado`. O índice único parcial confia neste campo; um valor divergente do status abriria brecha na garantia do banco
- **`reivindicadoEm` é o MUTEX das 4 ações do curador, e é um campo PRÓPRIO justamente para NÃO ser o `emAberto`** (`:45-53`): a primeira versão reivindicava zerando `emAberto`, o que liberava o índice único parcial durante a janela da ação e deixava `avaliarObra` abrir um caso IRMÃO para a mesma obra (achado da rodada 2 do fix round) — e ainda fazia a devolução do lock poder falhar com `E11000`. Com `emAberto` intacto, o índice continua protegendo durante a ação e o `findOneAndUpdate` de `fecharCaso` continua sendo o árbitro final. A reivindicação **expira sozinha** (5 min em `services/curadoriaService.js:27`): processo derrubado no meio de uma ação não prende o caso, sem job de saneamento
- 2º `pre('validate')` (`:81-89`) recusa `resumoMotivos` com chave fora do vocabulário, usando `invalidate()` — `new mongoose.Error.ValidationError(new Error(msg))` produzia "Validation failed" com `errors` vazio e perdia a mensagem que dizia QUAL motivo era desconhecido

---

## Observações

- Todos os models usam **Mongoose** com **CommonJS** (`module.exports`)
- O banco de dados é configurado via `MONGO_URI` no `.env`
- Nenhuma migração formal — o Mongoose aplica o schema automaticamente
