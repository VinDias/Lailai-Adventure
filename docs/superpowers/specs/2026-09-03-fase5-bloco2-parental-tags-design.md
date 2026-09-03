# Fase 5 · Bloco 2 — Controle Parental + Tags (vocabulário fechado)

**Contrato: pacote R$ 3.700 aprovado 28/08 (este bloco: Controle Parental R$ 700).**
**Fontes: PDF "Controle parental — tags privadas" (26/08) · PDF "Sistema de tags dos autores e do usuário" (31/08, `docs/sistema-de-tags-dos-autores-e-do-usuario.pdf` — SUPERA o desenho de tags do Bloco 4) · decisão 28/08 (Gênero FICA visível ao leitor).**

## Objetivo

Um vocabulário fechado de 19 tags com DUAS funções independentes (letra do PDF):
descoberta/recomendação (autor escolhe até 8 que representam a obra de verdade;
Master corrige) e filtro pessoal (usuário bloqueia tags; o servidor elimina
essas obras da experiência DELE — a obra segue publicada para os demais).
Mais a classificação etária oficial (Kids/Teen/Young, definida pela Lorflux)
com PIN parental. Nomenclatura OBRIGATÓRIA na UI: **"Classificação etária"**
(Kids/Teen/Young) e **"Preferências de conteúdo"** (tags ocultadas) — NUNCA
"controle de classificação". Uma plataforma única, sem versão por país.

## O vocabulário (fechado, 19 — letra do PDF)

Romance · Drama · Comédia · Ação · Aventura · Fantasia · Dark Fantasy ·
Ficção Científica · Terror · Thriller · Mistério · Crime · Histórico ·
Sobrenatural · Super-heróis · Slice of Life · High School · Psicológico ·
LGBTQIA+

Armazenamento: SLUGS canônicos minúsculos sem acento (`romance`, `drama`,
`comedia`, `acao`, `aventura`, `fantasia`, `dark-fantasy`, `ficcao-cientifica`,
`terror`, `thriller`, `misterio`, `crime`, `historico`, `sobrenatural`,
`super-herois`, `slice-of-life`, `high-school`, `psicologico`, `lgbtqia+`)
em `utils/tagsVocabulario.js` (backend, fonte única: slugs + rótulo PT) e
rótulos de exibição i18n ×4 no frontend (o leitor VÊ os nomes nas Preferências
de conteúdo; a obra continua NUNCA exibindo as próprias tags — regra do
Bloco 4 mantida).

## O que JÁ existe (scout com file:linha)

