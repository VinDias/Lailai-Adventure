# utils/

## Responsabilidade

Funções utilitárias transversais — arquivos `.js` (CommonJS) são do backend; arquivos `.ts` são helpers do frontend.

---

## Arquivos

### `logger.js`
Logger estruturado com **Winston**.
- Cria logs rotativos diariamente (`winston-daily-rotate-file`)
- Dois destinos: `error.log` (apenas erros) e `combined.log` (todos os níveis)
- Retenção de 30 dias
- Em desenvolvimento (`NODE_ENV !== production`), também exibe logs no console
- Usado em todo o backend para substituir `console.log`

### `generateMediaToken.js`
Geração de tokens JWT para acesso seguro a mídia no CDN.
- Gera um token assinado com `MEDIA_TOKEN_SECRET`
- Token com expiração por tempo (evita acesso permanente a URLs de mídia)
- Usado pelo backend antes de retornar URLs de vídeo/imagem protegidas

### `storageManager.js`
Gerenciamento da estrutura de diretórios locais.
- Cria as pastas de conteúdo necessárias no sistema de arquivos
- Usado durante o setup inicial e no processamento de uploads temporários

### `ownership.js` (Fase 5, Bloco 1)
Ponto único de "quem enxerga o que não está publicado" e "quem pode subir imagem para qual série" — centralizado aqui para `routes/content.js`, `routes/bunnyWebhook.js` e `routes/portal.js` não divergirem.
- `isAdminUser(user)` — `role` `admin` ou `superadmin`; tolera `user` ausente (`optionalAuth` pode não popular `req.user`)
- `podeVerRascunho(user, channelId)` — admin sempre; senão, só o dono do canal ao qual a série pertence (`Channel.ownerId === user.id`). Anônimo ou logado não-dono → `false`. **Quem chama trata o "não" como 404, nunca 403** — 403 confirmaria a existência do rascunho. Usado por `GET /content/series/:id`, `GET /content/series/:id/episodes`, `GET /content/episodes/:id` e `GET /bunny/signed-url`. Não checa `isActive` do canal: o dono de um canal desativado ainda vê os próprios rascunhos (decisão implícita, registrada em `routes/CONTEXT.md`)
- `temCanalAtivo(userId)` — o usuário é `ownerId` de algum canal com `isActive: true`? É o gate barato do upload de imagem, rodado **antes do multer**; `false` → 403
- `serieDeCanalAtivoDoUsuario(userId, seriesId)` — a série ALVO pertence a um canal ativo DESTE usuário? Devolve a série (com `title`, para derivar o slug do storage) ou `null`. Série inexistente, sem canal, de outro dono **ou com `_id` malformado** (o `CastError` é capturado e vira `null`, `ownership.js:48`) produzem o MESMO `null` → 404, sem confirmar nada

### `requestIdentity.js` (Fase 4)
`getIdentity(req)` — descobre de quem é a requisição de progresso: conta logada (`req.user.id`) sempre vence; senão cai para o visitante via cabeçalho `X-Anonymous-Id` (validado como UUID v4). Devolve `null` quando nenhum dos dois está presente. Usado por `routes/progress.js`.

### `tagsVocabulario.json` + `tagsVocabulario.js` (Fase 5, Bloco 2)
Fonte **única** dos 19 slugs do vocabulário fechado de tags (letra do PDF "Sistema de tags dos autores e do usuário", 31/08). O `.json` é um array de `{ slug, rotuloPt }` (`utils/tagsVocabulario.json:1-21`); o `.js` é o wrapper CommonJS que o backend importa. O **frontend importa o MESMO `.json`** (Vite importa JSON nativamente, `tsconfig.json` com `resolveJsonModule`) — nenhuma lista é duplicada em código, então drift de slug entre camadas é impossível por construção.
- Exports (`tagsVocabulario.js:19`): `VOCABULARIO` (o array), `SLUGS` (`Set` dos slugs) e `isSlugValido(slug)` (`tagsVocabulario.js:15-17`) — string e presente no `Set`
- **Qual superfície usa qual canal** (decisão pinada da spec): os chips do admin/fila/portal usam o **import do JSON**; os toggles das "Preferências de conteúdo" do leitor usam a lista que vem no `GET /api/parental` (`routes/parental.js:52`, que serve do mesmo JSON) — o componente do leitor **nunca** importa o JSON direto
- Consumido por: `models/Series.js` (validator `validateTags`), `routes/parental.js` (validação de `tagsBloqueadas`), `scripts/migrarTagsVocabulario.js` (ASSERT), `components/Admin/AdminDashboard.tsx`/`components/PortalEstudio.tsx` (chips)

