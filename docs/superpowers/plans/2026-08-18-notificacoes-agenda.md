# Bloco 2 — Notificações e Agenda — Plano de Implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`.
> Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** Push de capítulo novo para quem favoritou a série (Web Push/VAPID via
service worker) e agenda de lançamentos por dia da semana.

**Arquitetura:** `notificationService` centraliza o envio com test seam (padrão
`utils/bunnyStorage.js`) e claim atômico de envio único no Episode; os três
caminhos de publicação disparam fire-and-forget. Frontend assina via
`pushManager`, pede permissão em contexto (pós-favorito) e expõe toggle na Conta.
Agenda é um campo na série + um endpoint público agrupado + um overlay.

**Stack:** `web-push` (novo no backend); resto é o existente (Express/Mongoose,
React 19 + TS, Vitest).

**Spec:** `docs/superpowers/specs/2026-08-18-notificacoes-agenda-design.md`
*(o executor e os revisores leem o spec junto do brief — lição do Bloco 1)*

## Restrições globais

- Comentários e mensagens de commit em **português**, formato `tipo(escopo): descrição`.
- Chaves i18n novas na convenção **`escopo.camelCase`** (ex.: `push.enableTitle`) —
  nunca snake_case (defeito recorrente do Bloco 1).
- Baseline de testes: **backend 202, frontend 191** — a suíte inteira segue verde,
  `npx tsc --noEmit -p tsconfig.json` limpo.
- Rotas novas de usuário exigem auth **exceto** `GET /api/push/public-key`.
- O envio de notificação **nunca** derruba nem atrasa a rota que publicou
  (fire-and-forget com `.catch`).
- `releaseDay` é `0–6` (0 = domingo, alinhado a `Date.getDay()`) ou `null`.
- Payload do push em PT (dívida registrada para idioma por usuário).
- Testes de backend no arquivo novo `tests/backend/notifications.test.js`
  (agenda incluída); helpers `tests/helpers/db` e `tests/helpers/auth` como nos
  arquivos existentes.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `models/PushSubscription.js` | Schema da inscrição de aparelho |
| `models/Series.js` | + `releaseDay` |
| `models/Episode.js` | + `notificationSentAt` |
| `services/notificationService.js` | VAPID, claim, montagem do payload, envio em lote, prune |
| `routes/push.js` | public-key, subscribe, unsubscribe, status |
| `routes/content.js` | trigger no POST/PUT de episódio; `releaseDay` nas rotas de série; `GET /agenda` |
| `routes/bunnyWebhook.js` | trigger no Status 4 |
| `routes/account.js` | export + exclusão cobrem subscriptions |
| `utils/pushManager.ts` | lado do navegador: permissão, assinatura, status |
| `public/service-worker.js` | handlers `push` e `notificationclick`, VERSION v3 |
| `App.tsx` | deep link `?abrir&tipo`, estado do AgendaView, render do PushPrompt |
| `components/PushPrompt.tsx` | cartão contextual pós-favorito |
| `components/AgendaView.tsx` | overlay da agenda |
| `components/Profile.tsx` (ou equivalente da Conta) | toggle de notificações |
| `components/Admin/…` (form de série) | select "Dia de lançamento" |
| `i18n/translations.ts` | chaves novas nos 4 idiomas |

---

### Task 1: Schemas + `releaseDay` nas rotas de série

**Files:** Criar `models/PushSubscription.js`; modificar `models/Series.js`,
`models/Episode.js`, `routes/content.js` (destructuring do POST e do PUT de
séries); testar em `tests/backend/notifications.test.js` (novo).

**Interfaces — produz:** modelo `PushSubscription { userId, endpoint, keys:{p256dh,auth} }`
(endpoint único); `Series.releaseDay: Number|null`; `Episode.notificationSentAt: Date|null`.

- [ ] Teste que falha (novo arquivo, cabeçalho no padrão de `progress.test.js`):
  - `PushSubscription` exige `userId`, `endpoint`, `keys.p256dh`, `keys.auth`;
    dois documentos com o mesmo `endpoint` → o segundo rejeita (E11000).
  - `Series.create({ ..., releaseDay: 4 })` persiste; `releaseDay: 9` rejeita;
    ausente → `null`.
  - `POST /api/content/series` (admin) com `releaseDay: 2` devolve a série com o
    campo; `PUT /api/content/series/:id` com `releaseDay: null` limpa.
- [ ] Implementar:

```js
// models/PushSubscription.js
const mongoose = require('mongoose');

/**
 * Inscrição de push de UM aparelho de UM usuário (vários aparelhos = vários
 * documentos). Sem TTL: endpoint morto (404/410 no envio) é removido na hora
 * pelo notificationService.
 */
const PushSubscriptionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
}, { timestamps: true });

PushSubscriptionSchema.index({ userId: 1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
```

  Em `Series.js`: `releaseDay: { type: Number, min: 0, max: 6, default: null }`
  com comentário "// Dia da semana de lançamento (0=domingo) — alimenta a Agenda".
  Em `Episode.js`: `notificationSentAt: { type: Date, default: null }` com
  comentário "// Guarda de envio único do push de capítulo novo".
  Em `routes/content.js`: acrescentar `releaseDay` ao destructuring do POST
  /series e à lista de campos do PUT /series (seguir a forma existente de cada um).
- [ ] `npx vitest run tests/backend/notifications.test.js --config vitest.backend.config.ts` verde; commit
  `feat(notificacoes): schemas de inscricao push, releaseDay e guarda de envio`.

---

### Task 2: `notificationService` com VAPID e test seam

**Files:** Criar `services/notificationService.js`; `npm install web-push`;
testar em `tests/backend/notifications.test.js`.

**Interfaces — produz:** `getVapidPublicKey(): string|null`;
`notifyEpisodePublished(episodeId): Promise<{enviados, removidos}|null>`;
`__setTransportForTests(fn)` — `fn(subscription, payloadString)` que pode lançar
`{ statusCode: 410 }`.

- [ ] Teste que falha (transporte injetado no padrão `__set...ForTests` de
  `utils/bunnyStorage.js`; monte a cena com `Series` publicada + `Episode` +
  `Favorite` + `PushSubscription` criados direto pelos models):
  - envia **uma vez por subscription** dos usuários que favoritaram — e só deles;
  - segunda chamada para o mesmo episódio: transporte **não** é chamado de novo
    (claim de `notificationSentAt`);
  - duas chamadas simultâneas (`Promise.all`) → o transporte recebe o conjunto
    **uma vez** (claim atômico);
  - série com `isPublished: false` → não envia e **não** consome o claim;
  - transporte lançando `{ statusCode: 410 }` para uma subscription → ela é
    removida do banco e as demais recebem;
  - transporte lançando erro comum → loga e as demais recebem (função resolve).
  - payload: JSON com `title` = título da obra, `body` contendo `Capítulo 2`
    (hiqua) ou `Episódio 2` (vcine/hqcine), `url` = `/?abrir=<seriesId>&tipo=<content_type>`,
    `tag` = seriesId.
- [ ] Implementar. Esqueleto obrigatório:

```js
// services/notificationService.js
const webpush = require('web-push');
const logger = require('../utils/logger');

let testTransport = null;
let vapidReady = false;
let publicKey = null;

/** Configura o VAPID uma vez. Produção sem chaves = envio desativado com erro
 *  no log (nunca derruba o boot); dev sem chaves = par efêmero com aviso. */
function ensureVapid() {
  if (vapidReady) return publicKey !== null;
  vapidReady = true;
  let { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[Push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push DESATIVADO. Gere com: npx web-push generate-vapid-keys');
      return false;
    }
    const par = webpush.generateVAPIDKeys();
    pub = par.publicKey; priv = par.privateKey;
    logger.warn('[Push] Chaves VAPID efêmeras (dev): inscrições não sobrevivem ao restart.');
  }
  webpush.setVapidDetails(subject || 'mailto:contato@lorflux.com', pub, priv);
  publicKey = pub;
  return true;
}

function getVapidPublicKey() { return ensureVapid() ? publicKey : null; }

async function enviar(sub, payload) {
  if (testTransport) return testTransport(sub, payload);
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys }, payload,
  );
}
```

  `notifyEpisodePublished`: claim via
  `Episode.findOneAndUpdate({ _id, notificationSentAt: null }, { $set: { notificationSentAt: new Date() } })`
  → `null` = já enviado, retorna. Depois valida a série (`isPublished`); se
  inválida, **desfaz o claim** (`$set: { notificationSentAt: null }`) e retorna.
  Busca `Favorite.find({ seriesId }).distinct('userId')` →
  `PushSubscription.find({ userId: { $in } })` → lotes de 10 com
  `Promise.allSettled`; rejeição com `statusCode` 404/410 →
  `PushSubscription.deleteOne({ _id })`. Sem VAPID e sem transporte de teste →
  retorna `null` cedo.