| Peça | Estado |
|---|---|
| `Series.tags` | livre 0 ou 5–15 (`models/Series.js:36`), setter normaliza minúsculas/dedupe (`:17-30`) — **validator MUDA: 0 a 8, todas do vocabulário** |
| `Series.content_rating_sugerida` | `models/Series.js:53` (Bloco 1) — a OFICIAL (`content_rating`) nasce agora |
| Recomendação | candidatos em `recommendationService.js:1335` (`Series.find({isPublished, content_type})`) — ponto ÚNICO de inserção do filtro; **o fallback da rota refaz um find cru em `routes/content.js:259` e TAMBÉM precisa**; afinidade/temaForte/neutro (`:1046`, `:1178`, `:1286`) seguem funcionando com o vocabulário (são agnósticos ao conteúdo das strings) |
| Superfícies públicas | lista (`content.js:105`, **anônima pura**) · detalhe (`:127`) · episódios (`:283`) · episódio (`:313`) · search (`:23`) · agenda (`:76`, **anônima pura**) · recommendations (`:241` + fallback `:259`) · favoritos (`favorites.js:12`) · continuar (`progressService.js:215`) · canal público lista obras CLIENT-SIDE via `getSeries()` (`CanalPublico.tsx:56`) · signed-url (bunnyWebhook) |
| PIN | NÃO existe infra nenhuma; padrão de segredo = `bcrypt` rounds 12 (`server.js:386`), confirmação tipo exclusão de conta (`account.js:204`) |
| Export LGPD | `account.js:78` exclui só `-passwordHash` — **`parental.pinHash` vazaria; exclusão explícita obrigatória** |
| Testes do Bloco 4 | validator: ~17 de 20 its de `recommendations.test.js:23-231` pinam 5–15; ~50 fixtures com 5 tags INVENTADAS fora do vocabulário — **migração de fixtures preservando as RELAÇÕES DE INTERSEÇÃO dos cenários (afinidade/temaForte/diversidade), nunca só trocar strings às cegas** |
| UI de tags | `TagsChipInput` input LIVRE (`AdminDashboard.tsx:2204-2253`, contador /15) — vira seletor fechado |
| Conta | inline em `App.tsx:451-536`; `PrivacyCenter.tsx` é o molde de painel; i18n flat ×4 idiomas |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Modelo do usuário | `User.parental { classificacaoEtaria: enum kids/teen/young DEFAULT 'young', tagsBloqueadas: [slug do vocabulário] default [], pinHash: String default null }` — subdoc irmão de `consent` | Default 'young' = catálogo completo (o "sem barreiras" do Vin); quem quer restringir, restringe |
| Classificação oficial | `Series.content_rating: enum kids/teen/young, default null`. Definida SÓ pelo Master (admin form + fila de aprovação; `content_rating_sugerida` do autor PRÉ-PREENCHE o campo na fila). **Aprovar na fila passa a exigir gênero E classificação** | "Definida oficialmente pela Lorflux" (PDF); a sugerida do Bloco 1 vira insumo, como planejado |
| Obra sem classificação | Tratada como **'young'** (fail-safe: só aparece para quem vê tudo; some de Teen/Kids) | Errar para o lado de esconder de criança, nunca de mostrar. Catálogo atual é pequeno — o Master classifica na largada (badge de "não classificadas" no admin) |
| Semântica etária | Kids vê `content_rating: 'kids'`; Teen vê `kids+teen`; Young vê tudo (inclusive não classificadas) | Escada padrão de classificação |
| Filtro pessoal (tags) | `tags: { $nin: tagsBloqueadas }` — obra com QUALQUER tag bloqueada sai | Letra do PDF: "o servidor simplesmente elimina essas obras da experiência daquele usuário" |
| Onde o filtro roda | **`utils/parentalFilter.js`** (fonte única): `getFiltroParental(userId)` → fragmento de query Mongo (`$and` de etária + tags) + `serieVisivelPara(user, serie)` p/ checagem de doc único. Aplicado em TODAS as superfícies de leitor: lista, detalhe (→404, mesmo padrão dos drafts — deep link não fura), episódios da série, episódio/leitor, **signed-url**, search, agenda, recommendations (no candidato `:1335` E no fallback `:259` — cotas/diversidade preenchem só com permitidas), favoritos (a obra some da LISTA; o favorito NÃO é apagado — desbloquear a tag traz de volta), continuar lendo. Lista e agenda ganham `optionalAuth` | Ordem do PDF: Catálogo → classificação → tags → recomendações/busca/home. Um só ponto de verdade; rota nenhuma monta filtro à mão |
| Quem NÃO é filtrado | Anônimo/visitante (sem conta = sem preferências = young sem bloqueio); admin nas rotas ADMIN; dono de canal no PORTAL (as próprias obras) e nos próprios rascunhos (regra da T2/B1). O filtro é da EXPERIÊNCIA DE LEITURA do usuário logado | Preferência é da conta; portal/admin são operação, não consumo |
| Artista × preferências | Tags da obra: autor escolhe até 8 no PORTAL (campo novo no form criar/editar draft — allowlist `PORTAL_SERIES_FIELDS` += tags com validação vocabulário/8); Master corrige na fila e no admin. Preferências do usuário: NUNCA exibidas na página da obra, NUNCA visíveis ou alteráveis pelo artista, não mudam metadados | Letra dos dois PDFs |
| PIN | 4–6 dígitos, `bcrypt` rounds 12, OPCIONAL. Sem PIN: o dono da sessão muda as preferências livremente (com aviso recomendando criar). Com PIN: QUALQUER mudança de `parental` (etária, tags, trocar/remover PIN) exige o PIN atual. Rate limit: 5 tentativas/15min por usuário (mesmo espírito do accountLimiter); erradas → 401 sem vazar quantas restam com precisão? — mostra tentativas restantes (UX de parental, não de login) | Sem PIN o controle parental é decorativo (criança desfaz); com PIN, restringir é reversível só por quem o sabe |
| Rotas | `GET /api/parental` (minhas prefs: etária, tags bloqueadas, `temPin` bool — NUNCA pinHash) · `PUT /api/parental` (body: classificacaoEtaria?, tagsBloqueadas?, `pin` obrigatório se temPin) · `POST /api/parental/pin` (define/troca/remove: `{ novoPin?, pinAtual?, remover? }` — exige pinAtual se já existe). Tudo `verifyToken`; validação de slugs contra o vocabulário (desconhecido → 400) | Superfície mínima; PIN nunca trafega de volta |
| Migração do acervo | Passo de deploy (script `scripts/migrarTagsVocabulario.js`, idempotente): mapa manual tag-livre-atual → slug do vocabulário (catálogo conhecido); não mapeável → REMOVIDA; obra pode ficar com 0 tags (neutro derivado do B4 cobre); `content_rating` nasce null em todo o acervo → badge "não classificadas" no admin orienta o Master. Validator novo só REJEITA ESCRITA inválida — docs antigos não quebram leitura | Zero downtime; curadoria final é humana (regra do Vin: Master corrige) |
| Fixtures do Bloco 4 | Migração DEDICADA (task própria): trocar tags inventadas por slugs do vocabulário PRESERVANDO as relações de interseção de cada cenário (sobreposição de afinidade, temaForte >50%, dedupe, fronteiras); cenários de 15/16 tags viram fronteiras de 8/9; NENHUM expect afrouxado — o revisor confere cenário a cenário | O algoritmo do B4 é agnóstico às strings; os TESTES não são. Mudar fixture sem entender o cenário = teste que passa sem provar |
| `TagsChipInput` | Vira seletor fechado: 19 chips clicáveis (rótulo PT no admin), máx 8, contador /8; MESMO componente no admin (criar/editar/fila) e a versão i18n no portal | Fonte única de UI; o autor não digita tag — escolhe |
| UI do leitor (Conta) | Seção "Controle parental" (molde `PrivacyCenter`): **Classificação etária** (3 opções + explicação) e **Preferências de conteúdo** (19 tags i18n como toggles "ocultar") + gestão de PIN. i18n ×4. Admin segue PT | Nomenclatura obrigatória do PDF; tudo que o leitor vê em 4 idiomas |
| LGPD | Export inclui `parental` SEM `pinHash` (exclusão explícita no select E no payload); exclusão de conta apaga junto com o doc (já cobre) | `account.js:78` só exclui passwordHash hoje — buraco mapeado no scout |
| Guest | Nada muda para visitante | Sem conta, sem preferências |

