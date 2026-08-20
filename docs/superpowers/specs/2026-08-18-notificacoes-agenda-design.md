# Bloco 2 — Notificações de capítulo novo e Agenda de lançamentos

**Fase 4 do Lorflux · decisões registradas em 18/08/2026**

## Objetivo

Duas entregas do contrato:

1. **Notificação push** no celular quando sai capítulo novo de série favoritada —
   automática na publicação, para os três formatos, respeitando a permissão do
   sistema operacional.
2. **Agenda de lançamentos** por dia da semana: o leitor vê facilmente quais obras
   têm capítulo novo em cada dia ("minha série sai na quinta").

## Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Mecanismo de push | **Web Push (VAPID)** via service worker | O app é TWA: roda no Chrome do aparelho, que delega notificação web ao sistema. O `twa-manifest.json` já tem `enableNotifications: true`. Nada de FCM/Firebase — dependência a mais sem ganho para TWA |
| Quem recebe | Usuário **logado** que **favoritou** a série | É o contrato ("série favoritada") e o PDF do cliente ("notificações exigem login"). Favorito = inscrição; sem tela extra de "seguir" |
| Quando pedir permissão | **Depois do primeiro favorito** (contextual) + toggle na aba Conta | Pedir no primeiro load é o padrão que o usuário nega por reflexo — e a Play Store desaprova. No momento do favorito, o pedido tem contexto |
| Disparo | Centralizado em `notifyEpisodePublished`, chamado nos **3 caminhos** que publicam | Criação já publicada, edição para publicado, e o webhook do Bunny (status 4). Um `notificationSentAt` no Episode garante envio único mesmo com caminhos repetidos |
| Fila de envio | **Sem fila** — laço assíncrono em lotes pequenos no processo | Escala atual (dezenas de favoritos por obra) não justifica BullMQ aqui; dívida registrada para quando houver milhares |
| Dia de lançamento | `releaseDay: 0–6 ou null` na série, **um dia por obra** | "Minha série sai na quinta" é um dia. Multi-dia complica o admin e a tela sem pedido do cliente |
| UI da agenda | Botão de calendário no cabeçalho das 3 abas → overlay `AgendaView` | A barra inferior já tem 5 itens; um 6º espreme tudo. O overlay abre no dia de hoje, com seletor Dom–Sáb |

## Push — desenho

### Modelo `PushSubscription`

```js
{
  userId:   ObjectId (ref User, required),
  endpoint: String (required, unique),      // URL do serviço de push do navegador
  keys:     { p256dh: String, auth: String },
}                                            // timestamps: true
```

Vários aparelhos por usuário = vários documentos. Subscription morta (endpoint
respondendo 404/410 no envio) é **removida na hora** — sem TTL.

