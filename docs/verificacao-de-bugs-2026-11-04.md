# Verificação de bugs — 04/11/2026

Varredura feita antes de planejar o fechamento das frentes abertas. O que foi
olhado, sem precisar de chave nem de login:

- suíte inteira (`npm run test:all`), duas vezes;
- checagem de tipos (`npx tsc --noEmit`);
- dependências de produção (`npm audit --omit=dev`);
- a produção pelo lado de fora, como um visitante: catálogo, preços, settings
  públicos, cabeçalhos de segurança, redirecionamentos, Digital Asset Links e o
  contador do limite de requisições.

O que **não** dá para ver daqui e ficou marcado como "conferir na VPS": o
`.env` de produção, o `pm2 list` e a configuração do nginx.

Severidade pensada **para o que vem a seguir**: o cliente anunciou propaganda
paga em massa nas redes assim que a postagem estiver pronta. O que é baixo com o
tráfego de hoje pode ser alto com o tráfego de campanha.

---

## Resumo

| # | Severidade | O quê | Onde mexe |
|---|---|---|---|
| 1 | **alta** | o limite de requisições não está contando por pessoa | VPS (nginx/PM2) e talvez `server.js` |
| 2 | **alta** | `lorflux.com` e `www.lorflux.com` servem dois apps com sessões separadas | Cloudflare/nginx, Stripe, `.env` |
| 3 | média-alta | 49 vulnerabilidades em dependências de produção, uma delas em código que processa upload de usuário | `package.json` |
| 4 | média | classificação **esconde** (404) onde o PDF do cliente pede **convite** | código |
| 5 | média | o AdSense está desligado na prática, e "AdMob" não existe para este app | decisão do cliente + código |
| 6 | baixa | seis timers sem limpeza no painel do admin, que também deixam a suíte vermelha | código |
| 7 | baixa | a suíte não se aguenta com a máquina carregada | config de teste |
| 8 | baixa | código morto com preço fixo | código |
| 9 | baixa | bundle único de 1,1 MB | código |

Passou limpo: checagem de tipos sem erro; preços em produção certos
(R$ 10,90 / US$ 4,99 / EUR 4,99 em `/api/payment/precos`); CSP, HSTS com
`preload`, `nosniff` e `X-Frame-Options` no ar; `http://` redireciona com 301;
`node scripts/verificarAssetLinks.js` com as três visões `ok`; o catálogo do
visitante mostra as 5 obras, todas `teen`.

---

## 1. O limite de requisições não está contando por pessoa — ALTA

**Evidência, de fora, sem segredo.** Seis requisições seguidas do mesmo IPv4,
em poucos segundos, a `/api/settings/public`. O cabeçalho
`x-ratelimit-remaining` deveria cair de um em um. Veio:

```
298, 295, 298, 298, 297, 297
```

O contador sobe e desce para o mesmo cliente. Mais duas rodadas no mesmo dia,
já com `node scripts/verificarLimiteRequisicoes.js` (que agora é o guarda deste
item):

```
299, 299, 298, 298, 297, 297, 296, 296     (pares: dois contadores alternando)
299, 299, 295, 299, 295, 298               (errático)
```

Nas mesmas requisições, o `index-*.js` servido em `/` foi sempre o mesmo
(`index-Caf1e1yW.js`, o build de 27/10). Então, se houver um segundo processo,
não há sinal de que ele sirva código velho no frontend. De fora não dá para
separar as duas causas abaixo; os dois comandos de conferência no fim deste
item separam.

Só há duas explicações, e as duas são ruins:

- **(a) a chave do limite é o IP do Cloudflare, não o do usuário.** O site está
  atrás do Cloudflare (`server: cloudflare`, `colo=GRU`). `server.js:77` usa
  `app.set("trust proxy", 1)`, que confia em **um** salto. Se houver nginx entre
  o Cloudflare e o Node sem restaurar o IP real (`real_ip_header
  CF-Connecting-IP`), o `req.ip` vira o IP da borda do Cloudflare que abriu a
  conexão, e cada requisição cai no balde de uma borda diferente, dividido com
  todo mundo que passa por ela. É o que explicaria o 295 no meio.
