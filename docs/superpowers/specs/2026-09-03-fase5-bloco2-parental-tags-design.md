# Fase 5 · Bloco 2 — Controle Parental + Tags (vocabulário fechado)

**Contrato: pacote R$ 3.700 aprovado 28/08 (este bloco: Controle Parental R$ 700).**
**Fontes: PDF "Controle parental — tags privadas" (26/08) · PDF "Sistema de tags dos autores e do usuário" (31/08, `docs/sistema-de-tags-dos-autores-e-do-usuario.pdf` — SUPERA o desenho de tags do Bloco 4) · decisão 28/08 (Gênero FICA visível ao leitor).**
**Rev. 2 — incorpora os 20 achados do painel adversarial de 4 lentes de 03/09.**

**Registro comercial (achado do painel):** o PDF de tags é de 31/08, posterior
ao fechamento do preço (28/08) — o retrabalho do sistema de tags do B4
(vocabulário, migração de acervo e de fixtures) é ABSORVIDO no pacote: o Vin
enviou o PDF antes do início da execução e garantiu o pagamento depois dele
(01/09). Fica registrado para a prestação de contas, junto com a higiene do
B1 (CastError/episode_number = conserto de bug; **reativação de canal =
conserto da desativação sem inversa, cortesia registrada, não faturável**).

## Objetivo

Um vocabulário fechado de 19 tags com DUAS funções independentes (letra do
PDF): descoberta/recomendação (autor escolhe até 8 que representam a obra de
verdade; Master corrige) e filtro pessoal (usuário bloqueia tags; o servidor
elimina essas obras da experiência DELE — a obra segue publicada para os
demais). Mais a classificação etária oficial (Kids/Teen/Young, definida pela
Lorflux) com PIN. Nomenclatura OBRIGATÓRIA na UI: **"Classificação etária"**
e **"Preferências de conteúdo"** — NUNCA "controle de classificação". Título
da seção na Conta: **"Classificação etária e Preferências de conteúdo"**
(neutro — sem guarda-chuva "controle parental", preservando o enquadramento
anti-censura do Vin; o PIN aparece como "PIN de proteção").

## O vocabulário (fechado, 19 — letra do PDF)

Romance · Drama · Comédia · Ação · Aventura · Fantasia · Dark Fantasy ·
Ficção Científica · Terror · Thriller · Mistério · Crime · Histórico ·
Sobrenatural · Super-heróis · Slice of Life · High School · Psicológico ·
LGBTQIA+

Slugs canônicos: `romance, drama, comedia, acao, aventura, fantasia,
dark-fantasy, ficcao-cientifica, terror, thriller, misterio, crime,
historico, sobrenatural, super-herois, slice-of-life, high-school,
psicologico, lgbtqia+`.

**Fonte ÚNICA dos slugs: `utils/tagsVocabulario.json`** (array de {slug,
rotuloPt}) — o backend importa via `utils/tagsVocabulario.js` (require) e o
FRONTEND importa o MESMO JSON (Vite importa JSON) guardando só o mapa
slug→rótulo i18n ×4. Nenhuma lista duplicada — drift de slug entre camadas é
impossível por construção (B3/5.1 reutilizam). **Qual superfície usa qual
canal (pinado): os chips do `TagsChipInput` (admin/fila/portal) usam o
IMPORT do JSON; os toggles das Preferências de conteúdo usam a lista vinda
do `GET /api/parental` (que serve do mesmo JSON)** — o teste dos toggles
pina o GET, o dos chips pina o import. A obra continua NUNCA
exibindo as próprias tags ao leitor (regra do B4 mantida); o leitor vê os
RÓTULOS do vocabulário só nas Preferências de conteúdo.

## O que JÁ existe (scout com file:linha, conferido pelo painel)

