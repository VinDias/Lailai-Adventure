# Fase 6 — Assinatura no celular e regras de acesso (desenho)

**Contrato:** Fase 6 aprovada e PAGA pelo Vin em 06/10/2026 (R$ 2.000, 3 semanas).
**Fontes:** proposta `docsprivados/Proposta-Fase6-Lorflux-2026-09-26.pdf`; PDF do cliente
"Nova Estratégia de Compartilhamento" (25/09, 7 páginas); roadmap original da Fase 6
(assinatura pela Play + conteúdo exclusivo + e-mail de novidades).
**Levantamento do código:** `docs/superpowers/specs/2026-09-24-fase6-escopo.md` + mapa de
06/10 (abaixo, com arquivo:linha conferido).

---

## 1. O que muda, em uma frase

Hoje o servidor entrega tudo para todo mundo e o Premium só esconde anúncio no cliente.
Depois desta fase, **quem autoriza é o servidor**: visitante só abre obra Teen, conta nova
nasce Teen, e conteúdo Premium exige assinatura ativa — inclusive para quem chega por URL
direta.

## 2. Decisões já fechadas

| Decisão | Valor | Quem decidiu |
|---|---|---|
| Contas que já existem | **Não mudam.** Só conta nova nasce Teen | Fellipe, 06/10 |
| E-mail de novidades | **Resumo semanal automático** dos capítulos novos, com descadastro | Fellipe, 06/10 |
| Ordem das fases | Acesso + assinatura antes do compartilhamento (Fase 8) | Proposta aprovada |
| Catálogo sem classificação | Vin classifica antes da regra ir ao ar (pré-requisito da proposta) | Cliente |

## 3. Estado atual conferido (arquivo:linha)

- **Nenhuma rota considera Premium para acesso.** `routes/content.js:430` diz, em
  comentário, que conteúdo premium é entregue completo a qualquer um; o mesmo vale para
  a listagem (`:352-355`) e a busca (`:47`).
- **Visitante é isento do filtro etário por desenho:** `utils/parentalFilter.js:98`
  devolve `{}` quando não há usuário, e `:137-138` devolve `true` em `serieVisivelPara`.
- **Conta nova nasce `young`:** `models/User.js:47`.
- **Página pública do canal não aplica filtro nenhum:** `routes/channels.js:58`.
- **Marcação de Premium no conteúdo:** `models/Series.js:55` e `models/Episode.js:38`,
  escritas só pelo admin (`routes/content.js:22-23`).
- **Opt-in de marketing já existe:** `models/User.js:22` (`consent.marketing`), escrito em
  `routes/account.js:229-241`.
- **E-mail:** `services/emailService.js` com nodemailer e modelos em HTML inline; **não
  existe descadastro nem envio em massa**.
- **Play Billing:** `routes/mobilePayment.js:16-32` existe, usa a API antiga
  `purchases.subscriptions.get`, não confirma a compra, não amarra o comprovante a um
  usuário e **ninguém no app chama**. Montado em `/mobile` (`server.js:251`), fora do
  `/api` e, portanto, fora do limitador de requisições (`server.js:199`).
- **Detecção do app Android:** não existe nenhuma.
- **Premium "ativo" é checado de três jeitos diferentes** (só a flag, flag + data no
  cliente `utils/premium.ts:6`, e só no relatório de royalties
  `services/royaltyReportService.js:116-119`).

## 4. Desenho

### 4.1 Uma única porta de autorização

Nasce `utils/autorizacaoConteudo.js` com uma função só:

```
autorizarConteudo(user, { serie, episodio }) → { ok: true } | { ok: false, motivo }
motivo ∈ 'nao_publicado' | 'classificacao' | 'login_necessario' | 'assinatura_necessaria'
```

Ordem da verificação, igual à do PDF do cliente: publicação → classificação →
autenticação → Premium. O filtro etário continua em `utils/parentalFilter.js`; a função
nova o chama, não o substitui. **Regra nova do visitante:** sem usuário, a escada passa a
ser a de `teen` (vê `kids` e `teen`), em vez do `{}` de hoje.

### 4.2 Como cada resposta muda

| Situação | Hoje | Depois |
|---|---|---|
| Lista (feeds, busca, agenda, recomendações, continuar, favoritos) | visitante vê tudo | filtro `teen` aplicado na query; obra fora da faixa simplesmente não aparece |
| Detalhe de obra/episódio fora da faixa etária | 200 | **404** (mesmo critério de hoje para draft: não confirma existência) |
| Episódio Premium, visitante | 200 completo | **403** `{ code: 'login_necessario' }` + título e capa, para a tela convidar a criar conta |
| Episódio Premium, logado sem assinatura | 200 completo | **403** `{ code: 'assinatura_necessaria' }` + título e capa |
| Episódio Premium, assinante ativo | 200 | 200 |
| `GET /api/bunny/signed-url` de episódio Premium | assina para qualquer um | mesma regra: 403 sem assinatura ativa |