- **(b) há mais de um processo do app respondendo**, cada um com seu contador em
  memória (`express-rate-limit` usa memória por padrão, e não há `store` em
  `server.js:188-199`). O `ecosystem.config.js:7-8` declara uma instância só, em
  modo `fork`, mas o que roda na VPS pode não ser isso.

**Por que é alta agora.** Com (a), numa campanha, centenas de pessoas chegam
pelas mesmas poucas bordas do Cloudflare em São Paulo. O limite global
(300 requisições a cada 15 minutos, `server.js:188-191`) estoura para todas de
uma vez, e o site responde "Muitas requisições originadas deste IP" a quem
acabou de clicar no anúncio. O limite de login (5 tentativas a cada 10 minutos,
`server.js:193-199`) trava o login de todo mundo que divide a borda. E, do lado
da segurança, quem tenta adivinhar senha troca de balde a cada requisição.

**Conferir na VPS** (só leitura):

```
pm2 list
grep -rn "real_ip\|CF-Connecting-IP\|X-Forwarded-For" /etc/nginx/ 2>/dev/null
```

**Confirmado na VPS em 04/11: é o caso (a).** `pm2 list` mostra **um** só
`lorflux-app` (fork), e o nginx não tem `real_ip` nenhum: só
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
(`/etc/nginx/sites-available/lorflux:18`). O `X-Forwarded-For` chega ao Node
como `cliente, borda-do-cloudflare`, e com `trust proxy 1` o Express pega o
último, a borda. Os pares do verificador (`299, 299, 298, 298…`) eram as
requisições alternando entre duas bordas do Cloudflare.

**RESOLVIDO em 04/11/2026, na VPS.** Arquivo novo
`/etc/nginx/conf.d/cloudflare-real-ip.conf` com `set_real_ip_from` para as faixas
publicadas pelo Cloudflare (ips-v4 e ips-v6 do dia) e `real_ip_header
CF-Connecting-IP`; `nginx -t` ok e reload, sem derrubar o site. Depois:
`node scripts/verificarLimiteRequisicoes.js` → `299, 298, 297, 296, 295, 294,
293, 292`, ok. Se o Cloudflare publicar faixas novas, o verificador volta a
falhar de vez em quando: é só regerar o arquivo com o mesmo bloco.

**Efeito que vai além do limite, e que também foi consertado:** o registro de
engajamento que alimenta o repasse dos autores (`services/engagementLogger.js:57-94`)
descarta visualização, leitura e impressão de anúncio repetida comparando o
**hash do IP**: uma por usuário **ou** IP, por episódio, a cada 6 horas
(`dedupe`), e mais de 30 eventos do mesmo IP em 60 s viram `burst`. Com o IP da
borda do Cloudflare no lugar do IP de cada pessoa, leitores diferentes passando
pela mesma borda contavam como uma pessoa só, inclusive logados, porque a
condição é `userId` **ou** `ipHash`. Até 04/11, portanto, a contagem que
compõe o bolo de royalties tende a estar **abaixo** do real. Os eventos antigos
não têm como ser recontados (o hash guardado é o da borda). A partir de 04/11 a
contagem é por pessoa.

Se for (a), o conserto é no nginx (restaurar o IP real a partir das faixas do
Cloudflare) e não em código. Se for (b), ou mudar para uma instância, ou usar um
`store` compartilhado no limitador.

**Teste de regressão possível:** um teste de backend que monta o app com
`trust proxy` e um `X-Forwarded-For` simulado e confere que a chave do limitador
é o IP do cliente. A metade de fora (nginx) não tem teste offline e entra no
`REGRESSOES.md` como item "sem teste", com o comando de conferência acima.

---

## 2. Dois domínios servindo o app, com sessões separadas — ALTA antes da campanha

