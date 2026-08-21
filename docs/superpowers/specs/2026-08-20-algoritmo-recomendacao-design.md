# Bloco 4 — Algoritmo de recomendação e tags

**Fase 4 do Lorflux · decisões registradas em 20/08/2026**
**Fonte: PDF do cliente (Etapas 1–12) + pesos confirmados por ele no 99freelas.**

## Objetivo

Implementar o algoritmo de recomendação completo do PDF do cliente: score por
obra (0–100), tags internas (5–15), bônus de descoberta, Potential Score,
penalizações, Confidence Score, distribuição 50/30/20 na tela principal e
regras de diversidade — alimentando a ordem das obras nos 3 feeds.

**Pesos confirmados (o PDF tinha divergência interna; o cliente confirmou):**
Qualidade 30 · Retenção 25 · Afinidade 25 · Descoberta 10 · Diversidade 10.

## Dados disponíveis (lidos do código real)

| Métrica do PDF | Fonte | Observação |
|---|---|---|
| Likes | `SeriesVote` (série) e `Vote` (episódio) | like − dislike |
| Favoritos | `Favorite` | por série |
| Super Reader | `SuperReaderContribution` (Bloco 3) | por série/canal |
| Views válidas | `EngagementEvent` type view/read, `flagged: false` | anti-fraude da Fase 3 já filtra robô |
| Releituras | `EngagementEvent` repetido por (userId, seriesId) | proxy: eventos além do 1º por leitor |
| Capítulos concluídos / % médio | `ReadingProgress.completed` / `.percent` (Bloco 1) | inclui anônimos |
| Continuação em outro dia | dias distintos de `EngagementEvent`/`ReadingProgress` por leitor×série | proxy |
| Tempo médio de leitura | **NÃO COLETADO** | ver decisão abaixo |
| Leitores únicos | identidades distintas em `ReadingProgress` por série (userId + anonymousId) | base do Confidence |
| Idade da obra | `Series.createdAt` | Descoberta 30/60/90 |

## Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Decomposição do score | **Parte por obra (65 pts)** = Qualidade 30 + Retenção 25 + Descoberta 10, pré-computada e persistida em `SeriesScore`; **Afinidade (25 pts)** por leitor, calculada no request; **Diversidade (10 pts)** aplicada como re-ordenação na entrega (regras da Etapa 8) | Afinidade depende do leitor e Diversidade depende da LISTA — não são propriedades de uma obra isolada. A soma continua 100 e cada regra do PDF vive onde é computável |
| Tempo médio de leitura (10% da Retenção) | **Redistribuído** entre as 3 métricas disponíveis na mesma proporção do PDF: concluídos 45%, % médio 33%, outro dia 22% (era 40/30/20/10) | O app não coleta sessões de tempo; inventar número seria pior que redistribuir. Dívida registrada: coletar tempo e voltar aos pesos originais |
| Proporcionalidade (Etapa 2) | Toda métrica de Qualidade é **por leitor LOGADO** (ex.: favoritos ÷ leitores logados), normalizada contra o melhor do catálogo do mesmo `content_type`. **Nota (fix round da revisão final, Item 1/A1 — muda a semântica desta linha):** o denominador NÃO é mais `leitoresUnicos` (logados+anônimos) e sim `leitoresUserIds.length` (só logados) — os 4 numeradores da Qualidade já eram estruturalmente só-logados (Favorito/SeriesVote exigem token; SR exige `userId` real no checkout; releituras já são por `userId`), então dividir por um denominador que qualquer visitante anônimo inflava de graça diluía a taxa sem nenhuma ação real por trás. `leitoresUnicos` CONTINUA sendo o valor persistido em `SeriesScore.leitoresUnicos` e usado no Confidence Score (Etapa 12) — essa parte não muda | Regra de ouro do PDF: "100 leitores e 20 favoritos > 10.000 leitores e 200 favoritos". Normalizar por tipo evita webtoon competir com vídeo |
| Peso interno da Qualidade | Super Reader 45 · Favoritos 25 · Likes 20 · Releituras 10 (PDF, Etapa 2) | Confirmado |
| Descoberta | ≤30 dias +10 · 31–60 +7 · 61–90 +4 · depois 0 (PDF, Etapa 6), contado de `Series.createdAt` | Confirmado |
| Potential Score | Likes/leitor 25 · Favoritos/leitor 25 · SR/leitor 30 · Retenção 20 (PDF, Etapa 7), escala 0–100, persistido junto | Confirmado |
| Penalizações (Etapa 9) | Multiplicadores sobre a parte por obra: retenção baixa ×0.80 · abandono rápido ×0.85 · inatividade ×0.90; **piso de 20%** do valor pré-penalização (nunca zera). Limiares: retenção <30% da escala; abandono = ≥60% dos leitores param no cap. 1 com <25%; inatividade = >60 dias sem capítulo novo E sem engajamento | O PDF dá os percentuais; os limiares são decisão nossa (documentados, ajustáveis por `Setting` fica como dívida) |
| Confidence Score (Etapa 12) | `confidence = n/(n+K)` com **K=20** leitores únicos (meia-confiança em 20). NÃO altera scoreFinal nem Potential; na ORDENAÇÃO, o valor de ordenação é `parteDaObra×confidence + afinidade` — obra nova oscila menos o topo, mas continua entrando pela cota de descoberta | É exatamente o "fator de equilíbrio na ordenação" do PDF. K=20 cabe à escala atual (dezenas/centenas de leitores) |
| Persistência | `SeriesScore` (1 doc por série): componentes, scoreFinal (0–100 da parte por obra reescalada), potentialScore, confidence, leitoresUnicos, penalizacoesAplicadas[], computedAt | Recalcular tudo a cada request seria O(catálogo×coleções); persistir dá painel/debug de graça |
| Recálculo (Etapa 11) | Fire-and-forget nos gatilhos do PDF (like, favorito, SR via webhook, conclusão de leitura, releitura/view, capítulo publicado) recalcula A OBRA; varredura geral a cada 24h + no boot se houver score com >24h | Mesmo padrão dos disparos de push do Bloco 2 (`.catch(logger)`, nunca derruba a rota) |
| Afinidade (Etapa 4) | Perfil calculado **no request** (não persistido): histograma de tags a partir de favoritos (peso 3), SR (peso 4), likes de série (peso 2), progresso/leitura (peso 1, inclui `anonymousId`); afinidade da obra = sobreposição normalizada tags×perfil (25 pts máx). Sem histórico → **12,5 pts neutros** para todas | Não persistir = nada novo no export/exclusão LGPD (derivado de dados que já são exportados/apagados). Anônimo entra pelo `anonymousId` do progresso (Bloco 1) |
| Tags (Etapa 5) | `Series.tags: [String]`, minúsculas, únicas, **0 ou 5–15** (0 = obra antiga ainda sem curadoria; se informar, mínimo 5); só admin escreve; **nunca** exibidas ao leitor (o campo `genre` segue sendo o rótulo visível) | O PDF: tags são internas do algoritmo. Min 5 só quando informadas para não travar a edição do acervo existente |
| Distribuição 50/30/20 (Etapa 10) | `GET /api/content/recommendations?type=` monta a lista: 50% melhores por `parteDaObra×confidence+afinidade`, 30% melhores por Potential (ainda não usados), 20% novas (≤90 dias) — arredondamento determinístico, sem duplicata; catálogo pequeno degrada com naturalidade (cotas se completam com o que houver) | Confirmado no PDF |
| Diversidade (Etapa 8) | Re-ordenação da lista final aplicando as 4 regras do PDF: **(1) nenhuma obra 2×** — dedupe garantido por construção em `montarCotas` (Set de séries usadas, cada uma entra em no máximo uma cota); **(2) não permitir 2 obras ADJACENTES do mesmo `channelId`** — `mesmoCanal` em `aplicarDiversidade`; **(3) alternar temas e estilos** — `temaForte` em `aplicarDiversidade` (fix round da revisão final, Item 3/M1: as duas obras têm tags E a interseção > 50% do MENOR conjunto de tags; obra sem tags nunca conflita por tema); **(4) intercalar cotas** (consolidada/potencial/nova) em vez de blocos — `intercalarCotas`. As regras (2) e (3) usam o MESMO predicado combinado `conflitoAdjacente = mesmoCanal OU temaForte` na busca de troca (swap-forward): canal continua com precedência de fato, um swap nunca cria uma colisão de canal nova | As 4 regras do PDF viram regras mecânicas de lista — mapeamento 1:1 acima |
| Feeds | Os 3 feeds passam a buscar `api.getRecommendations(tipo)` (mesmo shape de série do `/series`); erro/vazio → fallback para `api.getSeries()` (ordem manual atual) | Recomendação nunca pode DERRUBAR o feed |
| Anônimo | `anonymousId` (o mesmo do progresso, header `X-Anonymous-Id` — conferir o header real do Bloco 1 na implementação) alimenta a afinidade; sem ele, ordem neutra | Já existe a infra do Bloco 1 |
| Admin | Campo de tags (chips, 5–15) no form de série. Painel de scores NO ADMIN fica como dívida (o PDF não pede UI) | Escopo contratado é o algoritmo |

