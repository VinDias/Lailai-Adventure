# Plano — Fase 5 · Bloco 1: Portal do Ilustrador

Spec: `docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md` (rev. 2)
Branch: `fase5/bloco1-portal` · Ledger: `.superpowers/sdd/2026-09-02-fase5-bloco1/progress.md`

Processo por task: implementador (sonnet) com brief + SPEC; revisor
independente com SPEC; fix rounds via resume; commits `tipo(escopo)` em PT
(título sem acento). Testes antes do código. Datas SEMPRE injetáveis.
Backend primeiro (T1–T8), frontend depois (T9–T10), revisão final (T11).

## Task 1 — Fundações: canais fechados, modelos, MensagemPortal

`POST /channels` vira admin-only (403 não-admin, teste). `PUT /channels/:id`
ganha branch admin (edita qualquer canal; ÚNICO que processa `ownerEmail` →
resolve e-mail→userId, troca `ownerId`; não-admin com `ownerEmail` → 403;
teste de revogação PÓS-transferência). `POST /channels/:id/desativar`
(admin, `isActive: false`). `GET /channels/:id` público: `followersCount` +
`isFollowing`, sem `followers[]` (shape pinado). Modelos: `Series` +=
`content_rating_sugerida` (enum kids/teen/young, null) + `submittedAt`;
`genre` required condicional a `isPublished`; `Episode` += `submittedAt`;
`MensagemPortal` completo (com `ownerUserId`, `refTipo/refId`,
`arquivadaEm`). Troca de dono arquiva thread (helper testado aqui, rotas de
mensagem na T6).

## Task 2 — Drafts invisíveis ao público

Rotas públicas de conteúdo filtram publicado: busca, lista de episódios da
série, detalhe do episódio (SEM incrementar views/telemetria de draft),
signed-url recusa não publicado. Admin e dono do canal seguem vendo os
próprios drafts (o portal da T4 depende disso). Teste explícito: capítulo
draft em série JÁ publicada não aparece em lista/busca/detalhe; série
`isPublished: false` invisível. Regressão: suíte de conteúdo existente verde.

## Task 3 — Service de royalties + painel de números

Extrair `buildReport` + `buildSuperReaderSummary` de `routes/royalties.js`
para `services/royaltyReportService.js`; os dois routers consomem do service;
testes admin existentes CONTINUAM verdes (prova da extração). `GET
/portal/meu-estudio` (canais + contagens; 403 não-dono) e `GET
/portal/resumo?period=` (mês corrente: pontos/views válidas/share % SEM R$;
períodos fechados com R$ do `RoyaltyPeriod.breakdown` filtrado; SR por mês)
— tudo escopado aos canais do usuário, teste "resumo bate com o service".

## Task 4 — CRUD do portal + submissão

`POST /portal/series` (`content_type: 'hiqua'` PINADO server-side — teste
com body malicioso; draft sem gênero salva; `content_rating_sugerida` do
form). `PUT /portal/series/:id` (só draft NÃO submetido; publicada/submetida
403). `POST /portal/series/:id/episodios` (draft, thumbnail upload opcional
com fallback = 1º painel na submissão). `POST .../enviar` ×2 (marca
`submittedAt`; validações mínimas capa/painéis). Ownership cruzado em TODAS
(A não toca na obra de B — teste explícito). Criação draft NUNCA dispara
push/recálculo.

## Task 5 — Uploads com guarda de dono

`upload-image` e `upload-image-batch`: `verifyToken` + admin OU dono do canal
da série alvo; contrato muda para `seriesId`/`episodeId` reais no body; slug
do caminho derivado SERVER-SIDE da série resolvida (nunca do body). `upload`,
`upload-video`, `upload-audio`: admin-only explícito (teste 403 dono de
canal). `POST /episodes/:id/panels` ganha a mesma regra dono-OU-admin (o
portal usa). Admin flows existentes intactos (regressão).

## Task 6 — Mensagens editor↔ilustrador

`GET/POST /portal/mensagens` (thread do dono vigente: `canalId` +
`ownerUserId` = req.user; ordem, `lidaEm`, max 2000, limites). Admin:
`GET/POST /admin/mensagens/:canalId` (vê arquivadas). Teste do arquivamento:
troca de dono → novo dono NÃO lê histórico antigo; admin lê. `refTipo/refId`
aceitos/validados.

## Task 7 — Fila de Aprovação

`GET /admin/aprovacoes` (SÓ submetidos não publicados; draft do admin sem
`submittedAt` fica FORA — teste; preview + classificação sugerida).
`POST /admin/aprovacoes/:tipo/:id/aprovar`: exige gênero preenchido (400 sem;
a rota aceita gênero/tags no body para o Master preencher na mesma ação),
publica pelos caminhos existentes (série `isPublished`, episódio
`status: 'published'`) e DISPARA os 6 pontos de push + recálculo (testes dos
6 caminhos continuam verdes). `/devolver`: limpa `submittedAt`, gera
MensagemPortal do editor com `refTipo/refId` + texto. Ambos no `AdminLog`.

## Task 8 — LGPD

Exclusão de conta: bloqueada enquanto dono de canal ATIVO (mensagem clara);
desativar/transferir desbloqueia (teste do fluxo completo
desativar→excluir). Na exclusão: mensagens autoradas pelo usuário apagadas;
export inclui mensagens (inclusive de threads arquivadas dele) + vínculo de
canal. LGPD do restante intacta (suíte existente verde). Conferir
`routes/account.js` (hoje deleta canal junto — comportamento MUDA: canal de
dono ativo bloqueia antes).

## Task 9 — Frontend: Meu Estúdio

Cartão "Meu Estúdio" na Conta (só donos). Tela `PortalEstudio`, abas:
Números (painel: mês corrente sem R$, fechados com R$, SR), Obras (lista com
estados draft/em análise/devolvida/publicada + criar/editar draft + capítulos
+ uploads de capa/thumbnail/painéis com progresso + botão Enviar para
aprovação), Mensagens (thread com lida/não lida), seções CINECOMICS/
VERTICALSHOW bloqueadas com aviso de temporada ("em breve"). i18n 4 idiomas.
Shapes da API pinados nos testes.

## Task 10 — Frontend: canal público, admin e bug da descrição

`CanalPublico` (avatar/banner/nome/descrição, obras publicadas, Seguir/
Seguindo + contagem) via clique no nome do canal no modal de detalhe (3
feeds). Admin: Fila de Aprovação (badge = submetidos; card com preview,
classificação sugerida, editor de gênero/tags, Aprovar bloqueado sem gênero),
campo "E-mail do dono" + botão desativar no form de canal, aba Mensagens por
canal. Bug fix: descrição do capítulo renderizada na lista dos 3 feeds.
i18n leitor 4 idiomas; admin PT.

## Task 11 — Revisão final do bloco (opus)

Costuras, spec×entregue (PDF de 26/08 item a item + decisões 28/08), ataques
de ownership de ponta a ponta (A→B em toda rota nova), drafts invisíveis sob
todos os ângulos, LGPD, regressões (royalties/push/algoritmo/feeds/admin),
triagem de menores, suítes completas + tsc. Depois: teste local com o app
real (devMock ganha um canal de ilustrador não-admin com obra draft) e merge.