**Evidência.** `https://lorflux.com/` responde **200**, não redireciona para o
`www`. A API aceita as duas origens (CORS devolve `access-control-allow-origin`
para as duas). Então existem, na prática, dois sites.

**O que isso quebra.**

- Os cookies de sessão são **do host**, sem `domain` (`utils/authCookies.js:18-25`,
  `httpOnly`, `sameSite: "strict"`). Quem entra em `lorflux.com` não está logado
  em `www.lorflux.com`, e vice-versa.
- A volta do checkout do Stripe vai para `${process.env.FRONTEND_URL}`
  (`routes/payment.js:102-103`). **Conferido em 04/11: o `FRONTEND_URL` da VPS
  NÃO é `https://www.lorflux.com`** (o valor exato ainda a classificar). Ele é
  usado em 18 lugares, inclusive links de e-mail. Se o `FRONTEND_URL` for o `www`, **quem assina pelo domínio sem `www` paga e volta deslogado**,
  vendo a tela de entrar logo depois de pagar. O Premium está na conta, então
  aparece depois do login, mas a primeira impressão é de cobrança sem entrega.
- O app Android só abre links do `www` (é o host do TWA). Link compartilhado
  com o domínio sem `www` abre no navegador, não no app.
- Duas cópias do site para o Google indexar.

**Como as pessoas caem no domínio sem `www`:** digitando `lorflux.com`, e por
qualquer peça de divulgação que use o endereço curto, que é o mais natural num
anúncio.

**A armadilha do conserto.** O óbvio é redirecionar `lorflux.com` → `www` com
301. Mas o **endpoint do webhook do Stripe está no domínio sem `www`**
(`https://lorflux.com/api/payment/webhook`, conferido em 27/10), e o Stripe
**não segue redirecionamento**. Redirecionar tudo mata as renovações e as
confirmações de pagamento em silêncio, o mesmo tipo de defeito do `invoice.paid`
(ver `REGRESSOES.md`). A ordem certa: trocar o endpoint no painel do Stripe para
o `www` (ou excluir `/api/payment/webhook` do redirecionamento), rodar
`node scripts/verificarWebhookStripe.js` e só então ligar o 301.

---

## 3. 49 vulnerabilidades em dependências de produção — MÉDIA-ALTA

`npm audit --omit=dev`: **1 crítica, 12 altas, 36 moderadas**. Em 15/09 o
commit `d3841bb` tinha baixado de 49 para 25; os avisos novos publicados desde
então trouxeram de volta.

O que tem exposição real neste projeto:

- **`sharp` 0.33.5, com CVEs da libvips.** Ele processa o **avatar enviado por
  qualquer usuário logado** (`routes/account.js:61-62`), e criar conta é
  gratuito. A correção exige subir de versão menor do 0.x (0.35.5 é a atual),
  que o `npm audit` trata como quebra.
- `body-parser` e `compression`: negação de serviço, no caminho de toda
  requisição.
- `mongoose`: poluição de protótipo via caminho com `__proto__` no update.
- `nodemailer`, `axios`, `follow-redirects`, `joi`.

O que tem exposição baixa: a crítica (`proxy-addr`) é sobre confiança por
**faixa** de IP com endereço IPv6 mapeado; o projeto confia por **contagem de
saltos** (`trust proxy 1`). `vite` e `esbuild` afetam o servidor de
desenvolvimento, não a produção.

**Feito em 04/11 (parte sem troca de versão maior):** `npm audit fix` com
npm 11 levou de **49 para 31** (0 críticas, 3 altas, 28 moderadas). Suíte
inteira, `tsc` e build passaram, e o bundle de produção saiu **idêntico** (mesmo
hash `index-C0P33cUl.js`, 1.123 kB): a atualização não toca no frontend. O
npm 9.2 instalado no servidor de desenvolvimento quebra no `audit fix`
(`Cannot read properties of null (reading 'edgesOut')`); use
`npx -y npm@11 audit fix`, que é a versão do CI. As 3 altas que sobram pedem
troca de versão maior: `sharp`, `nodemailer` e `vite` (este só no servidor de
desenvolvimento).

