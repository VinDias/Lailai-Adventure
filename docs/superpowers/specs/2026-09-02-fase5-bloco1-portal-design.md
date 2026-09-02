# Fase 5 · Bloco 1 — Portal do Ilustrador

**Contrato: pacote R$ 3.700 aprovado pelo Vin em 28/08 (portal R$ 2.000 + parental R$ 700 + curadoria R$ 1.400), pagamento garantido no 99freelas em 01/09.**
**Fontes: proposta enviada 24/08 · PDF "Conta do Ilustrador — Regra Final" (26/08) · PDF "Sistema de Tags" (31/08, tags entram no Bloco 2) · decisões do Vin em 28/08 (Gênero fica; reprovação vira crédito — crédito é da 5.1).**
**Rev. 2 — incorpora os 17 achados do painel adversarial de 4 lentes (contrato/arquitetura/segurança/fronteiras) de 02/09.**

## Objetivo

Cada ilustrador com conta própria vinculada ao canal: página pública com botão
Seguir, painel com os números dele (views válidas, pontos, fatia, mês, Super
Reader, histórico), upload dos próprios capítulos que só entram no ar após
aprovação do Master, e mensagem privada editor↔ilustrador (que a curadoria do
Bloco 3 reutiliza). O Vin deixa de ser o único operador do catálogo.

## O que JÁ existe (lido do código)