## Higiene herdada do Bloco 1 (dívidas atribuídas a este bloco)

CastError de id malformado → 404 (rotas de canal + `PUT /portal/series/:id` +
`POST /portal/episodios/:id/paineis`; padrão `adminPortal.js`) ·
`GET /channels?includeInactive=true` (admin) com `isActive` no select +
`POST /channels/:id/reativar` (admin) + CanaisPanel lista/reativa inativos
(threads arquivadas voltam a ter porta de entrada) · `episode_number`
duplicado na MESMA série → 400 (rotas portal e admin de criação).

## Fora deste bloco (registrado)

Curadoria/sinalização (Bloco 3 — usa as MESMAS obras filtradas? NÃO: sinalizar
é sobre a obra publicada, independe de preferências) · temporadas/legendas/
DDLS/publicidade (5.1) · validação de host de imagem contra CDN (5.1, dívida
B1) · tags privadas ≠ vocabulário separado (o PDF 4 SUPEROU: mesmas 19 servem
aos dois usos).

## Testes (antes do código, por task)

Backend: enum do vocabulário (slug inválido → 400 em série, portal, parental);
validator 0–8 (fronteiras 8/9; 0 ok); `content_rating` só via admin/fila
(allowlist portal NÃO aceita; aprovar sem classificação → 400; sugerida
pré-preenche mas Master decide); matriz do filtro por superfície × perfil
(young vê tudo; teen não vê young nem NULL; kids só kids; tag bloqueada some
de TODAS as superfícies — lista/detalhe 404/episódios/leitor/signed-url/
search/agenda/recomendação incl. fallback/favoritos/continuar — teste por
superfície, com obra 'young' sem rating e obra com tag bloqueada); anônimo vê
tudo; admin/portal NÃO filtrados; favorito de obra bloqueada persiste no banco
e volta ao desbloquear; PIN (define/troca/remove, PUT sem pin com temPin →
401, rate limit 5/15min, pinHash NUNCA em resposta nenhuma — grep de shape);
export com parental SEM pinHash; recomendação: cotas preenchem só com
permitidas (fixture com bloqueada no topo do score — não aparece e a cota
completa com a próxima); migração de fixtures B4 cenário a cenário (revisor
confere as relações); script de migração idempotente (2ª rodada no-op).
Frontend: seção Controle parental (nomenclatura EXATA), 19 toggles i18n ×4,
fluxos de PIN, TagsChipInput fechado /8 (admin e portal), badge de não
classificadas no admin, fila exigindo classificação.