A maior parte sai com `npm audit fix` sem troca de versão maior. `sharp`,
`googleapis`, `@sentry/node` e `uuid` pedem troca maior e precisam de teste
específico (o `sharp` tem `tests/backend/avatar.test.js`; o `googleapis` é o
Play Billing do servidor, coberto por `tests/backend/playBilling.test.js`).

---

## 4. Classificação esconde onde o cliente pediu convite — MÉDIA

Já conhecido, registrado aqui para o plano. Falha de classificação devolve 404
(`utils/autorizacaoConteudo.js:12,33,36`; traduzido em `routes/content.js:439` e
`routes/bunnyWebhook.js:606`), e o filtro parental tira a obra das listas. O
documento de regras do cliente pede "Crie uma conta para ter acesso" para
conteúdo acima de Teen.

**Hoje, sem efeito no ar:** o visitante vê as 5 obras publicadas, todas `teen`.
**Passa a ter efeito no dia em que a primeira obra `young` for publicada**, e o
cliente avisou em 21/10 que pretende deixar novelas e animações em `young` por
padrão. Ou seja, cai exatamente sobre o conteúdo novo da campanha.

---

## 5. AdSense desligado na prática, e "AdMob" não serve para este app — MÉDIA

**Evidência.** `/api/settings/public` em produção: `adsense_slot_id` vazio. Com o
slot vazio, `components/Ads.tsx:27` deixa o anúncio próprio da Lorflux rodar
para todo mundo e o AdSense não aparece. Hoje só existe uma modalidade no ar.

**O que o cliente disse em 23/10:** "Teremos duas modalidades, uma do Google
AdMob e o meu separado." O **AdMob é para app Android nativo**. O app da
Lorflux é um TWA, ou seja, o próprio site dentro do app; o anúncio do Google que
funciona ali é o **AdSense**, o mesmo do site. Vale dizer isso ao cliente antes
que ele crie conta no AdMob esperando que funcione.

**O que acontece quando alguém preencher o slot:** em `components/Ads.tsx:27`
o AdSense e o anúncio próprio são mutuamente exclusivos, com o AdSense vencendo.
O anúncio da casa passa a aparecer só para quem recusou cookies, e o bolo de
royalties (`services/royaltyReportService.js:120`) continua contando só as
impressões da casa. Não é bug hoje; é uma decisão pendente do cliente
(alternar no mesmo espaço ou separar os lugares, e se a receita do AdSense entra
no bolo), e faz parte do pedido de 26/10.

---

## 6. Timers sem limpeza no painel do admin — BAIXA

`components/Admin/AdminDashboard.tsx` dispara seis `setTimeout` que mudam
estado e nunca são cancelados: linhas 164, 196, 734, 792, 909 e 945.

- **No uso real:** depois de criar uma série, se o admin abrir o modal de nova
  série de novo em menos de 1,5 s, o timer da criação anterior fecha o modal
  novo (`:909`, `setShowCreateModal(false)`). O mesmo vale para episódio
  (`:945`) e anúncio (`:792`). Raro, mas é um "o modal fechou sozinho".
- **Na suíte:** com a máquina lenta, o timer de `:909` dispara depois que o
  ambiente de teste já foi desmontado e estoura `ReferenceError: window is not
  defined` (origem: `tests/frontend/adminDashboardAprovacoesBadge.test.tsx`).
  O Vitest conta como erro não tratado e **sai com código 1 mesmo com todos os
  testes passando**. Foi o que aconteceu na primeira rodada de hoje.

Conserto: guardar os ids num `useRef` e limpar no desmonte e antes de agendar
outro. Teste: abrir o modal de novo dentro da janela e conferir que ele continua
aberto (falha hoje).

---

## 7. A suíte não se aguenta com a máquina carregada — BAIXA (ambiente)