### `parentalFilter.js` (Fase 5, Bloco 2)
Fonte **única** do filtro parental — três peças, nenhuma duplicada por superfície (ruling P5 do ledger: as exceções de admin/dono vivem AQUI, nunca na rota).
- `passaFiltroParental(parental, serie)` (`parentalFilter.js:54-71`) — predicado **PURO**, sem exceção nenhuma (nem admin, nem dono). Usado pelo push (`services/notificationService.js:123`, audiência) e internamente por `serieVisivelPara`. **LANÇA** se `serie.content_rating` **ou** `serie.tags` vierem `undefined` (`:55-59`) — fail-closed contra um `select`/`populate` estreito futuro (ruling P4); `content_rating: null` é valor VÁLIDO (obra não classificada = só para `young`), só o campo **ausente** lança
- `getFiltroParental(user)` (`parentalFilter.js:99-120`) — fragmento Mongo para **queries de LISTA**, semântica **POSITIVA** (ruling P3, nunca `$ne`/`$nin` no rating): `kids` → `{content_rating:'kids'}`; `teen` → `{content_rating:{$in:['kids','teen']}}`; `young` → sem cláusula. `$in` nunca casa `null` nem campo ausente, então o fail-safe "não classificada só para young" sai de graça. `tagsBloqueadas` vira `tags: {$nin: [...]}` só quando há alguma. `{}` para anônimo **e para admin**
- `serieVisivelPara(user, serie)` (`parentalFilter.js:137-148`) — **doc único**: `true` para admin, para anônimo e para o **dono do canal** da série (`channelId` ausente não lança, o dono-check só dá `false`); senão delega no predicado puro
- `classificacaoEfetiva(valor)` (`parentalFilter.js:36-39`, interna) — valor fora do enum (escrita bruta/migração) cai no degrau **mais restritivo** (`kids`), nunca em `young`; ausente/`null`/`''` = `young`

### `routeErrors.js` (Fase 5, Bloco 2, Task 8 — higiene do Bloco 1)
`responderCastError(err, res, mensagem404)` (`routeErrors.js:24-32`) — trata `CastError` de forma consistente nas rotas com `:id`. `err.path === '_id'` (ObjectId malformado, ex. `"abc"`) → **404** com o mesmo shape de "não encontrado" de um id válido-mas-inexistente; `CastError` em **qualquer outro campo** (ex. `content_rating` recebendo array no body do aprovar) → **400** `Valor inválido para o campo "<path>"` — mapear isso para 404 mascararia erro de input como recurso inexistente. Devolve `true` quando já respondeu, `false` quando `err` não é `CastError` (o chamador segue para o catch genérico). Usado em 12+ rotas de `content.js`, `channels.js`, `portal.js` e `adminPortal.js`.