- [ ] Suíte verde; commit
  `feat(notificacoes): servico de envio com claim atomico e poda de inscricoes mortas`.

---

### Task 3: Rotas de push + registro no server

**Files:** Criar `routes/push.js`; modificar `server.js` (dois `app.use`);
testar em `tests/backend/notifications.test.js`.

**Interfaces — produz:** `GET /api/push/public-key` → `{ publicKey: string|null }`;
`POST /api/me/push/subscribe` (body `{ endpoint, keys:{p256dh,auth} }`) → 201;
`DELETE /api/me/push/subscribe` (body `{ endpoint }`) → `{ removed: n }`;
`GET /api/me/push/status?endpoint=...` → `{ thisDevice: bool, anyDevice: bool }`.

- [ ] Teste que falha:
  - public-key responde 200 com `publicKey` string (sem auth);
  - subscribe sem token → 401; com token e body válido → 201 e documento no
    banco; repetir o mesmo endpoint (mesmo usuário) → 200/201 sem duplicar;
    mesmo endpoint por **outro** usuário → o documento troca de dono (o aparelho
    é de quem está logado nele agora);
  - subscribe com body sem `keys.auth` ou endpoint que não é URL http(s) → 400;
  - unsubscribe remove só o endpoint do próprio usuário; status reflete
    `thisDevice`/`anyDevice`.
- [ ] Implementar `routes/push.js` com dois routers exportados **ou** um router
  montado duas vezes — escolha mais simples: um único router com as quatro rotas
  em caminhos completos, montado em `app.use('/api', ...)`:

```js
router.get('/push/public-key', (req, res) => { ... });          // sem auth
router.post('/me/push/subscribe', verifyToken, async ...);      // upsert por endpoint
router.delete('/me/push/subscribe', verifyToken, async ...);
router.get('/me/push/status', verifyToken, async ...);
```

  Validação: `endpoint` string começando com `https://` (ou `http://` apenas em
  `NODE_ENV=test`), `keys.p256dh`/`keys.auth` strings não vazias. Upsert:
  `findOneAndUpdate({ endpoint }, { $set: { userId, keys, endpoint } }, { upsert: true })`.
  Registro no `server.js` junto dos demais (`app.use("/api", require("./routes/push"))`).
- [ ] Suíte verde; commit `feat(notificacoes): rotas de inscricao push`.

---

### Task 4: Disparo nos três caminhos de publicação

**Files:** Modificar `routes/content.js` (POST /episodes e PUT /episodes/:id) e
`routes/bunnyWebhook.js` (bloco do Status 4); testar em
`tests/backend/notifications.test.js`.

**Interfaces — consome:** `notifyEpisodePublished` (Task 2).

- [ ] Teste que falha (transporte injetado contando chamadas): criar episódio já
  `status: 'published'` via POST → transporte chamado; criar `draft` e depois
  `PUT { status: 'published' }` → chamado uma vez; webhook do Bunny com Status 4
  → chamado (montar o episódio com `bunnyVideoId` e postar o webhook — siga o
  padrão de teste que `verifyBunnyWebhook` permite em ambiente de teste; se o
  middleware bloquear, injete o segredo esperado no header conforme o código dele).
- [ ] Implementar: nos três pontos, após a escrita bem-sucedida e **somente** se
  o status resultante é `'published'`:

```js
require('../services/notificationService')
  .notifyEpisodePublished(episode._id)
  .catch(err => logger.error('[Push] Falha no envio de capítulo novo', err));
```

  Sem `await` — fire-and-forget (restrição global). Nos testes, para observar o
  efeito, aguarde com `vi.waitFor`/pequeno poll até o transporte registrar a
  chamada.
- [ ] Suíte verde; commit
  `feat(notificacoes): publicacao de episodio dispara o push nos tres caminhos`.

---

### Task 5: LGPD — export, exclusão e política

**Files:** Modificar `routes/account.js` (export + exclusão) e
`components/LegalPolicy.tsx`; testar em `tests/backend/notifications.test.js`.

- [ ] Teste que falha: export do titular traz `pushSubscriptions` (array com
  `endpoint` e `createdAt`, **sem** `keys`); excluir a conta remove as
  subscriptions (siga o molde dos testes de LGPD do progresso no mesmo repo).
- [ ] Implementar nos mesmos blocos onde `ReadingProgress` entrou na fase
  anterior (mesmo `Promise.all`). Política: um `<li>` curto na seção de dados,
  no formato dos vizinhos: notificações são opcionais; o registro do aparelho é
  apagado ao desativar no app, ao excluir a conta ou ao revogar a permissão no
  sistema.