| Peça | Estado |
|---|---|
| `Channel` | `ownerId` (ref User, required), `name/description/avatar/banner`, **`followers[]` + POST/DELETE `/:id/follow`**, `GET /channels/me`, `GET /channels/:id` público. **ATENÇÃO: POST /channels hoje aceita qualquer usuário autenticado — vira admin-only neste bloco** |
| Aprovação | `Episode.status: draft/processing/published`; publicar dispara os 6 pontos de push + recálculo do algoritmo (Fase 4). **ATENÇÃO: rotas públicas hoje NÃO filtram draft (busca, lista de episódios, detalhe) — corrigido neste bloco** |
| Upload | `routes/bunnyWebhook.js`: `upload-image`, `upload-image-batch` (painéis), `upload-video`, `upload-audio` — hoje admin-only; recebem `seriesSlug` texto-livre (sem objeto validável — contrato muda neste bloco); painéis via `POST /episodes/:id/panels` (admin) |
| Royalties | motor da Fase 3 agrega por canal (`buildReport.byChannel`); Super Reader por canal (Fase 4 B3). `buildReport`/`buildSuperReaderSummary` são privadas de `routes/royalties.js` — extração para service é tarefa deste bloco |
| Série | `tags` (vocabulário vira fechado no Bloco 2), `genre` (FICA — decisão 28/08; hoje `required: true` — vira condicional neste bloco), `content_rating` chega no Bloco 2 |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Quem é ilustrador | **Derivado**: usuário que é `ownerId` de ≥1 canal ativo. SEM role novo. **PRÉ-CONDIÇÃO: `POST /channels` vira admin-only** (mudança explícita; teste 403 para não-admin) — sem isso qualquer leitor se autopromove a ilustrador | Zero migração; "vincular uma vez no painel" = admin define o dono. Painel do painel: campo de e-mail no form de canal do admin |
| Revogar/transferir | Admin troca o dono (`ownerEmail` no PUT com branch admin) OU desativa o canal (`isActive: false`, rota admin nova). Troca de dono **arquiva a thread de mensagens** (só admin vê) e abre thread nova para o novo dono | Revogação precisa funcionar DEPOIS da transferência (o admin já não é o dono); histórico privado do ex-ilustrador não pode vazar para o sucessor (LGPD) |
| Acesso ao portal | Aba **"Meu Estúdio"** na Conta, visível só para donos de canal | Não polui a UI de leitor comum |
| Painel de números | `GET /api/portal/resumo` — reusa as MESMAS agregações do motor, extraídas para `services/royaltyReportService.js` (`buildReport` + `buildSuperReaderSummary` saem de `routes/royalties.js`; os dois routers consomem do service; testes admin existentes continuam verdes). **Mês corrente: pontos, views válidas e % de share — SEM valor em R$** (o pool só é confirmado no fechamento). R$ aparece só em períodos FECHADOS (`RoyaltyPeriod.breakdown` filtrado ao canal) + SR por mês | "Os mesmos números do seu relatório" (PDF) sem criar número novo que diverge no fechamento — um só ponto de verdade, zero contestação de pagamento |
| Upload do ilustrador | **Hi-Qua completo** neste bloco: criar série (draft), criar capítulo, subir painéis (batch, pipeline Bunny) e camadas de tradução. **`POST /portal/series` PINA `content_type: 'hiqua'` no servidor** (body ignorado/rejeitado). HQCine/VCine: o portal MOSTRA as duas seções **bloqueadas com aviso** "Publicação mediante contratação de temporada — em breve" (sem checkout, sem upload) | O PDF de 26/08 descreve as abas com alerta de pagamento como parte da conta; a seção estática satisfaz a letra do PDF sem entregar o gate pago (5.1) nem abrir o buraco "vídeo grátis" |
| Formulários do portal (PDF 26/08) | Capa, **thumbnail do capítulo** e painéis **só por upload** (zero campos de URL). Thumbnail do capítulo: upload opcional; sem upload, **fallback = primeiro painel**. SEM campo Gênero para o ilustrador (o Master preenche na aprovação — Gênero segue existindo e visível ao leitor); **"Classificação sugerida"** (Kids/Teen/Young) no form — gravada em `content_rating_sugerida`, vira oficial no Bloco 2; tags: campo entra no Bloco 2 | Letra do PDF ("autor não tem Bunny"; episódio sem campos de URL) + decisão do Vin de 28/08 |
| `Series.genre` | Deixa de ser `required: true` → **required condicional a `isPublished`**. A Fila de Aprovação **exige gênero preenchido para habilitar Aprovar** (e avisa se tags = 0). Master edita gênero + tags na própria tela da fila; preencher gênero na aprovação dispara a tradução pelo caminho existente de update | Sem isso a criação de série do portal morre em ValidationError; placeholder vazaria para o leitor. Obras aprovadas já saem com gênero e tags → entram na Afinidade do algoritmo desde o dia 1 |
| Submissão explícita | `Series` e `Episode` ganham `submittedAt: Date/null`. Portal tem botão **"Enviar para aprovação"**; a Fila lista SÓ submetidos (`submittedAt != null` e não publicado). Devolver limpa `submittedAt` (volta a rascunho editável) | Sem o marcador, a fila ingere os drafts do próprio Vin (fluxo admin atual cria draft e publica depois) e trabalho-pela-metade do ilustrador — badge inútil, risco de aprovar obra incompleta. Bloco 3 herda o marcador |
| Aprovação | Obra/capítulo do portal nascem `isPublished: false` / `status: 'draft'`. **Fila de Aprovação** no admin (pendentes com preview + classificação sugerida visível) → Aprovar publica (dispara push/algoritmo pelos caminhos existentes) ou Devolver com mensagem. **Aprovar/Devolver registrados no `AdminLog`** | "Só entram no ar depois da sua aprovação no painel Master"; trilha de decisão apoia o direito de resposta do Bloco 3 |
| Drafts invisíveis ao público | **Rotas públicas de conteúdo passam a filtrar publicado**: séries `isPublished: true`, episódios `status: 'published'` — em busca, lista de episódios da série, detalhe do episódio (sem incrementar views/telemetria de draft) e signed-url (recusa episódio não publicado). Admin e dono do canal continuam vendo os próprios drafts | Hoje um draft numa série publicada aparece na lista do leitor e na busca — furaria a aprovação do Master no dia 1 do portal |
| Mensagem privada | `MensagemPortal { canalId(req, index), ownerUserId(req — dono vigente da thread), autorTipo: 'editor'\|'ilustrador', autorUserId, refTipo: 'series'\|'episode'\|null, refId: null, texto(req, max 2000), lidaEm }` — thread por (canal, dono vigente), aba no portal + no admin. Devolução preenche `refTipo/refId` automaticamente. Sem anexos, sem e-mail | O PDF pede mensagem privada "só para ele"; o escopo por dono impede vazamento na troca; refTipo/refId deixa a devolução apontar o capítulo e é o gancho que a curadoria (Bloco 3) reutiliza para avisar por obra |
| Ownership nas rotas | TODA rota do portal valida `canal.ownerId === req.user.id` e que a série/capítulo pertence ao canal — no backend, nunca só na UI | Ilustrador A não toca na obra do B |
| Uploads: auth | **SÓ `upload-image` e `upload-image-batch`** ganham a regra "admin OU dono do canal da série alvo". Contrato muda: o portal envia **`seriesId` real** (não slug); o servidor resolve série→`channelId`→`ownerId`, valida, e **deriva o slug do caminho server-side**. `upload`, `upload-video` e `upload-audio` permanecem **admin-only** até a 5.1 | Slug de texto livre não dá objeto para validar (A escreveria na pasta do B); abrir vídeo ao dono reabriria o "vídeo grátis" que o gate de temporada da 5.1 vai cobrar |
| Edição pós-publicação | `PUT /portal/series/:id` **só funciona em draft não submetido**. Série publicada NÃO é editável pelo portal — ilustrador pede ajuste ao editor pela thread | Mantém o pilar "nada vai ao ar sem aprovação" (descrição ao vivo seria spam/link à vista de Kids) e zero custo de fila de alterações |
| Bug da descrição do episódio | Corrigir de brinde: a descrição passa a aparecer na lista de capítulos do modal (3 feeds), abaixo do título, quando existir | Relato do Vin no PDF, confirmado no código (nunca renderizada) |
| Página pública do canal | `GET /channels/:id` já existe; **o shape público muda: `followersCount` (número) + `isFollowing` (bool p/ logado), SEM o array `followers[]`** (userIds de seguidores são dado pessoal). Nasce a tela `CanalPublico` (avatar/banner/nome/descrição, obras publicadas do canal, Seguir/Seguindo com contagem) — alcançável pelo nome do canal no modal de detalhe da obra | "Página pública com as obras e botão Seguir"; sem expor quem segue o quê a scrapers |
| Seguir | Reusa `followers[]`/rotas existentes; seguidor NÃO recebe push neste bloco (push segue por favorito) | Escopo: push por canal seguido não foi pedido |
| LGPD | Mensagens do portal e vínculo de canal entram no export (inclusive de ex-dono, das threads arquivadas dele). Exclusão de conta **bloqueada enquanto dono de canal ATIVO**, com mensagem clara ("transfira ou peça a desativação do canal ao editor"). **Porta de saída existe neste bloco**: admin desativa (`isActive: false`) ou transfere → exclusão desbloqueia. Na exclusão do ex-dono, as mensagens autoradas por ele são apagadas (comunicação privada dele) | Não órfãozar canal nem apagar obra publicada; bloqueio sem porta de saída seria negativa permanente do Art. 18 VI |
| Visitante/leitor comum | Nada muda para quem não é dono de canal | Portal é aditivo |