### `curadoriaLimiares.js` (Fase 5, Bloco 3 — Curadoria)
Fonte **única** das constantes da curadoria semiautomática, num arquivo só para ajuste por deploy sem tocar em lógica. O Vin deu os patamares 100/200/300/500 e o "mínimo de 20 + 30% das visualizações únicas" das obras pequenas **sem mapear volumes** — as faixas de V são decisão nossa (registrada no cabeçalho, `curadoriaLimiares.js:1-12`, e no item 1 da lista a comunicar ao Vin).
- Constantes: `PISO_PEQUENA = 20` (`:13`), `PERCENTUAL_PEQUENA = 30` (`:14`), `PATAMARES` (`:20-25`, `ateV` **EXCLUSIVO**: `V < ateV`), `GRAVE = 5` (`:32`), `IDADE_MINIMA_CONTA_DIAS = 3` / `IDADE_MINIMA_CONTA_GRAVE_DIAS = 7` (`:37-38`), `MOTIVOS` (os 6, `:40-47`), `MOTIVOS_GRAVES` (`:48`), `MOTIVOS_COM_DESCRICAO_OBRIGATORIA` (`:49`), `DESCRICAO_MAX = 500` (`:50`), `TEXTO_ADMIN_MAX = 1500` (`:51`)
- **`TETO_PEQUENA` é o próprio `PATAMARES[0].limiar`** (`:30`), nunca um literal duplicado — se o Vin pedir outro valor, a escada e o teto não podem divergir; `LIMITE_PEQUENA_V` também é derivado (`:54`, `ceil(100/0,30) = 334`)
- **`limiarPara(V)` (`:68-75`) é uma ESCADA CONTÍNUA**: na 1ª faixa devolve `max(PISO_PEQUENA, min(30% de V, TETO_PEQUENA))`; acima dela, o limiar do patamar. Resultado: V ≤ 66 → 20 · 67..333 → `ceil(0,3·V)` · 334..9.999 → 100 · 10k → 200 · 50k → 300 · 100k → 500. **A propriedade obrigatória é a NÃO-DECRESCÊNCIA em V**: a rev.1 da spec tinha "20 E 30%" até V<1.000 e 100 fixo depois, e o limiar CAÍA de 300 (V=999) para 100 (V=1.000) — obras de 334..999 exigiriam mais sinalizações do que obras de 50.000. Pinada por teste de propriedade sobre todo V de 0 a 120.000 (`tests/backend/curadoriaLimiares.test.js:20-25`); qualquer mexida nas constantes precisa mantê-lo verde
- **Os 30% são calculados em aritmética INTEIRA** — `floor((V·30 + 99)/100)` (`trintaPorCento`, `:64-66`), nunca `Math.ceil(0.3*V)`, que numa fronteira exata daria N+1 por erro de ponto flutuante. `validarV` (`:56-60`) recusa não-inteiro ou negativo em vez de propagar `NaN` pela escada
- `tipoGatilho(V)` (`:77-80`) → `'pequena'` abaixo de `LIMITE_PEQUENA_V`, senão `'normal'` (o `'grave'` do caso não vem daqui, vem de `decidirGatilho` no serviço); `ehGrave(motivo)` (`:82-84`) é o predicado que `models/Sinalizacao.js:49` usa para DERIVAR o campo `grave`

### `primeiroAdmin.js` (Fase 5, Bloco 3 — Curadoria)
`primeiroAdmin()` (`primeiroAdmin.js:11-13`) — o usuário `admin`/`superadmin` de `createdAt` mais antigo, ou `null` se não houver nenhum (quem chama decide o que fazer). **Critério extraído de `routes/account.js`**, onde nasceu no Bloco 1 como o dono "guarda-chuva" dos canais inativos na exclusão de conta; a rota passou a chamar o helper (`routes/account.js:38` e `:305`) em vez de repetir o `findOne`. A curadoria reusa exatamente este usuário como AUTOR do aviso automático ao artista (`services/curadoriaService.js:113-118`): `MensagemPortal` exige `autorUserId` real e `autorTipo` do enum — não existe conta "sistema", e inventar um `autorTipo` novo quebraria o render dos 2 frontends. Efeito colateral herdado e aceito: excluir a conta desse admin apaga as mensagens autoradas por ele, avisos automáticos inclusos.

---

### Helpers do frontend (`.ts`)

