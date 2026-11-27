# Regressões

Bug corrigido que volta é o problema que mais se repete. Esta tabela diz, para
cada conserto, qual teste impede a volta dele.

Suíte inteira do projeto: `npm run test:all` (frontend com jsdom, backend com
mongodb-memory-server). Em 04/11/2026: **59 arquivos e 656 testes no frontend,
46 e 1261 no backend**, todos passando. Desde 04/11 o `test:all` roda as duas
metades sempre (`scripts/testarTudo.js`) e o frontend sobe no máximo 4 workers
(`vite.config.ts`), porque com o servidor carregado 9 arquivos nem iniciavam.

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
| (branch `fix/retorno-vin-27-11`, item 2) | 2026-11-27 | video do autor pronto e "Enviar capitulo" recusado com aviso em vermelho ("podera ir para aprovacao em 13 minuto(s)"); nada na Fila de Aprovacao. Era a espera pela validade da autorizacao de envio (item 10), que os testes nunca exercitaram porque venciam a autorizacao a mao antes de cada envio | `tests/backend/videoFilaAprovacao.test.js` — _video pronto: o episodio vai para a fila NA HORA_ e _caso do print-2 e do print-3_ (e mais 3 da conferencia na aprovacao); `tests/backend/videoAutor.test.js` (validade minima); `tests/frontend/videoFilaAprovacao.test.tsx` — _a confirmacao sai em verde_ | coberto-novo | alto |
| (branch `fix/retorno-vin-27-11`, item 1) | 2026-11-27 | player de video mostrava quatro botoes de idioma com o mesmo texto ("English"): o Bunny marca todas as faixas com o mesmo idioma e o player traduzia o codigo faixa por faixa; o video enviado pelo AUTOR (frente A, item 9) nao tem os nomes que o admin digita (`hlsAudioLabels`). **Segunda vez**: `136b916` (28/03) consertou e `1073485` (10 minutos depois) apagou o conserto, sem teste | `tests/frontend/rotulosDeAudio.test.tsx` — _video do autor com quatro faixas "en" NAO mostra quatro botoes "English"_ (e mais 10) | voltou, coberto-novo | medio |
| (branch `fix/sem-barreira-de-mb`) | 2026-11-27 | o autor era barrado pelo peso do episodio (padrao de 20 MB no Setting `limite_mb_episodio`) no envio da pasta, na conferencia e na troca de arquivo pela grade, contra o pedido do cliente de 26/11 ("nao barrar o autor pela quantidade de megabytes") | `tests/backend/envioEpisodio.test.js` — _sem limite de MB por episodio no padrao_ (5 testes); `tests/backend/edicaoPaineis.test.js` — _sem Setting NAO ha limite de MB_ (e mais 2); `tests/backend/organizacaoEpisodio.test.js` — _pasta de 25 MB e de 300 MB passam sem opcao nenhuma_; `tests/frontend/envioPastaEpisodio.test.tsx` — _sem limite de MB (padrao): pasta de 21 MB nao mostra aviso de megabytes_; `tests/frontend/adminLimitePaineis.test.tsx` — _limite de MB por episodio e opcional_ | coberto-novo | alto |
| (branch `fix/balao-lote-paralelo`) | 2026-11-24 | balao (camada de idioma) enviado em LOTE se perdia: admin e Meu Estudio gravam em paralelo, `setTranslationLayer` salvava a lista inteira de paineis e os pedidos seguintes davam VersionError (rota 500; medido 23/11: 1 de 10 gravados pela rota do admin). No admin o arquivo ja aparecia "concluido" e o erro nao aparecia; no reenvio, falhas salteadas iam para o painel vizinho | `tests/backend/balaoLoteParalelo.test.js` — _10 baloes em paralelo, os 10 gravados_ (servico e as duas rotas, mais 5: troca e acrescimo no mesmo painel, idioma duplicado, remover junto, leitura antiga da conflito, validacoes); `tests/frontend/balaoLoteErroAdmin.test.tsx` e `tests/frontend/balaoLoteErroPortal.test.tsx` (erro visivel, so fica ok o que gravou, reenvio no mesmo painel) | coberto-novo | alto |
| (este PR) | 2026-11-19 | `GET /api/content/series/:id/episodes` devolvia o documento inteiro do episodio Premium (URLs dos paineis e das camadas de idioma, `video_url`, `bunnyVideoId`, faixas de audio) a visitante, conta gratuita e assinatura vencida: o 403 do detalhe e da URL assinada (Fase 6, `363af62`) era contornavel pela lista. A rota nem lia o `isPremium` da serie | `tests/backend/premiumListaEpisodios.test.js` — _visitante sem conta: episodio pago aparece na lista SEM midia_ (e mais 8: conta gratuita, vencida, assinante, dono, admin, obra mista, detalhe e signed-url); `tests/frontend/videoBloqueadoDaLista.test.tsx` (player mostra o convite com o item sem midia) | coberto-novo | alto |
| `cb3e7e0` (verificador) + nginx da VPS | 2026-11-04 | o limite de requisicoes e a anti-fraude do engajamento usavam o IP da borda do Cloudflare como se fosse o visitante (nginx sem `real_ip`, `trust proxy 1`): limite dividido entre desconhecidos e visualizacoes de pessoas diferentes descartadas como duplicata | **sem teste offline** (o conserto mora em `/etc/nginx/conf.d/cloudflare-real-ip.conf`); guarda: `node scripts/verificarLimiteRequisicoes.js`, de fora e sem segredo, exige o contador caindo de um em um | coberto-externo | alto |
| `14dd134` | 2026-11-04 | seis `setTimeout` do `AdminDashboard` nunca cancelados: o timer da criacao anterior fechava o modal "Nova Serie" reaberto dentro de 1,5 s, o novo modal herdava a mensagem de sucesso, e na suite o timer disparava depois do jsdom desmontado (`window is not defined`, rodada com codigo 1 e todos os testes passando) | `tests/frontend/adminDashboardTimers.test.tsx` — _fechar na mao e reabrir "Nova Serie" dentro de 1,5 s: o modal novo continua aberto_ (e mais 2: mensagem herdada, desmonte cancela os timers) | coberto-novo | baixo |
| `46340c5` | 2026-10-27 | `assetlinks.json` ficou com a chave de upload **perdida** (`84:3C:...`) e sem a chave nova (`83:F3:...`) depois da redefinicao de 22/10: APK de teste abre com a barra do Chrome (parece build quebrado) e a chave fora do nosso controle continuava podendo abrir as URLs de lorflux.com | `tests/backend/assetLinksChaves.test.js` — _declara a chave de UPLOAD em vigor_ e _nao declara nenhuma chave revogada_, mais `node scripts/verificarAssetLinks.js` para o que o site serve e o que o Google tem em cache | coberto-novo | alto |
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