- [ ] Suíte verde + `tsc` limpo; commit
  `feat(notificacoes): inscricoes de push no export e na exclusao de conta (LGPD)`.

---

### Task 6: Agenda — endpoint público

**Files:** Modificar `routes/content.js`; testar em
`tests/backend/notifications.test.js`.

**Interfaces — produz:** `GET /api/content/agenda` →
`{ "0": [...], ..., "6": [...] }` com `_id, title, cover_image, content_type, releaseDay`.

- [ ] Teste que falha: séries publicadas com `releaseDay` 1 e 4 aparecem nos
  grupos certos; sem `releaseDay` fica fora; `isPublished: false` fica fora;
  todos os 7 grupos existem na resposta (vazios como `[]`).
- [ ] Implementar: uma consulta
  `Series.find({ isPublished: true, releaseDay: { $ne: null } }).select(...).sort({ order_index: 1, title: 1 }).lean()`
  e agrupamento em JS. Sem cache (catálogo é pequeno; dívida se crescer).
- [ ] Suíte verde; commit `feat(agenda): endpoint de lancamentos por dia da semana`.

---

### Task 7: Frontend — pushManager, service worker e deep link

**Files:** Criar `utils/pushManager.ts`; modificar `services/api.ts` (métodos),
`public/service-worker.js` (VERSION v3 + handlers), `App.tsx` (deep link);
testar em `tests/frontend/pushManager.test.ts` e ajustar o que precisar.

**Interfaces — produz:** `pushManager.isSupported()`, `.getPermission()`,
`.subscribeThisDevice()`, `.unsubscribeThisDevice()`, `.getStatus()`;
`api.getPushPublicKey()`, `api.subscribePush(sub)`, `api.unsubscribePush(endpoint)`,
`api.getPushStatus(endpoint)`.

- [ ] Testes que falham (mocks de `Notification`, `navigator.serviceWorker` e
  `PushManager` via `vi.stubGlobal`): sem suporte → `isSupported()` false e
  `subscribeThisDevice()` resolve `false` sem lançar; permissão negada →
  `subscribeThisDevice()` false; fluxo feliz → chama `api.subscribePush` com a
  subscription serializada (`toJSON`).
- [ ] `pushManager.ts` — pontos obrigatórios: usa
  `navigator.serviceWorker.ready`; converte a chave pública base64url →
  `Uint8Array` (`applicationServerKey`); **nunca lança** (retorna false e loga);
  `unsubscribeThisDevice` chama `sub.unsubscribe()` **e** `api.unsubscribePush`.
- [ ] Service worker (`VERSION = "v3"`):

```js
self.addEventListener("push", event => {
  if (!event.data) return;
  let dados; try { dados = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(dados.title || "Lorflux", {
    body: dados.body || "", icon: "/logo.png", badge: "/logo.png",
    tag: dados.tag || undefined, data: { url: dados.url || "/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return clients.openWindow(url);
  }));
});
```

  (Confirme o caminho real do ícone em `public/` e use o que existir.)
- [ ] Deep link no `App.tsx`: no boot, parse de `?abrir` + `tipo` para um `ref`;
  limpa a URL com `history.replaceState`; um `useEffect` que roda quando `user`
  vira truthy (e no boot já logado) consome o ref → mesma lógica do
  `handleSearchSelect`. Teste: unitário do parser se extraído; o consumo é
  verificado nos testes de App existentes se houver, senão registrar como
  verificação manual no relatório.
- [ ] Suíte + `tsc` verdes; commit
  `feat(notificacoes): pushManager, service worker v3 e deep link de notificacao`.

---

### Task 8: Frontend — prompt contextual e toggle na Conta

**Files:** Criar `components/PushPrompt.tsx`; modificar `services/api.ts`
(`addFavorite` dispara `window.dispatchEvent(new CustomEvent('lorflux:favorited'))`
no sucesso), `App.tsx` (render do PushPrompt para usuário logado), componente da
aba Conta (localizar: `grep -n "account.rateApp\|account.myFavorites" components/*.tsx`),
`i18n/translations.ts`; testar em `tests/frontend/pushPrompt.test.tsx`.

- [ ] Testes que falham: evento `lorflux:favorited` com permissão `default` e
  sem flag → cartão aparece; "Agora não" grava flag `lorflux_push_asked` e o
  próximo evento não mostra; permissão `granted` ou `denied` → não mostra;
  "Ativar" chama `pushManager.subscribeThisDevice`.
