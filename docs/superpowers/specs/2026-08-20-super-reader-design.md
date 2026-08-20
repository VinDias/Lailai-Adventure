# Bloco 3 — Super Reader (apoio direto ao autor)

**Fase 4 do Lorflux · decisões registradas em 20/08/2026**

## Objetivo

Entrega do contrato (PDF do cliente): o leitor apoia uma obra específica com
R$ 5 ou mais; **80% vai direto para o autor** da obra e 20% fica com a
plataforma — separado do pool mensal de royalties (que segue a regra 60/40 já
entregue). Exige login. Quem apoia ganha o selo **Super Reader**.

## O que já existe (e o que está morto)

- Stripe já configurado para o Premium: `routes/payment.js` cria sessões de
  checkout e o webhook `POST /api/payment/webhook` (raw body + assinatura) trata
  `checkout.session.completed` **assumindo Premium** (busca por
  `stripeCustomerId`).
- `routes/donation.js` (`POST /donation/create`) existe mas é **doação genérica**
  sem registro em banco, sem vínculo com obra e sem tratamento no webhook.
- `components/DonateButton.tsx` está **morto**: não é renderizado em lugar nenhum
  e chama `/donation/create-donation-session`, rota que não existe (e envia
  reais onde o backend espera centavos). Não será reaproveitado nem corrigido
  neste bloco — fica registrado como achado.
- `Series.channelId → Channel.ownerId` liga obra → canal → autor.
- `RoyaltyPeriod` fecha o pool mensal por canal (snapshot imutável).
- `Setting` é um key/value com `PUBLIC_KEYS` expostas sem auth em
  `routes/settings.js`.

## Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Fonte da verdade | `SuperReaderContribution` criada **só no webhook** (`checkout.session.completed` com `metadata.tipo === 'super_reader'`) | Sessão criada ≠ pagamento feito. O webhook é o único ponto que o Stripe garante após o pagamento |
| Idempotência | `stripeSessionId` **unique** no modelo; gravação por upsert | O Stripe reenvia webhooks; retry não pode duplicar contribuição |
| Divisão 80/20 | Calculada e **congelada no registro** (`authorShareCents = Math.round(amountCents * 0.8)`, `platformShareCents = amountCents - authorShareCents`) | Snapshot imutável: mudar a regra no futuro não reescreve o passado. Centavos inteiros, sem float acumulado |
| Taxas do Stripe | Absorvidas pela plataforma (split sobre o **bruto**) | É o que o cliente descreveu ("80% direto ao autor"); simples de auditar |
| Mínimo | `Setting` chave `superReaderMinCents` (default **500**), no `PUBLIC_KEYS` | O PDF pede mínimo configurável; o frontend lê o mínimo sem auth para montar os botões de valor |
| Moedas | `brl`/`usd`/`eur` (mesmo conjunto do Premium); o mínimo em centavos vale **por moeda** (500 = R$5/US$5/€5) | Conversão cambial aqui seria complexidade sem pedido; 5 na moeda forte ≥ R$5 sempre |
| Login | `verifyToken` na criação da sessão | Exigência do PDF ("apoio exige login") — e o selo precisa de dono |
| Selo Super Reader | **Derivado** (existe ≥1 contribuição paga), sem campo novo em `User` | Sem estado duplicado para dessincronizar; a consulta é barata e cabe numa rota `me` |
| Relatório | Seção **separada** no `GET /api/admin/royalties/report` (`superReader: { porCanal, totais }`) somando `authorShareCents` do mês por canal | "Direto ao autor, fora do pool": não entra em `poolSuggested`, não entra no `breakdown` do fechamento, não altera `RoyaltyPeriod` |
| UI de apoio | `SuperReaderButton` (componente único) no modal de detalhe dos **3 feeds**, ao lado do favoritar | É onde o leitor está olhando a obra; modal é o único ponto de entrada, como o favoritar |
| Reembolso/estorno | **Fora de escopo** (dívida): `charge.refunded` não é tratado; ajuste manual pelo admin | Raro na escala atual; registrar a dívida evita fingir que não existe |

## Modelo `SuperReaderContribution`