## Retorno do cliente em 27/11/2026 (branch `fix/retorno-vin-27-11`)

Cinco apontamentos do Vin depois da publicacao da frente A (99, 27/11, 18:17 a 19:14). Um commit por item.

### Item 1: quatro botoes "English" no player de video (VOLTOU)

**O que o cliente viu (print-4).** "Parece que a orientacao de audio quebrou
tambem. So aparece a lingua inglesa." Quatro botoes de idioma, todos "English".

**Causa.** O Bunny Stream marca todas as faixas de audio com o mesmo idioma
(`en`) quando o arquivo nao diz o idioma de cada uma. O `VerticalPlayer`
escolhia o texto do botao assim: nome digitado pelo admin (`hlsAudioLabels`),
senao a traducao do codigo do idioma, faixa por faixa. Nos videos que o admin
envia isso ficava escondido, porque ele digita os nomes em "Faixas de Audio".
O video enviado pelo autor (frente A, item 9, `d5b495e`) nasce sem nomes, e o
autor nao tem onde digita-los. Os commits da frente A nao mexeram na escolha do
texto (`5232579` so acrescentou a prop `previa`): o que mudou foi existir video
sem os nomes.

**Ja tinha acontecido.** `136b916` (28/03/2026, "evitar todos os botoes
mostrarem English") consertou no player. `1073485`, dez minutos depois, criou
o editor de nomes e trocou o conserto por `hlsAudioLabels?.[i] || LANG_LABELS[...]`.
Nao havia teste, entao ninguem viu o conserto sair. Estava na lista "o que
ainda nao foi inventariado" (player de video).

**Conserto.** A regra saiu do JSX para `utils/rotulosDeAudio.ts`: nome do
admin; senao o idioma, se nenhuma outra faixa tem o mesmo; senao o nome que
veio do video, se for unico; senao a ordem combinada da plataforma (1a PT-BR,
2a English, 3a Espanol, 4a chines, a mesma dos exemplos do editor do admin);
senao "Faixa N". Dois botoes nunca saem iguais. Um botao por faixa do video.

**Prova.** Com o `VerticalPlayer.tsx` de `origin/main` (1486a0e) numa copia no
scratchpad, 4 dos 11 testes falham (os 4 que montam o player com faixas
iguais); com o conserto, 11 de 11.

**Sem teste (so no aparelho ou no Bunny).** Se a 1a faixa do arquivo do autor
e mesmo a de portugues. Quando nao for, o admin corrige em Gerenciar Conteudo,
"Faixas de Audio". O autor ainda nao tem esse campo no Meu Estudio.

### Item 2: "Enviar capitulo" de video recusado por 13 minutos, fila vazia

**O que o cliente viu (print-2 e print-3).** Video pronto, clicou "Enviar
capitulo" e apareceu em vermelho "O video acabou de ser enviado. Por
seguranca, este episodio podera ir para aprovacao em 13 minuto(s)...". Na Fila
de Aprovacao, "Nenhum item pendente". Ele leu como erro.

**Nao voltou: era regra nossa (item 10, `5232579`), decidida sem perguntar.**
O episodio so ia para a fila depois de vencer a autorizacao de envio do autor
(15 minutos no minimo). A fila estava vazia porque o envio tinha sido
RECUSADO: o episodio do print-2 ainda era rascunho. A consulta da fila
(`GET /api/admin/aprovacoes`) nunca filtrou por obra publicada nem por dono.

**Por que os testes nao pegaram.** `obraComEpisodio` vencia a autorizacao a
mao (`vencerAutorizacao`) antes de cada envio; so um teste olhava o caso real,
e ele PINAVA a espera como comportamento certo. Consertado: o ajudante deixou
de vencer a autorizacao, entao o arquivo inteiro passa pelo caso real.

**Conserto.** A espera saiu de `POST /api/portal/episodios/:id/enviar` e de
`POST /api/admin/aprovacoes/episodes/:id/aprovar`; `travaDeEnvio` e
`mensagemDaTrava` foram apagadas. Ficou, e foi reforcado, o que protege o
moderador de aprovar um video trocado por fora: (1) validade da autorizacao de
envio com minimo de 5 minutos (era 15; sem tamanho era 2 horas, agora 5
minutos; renovacao 5 minutos); (2) `aplicarStatusDoBunny`: video que muda no
Bunny depois de pronto tira o episodio da fila, e em publicado so registra no
log; (3) novo `conferirAntesDeAprovar`: a aprovacao consulta o Bunny e recusa
(409, episodio sai da fila) se o video deixou de estar pronto; Bunny sem
resposta nao trava a moderacao. No Meu Estudio o envio que deu certo mostra
uma confirmacao em verde (`role="status"`).

**Prova.** Com `videoAutorService.js`, `portal.js` e `adminPortal.js` de
`origin/main` numa copia: 14 dos 38 testes de backend falham. Com o
`PortalEstudio.tsx` de `origin/main`: 2 dos 14 de frontend falham.

**O que nenhum teste garante.** O Bunny de verdade: se ele aceita um segundo
arquivo para um video que ja tem um, se avisa (webhook) quando isso acontece,
e se aceita a renovacao da assinatura no meio de um envio longo (com a
validade menor, video acima de ~75 MB em conexao lenta depende dela). Troca
cujo aviso se perde E que termina de processar antes de o moderador aprovar
nao e detectada.

## 27/11/2026: o autor barrado por megabytes (limite de 20 MB por episodio como padrao)

**Nao voltou: e mudanca de regra pedida pelo cliente.** Em 25/11 o Vin deu os
limites de 100 paineis e 20 MB por episodio, e os dois entraram como padrao.
Em 26/11/2026 17:01 ele escreveu: "Sobre o peso, mantenha a liberacao para
nao barrar o autor pela quantidade de megabytes. Deixe o foco apenas no
limite dos 100 paineis e na compressao automatica do sistema." O codigo
publicado continuava barrando por megabytes em tres pontos de entrada.

**Onde barrava (todas as copias da regra).**
- `shared/organizacaoEpisodio.mjs`: `LIMITE_MB_EPISODIO_PADRAO = 20`, problema
  `limite-tamanho` (impede). E a regra usada pela tela E pelo servidor.
- `services/envioEpisodioService.js`: `lerLimiteBytes` caia nos 20 MB sem
  Setting; `iniciarEnvio` recusava a pasta (400); `receberParte` recusava com
  413 "passaram do tamanho esperado" acima de 3x o limite (`FOLGA_DO_CORTE`);
  `conferirTetoNaTroca` devolvia 413 "passa do tamanho maximo" na troca de
  imagem ou balao pela grade (`services/edicaoPaineisService.js`, `987868e`).
- `components/EnvioEpisodio/ConferenciaEnvio.tsx`: "Tamanho: X de 20 MB" e o
  aviso "somam X; o limite e Y", com o Enviar bloqueado.
- `components/Admin/AdminDashboard.tsx`: o campo dizia "vazio = 20".

**O conserto.** O padrao passou a ser SEM limite (`LIMITE_MB_EPISODIO_PADRAO
= 0`). Setting `limite_mb_episodio` ausente, vazio, 0 ou ilegivel = sem
limite: `limiteBytes` 0 na config, `tetoBytes` 0 no envio (sem teto nas
partes) e a troca pela grade nao confere o peso do episodio. Um numero > 0 no
admin liga tudo de novo, como era (limite sobre os originais, teto de 3x no
que chega, 413 na troca). A conferencia mostra so "Tamanho: X." quando nao ha
limite. O campo do admin diz "vazio ou 0 = sem limite". Continuam valendo:
100 paineis depois do corte, 8 MB por parte e por arquivo que sobe inteiro
(protecao da memoria do servidor, problema `arquivo-grande`), altura maxima
de 1280 px e o corte automatico. O limite de video (`limite_mb_video`) nao
foi tocado.

**Atencao no deploy.** Se o banco de producao tiver o Setting
`limite_mb_episodio` gravado com um numero (por exemplo 20, salvo pela tela
Configuracoes), o limite continua LIGADO depois do deploy: e a opcao do
admin. Para valer o pedido do cliente, o campo tem de ficar vazio ou 0.

**Testes (um por ponto de entrada), todos falhando no codigo antigo** (prova
em 27/11 numa copia do `HEAD` de `origin/main` no scratchpad com os testes
novos; 8 falharam: `expected 413 to be 200` na grade, `expected 20971520 to
be +0` na config, `[ 'limite-tamanho', 'limite-paineis' ]` no envio de 60 MB,
"Tamanho: 21 MB de 0,0 MB" na tela, placeholder `20` no admin):
- envio da pasta: `tests/backend/envioEpisodio.test.js`, bloco "sem limite de
  MB por episodio no padrao" (21 MB e 240 MB aceitos por autor e admin,
  Setting vazio ou 0, 100 paineis continuam valendo, Setting 30 liga de novo,
  partes sem teto);