| Peça | Estado |
|---|---|
| `Series.tags` | livre 0 ou 5–15 (`models/Series.js:36`), setter normaliza (`:17-30` — slugs com hífen/+ sobrevivem, conferido) — validator MUDA: 0 a 8 do vocabulário |
| `Series.content_rating_sugerida` | `models/Series.js:53` (B1) — a OFICIAL (`content_rating`) nasce agora |
| Recomendação | candidatos em `recommendationService.js:1335` + **fallback cru em `routes/content.js:259`** (os DOIS levam o filtro); afinidade/temaForte/neutro (`:1046/:1178/:1286`) agnósticos às strings, mas NÃO à cardinalidade (ver decisão própria) |
| Superfícies de LISTA | lista (`content.js:105`, anônima pura → ganha optionalAuth) · search séries (`:31-34`) · agenda (`:76`, anônima pura → optionalAuth) · recommendations (`:241`+`:259`) · favoritos (`favorites.js:12`) · continuar (`progressService.js:215`) · canal público client-side via `getSeries()` |
| Superfícies de DOC ÚNICO (ALTO do painel) | detalhe (`content.js:127`) · episódios da série (`:283`, **select estreito 'isPublished channelId'**) · episódio (`:313-317`, **populate estreito**) · search ramo EPISÓDIOS (`:44-51`, **populate estreito + post-filter só de isPublished**) · signed-url (`bunnyWebhook.js:586-589`, **populate estreito**) — TODOS os selects/populates ampliam para incluir `content_rating tags`; sem isso o filtro falha ABERTO em silêncio |
| Push | `notificationService.js:101-104` — audiência = favoritadores, SEM filtro (superfície que a rev.1 esqueceu) |
| Admin users | `adminManagement.js:23` — projeção POR EXCLUSÃO devolveria `parental` inteiro (pinHash!) |
| PIN | sem infra; bcrypt 12 (`server.js:386`); reset de senha NÃO toca parental (`server.js:643-659` — vira garantia testada) |
| Export LGPD | payload é ALLOWLIST (`account.js:101-115`) — parental precisa ser ADICIONADO explicitamente (campo a campo), nunca via spread |
| Testes que mudam | `recommendations.test.js` (~17 its validator + ~50 fixtures) · `adminAprovacoes.test.js:310-335` (tags fora do vocabulário → migrar p/ slugs) · `portalCrud.test.js:125/241` (contrato INVERTE: tags passam a ser aceitas — deliberado) e `:906` (select do portal passa a INCLUIR tags — form de edição precisa) · `adminTags.test.tsx` (contador /15 → /8, seletor fechado) |
| UI | `TagsChipInput` livre (`AdminDashboard.tsx:2204-2253`) → seletor fechado · Conta inline `App.tsx:451-536`, molde `PrivacyCenter` · i18n flat ×4 |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Modelo do usuário | `User.parental { classificacaoEtaria: enum kids/teen/young DEFAULT 'young', tagsBloqueadas: [slug], pinHash: { type: String, default: null, select: false }, pinTentativas: Number default 0, pinBloqueadoAte: Date default null }` — irmão de `consent`. **`select: false` no pinHash = fora de TODA query por default** (rotas do parental fazem `.select('+parental.pinHash')` para comparar); `adminManagement.js:23` ganha `-parental` na projeção (preferências são privadas — nem superadmin vê, letra do PDF de 26/08) | pinHash de 4–6 dígitos exposto quebra offline em segundos; preferências de conteúdo no painel admin contrariam o espírito do PDF |
| Classificação oficial | `Series.content_rating: enum kids/teen/young, default null`. Só o Master define (admin form + fila; allowlist do aprovar vira `['genre','tags','content_rating']`). **A exigência "aprovar → classificação obrigatória" vive NA ROTA do aprovar (`adminPortal.js:251`), NUNCA em `applySeriesUpdate`** — o PUT admin continua publicando sem rating (fail-safe + badge cobrem o acervo). Sugerida do autor PRÉ-PREENCHE a fila; **com sugerida null (obra submetida antes do B2), o seletor abre SEM default — o Master escolhe ativamente**; mensagem do 400: "Classificação etária é obrigatória para aprovar" | Se a exigência entrasse no service compartilhado, o PUT admin do acervo quebraria — contradição interna que o painel pegou |
| Semântica etária (FORMA da query pinada) | **POSITIVA, nunca por exclusão**: kids → `{content_rating:'kids'}`; teen → `{content_rating:{$in:['kids','teen']}}`; young → SEM cláusula. `$in` não casa null NEM campo ausente — o fail-safe (não classificada = só para young) sai DE GRAÇA e o script de migração nem precisa de `$set: null`. `serieVisivelPara` trata `undefined` e `null` como o mesmo caso | `$ne/$nin` casariam docs com campo ausente e INVERTERIAM o fail-safe em silêncio (achado do painel); matriz de testes inclui doc com campo AUSENTE, não só null |
| Filtro pessoal (tags) | `tags: { $nin: tagsBloqueadas }` (qualquer tag bloqueada exclui; campo ausente passa — conferido) | Letra do PDF |
| Fonte única do filtro | `utils/parentalFilter.js` exporta TRÊS peças: `getFiltroParental(user)` → fragmento `$and` (etária positiva + $nin) para QUERIES DE LISTA; `serieVisivelPara(user, serie)` para DOC ÚNICO — **exige que `serie` tenha `content_rating` e `tags` presentes: se o doc vier sem os campos (select estreito), LANÇA erro** (fail-closed contra regressão futura; `channelId` é OPCIONAL — sem ele o dono-check é simplesmente false, séries sem canal existem), **devolve `true` para admin e para o DONO do canal da série**; e `passaFiltroParental(parental, serie)` — predicado PURO sem exceções, usado pelo push (audiência) e internamente. **Ordem de implementação: ampliar o select E ligar o helper acontecem na MESMA task/commit, por superfície** (helper antes do select = 500 em massa) | O ALTO do painel: sem a defesa, um select estreito futuro reabre o buraco calado |
| Superfícies filtradas (lista) | lista de séries, search (ramo séries), agenda, recommendations (candidatos `:1335` E fallback `:259` — cotas preenchem só com permitidas), favoritos (some da LISTA; favorito persiste no banco — desbloquear traz de volta), continuar lendo, canal público (via lista já filtrada). Lista e agenda ganham `optionalAuth` (nunca rejeita — conferido que nenhum consumidor quebra) | Ordem do PDF |
| Superfícies filtradas (doc único) | detalhe da série (→404, padrão dos drafts), episódios da série, episódio/leitor, signed-url, **search ramo EPISÓDIOS (post-filter com serieVisivelPara na série populada — o fragmento de query não alcança o populate)**. TODOS os selects/populates dessas posições ampliados para `+ content_rating tags`. Composição com a T2/B1: branch publicado → `serieVisivelPara` → 404/[]; branch rascunho → `podeVerRascunho` INALTERADO e sem filtro parental | Deep link não fura por NENHUM caminho; o ramo de episódios da busca era a sub-superfície fácil de esquecer (2 lentes pegaram) |
| **Push de capítulo novo** | `notifyEpisodePublished` cruza a audiência (favoritadores) com **`passaFiltroParental` (predicado puro — SEM exceção de admin/dono: quem bloqueou a tag da própria obra não recebe o push dela, autoinfligido e coerente com "listas filtram todos")**: carrega `parental` dos userIds em lote e descarta quem não passa, ANTES de buscar PushSubscriptions. Teste: favoritar → bloquear tag → publicar capítulo → zero envios; sem bloqueio → recebe | A obra "eliminada da experiência" não pode apitar com título e deep link na tela de bloqueio da criança (ALTO do painel) |
| Writes de engajamento | `POST favorites/:seriesId`, `POST series/:id/vote`, `POST episodes/:id/vote`, `superreader/create-session`: `serieVisivelPara` → 404 (mesmo shape do detalhe). **Os fetches desses 4 POSTs também garantem `content_rating tags` no doc (mesma regra dos selects de leitura — vote não busca a série hoje e passa a buscar; create-session busca no service)**. GETs de contagem ficam. **Exceção-da-exceção pinada: no ramo de EPISÓDIOS da busca (lista), o filtro vale para todos INCLUSIVE dono/admin — o populate não carrega channelId e listas filtram todos por decisão** | Criança kids não pode favoritar/apoiar via API obra que não pode ver; fetch estreito num POST viraria 500 (o helper lança) em vez do 404 prometido |
| Exceções ao filtro | `serieVisivelPara` = true para **admin** (senão o AdminDashboard quebra: ele carrega episódios pela rota PÚBLICA `content.js:283`) e para **dono do canal da série** (senão o dono com parental setado toma 404 na PRÓPRIA obra publicada — o endpoint não sabe se a chamada veio do portal). Nas LISTAS, o filtro vale para todos (a ausência da própria obra na home do dono é autoinfligida — aceita e registrada). Anônimo/visitante: sem filtro | O painel provou a quebra do admin com file:linha; regra mora no helper, não na "superfície" |
| PIN | 4–6 dígitos, bcrypt 12, OPCIONAL (aviso recomendando). Com PIN: QUALQUER mudança de `parental` exige o PIN — **inclusive as tagsBloqueadas do próprio adulto (escolha consciente: sem isso a criança desbloqueia; registrado, não implícito)**. Rate limit PERSISTIDO NO USER: `pinTentativas`/`pinBloqueadoAte`, 5 erros → 15min com backoff exponencial (dobra por lote), zera no acerto; key = userId (por IP não acrescenta: a rota exige a própria sessão); mostra tentativas restantes | Limiter em memória zera no restart e por IP pune a casa inteira (achado); contador persistido também entrega o "tentativas restantes" |
| Recuperação de PIN | PIN esquecido: remoção SÓ via confirmação de senha + token dedicado por e-mail (molde do reset-password, com accountLimiter) — nunca senha sozinha (criança que sabe a senha derrubaria o PIN). Conta social (sem senha): token por e-mail apenas. **Reset/troca de senha e de e-mail NUNCA tocam em `parental` (garantia com teste)** | Sem caminho, PIN esquecido = preferências imutáveis para sempre |
| **Exclusão de conta × PIN** | `DELETE /api/account/me` passa a exigir o PIN quando `temPin` (qualquer provider), ALÉM da senha para contas locais. **Hoje conta Google exclui com um clique** — a criança apagaria a conta e recriaria sem parental | ALTO do painel; mesma regra do PUT: desfazer a restrição (inclusive por exclusão) só com o PIN |
| Rotas | `GET /api/parental` (etária, tagsBloqueadas, `temPin`, e a LISTA DE SLUGS do vocabulário — o frontend não hardcoda) · `PUT /api/parental` (classificacaoEtaria?, tagsBloqueadas?, `pin` se temPin) · `POST /api/parental/pin` ({novoPin?, pinAtual?, remover?}) · `POST /api/parental/pin/recuperar` + confirmação por token. Tudo verifyToken; slug desconhecido → 400; pinHash NUNCA em resposta NENHUMA (teste de shape cobre também `GET /api/admin/users` e `GET /api/auth/me`) | Superfície mínima |
| Tags no portal/admin | Autor: até 8 no form do portal (criar/editar draft) — `PORTAL_SERIES_FIELDS` += tags com validação vocabulário/8 (**contrato do B1 INVERTE deliberadamente: tags deixam de ser ignoradas; content_type/isPublished/genre SEGUEM ignorados** — testes portalCrud:125/241 reescritos com essa distinção); select do `GET /portal/series` passa a INCLUIR tags (form de edição precisa do estado atual; portalCrud:906 re-pinado). Master corrige na fila e no admin. `TagsChipInput` vira seletor fechado (19 chips, máx 8, /8) — mesmo componente, versão i18n no portal | Letra do PDF (autor escolhe, Master corrige) |
| Cardinalidade × algoritmo (B4) | **O mínimo 5 do B4 é REVOGADO pelo PDF ("até 8", sem mínimo) — efeito colateral ACEITO e registrado: `temaForte` dispara mais com conjuntos pequenos (1 tag × 1 tag igual = 100% > 50% = conflito)**. Testes novos de baixa cardinalidade (1×1 igual → conflito; 2×2 com 1 comum = 50% → NÃO conflito — fronteira exclusiva) além das fronteiras 8/9. Pós-migração do acervo real: smoke manual do /recommendations antes/depois, anotado no ledger | O guard-rail do B4 cai por decisão do cliente, não por acidente — assinado aqui |
| Migração do acervo | Script `scripts/migrarTagsVocabulario.js`, idempotente, cobre **TODOS os docs de Series (publicadas, despublicadas, drafts — senão a 1ª edição de um draft leva 400)**: mapa manual tag-livre → slug; não mapeável → removida; pós-mapa aplica DEDUPE e **CAP em 8 por ordem de prioridade do mapa, com ASSERT que falha alto se >8 sobrar**; obra pode ficar com 0 (neutro derivado cobre). Badge "não classificadas" no admin orienta o Master. **Rev. 4 (achado da T5): as LISTAS toleram campo ausente (semântica positiva), mas o helper de DOC ÚNICO LANÇA com campo ausente por desenho (P4) — e o acervo inteiro NÃO tem `content_rating` no documento (campo nasceu na T1 sem $set) nem `tags` nas séries pré-Fase 3. Sem correção, o detalhe/leitor/signed-url/writes dariam 500 para todo usuário logado não-admin até a migração rodar. Decisão: BACKFILL IDEMPOTENTE NO BOOT do servidor (`updateMany({content_rating:{$exists:false}},{$set:{content_rating:null}})` e `tags` ausente → `[]`), no mesmo padrão da varredura inicial da Fase 4, MAIS o mesmo backfill no script — o throw do helper fica como detector de select estreito, e nunca mais existe doc real sem os campos (sem janela entre pull e restart: o boot corrige antes de servir)** | Duas tags livres → mesmo slug e obras com 9+ mapeáveis eram buracos do script (achado); teste inclui as duas fixtures; o campo ausente foi contradição interna da rev.2/3 (lista tolera, doc único lança) que só a implementação expôs |
| Fixtures do B4 (migração de testes) | Task dedicada com guia CONCRETO: (1) a alavanca é o validator SEM mínimo — reduzir para 2–3 tags por obra mantém disjunção pairwise dentro do orçamento de 19 slugs (cenários de 6+ obras disjuntas de 5 tags são IMPOSSÍVEIS com 19 — 4×5=20>19); (2) expects de valores exatos de afinidade são RECALCULADOS das novas frações (recalcular ≠ afrouxar); (3) o revisor confere a RELAÇÃO de cada cenário (disjunto/sobreposto/>50%), não o número | Sem o guia, o executor criaria sobreposições acidentais ou travaria (achado com a conta combinatória) |
| UI do leitor (Conta) | Seção "Classificação etária e Preferências de conteúdo" (molde PrivacyCenter): etária (3 opções + explicação), 19 toggles i18n "ocultar", gestão do PIN de proteção. i18n ×4. Admin PT | Nomenclatura do PDF; título neutro (ver Objetivo) |
| LGPD | Export ADICIONA `parental` explicitamente (classificacaoEtaria, tagsBloqueadas, temPin bool — campo a campo, nunca spread); exclusão de conta apaga junto (já cobre) | O payload é allowlist — o risco real era a AUSÊNCIA (violação de acesso), não vazamento (achado corrigiu o scout) |
| Guest | Nada muda. **Limitação CONSCIENTE e registrada: logout/visitante contorna o filtro por definição — o parental é da CONTA, não do dispositivo** (modo visitante é cortesia aprovada na Fase 4). Mitigação por dispositivo = escopo futuro com o Vin | 2 lentes pediram o registro; comunicar ao Vin na entrega |

