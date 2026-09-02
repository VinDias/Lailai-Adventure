# Fase 5 · Bloco 1 — Portal do Ilustrador

**Contrato: pacote R$ 3.700 aprovado pelo Vin em 28/08 (portal R$ 2.000 + parental R$ 700 + curadoria R$ 1.400), pagamento garantido no 99freelas em 01/09.**
**Fontes: proposta enviada 24/08 · PDF "Conta do Ilustrador — Regra Final" (26/08) · PDF "Sistema de Tags" (31/08, tags entram no Bloco 2) · decisões do Vin em 28/08 (Gênero fica; reprovação vira crédito — crédito é da 5.1).**

## Objetivo

Cada ilustrador com conta própria vinculada ao canal: página pública com botão
Seguir, painel com os números dele (views válidas, pontos, fatia, mês, Super
Reader, histórico), upload dos próprios capítulos que só entram no ar após
aprovação do Master, e mensagem privada editor↔ilustrador (que a curadoria do
Bloco 3 reutiliza). O Vin deixa de ser o único operador do catálogo.

## O que JÁ existe (lido do código)

| Peça | Estado |
|---|---|
| `Channel` | `ownerId` (ref User, required), `name/description/avatar/banner`, **`followers[]` + POST/DELETE `/:id/follow`**, `GET /channels/me`, `GET /channels/:id` público |
| Aprovação | `Episode.status: draft/processing/published`; publicar dispara os 6 pontos de push + recálculo do algoritmo (Fase 4) |
| Upload | `routes/bunnyWebhook.js`: `upload-image`, `upload-image-batch` (painéis), `upload-video`, `upload-audio` — hoje admin-only; painéis via `POST /episodes/:id/panels` (admin) |
| Royalties | motor da Fase 3 agrega por canal (`buildReport.byChannel`); Super Reader por canal (Fase 4 B3) |
| Série | `tags` (vocabulário vira fechado no Bloco 2), `genre` (FICA — decisão 28/08), `content_rating` chega no Bloco 2 |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Quem é ilustrador | **Derivado**: usuário que é `ownerId` de ≥1 canal ativo. SEM role novo | Zero migração; "vincular uma vez no painel" = admin define o dono do canal (campo de e-mail no form de canal do admin). Revogar = trocar o dono |
| Acesso ao portal | Aba **"Meu Estúdio"** na Conta, visível só para donos de canal | Não polui a UI de leitor comum |
| Painel de números | `GET /api/portal/resumo` — reusa as MESMAS agregações do motor (views válidas, pontos, fatia estimada do pool do mês corrente, Super Reader 80%), escopadas ao(s) canal(is) do usuário; histórico = períodos FECHADOS (`RoyaltyPeriod.breakdown` filtrado ao canal) + SR por mês | "Os mesmos números do seu relatório, vistos só por ele" (PDF). Nada recalculado por fora do motor — um só ponto de verdade |
| Upload do ilustrador | **Hi-Qua completo** neste bloco: criar série (draft), criar capítulo, subir painéis (batch, reusa o pipeline Bunny) e camadas de tradução. **HQCine/VCine ficam FORA do portal** neste bloco — o gate pago é a Fase 5.1 (temporadas); nada de aba com aviso de pagamento ainda | O PDF amarra vídeo à cobrança por temporada; entregar upload de vídeo sem o gate criaria o buraco "vídeo grátis" que o Vin não quer |
| Formulários do portal (PDF 26/08) | Capa e painéis **só por upload** (zero campos de URL); SEM campo Gênero para o ilustrador (o Master preenche/ajusta no admin — Gênero segue existindo e visível ao leitor); **"Classificação sugerida"** (Kids/Teen/Young) no form — gravada em `content_rating_sugerida`, vira oficial no Bloco 2 quando o Master aprovar; tags: campo entra no Bloco 2 com o vocabulário fechado | Letra do PDF + decisão do Vin de 28/08 |
| Aprovação | Obra/capítulo do portal nascem `isPublished: false` / `status: 'draft'`. **Fila de Aprovação** no admin (lista de pendentes com preview) → Aprovar publica (dispara push/algoritmo pelos caminhos existentes) ou Devolver com mensagem | "Só entram no ar depois da sua aprovação no painel Master" |
| Mensagem privada | Modelo `MensagemPortal { canalId, autorTipo: 'editor'\|'ilustrador', texto, lidaEm }` — thread única por canal, aba no portal + no admin. Sem anexos, sem e-mail | O PDF pede mensagem privada "só para ele"; a curadoria (Bloco 3) usa esta mesma peça para avisar e receber resposta |
| Ownership nas rotas | TODA rota do portal valida `canal.ownerId === req.user.id` e que a série/capítulo pertence ao canal — no backend, nunca só na UI | Ilustrador A não toca na obra do B |
| Uploads: auth | As rotas Bunny de upload ganham `verifyToken` + regra: admin OU dono do canal da série alvo; tamanho/formato já validados hoje permanecem | Hoje são admin-only implícitas; o portal precisa delas com escopo |
| Bug da descrição do episódio | Corrigir de brinde: a descrição passa a aparecer na lista de capítulos do modal (3 feeds), abaixo do título, quando existir | Relato do Vin no PDF, confirmado no código (nunca renderizada) |
| Página pública do canal | `GET /channels/:id` já existe; nasce a tela `CanalPublico` (avatar/banner/nome/descrição, obras publicadas do canal, botão Seguir/Seguindo com contagem) — alcançável pelo nome do canal no modal de detalhe da obra | "Página pública do canal, com as obras e botão Seguir para os fãs" |
| Seguir | Reusa `followers[]`/rotas existentes; seguidor NÃO recebe push neste bloco (push segue por favorito) | Escopo: push por canal seguido não foi pedido |
| LGPD | Mensagens do portal e vínculo de canal entram no export; exclusão de conta de ilustrador: canal fica sem dono (`ownerId` → null? NÃO: exige `required`) → decisão: exclusão BLOQUEADA enquanto for dono de canal ativo, com mensagem clara ("transfira ou peça remoção do canal ao editor") | Não podemos órfãozar o canal nem apagar obra publicada de terceiros na plataforma |
| Visitante/leitor comum | Nada muda para quem não é dono de canal | Portal é aditivo |