A distinção 404 × 403 é deliberada: classificação etária esconde (o leitor não precisa
saber que existe), enquanto Premium é um convite comercial (precisa aparecer para vender).

### 4.3 Premium ativo, um conceito só

`utils/premium.js` (backend) ganha `assinaturaAtiva(user)` = `isPremium === true` **e**
(`premiumExpiresAt` ausente **ou** no futuro). Passa a ser a única fonte para rotas,
relatório de royalties e rotina de expiração. Uma tarefa diária desliga `isPremium` de quem
venceu, para o banco não depender só de webhook.

### 4.4 Conta nova nasce Teen

`models/User.js:47` muda o default para `'teen'`. **Nenhuma migração**: contas existentes
ficam como estão (decisão do Fellipe). O cadastro (`server.js:376-445`) não grava
`parental`, então herda o default novo automaticamente.

### 4.5 Assinatura pela Google Play

- **App:** detecção do TWA por `document.referrer` começando com `android-app://com.lorflux.twa`,
  gravada na sessão; dentro do app, o botão passa a usar a Digital Goods API + Payment
  Request; fora, segue o Stripe de hoje.
- **Servidor:** `/mobile` passa a `/api/mobile` (entra no limitador); verificação migra
  para `purchases.subscriptionsv2.get`; **confirma a compra** (sem isso o Google estorna em
  3 dias); grava `PlayPurchase { purchaseToken (único), orderId, userId, productId, estado,
  expiraEm }` — é o índice único que impede o mesmo comprovante virar Premium em várias
  contas; `productId` validado contra lista fixa.
- **Avisos do Google (RTDN):** rota nova `POST /api/mobile/notificacoes` recebendo o
  Pub/Sub, tratando renovação, cancelamento, suspensão, retomada, reembolso e revogação.
- **Preço:** vem do Play no app; no site segue o Stripe (`GET /api/payment/precos`, já no ar).

### 4.6 Resumo semanal de novidades

- Destinatários: `consent.marketing === true`.
- Conteúdo: capítulos publicados nos últimos 7 dias, respeitando a classificação da conta
  (não adianta anunciar o que a pessoa não pode abrir).
- Descadastro: link com token assinado (`/api/account/novidades/descadastrar?token=`), sem
  exigir login, mais cabeçalho `List-Unsubscribe`.
- Envio em lote com registro do que saiu, para não duplicar se a tarefa rodar duas vezes.

## 5. Tarefas

| # | Tarefa | Depende de | Estado |
|---|---|---|---|
| T1 | `autorizarConteudo` + `assinaturaAtiva` + aplicação nas rotas de lista e de documento | — | **feita** (`363af62`) |
| T2 | 403 com código e convite na UI (criar conta / assinar), telas do leitor | T1 | **feita** (`6e0f19c`) |
| T3 | Conta nova em Teen + canal público entrando no filtro (`channels.js:58`) | T1 | **feita** — ver 5.1 |
| T4 | Rotina diária de expiração + unificação do conceito de assinante | T1 | **feita** (`c2cf3ed`) |
| T5 | Play Billing no app e no servidor (produto, confirmação, vínculo, RTDN) | Play Console | **bloqueada** (acesso externo) |
| T6 | Resumo semanal + descadastro | — | **feita** |
| T7 | Re-pinagem dos testes antigos + E2E no app real | T1..T6 | **feita** — ver 5.3 |

### 5.1 T3 — o que a conferência achou

O levantamento marcou `routes/channels.js:58` como "página do canal sem filtro
parental". Conferido: a rota **não devolve obra nenhuma** — só nome, descrição,
avatar, banner e dono. A grade do canal é montada no cliente a partir de
`GET /content/series` (`components/CanalPublico.tsx:55-61`), que já passa pelo
filtro desde a T1, e nenhuma rota pública lista série por canal no servidor.
Não havia vazamento, então **não houve mudança de código**; o que entrou foram
duas asserções em `tests/backend/parentalListSurfaces.test.js` que quebram se
alguém acrescentar um catálogo ao shape do canal.

### 5.2 T6 — como o resumo semanal ficou

- **Quando:** varredura de hora em hora (molde da T4), agindo só na segunda
  12h UTC. Um `setInterval` de 7 dias nunca dispararia, porque o processo
  reinicia a cada deploy. Não há cron na VPS para o Fellipe manter à parte.
- **Não repete:** índice único `(userId, periodo)` em `models/EnvioNovidades.js`,
  com o registro criado ANTES do envio (molde do `notificationSentAt` do push).
  Falha de SMTP apaga o registro e devolve a vez ao próximo tique.
- **Período** é a semana ISO (`2026-W41`), não uma data: qualquer tique da mesma
  semana reconhece o mesmo período.