## Modelos novos/alterados

- `Channel` — sem mudança de schema (rotas mudam: POST admin-only; PUT ganha branch admin; nova rota admin de desativar).
- `Series` += `content_rating_sugerida: { type: String, enum: ['kids','teen','young'], default: null }` · `submittedAt: { type: Date, default: null }` · `genre` required → condicional a `isPublished`.
- `Episode` += `submittedAt: { type: Date, default: null }` (status draft já serve para o resto).
- `MensagemPortal { canalId(ref, req, index), ownerUserId(ref, req), autorTipo: 'editor'|'ilustrador', autorUserId(ref), refTipo: 'series'|'episode'|null, refId(ObjectId, null), texto(req, max 2000), lidaEm(Date, null), arquivadaEm(Date, null) }`, timestamps.

## Rotas (novas em `/api/portal`, todas `verifyToken` + guarda de dono; alterações marcadas)

| Rota | Função |
|---|---|
| `GET /portal/meu-estudio` | canais do usuário + contagens (obras, pendentes, mensagens não lidas). 403 se não é dono de canal ativo |
| `GET /portal/resumo?period=` | números do painel: mês corrente (pontos/views/share %, sem R$) + períodos fechados (com R$) + SR — tudo via `royaltyReportService` |
| `POST /portal/series` | cria série DRAFT no canal do usuário — `content_type: 'hiqua'` pinado no servidor (title, description, classificação sugerida; capa via upload) |
| `PUT /portal/series/:id` | edita a própria série **draft não submetida** (publicada/submetida: 403) |
| `POST /portal/series/:id/episodios` | cria capítulo draft (thumbnail: upload opcional, fallback = 1º painel) |
| `POST /portal/episodios/:id/paineis` | painéis (batch upload — envia `seriesId`/`episodeId` reais; slug derivado server-side) |
| `POST /portal/series/:id/enviar` · `POST /portal/episodios/:id/enviar` | marca `submittedAt` (validações mínimas: capa/painéis presentes) |
| `GET /portal/mensagens` / `POST /portal/mensagens` | thread do canal do dono vigente (ilustrador) |
| Admin: `GET /admin/aprovacoes` | fila de SUBMETIDOS (séries/capítulos com `submittedAt`, não publicados) + preview + classificação sugerida |
| Admin: `POST /admin/aprovacoes/:tipo/:id/aprovar` \| `/devolver` | aprovar exige gênero preenchido (tela permite editar gênero/tags); publica e dispara caminhos existentes; devolver limpa `submittedAt` e gera MensagemPortal do editor com `refTipo/refId`; ambos logam no `AdminLog` |
| Admin: `GET/POST /admin/mensagens/:canalId` | lado do editor da thread (vê arquivadas) |
| Admin: `PUT /channels/:id` **(alterado)** | branch admin: edita qualquer canal e é o ÚNICO que processa `ownerEmail` (troca de dono arquiva thread); dono comum segue escopado a si, `ownerEmail` no body de não-admin → ignorado + 403 |
| Admin: `POST /channels/:id/desativar` **(nova)** | `isActive: false` (desbloqueia exclusão de conta do dono) |
| `POST /channels` **(alterado)** | vira admin-only (403 para não-admin) |
| `GET /channels/:id` **(alterado)** | shape público: `followersCount` + `isFollowing`, sem `followers[]` |
| Conteúdo público **(alterado)** | busca/lista de episódios/detalhe/signed-url filtram publicado; sem views de draft |

