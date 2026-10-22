# Regressões

Bug corrigido que volta é o problema que mais se repete. Esta tabela diz, para
cada conserto, qual teste impede a volta dele.

Suíte inteira do projeto: `npm run test:all` (frontend com jsdom, backend com
mongodb-memory-server). Em 22/10/2026: **58 arquivos e 651 testes no frontend,
44 e 1249 no backend**, todos passando.

Procedimento: skill `/regressao`. Em resumo, conserto só termina com um teste
que falha sem a correção, e a prova de que ele falha é feita numa **cópia** do
projeto no scratchpad com o bug reintroduzido, nunca com `git stash`,
`git checkout` ou `git reset` (este clone tem arquivos de trabalho que só
existem aqui).

## Como esta tabela foi levantada

Em 21/10/2026, 51 consertos foram reintroduzidos um por um, cada um numa cópia
isolada, e os testes existentes do componente foram rodados contra o bug de
volta. Quem disse "coberto" teve de colar o trecho literal da falha: um falso
"protegido" é pior que um "descoberto" declarado. Os 12 que ninguém pegou
ganharam teste novo, e **cada teste novo foi provado por um agente diferente
do que o escreveu**, que reintroduziu o bug na própria cópia, exigiu a falha e
respondeu se o teste exercita o código de produção ou apenas o próprio mock.
Os 12 foram aprovados.

**Nenhum bug havia voltado.** Nenhum item ficou como `voltou`.