| Arquivo | Propósito |
|---------|-----------|
| `consent.ts` | Consentimento de cookies/anúncios (LGPD) + carregamento condicional do AdSense |
| `premium.ts` | `isPremiumActive(user)` — premium só vale se não expirado (checa `premiumExpiresAt`) |
| `localizedPrice.ts` | Preço da assinatura formatado pela locale |
| `googleSignIn.ts` | Carrega o script do Google Identity Services sob demanda (uma vez, com retry) para o botão "Entrar com Google" |
| `anonymousId.ts` (Fase 4) | `getAnonymousId()` — UUID v4 do visitante sem conta, gerado uma vez e persistido em `localStorage` (`lorflux_anonymous_id`); nunca lança (roda em toda chamada de API via `api.ts`) — usa `crypto.randomUUID`/`crypto.getRandomValues` com fallback pra `Math.random` (TWA roda no Chrome instalado do aparelho, que pode estar desatualizado) |
| `progressPosition.ts` (Fase 4) | `posicaoDeVolta(percent, alturaTotal, alturaVisivel)` e `percentualLido(...)` — conversão entre percentual salvo e posição de scroll do `WebtoonReader` (percentual, não pixel, pra funcionar entre telas de tamanhos diferentes) |
| `claimProgress.ts` (Fase 4) | `migrarProgressoDoVisitante()` — chamada logo após login/cadastro para levar o progresso do visitante (`anonymousId` do `localStorage`) à conta via `api.claimProgress`; falha em silêncio e nunca segura o login além de `PRAZO_MIGRACAO_MS` (2s) |
| `pushManager.ts` (Fase 4, Bloco 2) | Push neste aparelho — mesma regra de `anonymousId.ts`: nenhuma função lança, cada uma checa suporte do navegador (ServiceWorker + PushManager + Notification) e resolve `false`/`null` em qualquer falha, só logando aviso (app roda como TWA, versões de Chrome variadas no aparelho). `isSupported()`, `getPermission()`. `subscribeThisDevice()` — pede permissão se `default`, busca `api.getPushPublicKey()`, assina via `PushManager.subscribe()` e registra com `api.subscribePush()`; devolve `boolean`. `unsubscribeThisDevice()` — cancela local (`subscription.unsubscribe()`) e remove no servidor (`api.unsubscribePush()`), as duas chamadas independentes (best-effort). `getStatus()` — devolve `{ thisDevice, anyDevice } \| null` (`null` = sem suporte ou erro), consultando `api.getPushStatus(endpoint)` com o endpoint da subscription local (ou vazio, se não houver). Não expõe `handlePushMessage` — o evento `push` é tratado inteiramente em `public/service-worker.js` |
| `superReaderReturn.ts` (Fase 4, Bloco 3) | `parseSuperReaderReturn(search)` — parser puro (mesmo espírito de `utils/deepLink.ts`) do retorno do checkout do Super Reader: lê o parâmetro `superreader` da query string (`?superreader=success\|cancelled`, gerado pelo `success_url`/`cancel_url` de `services/superReaderService.js`). Devolve `'success' \| 'cancelled' \| null` — sem o parâmetro ou com valor desconhecido (lixo), devolve `null`. Consumido por `App.tsx` no boot, no mesmo trecho que consome `?abrir=` do deep link de push |
| `currency.ts` (Fase 4, Bloco 3) | `CURRENCY_SYMBOL` — mapa `brl\|usd\|eur` → `R$\|$\|€` (mesmo conjunto de moedas do backend). `formatarValorMonetario(cents, currency)` — formata centavos para exibição: valor redondo vira `"R$5"` (sem casas decimais); não-redondo vira `"R$7,50"` (vírgula no `brl`) ou `"$7.50"` (ponto nas demais moedas). Extraído de `components/SuperReaderButton.tsx` para reuso em `components/SuperReaderBadge.tsx` sem duplicar o mapeamento símbolo↔moeda |

## Observações

- Backend usa apenas os `.js` (CommonJS); nunca use `console.log` em produção — use o `logger.js`