## Frontend

- **Conta** ganha o cartão "Meu Estúdio" (só donos) → tela `PortalEstudio` com abas: Números (painel), Obras (lista + criar/editar draft + capítulos + upload de capa/thumbnail/painéis com progresso + botão Enviar para aprovação + estado "Em análise"/"Devolvida"), Mensagens (thread), e seções **CINECOMICS/VERTICALSHOW bloqueadas** com o aviso de temporada (em breve).
- **CanalPublico** (leitor): via clique no nome do canal no modal de detalhe; Seguir/Seguindo + contagem.
- **Admin**: Fila de Aprovação (badge = submetidos; card com preview, classificação sugerida, editor de gênero/tags; Aprovar bloqueado sem gênero) + campo "E-mail do dono" no form de canal + botão desativar canal + aba Mensagens por canal.
- Modal dos 3 feeds: descrição do capítulo renderizada (bug fix).
- i18n 4 idiomas para tudo que o leitor/ilustrador vê; admin segue PT fixo.

## Fora deste bloco (registrado)

Checkout/gate de temporada HQCine/VCine + crédito de reprovação (5.1 — aqui só
a seção bloqueada com aviso) · capas DDLS (5.1) · legendas (5.1) · publicidade
Google×Originals (5.1) · vocabulário fechado de tags + classificação oficial +
PIN + filtros (Bloco 2 — mas o Master já pode taggear na aprovação com o campo
livre atual) · sinalização/fila de curadoria (Bloco 3) · push para seguidores
de canal.

## Testes (antes do código, por task)

Backend: derivação de ilustrador (dono de canal ativo); **403 não-admin em POST
/channels**; PUT /channels branch admin + `ownerEmail` só admin + **revogação
pós-transferência funciona**; 403 de não-dono em TODAS as rotas do portal;
ownership cruzado (A não edita obra de B — teste explícito); `content_type`
pinado 'hiqua' (body malicioso ignorado); série draft sem gênero salva, publicar
sem gênero falha; **draft invisível ao público** (busca/lista/detalhe/signed-url;
capítulo draft de série publicada não aparece; views não incrementam); submissão
(fila lista só submetidos; draft do admin fora da fila; devolver limpa
`submittedAt`); resumo bate com o service (mesmos números do report escopados,
sem R$ no mês corrente); testes admin de royalties seguem verdes pós-extração;
criação draft nunca dispara push/recálculo; aprovar exige gênero, publica e
dispara (os 6 caminhos continuam verdes); devolver gera mensagem com ref;
thread (ordem, lidaEm, limites, escopo por dono vigente, **arquivamento na troca
de dono** — novo dono não lê histórico antigo); uploads: dono válido ok, A→série
de B = 403, slug derivado server-side, vídeo/áudio seguem admin-only; shape
público do canal sem `followers[]`; exclusão bloqueada para dono ativo →
desativar → exclusão passa (LGPD do restante intacta); export inclui mensagens
e vínculo.
Frontend: cartão Meu Estúdio só para dono; fluxo criar obra→capítulo→painéis→
enviar para aprovação→estado; seções bloqueadas HQCine/VCine visíveis; página
do canal + seguir; fila de aprovação no admin (badge, gênero obrigatório);
descrição do capítulo visível; shapes da api pinados.
