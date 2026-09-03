# Plano — Fase 5 · Bloco 2: Controle Parental + Tags

Spec: `docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md` (rev. 2)
Branch: `fase5/bloco2-parental` · Ledger: `.superpowers/sdd/2026-09-03-fase5-bloco2/progress.md`

Processo por task: implementador (sonnet) com brief + SPEC; revisor
independente com SPEC; fix rounds via resume; commits `tipo(escopo)` em PT
(título sem acento). Testes antes do código. Datas injetáveis. Suíte verde a
cada commit — a ordem das tasks foi desenhada para nunca deixar a suíte
vermelha entre commits (validator só muda junto com as fixtures).

## Task 1 — Fundações: vocabulário, User.parental, content_rating

`utils/tagsVocabulario.json` (19 {slug, rotuloPt}) + wrapper `.js`.
`User.parental` (classificacaoEtaria default 'young', tagsBloqueadas,
pinHash `select: false`, pinTentativas, pinBloqueadoAte). `-parental` na
projeção de `adminManagement.js:23`. `Series.content_rating` (enum, null).
Export LGPD += parental (campo a campo, sem pinHash). Testes de shape:
pinHash ausente em auth/me, admin/users, export; parental presente no
export. SEM mudar o validator de tags ainda (T2).

## Task 2 — Validator 0–8/enum + migração das fixtures do B4

`validateTags` vira: 0 a 8, todas slugs do vocabulário (setter atual
preserva hífen/+ — conferido). Migração de `recommendations.test.js` com o
GUIA da spec: reduzir cardinalidade (2–3 tags) para manter disjunção
pairwise no orçamento de 19; expects de afinidade RECALCULADOS (≠
afrouxados); relações (disjunto/sobreposto/>50%) preservadas cenário a
cenário. `adminAprovacoes.test.js:310-335` migra para slugs. Testes novos de
baixa cardinalidade do temaForte (1×1 igual → conflito; 2×2 com 1 comum =
50% → NÃO conflito). Revisor confere as RELAÇÕES, não só o verde.

## Task 3 — Rotas /api/parental + PIN

GET (prefs + temPin + lista de slugs — frontend não hardcoda), PUT (gate de
PIN quando temPin), POST /pin (define/troca/remove), recuperação por token
de e-mail (molde reset-password), rate limit persistido no User (5→15min,
backoff exponencial, zera no acerto, tentativas restantes), DELETE
/account/me exige PIN quando temPin (local E social), reset/troca de senha
NÃO toca parental (teste). pinHash em nenhum shape (grep).

## Task 4 — parentalFilter + superfícies de LISTA

`utils/parentalFilter.js`: `getFiltroParental(user)` (semântica POSITIVA:
kids $eq, teen $in, young sem cláusula; tags $nin) e `serieVisivelPara(user,
serie)` (LANÇA se doc sem content_rating/tags; true para admin e dono do
canal). Aplicação: lista de séries (+optionalAuth), search ramo SÉRIES,
agenda (+optionalAuth), recommendations (candidatos :1335 E fallback :259),
favoritos lista (favorito persiste), continuar lendo. Matriz de testes
lista × perfil (incl. rating AUSENTE vs null; anônimo sem filtro).

## Task 5 — Superfícies de DOC ÚNICO + push + writes

Selects/populates ampliados (+content_rating tags) em: detalhe, episódios
da série, episódio/leitor, signed-url, search ramo EPISÓDIOS (post-filter
com serieVisivelPara). Composição com podeVerRascunho (rascunho inalterado).
Push: notifyEpisodePublished filtra audiência (favoritou→bloqueou→zero
envios). Writes de engajamento → 404 (favoritar, votar ×2, SR
create-session). Testes: deep link não fura por nenhum caminho; admin segue
gerenciando episódios; dono abre a própria obra com a tag dela bloqueada.

## Task 6 — Tags no portal/admin + fila exige classificação

`PORTAL_SERIES_FIELDS` += tags (validação vocabulário/8; inversão do
contrato do B1 pinada: content_type/isPublished/genre SEGUEM ignorados);
select do GET /portal/series += tags (portalCrud:906 re-pinado). Aprovar:
pick += content_rating, exigência NA ROTA (400 "Classificação etária é
obrigatória para aprovar"), sugerida pré-preenche, null → seletor sem
default. `TagsChipInput` seletor fechado 19/máx 8 (admin + fila) + versão
i18n no form do portal. Badge "não classificadas" no admin.
adminTags.test.tsx re-pinado (/8, seletor).

## Task 7 — Frontend Conta: a seção do leitor

"Classificação etária e Preferências de conteúdo" (molde PrivacyCenter):
etária com explicação, 19 toggles i18n ×4 vindos do GET (sem lista
hardcoded), PIN de proteção (criar/trocar/remover/recuperar, tentativas
restantes, bloqueio). Nomenclatura EXATA do PDF. useCamadaVoltar se virar
camada/modal.

## Task 8 — Higiene do B1 (cortesia registrada)

CastError → 404 (canais + PUT portal/series/:id + POST paineis);
GET /channels?includeInactive=true (admin, isActive no select) + POST
/channels/:id/reativar + CanaisPanel lista/reativa inativos;
episode_number duplicado na mesma série → 400 (portal e admin).

## Task 9 — Script de migração do acervo

`scripts/migrarTagsVocabulario.js`: TODOS os docs de Series; mapa manual →
slug; dedupe + cap 8 por prioridade do mapa + ASSERT alto se >8; idempotente
(2ª rodada no-op); fixtures de teste (mapa >8 → cap; duas livres → mesmo
slug). Instruções de deploy no DOCS.md (rodar o script no VPS após o pull).
Smoke local da recomendação antes/depois com devMock, anotado no ledger.

## Task 10 — Revisão final do bloco (opus)

Spec × entregue (os 2 PDFs item a item), matriz de bypass integrada (deep
links, push, writes, admin/dono, logout registrado), triagem de dívidas,
regressão B4 (ranking real com cardinalidade nova — smoke), suítes + tsc.
Depois: E2E no app real (devMock ganha User com parental + PIN) e merge.