- troca pela grade: `tests/backend/edicaoPaineis.test.js` ("sem Setting NAO
  ha limite de MB", "Setting vazio ou 0", "com o Setting em 30 o limite volta
  a valer");
- regra compartilhada: `tests/backend/organizacaoEpisodio.test.js`;
- conferencia: `tests/frontend/envioPastaEpisodio.test.tsx` ("sem limite de
  MB (padrao)");
- admin: `tests/frontend/adminLimitePaineis.test.tsx` ("e opcional").
Os testes antigos que fixavam os 20 MB como padrao passaram a ligar o limite
de forma explicita (Setting ou opcao) e cobrem o caso "limite ligado".

## 27/11/2026: botoes pequenos demais para o dedo na grade de paineis (celular)

**Nao voltou: apareceu agora**, no primeiro teste da grade (frente A, item 6)
em navegador de verdade. Em emulacao de Pixel 7 (412 px de largura, duas
colunas de 157 px) o selo de idioma de cada painel (PT/EN/ES/ZH, que abre a
janela do balao) tinha 30x18 px, e os botoes de apagar, trocar imagem e
selecionar tinham 24 a 25 px. O minimo de alvo de toque da WCAG 2.2 e 24 px;
o selo ficava abaixo e o apagar ficava colado no trocar imagem. Funcionava
(o roteiro tocou e apagou), mas errar o dedo era facil.

**Como foi achado e medido.** `tests/e2e/roteiroFrenteA.cjs` abre a grade
como autor no celular e mede cada botao com `getBoundingClientRect`. Antes:
apagar 25x25, trocar 25x25, selecionar 24x24, selo 30x18. Depois: 29x29,
29x29, 28x28, 30x30, sem rolagem lateral.

**O conserto.** `components/EnvioEpisodio/GradePaineis.tsx`: no celular (sem
o prefixo `sm:`) os botoes ganham mais area (`p-2`, `w-7 h-7`, `py-2`); do
`sm:` para cima fica como era. Unica copia da grade (Meu Estudio e Gerenciar
Conteudo usam o mesmo componente). Pino na suite:
`tests/frontend/gradePaineis.test.tsx` ("no celular os botoes da grade tem
alvo de toque maior que no desktop"), que falha com o componente antigo
(provado numa copia em 27/11: `expected [...'py-0.5'...] to include 'py-2'`).
jsdom nao mede tela: o pino confere as classes; a medida em pixels so roda no
roteiro E2E, que nao faz parte do `npm run test:all` (precisa do Chromium do
Playwright).

No mesmo roteiro, conferidos e SEM defeito: itens 5, 6, 7 e 8 da frente A
pela tela (envio de pasta, grade, fila do moderador, edicao de publicado),
no desktop e em Pixel 7, e a emenda entre fatias do conserto de 25/11
(queda de brilho 0,4 no HaQa Stone EP3).

## 25/11/2026: a linha fina entre duas fatias da mesma pagina, no celular

**Nao voltou: apareceu agora.** Era o risco R2 do recorte de 23/11. Com a
frente A, uma pagina alta vira varias fatias de 1280 px que se encaixam sem
emenda no desenho. No celular o leitor reduz a imagem de 800 px para a
largura da tela, a altura de cada painel fica fracionaria (1280 x 412/800 =
659,2 px) e o navegador deixa uma fresta de um pixel do fundo preto entre os
paineis. No desktop (800 px, sem reducao) nao acontece. As fatias em si estao
certas: a ultima linha de uma e a primeira da seguinte tem o mesmo brilho.

**Como foi achado e medido.** `scripts/e2eEnvioPasta.cjs` posta o HaQa Stone
EP3 do Vin pelo Meu Estudio e tira print do leitor em emulacao de Pixel 7
com uma emenda no meio da tela; compara o brilho da linha da borda com o das
vizinhas. Antes do conserto: queda de 50 a 58. Depois: 0. Desktop: 0 nos dois.

**O conserto.** `components/WebtoonReader.tsx`: cada painel depois do
primeiro sobe 1 px sobre o anterior (`-mt-px`). Unica copia do leitor de
paineis no repositorio. Pino na suite: `tests/frontend/reader.test.tsx`
("emenda entre fatias"), que falha sem a classe; a medida de pixels so roda
no roteiro E2E (precisa do Chromium).

## 24/11/2026: o balao do lote que o servidor recusava calado

**Nao voltou: nunca tinha sido consertado.** Os consertos de painel anteriores
(`4ea593f`, `f371353`) eram de INDICE (qual painel recebe a camada). Este e de
concorrencia: o lote grava um pedido por painel ao mesmo tempo, e o servico
lia o episodio, mexia num painel e salvava a lista inteira com a versao do
documento (`__v`). So o primeiro pedido passava.

**Por que a suite nao pegou.** Os testes do frontend mockam a API, entao todo
pedido "dava certo"; os de backend (`portalCrud.test.js`) gravavam um balao
por vez. Nenhum teste mandava dois pedidos juntos. O teste novo faz o que a
tela faz: 10 pedidos em paralelo, pelo servico e pelas duas rotas.

**O conserto.** `services/episodePanelService.js` grava a camada com
`updateOne` no proprio painel (`panels.<i>.translationLayers`), sem ler e
salvar a lista; o DELETE da camada usa `$pull` (`removeTranslationLayer`).
As duas operacoes fazem `$inc: { __v: 1 }`, para quem ainda salva a lista
inteira a partir de leitura antiga (DELETE de painel, `splice` + `save`)
receber conflito em vez de apagar o balao novo. Nos clientes, o arquivo so
fica "ok" depois de gravado, cada falha aparece com o numero do painel e o
reenvio volta ao painel do primeiro envio.

**O que continua aberto.** Apagar um PAINEL no meio de um lote de baloes
desloca os indices (o balao vai para o painel que subiu de posicao). Nao
medido nem consertado: e outro defeito.

## 19/11/2026: o Premium fechado na porta e aberto na lista

**Nao voltou: nunca tinha sido fechado.** A Fase 6 (`363af62`, 07/10/2026)
criou a porta unica `autorizarConteudo` e a aplicou ao detalhe do episodio e a
URL assinada do video. O levantamento da propria fase
(`docs/superpowers/specs/2026-10-06-fase6-assinatura-acesso-design.md`, secao 3)
listava a LISTA de episodios entre as rotas que entregavam tudo, mas a tabela
4.2 do desenho so tratou a lista para o filtro de idade. A tarefa T1 foi
marcada como feita "nas rotas de lista e de documento", e a lista ficou de fora.

Antes disso, de 08/07 (`bffb6ce`) a 07/10/2026, entregar o Premium a todos era a
regra combinada (Premium = sem anuncio). Um conserto de 23/05 (`33578ce`) tirava a
midia paga do detalhe e foi desfeito de proposito em 08/07. Nenhum dos dois tocou a lista.

**Por que a suite nao pegou.** Os testes da lista em `content.test.js`
conferiam so o TITULO ("episodio premium tambem aparece para nao-premium"),
que e o comportamento certo da vitrine, e os episodios Premium desses testes
nao tinham midia nenhuma. Nenhum teste perguntava se a URL do painel saia. O
teste novo cria episodios com painel, camada de idioma, video e audio e
procura qualquer URL deles no JSON inteiro, nao so nos campos conhecidos.

**O conserto e de lista do que pode sair.** `episodiosParaLista` em
`utils/autorizacaoConteudo.js` copia so os campos de vitrine
(`CAMPOS_DE_VITRINE`) do episodio bloqueado; campo de midia novo no schema
fica de fora sem ninguem lembrar. A decisao continua em `autorizarConteudo`.

**O que a API nao resolve.** Paineis, capas e audios ficam na zona de
armazenamento da Bunny com URL publica e sem token
(`routes/bunnyWebhook.js:254,336,401`): o nome tem relogio em milissegundos e
~52 bits aleatorios, entao nao e adivinhavel, mas quem ja tem a URL abre para
sempre e pode repassar. O video depende da Token Authentication estar ligada
na zona da biblioteca do Stream, o que nao e conferivel daqui.

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

**Fechado em 27/10/2026.** `node scripts/verificarWebhookStripe.js` na VPS
responde `https://lorflux.com/api/payment/webhook [enabled]` com os três
eventos assinados, `invoice.paid` entre eles: `ok`. A metade do conserto que
morava fora do repositório entrou. O endpoint é o domínio sem `www`, e isso foi
conferido no mesmo dia porque o Stripe não segue redirecionamento: o apex serve
o app direto (POST devolve 400 de assinatura inválida, igual ao `www`), não
redireciona, então a entrega chega.

## 27/10/2026: o mesmo padrão, agora no Digital Asset Links

**Segunda vez que a metade do conserto mora fora do código.** A chave de upload
original ficou no computador que foi formatado; a redefinição foi pedida ao
Google em 22/10 e a chave nova passou a valer em 24/10 às 23:33. O
`public/.well-known/assetlinks.json` não foi atualizado junto e ficou declarando
a chave de assinatura do app (certo) mais a chave de upload **perdida**
(errado), sem a nova. Nenhum teste existia sobre esse arquivo: a única
conferência era `$ExpectedFingerprint` em `scripts/build-twa.ps1`, que roda só
na máquina Windows do Fellipe, só na hora do build, e que tinha a chave perdida
escrita dentro — ou seja, o verificador validava o valor errado.

Os dois efeitos apontam para lados opostos, e nenhum deles grita. O
`bubblewrap build --apk`, que é o teste em aparelho antes de subir o AAB, assina
com a chave de upload; sem ela declarada o app abre com a barra de endereço do
Chrome em cima, que é o sintoma clássico de assetlinks errado, e quem não
soubesse do histórico iria procurar o defeito no build ou no manifest. Do outro
lado, a chave perdida continuava recebendo delegação para abrir as URLs de
lorflux.com, que é exatamente o que a redefinição existe para encerrar.

Isso foi achado ao preparar o AAB que destrava a compra dentro do app, que é o
caminho crítico da entrega da Fase 6.

O guarda ficou em duas peças, como no caso do Stripe:
`tests/backend/assetLinksChaves.test.js`, que roda offline sobre o arquivo
versionado e exige a chave de assinatura, exige a chave de upload em vigor,
recusa chave revogada e recusa impressão desconhecida; e
`node scripts/verificarAssetLinks.js`, que compara o arquivo versionado com o
que o site serve de verdade e com o que a API do Digital Asset Links tem em
cache (até 1 hora de atraso), e não precisa de segredo nenhum para rodar. A
falha foi provada contra o arquivo real antes da correção, que era o estado
defeituoso em produção: dois dos cinco testes falham, nomeando a chave que falta
e a que sobra.

Trocar a chave de upload de novo significa trocar uma linha em
`scripts/verificarAssetLinks.js` e fazer deploy do site. O teste falha até que
as duas coisas aconteçam.

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
- `136b916` 2026-03-28 — fix: fallback de label quando faixas de áudio HLS têm mesmo lang code (**voltou em 27/11/2026**, desfeito por `1073485`; agora coberto por `tests/frontend/rotulosDeAudio.test.tsx`)
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