- [ ] Toggle na Conta: três estados — ligado (subscription deste aparelho ativa),
  desligado, e desabilitado com explicação quando `Notification.permission === 'denied'`.
  Segue o padrão visual dos itens existentes da Conta.
- [ ] Chaves i18n (**`escopo.camelCase`**), nos 4 idiomas:
  `push.promptTitle`, `push.promptBody`, `push.enable`, `push.notNow`,
  `push.accountToggle`, `push.deniedHint`.
- [ ] Suíte + `tsc` verdes; commit
  `feat(notificacoes): prompt contextual pos-favorito e toggle na conta`.

---

### Task 9: Agenda — overlay, botão nas abas e admin

**Files:** Criar `components/AgendaView.tsx`; modificar `components/HQCine.tsx`,
`components/HiQua.tsx`, `components/VFilm.tsx` (botão calendário no cabeçalho,
prop `onOpenAgenda`), `App.tsx` (estado + render + `onOpenSeries` →
`handleSearchSelect`), form de série do admin (localizar por
`grep -n "content_type" components/Admin*.tsx components/Admin/*.tsx`),
`services/api.ts` (`getAgenda()`), `i18n/translations.ts`; testar em
`tests/frontend/agendaView.test.tsx`.

- [ ] Testes que falham: abre no dia de hoje (mock de `Date`); troca de dia
  refiltra; dia vazio mostra o aviso; clique numa obra chama
  `onOpenSeries(seriesId, contentType)` e fecha; erro de rede → aviso, sem crash.
- [ ] `AgendaView`: overlay full-screen no padrão visual do app (fundo
  `var(--bg-color)`, header com título e botão fechar, seletor horizontal dos 7
  dias com o de hoje destacado, grade de capas). Nomes dos dias via
  `Intl.DateTimeFormat(locale, { weekday: 'short' })` com o locale derivado do
  idioma do app (pt-BR/en-US/es-ES/zh-CN).
- [ ] Admin: select "Dia de lançamento" (Nenhum + 7 dias) no form de série,
  enviando `releaseDay` no payload (null quando "Nenhum").
- [ ] Chaves i18n: `agenda.title`, `agenda.empty`, `agenda.open` (aria-label do
  botão), nos 4 idiomas.
- [ ] Suíte + `tsc` verdes; commit
  `feat(agenda): overlay por dia da semana, botao nas abas e campo no admin`.

---

### Task 10: Documentação e contexto

**Files:** `models/CONTEXT.md`, `routes/CONTEXT.md`, `services/CONTEXT.md`,
`utils/CONTEXT.md`, `components/CONTEXT.md`; `DOCS.md` ou arquivo de deploy
(instruções VAPID para a VPS).

- [ ] Entradas curtas no formato de cada arquivo para: `PushSubscription.js`,
  `notificationService.js`, `push.js`, `pushManager.ts`, `PushPrompt.tsx`,
  `AgendaView.tsx`, e as mudanças em `Series`/`Episode`.
- [ ] Deploy: seção "Ativar push na VPS" — gerar as chaves uma única vez
  (`npx web-push generate-vapid-keys`), adicionar as três variáveis ao `.env`,
  reiniciar; aviso em destaque de que trocar a chave invalida todas as inscrições.
- [ ] Commit `docs(notificacoes): contexto e instrucoes de ativacao do push`.

---

## Autorrevisão do plano

**Cobertura do spec:** modelo/chaves/rotas/envio (T1–T3), disparo nos 3 caminhos
(T4), LGPD (T5), agenda backend (T6), SW + deep link + pushManager (T7), prompt +
toggle (T8), overlay + admin (T9), docs/deploy (T10). Prune de 404/410, claim
atômico, série despublicada, fire-and-forget: T2/T4. Permissão contextual e
negada: T7/T8.

**Consistência de nomes:** `notifyEpisodePublished`, `getVapidPublicKey`,
`__setTransportForTests`; `pushManager.*`; `api.getPushPublicKey/subscribePush/
unsubscribePush/getPushStatus/getAgenda`; evento `lorflux:favorited`; flag
`lorflux_push_asked`; chaves `push.*`/`agenda.*` — conferidos entre tarefas.

**Ordem:** T1→T2→T3→T4→T5→T6 backend; T7→T8→T9 frontend (T7 primeiro: T8 usa
`pushManager`, T9 usa o caminho do deep link); T10 por último.