## Higiene herdada do Bloco 1 (conserto/cortesia — não faturável no R$700)

CastError → 404 (rotas de canal + `PUT /portal/series/:id` + `POST
/portal/episodios/:id/paineis`) · `GET /channels?includeInactive=true` admin
com `isActive` no select + `POST /channels/:id/reativar` + CanaisPanel
lista/reativa inativos (conserto: desativar hoje não tem inversa) ·
`episode_number` duplicado na MESMA série → 400 (portal e admin).

## Fora deste bloco (registrado)

Curadoria/sinalização (B3 — independe de preferências; fila de curadoria é
rota admin, não filtrada) · temporadas/legendas/DDLS/publicidade (5.1;
`content_rating` em Series já cobre hqcine/vcine futuros) · validação de
host de imagem (5.1) · **busca TEXTUAL por tag: NÃO entra — descoberta é via
recomendação (B4); busca por tag = decisão futura com o Vin (registrado para
não virar cobrança)** · mitigação de bypass por logout/dispositivo · conta
nova/outro dispositivo escapam do parental (limitação inerente, comunicar) ·
índice em tags/content_rating: NÃO criar (catálogo pequeno; $nin não usa
índice — avaliado e recusado pelo painel).

## Testes (antes do código, por task)

Backend: enum/slug inválido → 400 (série admin, portal, parental); validator
0–8 (fronteiras 8/9; 0 ok; sem mínimo); content_rating só admin/fila
(allowlist portal recusa; aprovar sem → 400 com a mensagem pinada; sugerida
null na fila aprovável escolhendo na hora); **matriz filtro × superfície ×
perfil** (young vê tudo incl. rating AUSENTE e null; teen não vê young/null/
AUSENTE; kids só kids; tag bloqueada some de: lista, search séries E
EPISÓDIOS, agenda, recomendação INCLUSIVE FALLBACK, favoritos-lista,
continuar, detalhe→404, episódios, leitor, signed-url); anônimo sem filtro;
**admin vê tudo nas superfícies compartilhadas (AdminDashboard segue
gerenciando episódios de obra "bloqueada")**; **dono abre a própria obra
publicada mesmo com a tag dela bloqueada** (detalhe/episódios/signed-url);
favorito persiste e volta ao desbloquear; writes de engajamento em obra
invisível → 404 (favoritar, votar ×2, SR create-session); **push: favoritou→
bloqueou→capítulo novo → zero envios para ele, envio normal para os demais**;
PIN (define/troca/remove; PUT sem pin com temPin → 401; 5 erros → bloqueio
persistido com backoff — sobrevive a "restart" [novo require do app];
tentativas restantes; recuperação por token; reset de senha NÃO toca
parental); pinHash em NENHUM shape (parental, auth/me, admin/users, export);
export COM parental (campo a campo); DELETE conta exige PIN com temPin
(local E google); recomendação: cota completa só com permitidas (bloqueada
no topo do score não aparece e a próxima entra); migração de fixtures B4
cenário a cenário (relações conferidas pelo revisor; baixa cardinalidade
1×1 e 2×2-fronteira); script de migração idempotente + fixtures >8→cap e
duas-livres→mesmo-slug; higiene B1 (CastError 404 ×N; reativar; episode_number).
Frontend: seção da Conta (nomenclatura EXATA, título neutro), 19 toggles
i18n ×4 vindos do GET (sem lista hardcoded), fluxos de PIN, TagsChipInput
fechado /8 (admin e portal), badge não classificadas, fila exigindo
classificação com seletor sem default.