## Modelos novos/alterados

- `Channel` += `slug`? NÃO (id basta). Sem mudança de schema.
- `Series` += `content_rating_sugerida: { type: String, enum: ['kids','teen','young'], default: null }` (oficial vem no Bloco 2).
- `MensagemPortal { canalId(ref, req, index), autorTipo: 'editor'|'ilustrador', autorUserId(ref), texto(req, max 2000), lidaEm(Date, null) }`, timestamps.
- `Episode` — sem mudança (status draft já serve).

## Rotas novas (montadas em `/api/portal`, todas `verifyToken` + guarda de dono; exceções marcadas)

| Rota | Função |
|---|---|
| `GET /portal/meu-estudio` | canais do usuário + contagens (obras, pendentes de aprovação, mensagens não lidas). 403 se não é dono de canal |
| `GET /portal/resumo?period=` | números do painel (mês corrente ao vivo + fechados) |
| `POST /portal/series` | cria série DRAFT no canal do usuário (title, description, classificação sugerida; capa via upload) |
| `PUT /portal/series/:id` | edita a própria série draft (publicada: só descrição — decisão: publicada é do editor) |
| `POST /portal/series/:id/episodios` | cria capítulo draft |
| `POST /portal/episodios/:id/paineis` | painéis (batch upload, pipeline Bunny existente com guarda de dono) |
| `GET /portal/mensagens` / `POST /portal/mensagens` | thread do canal (ilustrador) |
| Admin: `GET /admin/aprovacoes` | fila de pendentes (séries/capítulos draft de canais com dono) |
| Admin: `POST /admin/aprovacoes/:tipo/:id/aprovar` \| `/devolver` (com texto → vira MensagemPortal do editor) | aprovação/devolução |
| Admin: `GET/POST /admin/mensagens/:canalId` | lado do editor da thread |
| Admin: vincular dono | no PUT /channels/:id existente, aceitar `ownerEmail` → resolve para userId (só admin) |

## Frontend

- **Conta** ganha o cartão "Meu Estúdio" (só donos) → tela `PortalEstudio` com abas: Números (painel), Obras (lista + criar/editar + capítulos + upload de painéis com progresso), Mensagens (thread).
- **CanalPublico** (leitor): via clique no nome do canal no modal de detalhe; Seguir/Seguindo.
- **Admin**: Fila de Aprovação (badge com contagem) + campo "E-mail do dono" no form de canal + aba Mensagens por canal.
- Modal dos 3 feeds: descrição do capítulo renderizada (bug fix).
- i18n 4 idiomas para tudo que o leitor/ilustrador vê; admin segue PT fixo.

## Fora deste bloco (registrado)

HQCine/VCine no portal + cobrança por temporada + crédito de reprovação (5.1) ·
capas DDLS (5.1) · legendas (5.1) · publicidade Google×Originals (5.1) ·
vocabulário fechado de tags + classificação oficial + PIN + filtros (Bloco 2) ·
sinalização/fila de curadoria (Bloco 3) · push para seguidores de canal.

## Testes (antes do código, por task)

Backend: derivação de ilustrador (dono de canal ativo); 403 de não-dono em TODAS
as rotas do portal; ownership cruzado (A não edita obra de B — teste explícito);
resumo bate com o motor (mesmos números do report escopados, com SR); criação
draft nunca dispara push/recálculo; aprovar publica e dispara (os 6 caminhos já
testados continuam verdes); devolver gera mensagem; thread de mensagens (ordem,
lidaEm, limites); uploads com guarda de dono; exclusão de conta bloqueada para
dono de canal (LGPD do restante intacta); export inclui mensagens e vínculo.
Frontend: cartão Meu Estúdio só para dono; fluxo criar obra→capítulo→painéis→
enviado para aprovação; página do canal + seguir; fila de aprovação no admin;
descrição do capítulo visível; shapes da api pinados.