- **Recorte etário** pelo predicado puro `passaFiltroParental`, sem exceção de
  admin nem de dono (mesma escolha do push, ledger P5). Obra que chega com
  `content_rating`/`tags` ausentes do documento fica fora e o lote continua.
- **O que conta como novidade:** episódio `published`, obra publicada e conteúdo
  presente (painéis ou vídeo) — mesma definição de "consumível" do push. A data
  é `createdAt`, o proxy de recência já usado em
  `services/recommendationService.js:575`; não existe `publishedAt` e criar um
  exigiria backfill do acervo para um ganho que o fluxo real não tem.
- **Descadastro** por HMAC do id da conta (`NEWSLETTER_SECRET`, ou `JWT_SECRET`),
  não por token guardado: o e-mail fica anos na caixa de entrada, e um token com
  prazo deixaria de funcionar justamente quando a pessoa quisesse sair. Rota sem
  login, GET (página) e POST (One-Click do RFC 8058), mais os cabeçalhos
  `List-Unsubscribe` e `List-Unsubscribe-Post`.
- **Consentimento informado:** o botão em `components/PrivacyCenter.tsx` já
  existia e não fazia nada; passou a dizer o que chega e com que frequência.

### 5.3 T7 — o que o E2E no app real achou

Percurso completo no Chrome do projeto, contra a build servida pelo proprio
Express (mesma topologia da producao, sem proxy do Vite), com acervo semeado:
obra Teen livre, obra Young e obra Teen Premium.

Confirmado na tela: visitante ve so as duas Teen; obra Young nao aparece;
obra Premium abre a tela de convite; conta logada sem assinatura ve "Quero
assinar"; assinante le os paineis. Pela API, a matriz inteira (404 de
classificacao, 403 com codigo, 200 para assinante e admin) responde como
desenhado.

**Tres defeitos que so apareciam na tela** e que os testes de componente nao
pegavam, porque entregam `obra` ja montado ao componente:

1. `services/api.ts` nao copiava `obra` do corpo do 403 para o Error. A tela
   caia no fallback e mostrava o titulo do EPISODIO, sem capa — o oposto de
   uma oferta. O servidor sempre mandou certo.
2. `bloqueio.semConta` dizia "Esta obra e para maiores". `login_necessario` so
   acontece em conteudo PAGO (classificacao responde 404, nunca 403), entao o
   texto descrevia obra paga como obra adulta. Reescrito nos quatro idiomas.
3. O botao "Criar minha conta" abria o formulario de LOGIN, com o cadastro
   atras de um link. `Auth` ganhou `modoInicial` (padrao 'login', nada mais
   muda) e o convite abre direto no cadastro.

Nota de ambiente, para quem for repetir: o helmet manda HSTS, entao o Chrome
passa a forcar https em qualquer HOSTNAME usado uma vez em http e os assets
morrem com ERR_SSL_PROTOCOL_ERROR. Testar por 127.0.0.1, que o HSTS nao
alcanca (RFC 6797 nao se aplica a IP), e manter FRONTEND_URL igual a origem
usada no navegador, senao o CORS devolve 403 ate para os assets.

## 6. Riscos registrados

1. **Imagem de painel é URL pública no CDN.** Fechar a rota impede a navegação casual, mas
   quem já tem o endereço direto do arquivo continua abrindo. Fechar de verdade exige token
   no pull zone do Bunny (a chave `BUNNY_TOKEN_KEY` já existe para vídeo). **Decisão:** esta
   fase fecha a API; o token de imagem fica registrado como trabalho separado.
2. **`/uploads` e `/thumbnails` são servidos sem proteção** (`server.js:216,222`) — resíduo
   anterior ao Bunny; conferir se ainda há conteúdo vivo ali.
3. **Testes que fixam o comportamento atual** (visitante vê tudo, premium para todos, conta
   nova `young`): cerca de 40 asserções em 12 arquivos, mapeadas no levantamento de 06/10.
   Elas serão **reescritas uma a uma**, cada uma declarando a regra nova — nunca apagadas
   para "ficar verde".
4. **Catálogo sem classificação some para visitante.** Pré-requisito do cliente; sem isso a
   home fica vazia para quem não tem conta.
5. **Play Console e keystore** são bloqueios externos para a T5.
6. **O resumo semanal carrega todos os destinatários em memória** e envia em
   série (`User.find({'consent.marketing': true})`). Proposital enquanto a base é
   pequena — o SMTP da Hostinger tem limite por minuto e o resumo não tem pressa.
   Quando a base crescer, paginar por cursor e lotear o envio.
7. **`createdAt` é imutável no Mongoose** quando o schema tem `timestamps`: um
   `$set` pelo model é descartado em silêncio, mesmo com `{timestamps: false}`.
   Datar episódio no passado (testes da janela semanal) exige a coleção nativa.
   Achado ao escrever `tests/backend/novidadesSemanais.test.js`, onde isso tinha
   passado como teste verde pelo motivo errado.