```js
{
  userId:             ObjectId (ref User, default null),  // null = anonimizada (LGPD)
  seriesId:           ObjectId (ref Series, required),
  channelId:          ObjectId (ref Channel, required),   // congelado no registro
  amountCents:        Number (required, min 1),
  currency:           String (enum brl|usd|eur),
  authorShareCents:   Number (required),                  // 80% congelado
  platformShareCents: Number (required),                  // o resto
  stripeSessionId:    String (required, unique),
  period:             String 'YYYY-MM' (required, index), // mês do PAGAMENTO (webhook)
}                                                          // timestamps: true
```

Índices: `stripeSessionId` unique; `{ channelId, period }`; `{ userId }`.

## Rotas

| Rota | Auth | Função |
|---|---|---|
| `POST /api/superreader/create-session` | sim | body `{ seriesId, amountCents, currency }`. Valida: série existe, `isPublished`, tem `channelId`; `amountCents` inteiro ≥ mínimo do Setting. Cria sessão Stripe `mode: 'payment'` com `metadata: { tipo: 'super_reader', userId, seriesId, channelId }`, `success_url: FRONTEND_URL/?superreader=success`, `cancel_url: .../?superreader=cancelled`. Devolve `{ url }` |
| `GET /api/superreader/me` | sim | `{ superReader: boolean, contribuicoes: [{ seriesTitle, amountCents, currency, createdAt }] }` — alimenta o selo e a lista na Conta |
| `GET /api/superreader/min` | não | `{ minCents }` — via `PUBLIC_KEYS` do settings OU rota própria; decidir na implementação pelo idioma do repo |

## Webhook (routes/payment.js)

No `checkout.session.completed`, **antes** da lógica Premium:
`if (session.metadata?.tipo === 'super_reader')` → grava a contribuição
(upsert por `stripeSessionId`) com os dados do metadata + `amount_total` da
sessão (fonte: Stripe, não o metadata) e **retorna** — não cai no caminho
Premium. Falha na gravação → 500 (o Stripe reenvia; o upsert absorve o retry).
A lógica de registro vive em `services/superReaderService.js` com **test seam**
(`__setStripeForTests` no padrão de `notificationService`), rotas finas.

## Frontend

- `SuperReaderButton.tsx`: valores rápidos (R$ 5/10/20 — a partir do mínimo) +
  campo livre; envia **centavos**; visitante vê o botão e, ao tocar, recebe o
  convite para entrar (mesmo padrão de gate de login do app). Redireciona para
  a URL do Stripe.
- Retorno `/?superreader=success`: toast/estado de agradecimento (query limpa
  com `replaceState`, mesmo idioma do deep link de push); `cancelled` limpa em
  silêncio.
- Conta: selo **Super Reader** (via `GET /api/superreader/me`) + lista das
  contribuições do usuário.
- `RoyaltiesPanel` (admin): seção "Super Reader (direto ao autor)" do mês —
  por canal: total repassado (80%), nº de apoios; total plataforma (20%).
  Claramente fora do fechamento do pool.
- CSV de royalties ganha as colunas/linhas da seção SR **sem** mexer nas
  existentes (aba/bloco separado no arquivo).
- i18n nos 4 idiomas.

## LGPD

- Export (`GET /api/account/me/export`): `superReaderContributions`
  (obra, valor, moeda, data — sem ids do Stripe).
- Exclusão de conta: **anonimiza** (`userId: null`) em vez de apagar — o valor
  repassado ao autor é registro contábil do relatório de royalties; sem o
  vínculo pessoal, deixa de ser dado pessoal. Parágrafo na política de
  privacidade explica isso.

## Fora de escopo (dívida registrada)

Reembolso/estorno automático · repasse bancário ao autor (o relatório informa;
o pagamento é manual como no pool) · selo visível fora da Conta (ex. em
comentários — não existem) · conversão cambial do mínimo.

## Testes (antes do código)

**Backend:** modelo (unique de `stripeSessionId`, required); create-session
(401 sem login; 400 abaixo do mínimo/valor não-inteiro/moeda inválida; 404
série inexistente; 400 série despublicada ou sem canal; sessão criada com
metadata certo — stripe injetado); webhook SR (grava com 80/20 correto e
`amount_total` da sessão; retry não duplica; **não** ativa Premium; sessão sem
metadata segue o caminho Premium intacto); relatório (soma por canal e período
certos, não altera pool/fechamento); `me` (selo e lista); export inclui e
exclusão anonimiza.

**Frontend:** botão (mínimo respeitado, centavos corretos, gate de visitante);
retorno success/cancelled limpa a query; selo na Conta nos dois estados;
RoyaltiesPanel renderiza a seção SR.