## Modelo `SeriesScore`

```js
{
  seriesId:        ObjectId (ref Series, required, unique),
  contentType:     String (denormalizado, para varreduras por tipo),
  scoreFinal:      Number 0–100,   // parte por obra (Q+R+D reescalada) APÓS penalizações
  qualidade:       Number 0–30,
  retencao:        Number 0–25,
  descoberta:      Number 0–10,
  potentialScore:  Number 0–100,
  confidence:      Number 0–1,
  leitoresUnicos:  Number,
  penalizacoes:    [String],       // ex.: ['retencao_baixa'] — vazio = nenhuma
  computedAt:      Date,
}                                   // timestamps: true; índices: seriesId unique, {contentType, scoreFinal desc}
```

`scoreFinal` reescala (Q+R+D)/65×100 para o 0–100 do PDF; a ordenação usa os
componentes crus (65 + afinidade 25), não o reescalado — documentado no código.

## Serviço `services/recommendationService.js`

- `computeSeriesScore(seriesId)` — agregações + upsert em `SeriesScore`.
- `computeAllScores()` — varre séries publicadas; usada pelo timer 24h e boot.
- `buildRecommendations({ contentType, userId, anonymousId })` — carrega scores
  do tipo, calcula afinidade do leitor, aplica confidence, monta 50/30/20,
  re-ordena por diversidade, devolve a lista de séries (lean, shape do /series).
- `computeAffinityProfile({ userId, anonymousId })` — histograma de tags.
- Timer: `setInterval` 24h dentro do serviço, iniciado pelo server (guardado
  contra `NODE_ENV === 'test'`); boot dispara `computeAllScores()` se houver
  score ausente/velho — fire-and-forget com log.
- Test seam se necessário no padrão do repositório; datas SEMPRE injetáveis
  (`agora = new Date()` como parâmetro default) para testar descoberta/inatividade.

## Rotas

| Rota | Auth | Função |
|---|---|---|
| `GET /api/content/recommendations?type=hqcine\|vcine\|hiqua` | `optionalAuth` (+ anonymousId como no progresso) | lista ordenada de séries publicadas do tipo (shape do `/series`); NUNCA 500 por falha de score — degrada para a ordem manual |
| `PUT/POST série (admin)` | já existentes | aceitam `tags` (validação 0 ou 5–15, ≤15, strings não vazias, minúsculas, dedupe) |

Gatilhos fire-and-forget de recálculo nas rotas existentes: vote de série,
favorito (add), webhook SR (registro ok), saveProgress com `completed` novo,
publicação de capítulo (os mesmos 6 pontos do push do Bloco 2 — reusar a
lista de lá).

**Nota (ruling da T5):** o gatilho de view/read (releitura, Etapa 11 do PDF)
é coberto SÓ pela varredura de 24h, sem disparo síncrono — a rota de abrir
episódio é a mais quente do backend e o recálculo custa ~10 agregações; o
evento é gravado de qualquer forma (nada se perde) e o atraso máximo de 24h
é o mesmo que a própria Etapa 11 aceita para a atualização geral. Alternativa
de debounce em memória por série fica registrada como opção futura.

## Fora de escopo (dívida registrada)

Tempo médio de leitura (voltar aos pesos 40/30/20/10 quando coletado) ·
limiares de penalização configuráveis por `Setting` · painel admin de scores ·
cache/paginação da recomendação (catálogo é pequeno) · A/B ou telemetria de
CTR das recomendações · Potential/Confidence expostos na API pública.

## Testes (antes do código)

**Backend:** tags (validação 0/5–15, dedupe, minúsculas, admin-only);
Qualidade proporcional (obra pequena com taxa alta > obra grande com taxa
baixa — o exemplo literal do PDF vira teste); pesos internos; Retenção com
redistribuição; Descoberta nas 4 faixas (datas injetadas); Potential; padrões
de penalização (cada uma, combinação, piso de 20%); Confidence n/(n+K) e efeito
na ordenação (obra nova com score alto não desbanca consolidada equivalente);
50/30/20 (contagens por cota, sem duplicata, degradação com catálogo pequeno);
diversidade (sem adjacentes do mesmo canal, cotas intercaladas); afinidade
(perfil por favoritos/SR/likes/progresso, anônimo via anonymousId, neutro sem
histórico); rota (shape, fallback quando não há scores, flagged fora das
contas); gatilhos disparam recálculo (fire-and-forget não quebra a rota).

**Frontend:** feeds consomem `getRecommendations` na ordem devolvida; fallback
para `getSeries` em erro; admin chips de tags (5–15, dedupe); shapes da api
pinados contra fetch.
