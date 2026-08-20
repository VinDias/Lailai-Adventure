# Plano — Bloco 3: Super Reader

Spec: `docs/superpowers/specs/2026-08-20-super-reader-design.md`
Branch: `fase4/bloco3-super-reader` · Ledger: `.superpowers/sdd/2026-08-20-super-reader/progress.md`

Processo por task: implementador (sonnet) com brief + SPEC; revisor independente
com SPEC; fix rounds via resume; commits `tipo(escopo): descrição` (PT, título
sem acento). Testes antes do código em cada task.

## Task 1 — Modelo + serviço com seam

`models/SuperReaderContribution.js` (schema da spec, índices).
`services/superReaderService.js`: `criarSessaoDeApoio({ userId, seriesId, amountCents, currency })`
(validações + sessão Stripe com metadata; stripe lazy + `__setStripeForTests`),
`registrarContribuicao(session)` (upsert por `stripeSessionId`, 80/20 congelado,
`amount_total` da sessão, period do momento do webhook),
`lerMinimoCents()` (Setting `superReaderMinCents`, default 500).
Testes: `tests/backend/superReader.test.js` (modelo + serviço).
Rodar: `npx vitest run tests/backend/superReader.test.js --config vitest.backend.config.ts`

## Task 2 — Rotas do leitor

`routes/superReader.js`: `POST /superreader/create-session` (verifyToken),
`GET /superreader/me` (verifyToken), mínimo público (rota própria
`GET /superreader/min` OU `PUBLIC_KEYS` — seguir idioma de routes/settings.js;
registrar a escolha no ledger). Montar em `server.js` (`/api`).
Testes: auth, validações (mínimo, inteiro, moeda, série), shape das respostas.

## Task 3 — Webhook

`routes/payment.js`: branch `metadata.tipo === 'super_reader'` ANTES do caminho
Premium, chamando o serviço; 500 em falha de gravação (retry do Stripe); caminho
Premium intocado (testes existentes de payment continuam verdes).
Testes: gravação, retry idempotente, não-ativação de Premium, Premium intacto.

## Task 4 — Relatório admin + CSV

`routes/royalties.js`: `GET /report` ganha `superReader: { porCanal: [{ channelId,
channelName, apoios, autorCents }], totalAutorCents, totalPlataformaCents }` do
período consultado; `close` e `RoyaltyPeriod` INTOCADOS; `export.csv` ganha
bloco SR separado. Testes: agregação por canal/período; fechamento não muda.

## Task 5 — API frontend + SuperReaderButton

`services/api.ts`: `createSuperReaderSession`, `getSuperReaderMe`,
`getSuperReaderMin`. `components/SuperReaderButton.tsx`: valores rápidos a
partir do mínimo + campo livre, centavos, gate de visitante (padrão do app),
loading/erro; inserido no modal de detalhe dos 3 feeds (HQCine/VFilm/HiQua),
junto do favoritar. Retorno `?superreader=success|cancelled` tratado no boot do
App (mesmo lugar do parse de deep link; limpa a query; success → toast i18n).
Testes frontend: botão (mínimo, centavos, gate), api shapes, retorno limpa query.

## Task 6 — Selo e lista na Conta + i18n

Conta (`AccountView`/onde vive a aba Conta): selo Super Reader + lista de
contribuições (`GET /superreader/me`). Chaves i18n `superReader.*` nos 4
idiomas (todas as strings novas do bloco). Testes: dois estados do selo.

## Task 7 — RoyaltiesPanel (admin)

Seção "Super Reader — direto ao autor" no `components/Admin/RoyaltiesPanel.tsx`
com os dados do report; visualmente separada do pool; CSV já coberto na T4.
Teste: renderização com e sem dados SR.

## Task 8 — LGPD

`routes/account.js`: export ganha `superReaderContributions` (sem ids Stripe);
exclusão anonimiza (`userId: null`) em vez de apagar. `components/LegalPolicy.tsx`:
parágrafo do registro contábil anonimizado. Testes: export e anonimização.

## Task 9 — Documentação

CONTEXT.md (models/routes/services/components) + DOCS.md (deploy: nada novo de
env além do Stripe já existente; conferir webhook no painel Stripe cobre
`checkout.session.completed` — já cobre). TODA afirmação verificada contra o
código com file:linha (lição da T10 do Bloco 2).

## Task 10 — Revisão final do bloco

Revisor opus: costuras, spec×entregue, triagem de menores, regressões
(payment/royalties/account), segurança (metadata forjável? — `amount_total` vem
da sessão do Stripe, não do cliente), suítes completas + tsc. Depois: teste
local com o app real (webhook simulado com assinatura de teste do próprio
stripe) e merge.