### Chaves VAPID

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` no `.env`.
- **Produção exige as três** — subscriptions são criptograficamente presas à chave
  pública; trocar a chave invalida todas. Gerar uma vez
  (`npx web-push generate-vapid-keys`) e nunca mais mudar. Documentado no deploy.
- Dev sem chaves: gera efêmeras no boot com aviso claro no log.

### Rotas

| Rota | Auth | Função |
|---|---|---|
| `GET /api/push/public-key` | não | chave pública para o navegador assinar |
| `POST /api/me/push/subscribe` | sim | registra a subscription do aparelho |
| `DELETE /api/me/push/subscribe` | sim | remove (por endpoint, do corpo) |
| `GET /api/me/push/status` | sim | o toggle da Conta pergunta se este aparelho está inscrito (endpoint via query) e se o usuário tem alguma inscrição |

### Envio

`services/notificationService.js`, com **test seam** no padrão do repositório
(`utils/bunnyStorage.js`): `__setTransportForTests(fn)` injeta o transporte;
produção usa `web-push`.

`notifyEpisodePublished(episodeId)`:

1. Episode com `notificationSentAt` preenchido → retorna (envio único).
2. Marca `notificationSentAt` **antes** de enviar (claim atômico via
   `findOneAndUpdate` com `notificationSentAt: null` no filtro — dois caminhos
   simultâneos não duplicam).
3. Série do episódio precisa estar `isPublished` — episódio de obra despublicada
   não notifica.
4. Busca favoritos da série → subscriptions dos usuários → envia em lotes de 10.
5. Payload: `{ title: <obra>, body: "Capítulo N disponível" ou "Episódio N
   disponível", url: "/?abrir=<seriesId>&tipo=<content_type>" }` — rótulo conforme
   `content_type`, textos em PT (idioma do payload por usuário fica como dívida).
6. Falha 404/410 → deleta a subscription. Outras falhas → loga e segue (envio é
   melhor-esforço; nunca derruba a rota que publicou).

O disparo nas rotas é **fire-and-forget** (`.catch(logger)`) — publicar episódio
não espera o envio terminar.

### Service worker e deep link

- `push` → `showNotification(title, { body, icon, data: { url } })`.
- `notificationclick` → foca aba existente do app se houver, senão abre `data.url`.
- `VERSION` do SW sobe para `v3` (invalida caches, força atualização do SW).
- No boot do App: query `?abrir=<id>&tipo=<t>` → mesmo caminho do
  `handleSearchSelect` (seta a aba e `pendingSeriesFocus`) → remove os params da
  URL (`history.replaceState`) para não re-focar em reload.

### Frontend

- `utils/pushManager.ts`: `isSupported()`, `getPermission()`,
  `subscribeThisDevice()` (pega public key → `pushManager.subscribe` →
  `POST subscribe`), `unsubscribeThisDevice()`, `getStatus()`.
- Prompt contextual: após favoritar com sucesso, se a permissão está em `default`
  e o usuário nunca foi perguntado (flag em `localStorage`), mostra um cartão
  não-bloqueante "Quer ser avisado quando sair capítulo novo?" com Ativar /
  Agora não. Uma vez só.
- Conta: toggle "Notificações de capítulos novos". Permissão negada no navegador →
  toggle desabilitado com explicação de como reativar.
- Textos via dicionário nos 4 idiomas.

## Agenda — desenho

- `Series.releaseDay: { type: Number, min: 0, max: 6, default: null }`
  (0 = domingo, alinhado a `Date.getDay()`).
- Rotas de série (POST/PUT) aceitam `releaseDay` — as rotas usam destructuring
  explícito, então o campo entra nas duas listas.
- Admin: select "Dia de lançamento" (Nenhum / Dom…Sáb) no form de série.
- `GET /api/content/agenda` (público): séries `isPublished` com `releaseDay`
  não-nulo, agrupadas `{ "0": [...], ..., "6": [...] }`, cada uma com
  `_id, title, cover_image, content_type, releaseDay`.
- `AgendaView`: overlay com seletor de dias (default hoje), grade de capas do dia,
  clique fecha o overlay e foca a série (mesmo mecanismo do deep link). Dia vazio
  mostra aviso amigável. i18n nos 4 idiomas.

## LGPD

- `PushSubscription` é dado pessoal: entra na **exclusão de conta**
  (`DELETE /api/account/me`) e no **export** (endpoint + data de criação, sem as
  chaves criptográficas — são segredo do transporte, não dado informativo).
- Parágrafo na política de privacidade: notificações são opcionais e o registro
  do aparelho é apagável desativando no app ou revogando a permissão no sistema.

## Fora de escopo (dívida registrada)

Fila persistente de envio (escala) · idioma do payload por usuário · notificação
agregada ("3 séries atualizaram") · agenda com horário.

## Testes (antes do código)

**Backend:** modelo (unicidade de endpoint, campos exigidos); subscribe/
unsubscribe/status (auth exigida, visitante recebe 401); `notifyEpisodePublished`
com transporte injetado — envia aos favoritos e só a eles, envio único sob claim
concorrente, série despublicada não notifica, 410 remove a subscription, lote não
para nas falhas; disparo nos 3 caminhos de publicação; agenda agrupa por dia e
exclui não-publicadas e sem `releaseDay`; rotas de série persistem `releaseDay`;
export e exclusão de conta cobrem subscriptions.

**Frontend:** `pushManager` (suporte ausente, permissão negada, fluxo feliz com
mocks de `Notification` e `serviceWorker`); prompt contextual aparece uma vez e
respeita a flag; toggle da Conta nos três estados; `AgendaView` (dia default,
troca de dia, dia vazio, clique foca a série); deep link no boot lê e limpa os
params.