Primeira rodada de hoje, com load acima de 39 em 10 núcleos: **9 arquivos do
frontend nem iniciaram** (`[vitest-pool-runner]: Timeout waiting for worker to
respond`). Como o `test:all` é `npm run test && npm run test:backend`, o
backend nem rodou. Nada disso é defeito do código, mas um "vermelho" que não
significa nada ensina a ignorar vermelho.

Conserto barato: limitar os workers do frontend no `vite.config`/config do
Vitest (`maxWorkers`) e trocar o `&&` por algo que rode as duas metades e some
os resultados.

Resultado da segunda rodada, com `--maxWorkers=2`: ver o fim deste arquivo.

---

## 8. Código morto com preço fixo — BAIXA

- `components/Premium.tsx` e `components/SubscriptionTab.tsx`: ninguém importa;
  mostram preço fixo/digitado. Já existe teste travando que sigam desligados
  (`tests/frontend/appPrecoAssinarBotao.test.tsx`).
- `services/stripeService.js`: ninguém importa; monta URL de volta com
  `process.env.DOMAIN`, variável que o resto do projeto não usa.

Remover tira a chance de alguém religar por engano.

---

## 9. Bundle único de 1,1 MB — BAIXA (desempenho)

O build de produção gera um só `index-*.js` de 1.122 kB (318 kB com gzip), com
aviso do próprio Vite. É o que o celular baixa antes de mostrar qualquer coisa.
Para quem chega por anúncio em rede móvel, cada segundo de tela preta custa
clique pago.

**Armadilha para medir:** o `.env` local do repositório no servidor de
desenvolvimento tem `NODE_ENV=development`, e o Vite lê esse arquivo. Um
`npx vite build` ali sai com o React **de desenvolvimento** e 1.600 kB, o que
parece regressão e não é. Para medir o tamanho real, `NODE_ENV=production npx
vite build`. Na VPS o `.env` tem `NODE_ENV=production`, que o Vite ignora com
aviso, e o build sai em modo produção. Divisão por tela (`import()` dinâmico nas telas de admin, portal e
leitor) é o caminho.

---

## Fora do código, para não perder

- `scripts/build-twa.ps1` e `scripts/setup-twa.ps1` com a chave perdida e com
  Play Billing em `N` (trabalho em andamento do Fellipe, não alterados). Ver
  `docs/assinatura-do-app-e-chave-de-upload.md`.
- A senha da chave de upload está num `senha.txt` ao lado do `.jks` no servidor
  de desenvolvimento, fora do git.
- O AAB com Play Billing (versionCode 4) espera RAM no servidor de
  desenvolvimento para ser montado (`ANDROID_BUILD.md`).
- No build da VPS: `NODE_ENV=production` no `.env` é ignorado pelo Vite
  (inofensivo) e os dados do browserslist têm 8 meses.

---

## Resultado da suíte (segunda rodada)

- **Frontend, com `--maxWorkers=2`: 58 arquivos, 651 testes, todos passando,
  sem erro não tratado.** Confirma que a primeira rodada falhou por carga da
  máquina, não por código.
- **Backend: não deu para validar hoje.** Durante a rodada a carga do servidor
  de desenvolvimento chegou a **274** (10 núcleos) com **1,1 GB livres**, e o
  `mongodb-memory-server` não conseguiu nem subir o banco de teste
  (`Instance failed to start within 10000ms`, testes de `avatar.test.js`
  pulados). A rodada foi interrompida para não piorar a carga. A carga vinha de
  processos de outros projetos (`dotnet`, `php`, `python`, Chrome), não deste.
- **Por que isso não deixa o backend sem garantia:** o código não mudou desde a
  última rodada verde completa. Em 27/10 a suíte inteira passou com 45 arquivos
  e 1254 testes no backend, imediatamente antes do commit `f9f8870`; de
  `f9f8870` até `769accb` (o atual) só mudaram `ANDROID_BUILD.md` e
  `docs/assinatura-do-app-e-chave-de-upload.md`, e não há mudança não commitada
  em código coberto pela suíte.
- Rodar de novo quando a máquina estiver calma: `npx vitest run --maxWorkers=2`
  e depois `npm run test:backend`.