| Commit | Data | Bug | Teste que protege | Status | Risco |
|---|---|---|---|---|---|
| `517bb54` | 2026-10-22 | `invoice.paid` (renovacao mensal) tratado no codigo desde 16/09 mas **nunca habilitado no endpoint do Stripe**: o evento nao era entregue, `premiumExpiresAt` congelava nos 30 dias da primeira cobranca | `tests/backend/webhookEventosStripe.test.js` — _todo event.type tratado em routes/payment.js esta declarado em EVENTOS_ESPERADOS_, mais `node scripts/verificarWebhookStripe.js` na VPS para a conferencia contra o painel | coberto-novo | alto |
| `9471736` | 2026-10-13 | fix(assinatura): botao nao mostra mais preco de reserva desatualizado | `tests/frontend/appPrecoAssinarBotao.test.tsx` | coberto-novo | medio |
| `f82bb17` | 2026-10-11 | fix(carrossel): capitulo na fila de aprovacao segurava o Continuar | `tests/backend/progress.test.js` — _capitulo na fila de aprovacao NAO segura a obra no carrossel_ | coberto-verificado | medio |
| `120e441` | 2026-10-07 | fix(fase6): tres defeitos da tela de convite achados no E2E do app real | `tests/frontend/api.bloqueio.test.ts` — _403 de conteudo pago > carrega status, code e OBRA (titulo e capa) no _ | coberto-verificado | alto |
| `f371353` | 2026-09-24 | fix(paineis): camada de idioma vai para o painel certo | `tests/frontend/adminPaineisIdioma.test.tsx` — _o lote continua do primeiro painel SEM a camada, em vez de voltar ao #_ | coberto-verificado | alto |
| `79c5aaa` | 2026-09-24 | fix(uploads): envio multipart renova a sessao em vez de falhar | `tests/frontend/api.uploads.test.ts` — _401 renova o token e REPETE o upload, sem exigir F5 (e mais 3: "refres_ | coberto-verificado | alto |
| `517bb54` | 2026-09-24 | fix(assinatura): renovacao mensal do Stripe e preco real no botao | `tests/backend/assinaturaPremium.test.js` — _estende a validade até o fim do período cobrado na fatura (e mais 2 do_ | coberto-verificado | alto |
| `240701b` | 2026-09-11 | fix(portal): obra removida pela curadoria volta a ser reenviavel | `tests/backend/portalCrud.test.js` — _obra REMOVIDA pela curadoria (capítulos publicados, zero rascunhos) po_ | coberto-verificado | medio |
| `c72f816` | 2026-09-04 | fix(curadoria): reivindicacao por campo proprio - mutex das 4 acoes, sem caso preso nem irmao, e indice do aggregate | `tests/backend/curadoriaService.test.js` — _rodada 2 (d): caso REIVINDICADO continua barrando um caso IRMÃO da mes_ | coberto-verificado | alto |
| `7143529` | 2026-09-04 | fix(curadoria): token de posse na reivindicacao - so o dono fecha, devolve e altera a obra | `tests/backend/adminCuradoria.test.js` — _rodada 3 (a): quem PERDEU o lock por expiração no meio da ação NÃO alt_ | coberto-verificado | alto |
| `44270ee` | 2026-09-04 | fix(curadoria): T4 - submittedAt no remover, lock otimista no fechamento, pinos de ciclo e relogio, robustez das acoes | `tests/backend/adminCuradoria.test.js` — _remover limpa submittedAt (mesmo que a série publicada ainda o tivesse_ | coberto-verificado | alto |
| `08639a7` | 2026-09-04 | fix(curadoria): consolidacao do backend - lock antes de alterar a obra, fechamento atomico, reavaliacao por agregacao e pinos de escopo | `tests/backend/adminCuradoria.test.js` — _item 1: remover reivindica ANTES de despublicar — o `aprovar` concorre_ | coberto-verificado | alto |
| `c99293b` | 2026-09-03 | fix(parental): backfill de campo ausente no boot e busca de episodios query-side | `tests/backend/parentalDocSurfaces.test.js` — _visitante × episódio de série LEGADA (sem content_rating/tags no doc) _ | coberto-verificado | alto |
| `b77bbcd` | 2026-09-03 | fix(portal): lookup do admin antes do cancel do Stripe na exclusao | `tests/backend/exclusaoContaStripe.test.js` | coberto-novo | medio |
| `af095f7` | 2026-09-03 | fix(parental): fecha ressalvas do fix round da T9 (migracao de tags) | `tests/backend/migrarTagsVocabulario.test.js` — _(INFO 4) tags: null (campo presente mas não-array) é tratado como [] e_ | coberto-verificado | medio |
| `9285a2f` | 2026-09-03 | fix(parental): restaura o pino da regressao A2 no teste de neutro | `tests/backend/pinoNeutroA2.test.js` | coberto-novo | medio |
| `63aa52e` | 2026-09-03 | fix(parental): recomendacoes fail-closed e enum corrompido cai em kids | `tests/backend/parentalFilter.test.js` — _classificacaoEtaria fora do enum (escrita bruta) → fragmento de KIDS, _ | coberto-verificado | alto |
| `6105bfa` | 2026-09-03 | fix(portal): followers fora de todas as respostas de canal | `tests/backend/channels.test.js` — _followers[] nunca sai nas demais respostas de canal > GET /channels/me_ | coberto-verificado | medio |
| `5761ea4` | 2026-09-03 | fix(parental): dedupe das tags bloqueadas e limpeza do token de PIN na exclusao | `tests/backend/parentalPinRoutes.test.js` — _tagsBloqueadas é DEDUPLICADA no banco (lista vira $nin de toda query d_ | coberto-verificado | medio |
| `e740c4b` | 2026-09-02 | fix(portal): episodio submetido nao recebe paineis | `tests/backend/portalCrud.test.js` — _episódio SUBMETIDO não recebe painéis (403); devolvido volta a aceitar_ | coberto-verificado | alto |
| `9ce693e` | 2026-09-02 | fix(portal): gate de publicacao usa o convertToTrue do proprio Mongoose | `tests/backend/content.test.js` — _todo formato que o cast do Mongoose publica é barrado sem genre (inclu_ | coberto-verificado | medio |
| `bb80c9f` | 2026-08-21 | fix(algoritmo): neutro da afinidade derivado da media do leitor | `tests/backend/recommendations.test.js` — _Item 2 (fix round, achado A2): obra SEM tags nunca "abre o feed" — não_ | coberto-verificado | medio |
| `a302f34` | 2026-08-21 | fix(algoritmo): denominador da qualidade usa leitores logados | `tests/backend/recommendations.test.js` — _qualidade proporcional > denominador logado (Item 1, fix round da revi_ | coberto-verificado | alto |
| `7966698` | 2026-08-21 | fix(visitante): agradecimento do super reader so com conta | `tests/frontend/superReaderThanksGate.test.tsx` | coberto-novo | baixo |
| `67d9a45` | 2026-08-21 | fix(algoritmo): neutro derivado exclui obras ja consumidas pelo leitor | `tests/backend/recommendations.test.js` — _neutro derivado exclui obras ja consumidas > leitor que leu quase todo_ | coberto-verificado | medio |
| `e4ee859` | 2026-08-20 | fix(notificacoes): deep link vence o setView do login e tipos reais nas rotas de push | `tests/frontend/appDeepLinkLogin.test.tsx` | coberto-novo | medio |
| `df9d5b7` | 2026-08-20 | fix(superreader): guard de payment_status, period em utc e docs do minimo | `tests/backend/superReader.test.js` — _webhook > caso 7: sessão SR com payment_status "unpaid" responde 200 e_ | coberto-verificado | medio |
| `c6e5072` | 2026-08-20 | fix(notificacoes): guarda de conteudo no push e quinto caminho (paineis) | `tests/backend/notifications.test.js` — _caminho 5 — POST /api/content/episodes/:id/panels (guarda de conteúdo)_ | coberto-verificado | alto |
| `c281083` | 2026-08-20 | fix(superreader): garante indice unico nos testes e trata corrida do upsert | `tests/backend/superReader.test.js` — _registrarContribuicao > perdedor da corrida (E11000 forçado): re-busca_ | coberto-verificado | medio |
| `b99006b` | 2026-08-20 | fix(superreader): apoio somente em brl ate existir politica cambial | `tests/backend/superReader.test.js` — _moeda usd é rejeitada (Super Reader trancado em BRL até existir políti_ | coberto-verificado | alto |
| `926b39e` | 2026-08-20 | fix(notificacoes): poda de subscription morta nao aborta o lote em falha transitoria | `tests/backend/notifications.test.js` — _PushSubscription.deleteOne lançando (falha transitória de banco na pod_ | coberto-verificado | medio |
| `50f75a4` | 2026-08-20 | fix(push): backfill de notificationSentAt para episodios legados | `tests/backend/notifications.test.js` — _scripts/backfillNotificationSentAt > marca published legado sem o camp_ | coberto-verificado | medio |
| `3a81e4a` | 2026-08-20 | fix(payment): sessao sem customer nao promove usuario arbitrario a Premium | `tests/backend/superReader.test.js` — _webhook > caso 6: sessão sem metadata.tipo E sem customer não promove _ | coberto-verificado | alto |
| `2cc2eda` | 2026-08-20 | fix(algoritmo): favoritos e likes contam somente de quem leu a obra | `tests/backend/recommendations.test.js` — _gate de leitura real (favoritos/likes so de quem leu; SR sempre conta)_ | coberto-verificado | alto |
| `156cbc9` | 2026-08-20 | fix(push): boot logado nao clobra a aba do deep link sob StrictMode | `tests/frontend/appDeepLinkLogin.test.tsx` | coberto-novo | medio |
| `e9aaa1e` | 2026-08-17 | fix(progresso): portao de gravacao e protecao contra corrida na restauracao | `tests/frontend/reader.test.tsx` — _WebtoonReader — Restauração de progresso > não grava progresso antes d_ | coberto-verificado | alto |
| `e4a1ed2` | 2026-08-17 | fix(progresso): claim trata corrida no reindex e testa fusao nos dois sentidos | `tests/backend/progress.test.js` — _POST /api/me/progress/claim > recupera de corrida quando um documento _ | coberto-verificado | medio |
| `75e994a` | 2026-08-17 | fix(progresso): cancela restauracao do capitulo anterior ao trocar de capitulo | `tests/frontend/reader.test.tsx` — _WebtoonReader — Restauração de progresso > ignora resposta atrasada do_ | coberto-verificado | medio |
| `6cc108b` | 2026-08-17 | fix(seguranca): valida contentType da query do carrossel contra injecao | `tests/backend/progress.test.js` — _tentativa de injecao de operador (contentType[$ne]) nao e repassada ao_ | coberto-verificado | medio |
| `69e10de` | 2026-08-17 | fix(progresso): gravacao periodica morria apos trocar de capitulo | `tests/frontend/useProgress.test.ts` — _continua gravando periodicamente depois de trocar de episodio com time_ | coberto-verificado | alto |
| `57a1946` | 2026-08-17 | fix(progresso): agrupa por obra dentro do Mongo antes do teto do carrossel | `tests/backend/progress.test.js` — _uma obra com muitas linhas recentes nao empurra outra obra (com so 1 l_ | coberto-verificado | medio |
| `4581a98` | 2026-08-17 | fix(progresso): descarrega o pendente ao sair mesmo abaixo do limiar | `tests/frontend/useProgress.test.ts` — _descarrega ao desmontar mesmo com variacao abaixo do limiar_ | coberto-verificado | alto |
| `2c2c619` | 2026-08-17 | fix(progresso): clique em Continuar nao depende mais de estado local nem falha em silencio | `tests/frontend/continueCarousel.test.tsx` — _mostra mensagem de erro quando onOpen falha, em vez de nao fazer nada;_ | coberto-verificado | medio |
| `85f9c32` | 2026-06-27 | fix(reader): painéis premium nao apareciam + admin cortado pela barra inferior | `tests/frontend/reader.test.tsx` — _WebtoonReader — Renderização > busca o episódio pelo episodeId (mais 1_ | coberto-verificado | alto |
| `44692b6` | 2026-06-05 | fix(bunny): corrige fórmula da signed URL para o esperado pelo Bunny CDN | `tests/backend/signedUrlContrato.test.js` | coberto-novo | alto |
| `43e7694` | 2026-06-05 | fix(bunny): assina token pro diretorio do video (token_path) cobrindo HLS | `tests/backend/signedUrlContrato.test.js + tests/frontend/videoXhrSetup.test.tsx` | coberto-novo | alto |
| `a3285af` | 2026-06-02 | fix(security): bunny signed-url fail-closed e bloqueio de premium para anonimos | `tests/backend/signedUrl.test.js` — _episódio PREMIUM: anônimo e logado sem assinatura levam 403; assinante_ | coberto-verificado | alto |
| `33578ce` | 2026-05-23 | fix(security): controle de acesso premium, mass-assignment, vazamento de erro e pagamento mobile | `tests/backend/content.test.js` — _episódio premium NÃO sai para usuário logado sem assinatura: 403 com c_ | coberto-verificado | alto |
| `1a3adc3` | 2026-04-28 | fix(payment): JSON parser para /api/payment/create-checkout | `tests/backend/paymentCheckout.test.js` | coberto-novo | alto |
| `935a565` | 2026-03-26 | fix: propaga token HLS para sub-requests, corrige auto-hide e aria-labels | `tests/frontend/videoXhrSetup.test.tsx` | coberto-novo | alto |
| `4ea593f` | 2026-03-26 | fix: índice de translation layers no batch upload e fallback de CDN | `tests/frontend/adminPaineisIndice.test.tsx` | coberto-novo | medio |
| `6615c15` | 2026-03-12 | fix: use _id for Series (MongoDB) and deduplicate Stripe customers | `tests/backend/paymentCheckout.test.js` | coberto-novo | medio |
| `2f30192` | 2026-03-12 | fix: optional chaining on req.cookies in verifyToken to prevent 500 on payment routes | `tests/backend/paymentCheckout.test.js` | coberto-novo | alto |

## 22/10/2026: o conserto cuja metade morava fora do repositório

**Código certo, serviço externo errado.** O `517bb54` (16/09/2026) passou a
tratar `invoice.paid` para renovar a assinatura mensal, e veio com teste de
regressão (`tests/backend/assinaturaPremium.test.js`, cujo cabeçalho descreve a
falha). O teste passava, e sempre passou. Em 22/10/2026, ao listar o endpoint de
webhook da conta do Stripe, apareceu que os eventos assinados eram só
`checkout.session.completed` e `customer.subscription.deleted`: **o `invoice.paid`
nunca foi habilitado no painel**, então o Stripe nunca o enviou e o handler estava
morto em produção havia cinco semanas. Consequência se houvesse assinante:
`premiumExpiresAt` congelado nos 30 dias de `routes/payment.js:183`, anúncio de
volta para quem pagava (`utils/premium.ts:9`) e a pessoa fora da contagem do pool
de royalties (`services/royaltyReportService.js:116-118`). Não atingiu ninguém
porque a conta tinha zero assinaturas ativas.

O teste existente não tinha como pegar: ele faz POST do evento direto no
endpoint, com assinatura válida. Isso prova que o código trata o evento e nada
diz sobre o Stripe mandar. É o primeiro caso neste projeto em que a metade que
faltava do conserto não estava em arquivo versionado nenhum, e a regra do
CLAUDE.md ("o conserto vale para todas as cópias") passa a valer também para
configuração de serviço externo.

O guarda ficou em duas peças: `tests/backend/webhookEventosStripe.test.js`, que
roda offline e falha no instante em que alguém trata um `event.type` novo sem
declarar na lista de `scripts/verificarWebhookStripe.js` — que é exatamente o
instante de habilitar o evento no painel —, e `node scripts/verificarWebhookStripe.js`,
que precisa da chave e por isso roda na VPS, comparando a lista com os
`enabled_events` do endpoint vivo. A falha foi provada reintroduzindo o estado de
16/09 numa cópia isolada (a rota tratando `invoice.paid`, a lista sem ele): dois
dos três testes falham, com a mensagem que diz ao dev para habilitar o evento.

## O que este levantamento achou

**O vício do teste que confere o próprio mock.** O `43e7694` (token do Bunny)
estava descoberto porque o único teste que o commit tocou teve só o *fixture*
atualizado: ele afirma que `hls.loadSource` recebeu a mesma string que o mock
devolveu. `xhrSetup` não aparecia em teste nenhum do projeto. O teste novo
(`signedUrlContrato.test.js`) ataca isso em cadeia: nada é mockado, a URL vem
da rota real, o verificador é travado por um vetor conhecido literal, e um dos
casos congela o relógio e compara a URL inteira com uma string fixa, sem conta
nenhuma dentro do teste.

**Rota de dinheiro sem teste.** `POST /api/payment/create-checkout` não era
tocado por nenhum teste do projeto (`1a3adc3`). Agora é, junto com a
deduplicação de cliente do Stripe (`6615c15`) e o guard de cookie ausente
(`2f30192`).

**Um conserto que hoje é redundante, e o que de fato protege.** O `2f30192`
(optional chaining em `req.cookies`) não pode mais recorrer pelo mesmo caminho,
porque o `cookieParser()` está montado antes de todos os routers. O que protege
isso é um teste de ORDEM DE MONTAGEM, não de comportamento, e é o que
`paymentCheckout.test.js` fixa: o webhook pega `express.raw` antes do
`express.json`, e toda leitura de `req.cookies` no backend usa optional
chaining.

**Cobertura desigual declarada em vez de escondida.** O `935a565` é um pacote
de oito mudanças em que só a fatia cosmética (os `aria-label`) era pega pela
suíte. Foi classificado como descoberto de propósito, para não registrar um
"protegido" que não era.

**Um caso que não é de código.** O `9285a2f` não corrige produção: ele restaura
a FORÇA de um teste que passava com a regressão A2 instalada, porque o cenário
dava 3 de 3 tags à obra e o neutro derivado coincidiu com o neutro da spec. O
teste novo (`pinoNeutroA2.test.js`) fixa justamente isso: um dos casos afirma
que o cenário de 3 de 3 tags é CEGO para a regressão, que é a razão de o pino
existir.

**`9471736` foi a segunda vez.** O `517bb54` (24/09/2026, "preço real no
botão") é que introduziu o `precoPremium ?? getLocalizedPrice()` e, no mesmo
commit, acrescentou a três testes de tela o falso
`getPrecosPremium -> { precos: {} }`, exatamente o caso em que o valor de
reserva aparece. Nenhum teste olhava o texto do botão, então a suíte ficou
verde exercitando o caminho do defeito.

**Duas cópias de defeito seguem no repositório, desligadas.**
`components/SubscriptionTab.tsx:33` exibe o valor fixo de
`utils/localizedPrice.ts` e `components/Premium.tsx:103,124` exibe
`premium_price_display`, campo digitado no painel do admin que nada mantém
igual ao Stripe. Nenhuma tela importa os dois, então não mentem para ninguém e
não dá para testá-los rodando. A trava é estática, em
`appPrecoAssinarBotao.test.tsx`: se alguém voltar a importar um deles, o teste
quebra. O campo "Preço Premium (exibição)" do painel é inerte pelo mesmo
motivo.

## O que ainda não foi inventariado (84 de 136 consertos)

O histórico tem 136 consertos. Foram inventariados os 51 de dinheiro, acesso e
integridade de dados, mais o `9471736`. Os demais estão abaixo. **O agrupamento
foi feito por palavra-chave sobre o título do commit e não é curado**: serve
para dar ordem de grandeza, não para afirmar que cada um é inofensivo. Quem
pegar a próxima leva deve reler os títulos.

Os que eu levaria primeiro na próxima rodada estão marcados com `>>`: mexem em
cobrança, autenticação, navegação ou cabeçalho de segurança.

### player de vídeo e sincronia de áudio (15)

- >> `97b5fb2` 2026-07-10 — fix(pacote2): dark-mode forcado, anuncio em video, banner, metricas e premium expirado
- `136b916` 2026-03-28 — fix: fallback de label quando faixas de áudio HLS têm mesmo lang code
- `c202dbb` 2026-03-26 — fix: auto-hide controls, audio track init e padding do WebtoonReader
- `74c351e` 2026-03-20 — fix: áudio como clock mestre — vídeo ajusta playbackRate para sincronizar
- `2733691` 2026-03-20 — fix: unifica sync de áudio no timeupdate do vídeo (remove setInterval)
- `eb2730b` 2026-03-20 — fix: sync áudio via playbackRate — elimina dessincronia por buffering HLS
- `b78db3d` 2026-03-20 — fix: remove lowLatencyMode HLS — causa lentidão em VOD
- `06623b5` 2026-03-20 — fix: sincronização de áudio event-driven — elimina engasgadas
- `0def96c` 2026-03-20 — fix: elimina stutter causado por preload concorrente e sync excessivo
- `7740194` 2026-03-20 — fix: passa audioTrack1Url/2 ao player + player completo reescrito
- `4ff0900` 2026-03-20 — fix: corrige áudio separado bloqueado por autoplay policy
- `ddf3de5` 2026-03-19 — fix: verificação automática de status de vídeo no Bunny
- `294ce40` 2026-03-19 — fix: redesign VerticalPlayer com controles padrão completos
- `b32a0e5` 2026-03-19 — fix: corrige crash ao abrir vídeo (ep.id undefined) e passa bunnyVideoId ao player
- `67d4a6f` 2026-03-07 — fix: connect frontend to real API, fix HLS player and WebtoonReader panels

### tema, CSS e layout (15)

- `f459900` 2026-09-15 — fix(admin): modal Nova Serie rola em tela de notebook
- `f189740` 2026-09-15 — fix(feeds): capas com a mesma cor no tema claro e no escuro
- `80e412d` 2026-09-15 — fix(conta): aba Conta volta a rolar ate o fim no celular
- `8a07301` 2026-09-11 — fix(feeds): fonte do HI-QUA igual as outras abas, cabecalho menor e frases traduzidas
- `235e2d6` 2026-09-02 — fix(visitante): botao explorar legivel no tema claro
- `fd10efd` 2026-09-02 — fix(visitante): botao explorar legivel no tema claro
- `c3d10e3` 2026-09-02 — fix(mobile): safe-area na nav e no rodape e botao de visitante visivel
- `b766288` 2026-08-20 — fix(superreader): agradecimento e convite de push nao se sobrepoem
- `a139f95` 2026-08-20 — fix(notificacoes): prompt acima do modal que o dispara, lock de clique e guarda de suporte
- `114326b` 2026-03-18 — fix: substitui "L" texto pelo logo SVG oficial no BrandLogo (tela de login)
- `2f5c2c6` 2026-03-18 — fix: corrige inputs invisíveis no tema claro do AdminDashboard
- `a08ae8a` 2026-03-14 — fix: cor do select Tipo de Conteúdo ilegível no modal Nova Série
- `88fa8ae` 2026-03-12 — fix: Admin Dashboard theme support (dark/light)
- `ca3553f` 2026-03-12 — fix: use CSS variable for main content backgrounds to support light mode
- `ff6e0c5` 2026-03-12 — fix: theme toggle position and dark/light mode implementation

### CI, deploy e build (8)

- `c8bcb8e` 2026-07-15 — fix(ci): deploy remoto descarta lock reescrito pelo npm antigo da VPS antes do pull
- `0b3d6c0` 2026-07-14 — fix(ci): deploy remoto usa npm install (npm 10.x da VPS vs lock npm 11)
- `03f9079` 2026-07-14 — fix(ci): alinha npm 11 no workflow e sincroniza package-lock
- `46340c5` 2026-06-06 — fix(twa): adiciona SHA-256 da App Signing Key do Google no assetlinks
- `45e8387` 2026-06-06 — fix(vite): manifest.json em public/ para ser servido como /manifest.json
- `c0f927e` 2026-03-19 — fix: CORS aceita www.lorflux.com além de lorflux.com
- `c1ebde5` 2026-03-18 — fix: suporte a endpoint regional do Bunny Storage via BUNNY_STORAGE_ENDPOINT
- `cdd5e55` 2026-03-06 — fix: downgrade plugin-react to v4 (CJS compat), add MONGO_URI validation, update .env.example with Bunny vars

### documentação, texto legal e i18n (9)

- `f02d0e6` 2026-08-20 — fix(superreader): texto legal preciso sobre a anonimizacao
- `67d9aba` 2026-08-20 — fix(docs): contagem real dos pontos de disparo do push (6, nao 3)
- `ff983e8` 2026-08-20 — fix(docs): contexto e instrucoes de push conferidos contra o codigo real
- `1d7e610` 2026-08-20 — fix(notificacoes): politica descreve com precisao quando o registro do aparelho e apagado
- `d1a95bf` 2026-08-12 — fix(i18n): seletor mostra PORT-BR no lugar de PT (pedido do cliente)
- `019a493` 2026-08-01 — fix(traducao): uma requisicao por obra (cota free do Gemini e 5/min)
- `04cd487` 2026-08-01 — fix(traducao): retry e ritmo controlado contra o limite de cota do Gemini
- `9b9b131` 2026-06-28 — fix(legal): troca e-mail de contato para contato@lorflux.com
- `4cc4538` 2026-02-19 — fix(Auth): Correct capitalization in tagline

### fix rounds internos das Fases 5 e 6 (as mensagens dizem que acrescentaram pinos) (9)

- `501cb7f` 2026-09-04 — fix(curadoria): escalonamento por maturacao, aviso de fechamento persistido e decisao registrada mesmo com falha posterior
- `77edaf2` 2026-09-04 — fix(curadoria): frontend - aba ligada no App, estado por obra, pinos da regra 8 e do code, e acessibilidade do painel
- `96464d4` 2026-09-04 — fix(curadoria): T3 - pinos do GET e do E11000, descricao nao-string, limiter testado e disparo protegido
- `8ac6daa` 2026-09-04 — fix(curadoria): T2 - fronteiras de idade, pino da reavaliacao, resumoMotivos so maduras e guarda de tamanho do aviso
- `1dcb1ae` 2026-09-04 — fix(curadoria): T1 - grave e emAberto derivados, mensagem do ValidationError, pinos e cobertura dos models
- `46b4571` 2026-09-03 — fix(parental): fix round da higiene do Bloco 1 - docs e gaps de CastError
- `3bb9f0b` 2026-09-03 — fix(parental): higiene do Bloco 1 e dividas do Bloco 2
- `76a1955` 2026-09-03 — fix(parental): fecha 2 MEDIAS + 2 BAIXAS do fix round da T7
- `c31e2f8` 2026-09-03 — fix(portal): fecha 2 medios e 4 baixos da revisao da T9

### demais (28)

- `39f1f77` 2026-09-15 — fix(canais): criar canal na aba Canais ja com o e-mail do ilustrador
- `e3391d5` 2026-09-03 — fix(portal): erro de transferencia de dono sinalizado em vermelho
- `c4596e5` 2026-09-02 — fix(portal): gate de upload com try/catch e spec alinhada ao 404
- `d4415bc` 2026-09-02 — fix(portal): valida genre no estado final do PUT e evita arquivar thread sem troca de dono
- >> `e8107dd` 2026-09-02 — fix(navegacao): sentinela unica elimina corrida do back assincrono
- >> `87712ab` 2026-09-02 — fix(navegacao): botao voltar do android fecha camadas antes de sair
- `de12aad` 2026-08-20 — fix(push): renotify apenas quando ha tag, conforme a spec da API
- `d68b6d8` 2026-08-20 — fix(push): ajustes da revisao final - endpoint, renotify, env, doc
- `b6a7c9f` 2026-08-20 — fix(agenda): fechar por escape e backdrop, pilha de z-index deliberada e chave de erro propria
- `80d2e49` 2026-08-17 — fix(progresso): itens menores da revisao final + documentacao
- >> `7824593` 2026-08-17 — fix(progresso): cadencia de gravacao por tipo e flush em segundo plano
- `7dd7b85` 2026-08-17 — fix(progresso): formulario espera onLogin terminar antes de desligar o spinner
- >> `83b36f4` 2026-08-17 — fix(progresso): migracao roda antes da troca de tela, com prazo
- >> `8e9a23c` 2026-08-17 — fix(progresso): getAnonymousId nunca lanca sem crypto.randomUUID
- >> `2a1184e` 2026-08-17 — fix(progresso): valida ObjectId e recupera de corrida no upsert manual
- >> `a3edf9c` 2026-07-15 — fix(avatar): URL publica do avatar usava env inexistente (foto nao aparecia)
- `fbff0df` 2026-07-15 — fix(admin): edicao de titulo/genero/descricao de series e episodios
- >> `90417d0` 2026-07-10 — fix(review): banners de feed em HQCine/VFilm, endsAt inclusivo e cascade retryavel
- >> `431aab9` 2026-06-05 — fix(csp): troca Referrer-Policy no-referrer por strict-origin-when-cross-origin
- `b749d29` 2026-03-21 — fix: renomeia V-FILM → VCINE e subtítulo correto
- >> `db14438` 2026-03-19 — fix: corrige painéis persistindo ao navegar entre views no admin
- `88a2b8f` 2026-03-19 — fix: upload de thumbnail via Bunny Storage em vez de disco local
- `1cf5a65` 2026-03-18 — fix: validação de URL, edição de thumbnail de episódio e fallback no admin
- >> `084fb5d` 2026-03-18 — fix: episódios não apareciam + suíte de testes completa
- >> `67fcf14` 2026-03-12 — fix: correct Stripe checkout endpoint URL (create-checkout-session -> create-checkout)
- `9c19b18` 2026-03-11 — fix: admin access and subview routing
- `67e7ca2` 2026-03-11 — fix: token persistence and offline detection
- `0df3ac4` 2026-03-06 — fix: resolve white screen + update guide.md with remaining tasks

