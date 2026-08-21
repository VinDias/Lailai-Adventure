# Plano — Bloco 4: Algoritmo de recomendação e tags

Spec: `docs/superpowers/specs/2026-08-20-algoritmo-recomendacao-design.md`
Branch: `fase4/bloco4-algoritmo` · Ledger: `.superpowers/sdd/2026-08-20-algoritmo/progress.md`

Processo por task: implementador (sonnet) com brief + SPEC; revisor
independente com SPEC; fix rounds via resume; commits `tipo(escopo)` em PT
(título sem acento). Testes antes do código. Datas SEMPRE injetáveis.

## Task 1 — Tags no modelo, rotas e admin

`Series.tags: [String]` (0 ou 5–15, ≤15, minúsculas, dedupe, não vazias) com
validação no schema + nas rotas de série (POST/PUT admin, destructuring).
Admin: campo de chips no form (criar/editar), contador 5–15, nunca exibida ao
leitor (conferir que nenhum feed/detalhe renderiza tags). Testes backend
(validações, persistência, leitor não recebe? — tags PODEM ir no JSON do
/series [interno], mas nenhum componente as exibe; decidir e registrar) +
frontend (chips).

## Task 2 — SeriesScore + Qualidade proporcional

`models/SeriesScore.js` (schema da spec). `services/recommendationService.js`
começa com: `leitoresUnicos` (identidades distintas de ReadingProgress por
série), Qualidade 0–30 (SR 45/Fav 25/Likes 20/Releituras 10, cada métrica POR
leitor único, normalizada pelo melhor do mesmo content_type), eventos
`flagged: true` FORA. Teste com o exemplo literal do PDF (100 leitores/20
favoritos > 10.000/200).

## Task 3 — Retenção + penalizações

Retenção 0–25 (concluídos 45/percentual 33/outro-dia 22 — redistribuição da
spec). Penalizações como multiplicadores (×0.80/×0.85/×0.90) com limiares da
spec e piso de 20%; `penalizacoes: [String]` no doc. Datas injetadas.

## Task 4 — Descoberta, Potential, Confidence e composição

Descoberta 0–10 (30/60/90 de `Series.createdAt`); Potential 0–100 (25/25/30/20);
`confidence = n/(n+20)`; `scoreFinal` = (Q+R+D)/65×100 pós-penalização;
`computeSeriesScore` completo com upsert + `computeAllScores`.

## Task 5 — Gatilhos e varredura 24h

Fire-and-forget nas rotas: SeriesVote, Favorite add, webhook SR, saveProgress
(completed novo), engagement view/read, publicação de capítulo (reusar os 6
pontos do push — mesma lista de `notifyEpisodePublished`). Timer 24h + boot
(guardas de `NODE_ENV === 'test'`). Nenhuma rota muda status/shape por falha
de recálculo.

## Task 6 — Afinidade + rota de recomendação

`computeAffinityProfile` (favoritos 3 / SR 4 / likes de série 2 / progresso 1;
`anonymousId` incluído — usar o MESMO mecanismo de identidade anônima do
progresso do Bloco 1, conferir header/query real) e `buildRecommendations`
(50/30/20 + confidence na ordenação + diversidade: sem adjacentes do mesmo
canal, cotas intercaladas, dedupe). `GET /api/content/recommendations?type=`
com `optionalAuth`, shape do `/series`, degradação para ordem manual (nunca
500 por score ausente).

## Task 7 — Feeds consomem a recomendação

`api.getRecommendations(tipo)`; HQCine/VFilm/HiQua ordenam a grade pela
resposta com fallback `getSeries()` em erro/vazio. Carrossel "Continuar" e
foco de série (deep link/agenda/busca) INTACTOS. Testes frontend.

## Task 8 — Documentação

CONTEXT.md (models/services/routes/components) + DOCS.md (deploy: primeiro
boot recalcula tudo; nada de env novo). TODA afirmação com file:linha (regra
dos blocos anteriores).

## Task 9 — Revisão final do bloco (opus)

Costuras, spec×entregue (as 12 Etapas do PDF, uma a uma), triagem de menores,
regressões (feeds/admin/rotas tocadas), fraude (score inflável? flagged fora?),
suítes completas + tsc. Depois: teste local com o app real (devMock ganha
engajamento/likes/favoritos/SR variados para o ranking ficar visível) e merge.
