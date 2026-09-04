# Fase 5 · Bloco 3 — Curadoria Semiautomática

**Contrato: pacote R$ 3.700 aprovado 28/08 (este bloco: Curadoria R$ 1.400).**
**Fontes: regras do Vin no 99freelas em 17/08 (memória `fase5-curadoria-regras-vin`) · proposta de 24/08 · Blocos 1 e 2 já em main (MensagemPortal, Fila de Aprovação, content_rating, filtro parental).**

## As regras do Vin (letra, 17/08)

1. **Sem remoção automática, nunca.** "Não Conforme" só gera sinais; o sistema
   aponta o que merece atenção; o CURADOR decide.
2. Gatilho normal: **100 / 200 / 300 / 500 sinalizações válidas**, conforme o
   volume de visualizações.
3. Obras pequenas: **mínimo de 20 sinalizações + 30% das visualizações únicas**.
4. Casos graves (**direitos autorais / conteúdo proibido**): **5 sinalizações**
   dão prioridade máxima na fila — mas nunca removem.
5. Antiabuso: **uma conta = uma sinalização por obra**, com filtros antiabuso
   (a infra anti-fraude da Fase 3 é a base).
6. Fila de Revisão: curador decide entre **aprovar, reclassificar, solicitar
   correção ou remover**.
7. Artista **avisado** e com **direito de resposta** (mensagem privada — a
   MensagemPortal do Bloco 1).
8. **Proibido**: usar dislike/popularidade para curadoria; expor publicamente
   quem denunciou ou quantas denúncias uma obra recebeu.

## O que JÁ existe (scout com file:linha)

| Peça | Estado |
|---|---|
| Consumidores únicos por obra | `royaltyReportService.js:57-69` — aggregate de `EngagementEvent` `{type view/read, flagged:false}` com `$addToSet {$ifNull:['$userId','$ipHash']}` — **a base das "visualizações únicas"** (dedupe 6h já aplicado como `flagged` pelo logger `engagementLogger.js:70-93`) |
| "1 conta = 1 ação por obra" | `SeriesVote` unique `{userId, seriesId}` (`models/SeriesVote.js:11`) + upsert idempotente com `E11000` tratado (`content.js:719-756`) + `serieVisivelPara` ANTES de escrever |
| Aviso privado ao artista | `MensagemPortal` com `refTipo/refId` reservados para isto (`models/MensagemPortal.js:14-16`); Master→dono em `adminPortal.js:124-158` (ownerUserId sempre do canal); artista lê/responde em `portal.js:562-638` |
| Molde da fila admin | `GET /admin/aprovacoes` flat + ações + AdminLog (`adminPortal.js:181-445`); `AprovacoesPanel.tsx`; badge por polling em `AdminDashboard.tsx:301-311/943` — **o único "avisa o Master" que existe** (não há push/e-mail para admin) |
| Reclassificar | `PUT /content/series/:id` → `applySeriesUpdate` (`content_rating` na allowlist `content.js:22`) |
| Despublicar | `isPublished:false` via `applySeriesUpdate` — nada dispara, favoritos persistem, feeds filtram; **remover de verdade** (`DELETE /series/:id`, `content.js:255-281`) apaga episódios/favoritos/votos — irreversível |
| AdminLog | `{adminId, action, targetId, details}` (`models/AdminLog.js:3-9`) |
| Botão do leitor | fila de ações do modal de detalhe (favoritar → curtir → Super Reader) idêntica nos 3 feeds (`HQCine.tsx:259-278`, `VFilm.tsx:264-283`, `HiQua.tsx:269-288`); guest = botão desabilitado (padrão) |
| Views | `Episode.views` bruto (sem dedupe) — **NÃO serve** para os gatilhos; a base é o aggregate acima |

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Quem sinaliza | **Só conta logada** (`verifyToken`); guest vê o botão desabilitado (padrão do favoritar). Obra precisa ser visível ao usuário (`serieVisivelPara` — não sinaliza o que não pode ver, 404) | "Uma conta = uma sinalização" pressupõe conta; anônimo é infalsificável |
| Modelo `Sinalizacao` | `{ seriesId, userId, motivo: enum, grave: Boolean (derivado do motivo), descricao?: String max 500, valida: Boolean, invalidaMotivo?: String, revisadaEm: Date/null (fechada por um caso), createdAt }` · **unique `{userId, seriesId}`**; upsert idempotente: re-sinalizar → 200 `{ jaSinalizada: true }` sem alterar (motivo não muda — evita "gamificar" a categoria) | Letra da regra 5 + padrão do voto |
| Vocabulário de motivos (fechado) | `conteudo_inadequado_faixa` (não condiz com a classificação etária) · `violencia_excessiva` · `conteudo_sexual` · `discurso_de_odio` · `spam_ou_enganoso` · **`direitos_autorais`** · **`conteudo_proibido`** · `outro` (descrição obrigatória). Graves = `direitos_autorais`, `conteudo_proibido` | Regra 4 nomeia os dois graves; o resto cobre "não conforme" sem virar censura de gosto |
| Sinalização VÁLIDA (antiabuso) | Válida se o usuário tem **consumo real da obra**: ≥1 `EngagementEvent` não-flagged (`view`/`read`) OU `ReadingProgress` na série. Sem consumo → gravada com `valida:false, invalidaMotivo:'sem_consumo'` (conta para o admin ver, NÃO conta para gatilho). Conta `isActive:false` → 403 | "Sinalizações válidas" (regra 2) precisa de critério; consumo real é o que a Fase 3 já mede e é o que separa leitor de brigada |
| Base de volume V | **Visualizações únicas da obra** = consumidores únicos não-flagged de `EngagementEvent` (mesma agregação de `royaltyReportService.js:57-69`, extraída para função compartilhada `contarConsumidoresUnicos(seriesId)`), janela = vida toda da obra | Regra 3 fala em "visualizações únicas"; `Episode.views` é bruto e inflável |
| Faixas dos gatilhos (mapeamento que o Vin não deu — DECISÃO EXPLÍCITA, a confirmar com ele na entrega) | S = sinalizações válidas não revisadas. **Obra pequena (V < 1.000)**: gatilho quando `S ≥ 20 E S ≥ 0,30·V`. **V ≥ 1.000 → 100** · **V ≥ 10.000 → 200** · **V ≥ 50.000 → 300** · **V ≥ 100.000 → 500**. **Grave**: `S_grave ≥ 5` abre com `prioridade:'grave'` em QUALQUER V. Constantes num único objeto exportado (`utils/curadoriaLimiares.js`) para ajuste sem tocar em lógica | Os 4 patamares do Vin precisam de faixas de V para serem aplicáveis; a escada escolhida cresce com o alcance (100 sinais em 1k views = 10%; 500 em 100k = 0,5%) e a obra pequena tem piso 20 para não ser derrubada por 6 amigos |
| Caso de curadoria | `CasoCuradoria { seriesId, status: 'aberto'\|'aguardando_artista'\|'fechado', prioridade: 'normal'\|'grave', abertoEm, gatilho: {tipo:'normal'\|'pequena'\|'grave', S, V, limiar}, resumoMotivos: {motivo: count}, mensagemAvisoId, decisao?: 'aprovar'\|'reclassificar'\|'solicitar_correcao'\|'remover', decididoPor?, decisaoEm?, observacao? }` · **1 caso aberto por obra** (unique parcial em `{seriesId, status≠fechado}` — implementar como checagem + índice em `{seriesId, status}`) | A fila trabalha com CASOS, não com sinalizações soltas |
| Avaliação do gatilho | Fire-and-forget após cada sinalização VÁLIDA (padrão `dispararRecalculo`): recomputa S (não revisadas), S_grave, V; se atinge limiar e não há caso aberto → abre caso, **avisa o artista** (MensagemPortal do editor com `refTipo:'series'`, texto-template i18n-PT do lado do servidor: "Sua obra X recebeu sinalizações de leitores nas categorias: A, B. O editor vai revisar. Você pode responder por aqui." — **SEM números**), grava AdminLog `CURADORIA_CASO_ABERTO`. Erro na avaliação NUNCA falha a sinalização (200 para o leitor de qualquer jeito) | Regra 1 e 7; a sinalização é do leitor, o caso é do sistema |
| Escalonamento | Caso aberto `normal` que depois atinge `S_grave ≥ 5` → vira `grave` (sobe na fila, AdminLog). Novas sinalizações em caso aberto só atualizam `resumoMotivos` | Um caso, prioridade viva |
| Fila de Revisão (admin) | `GET /admin/curadoria` — casos `aberto`/`aguardando_artista`, **graves primeiro**, depois por `S/limiar` desc; item: obra (título/capa/canal/rating/tags), gatilho, `resumoMotivos`, S e V (**só o admin vê números**), descrições dos leitores (**anonimizadas — sem userId/nome**), thread do canal (últimas mensagens com `refId` da obra), status. Badge "Curadoria N" (graves destacadas) no sidebar do admin, por polling (padrão) | Regra 8: números e identidades nunca públicos; para o admin, números sim, identidades NÃO (não precisa saber quem para decidir) |
| Ações do curador (todas com AdminLog + `observacao` opcional) | **Aprovar** (mantém; caso `fechado`; sinalizações do caso marcadas `revisadaEm` — S zera para o próximo ciclo). **Reclassificar** (body `content_rating` → `applySeriesUpdate`; fecha; aviso ao artista com a nova classificação). **Solicitar correção** (texto obrigatório → MensagemPortal com `refId`; caso → `aguardando_artista`; o artista responde pela thread; o curador fecha depois com aprovar/remover). **Remover** = **DESPUBLICAR** (`isPublished:false` via `applySeriesUpdate`, nunca `DELETE` — reversível pelo Master pelo PUT; fecha; aviso ao artista com o motivo). **Nada é automático** | Regras 1 e 6; "remover" do Vin = tirar do ar, não apagar obra e favoritos de terceiros irreversivelmente |
| Direito de resposta | O artista responde na thread do canal (já existe); a fila mostra a thread; **nenhuma sinalização, contagem ou identidade chega ao artista** — só as categorias no aviso | Regra 7 + regra 8 |
| Dislike/popularidade | **Nunca** entram em S, V ou prioridade (teste explícito: 1.000 dislikes → 0 casos) | Regra 8 |
| Privacidade pública | Nenhuma rota de leitor devolve contagem de sinalizações nem existência de caso; `GET /series/:id/sinalizacao` devolve só `{ jaSinalizada, motivo }` do próprio usuário. Shape público das séries inalterado | Regra 8 |
| Reabertura | Obra com caso fechado volta a acumular do zero (só sinalizações não revisadas contam); caso `fechado` fica no histórico (`GET /admin/curadoria?status=fechado`) | Ciclos independentes, histórico para o Master |
| LGPD | Export inclui as sinalizações do usuário (obra, motivo, data — não o caso); exclusão de conta **apaga** suas sinalizações (S recalcula na próxima avaliação); descrição do leitor é dado dele — apagada junto | Minimização |
| Frontend leitor | Botão **"Sinalizar"** (ícone bandeira) ao lado do Super Reader nos 3 modais; modal: select de motivo (i18n ×4), descrição (obrigatória em `outro`), confirmação "Sua sinalização é anônima para o autor e para outros leitores; o editor vai avaliar." Já sinalizada → botão em estado "Sinalizada" (sem contagem). `useCamadaVoltar` no modal. Nomenclatura para o leitor: **"Sinalizar conteúdo"** (não "denunciar") | Tom do Vin ("mais soltas, sem barreiras"); anonimato dito na cara |
| Frontend admin | `CuradoriaPanel.tsx` (molde `AprovacoesPanel`): lista com prioridade, card com números/motivos/descrições anonimizadas/thread, 4 botões (Remover com confirm e motivo obrigatório; Reclassificar com select; Solicitar correção com textarea), histórico de fechados, badge com refetch. PT fixo | Padrão da fila |
| Portal do artista | Nenhuma tela nova: o aviso chega na aba Mensagens (com "Sobre: <obra>") e a resposta é a thread. Card da obra ganha selo "Em revisão editorial" enquanto há caso aberto (sem números) | Reuso do B1; transparência sem exposição |

## Rotas

| Rota | Função |
|---|---|
| `POST /content/series/:id/sinalizar` (verifyToken) | body `{ motivo, descricao? }`; visível? (404 senão); upsert unique; calcula `valida`; 201 `{ jaSinalizada:false }` / 200 `{ jaSinalizada:true }`; dispara avaliação fire-and-forget |
| `GET /content/series/:id/sinalizacao` (verifyToken) | `{ jaSinalizada, motivo }` do próprio usuário — nada mais |
| `GET /admin/curadoria?status=` (admin) | fila (aberto/aguardando_artista) ou histórico (fechado) + `total`, `graves` |
| `POST /admin/curadoria/:casoId/aprovar` · `/reclassificar` `{content_rating}` · `/solicitar-correcao` `{texto}` · `/remover` `{motivo}` (admin) | as 4 decisões; 409 se caso já fechado |
| Export LGPD | += `sinalizacoes: [{seriesId, titulo, motivo, createdAt}]` |

## Serviço

`services/curadoriaService.js`: `contarConsumidoresUnicos(seriesId)` (extraído/compartilhado com `royaltyReportService`), `limiarPara(V)`, `avaliarObra(seriesId)` (S, S_grave, V → abre/escalona caso + aviso + AdminLog; nunca lança para o chamador), `fecharCaso(caso, decisao, admin, extra)`. Constantes em `utils/curadoriaLimiares.js`.

## Fora deste bloco (registrado)

Notificação ativa ao admin (push/e-mail) — badge por polling é o padrão do app · sinalização de EPISÓDIO específico (a unidade de curadoria do Vin é a obra) · sinalização de comentários (não existem) · appeal formal além da thread · faixas de V ajustáveis pelo Master na UI (constantes no código, ajuste por deploy) · anti-brigada por IP/dispositivo além do "1 conta + consumo real".

## Testes (antes do código, por task)

Backend: unique por conta/obra (2ª → 200 jaSinalizada, sem write); guest 401; obra invisível (parental/draft) 404 sem write; motivo fora do enum 400; `outro` sem descrição 400; validade (com consumo → valida; sem → invalida:'sem_consumo' e NÃO conta); **gatilhos com fixtures não-redondas**: pequena (V=47: 20 sinais e 14 = 30% → abre em 20; V=90: 20 mas 27 é 30% → abre só em 27), V=1.000→100, 10.000→200, 50.000→300, 100.000→500 (fronteiras exatas: 99 não abre, 100 abre), grave 5 (4 não), escalonamento normal→grave; 1 caso aberto por obra (concorrência: 2 avaliações simultâneas → 1 caso); dislikes NUNCA contam; aviso ao artista criado com refTipo/refId e SEM números no texto; falha na avaliação não afeta o 201 do leitor (spy lançando); fila ordenada (grave primeiro, depois S/limiar); ações: aprovar zera S (nova sinalização reabre ciclo), reclassificar grava rating + fecha + aviso, solicitar correção → aguardando_artista + mensagem, remover → isPublished:false (NÃO delete: episódios/favoritos intactos) + fecha + aviso; 409 em caso fechado; não-admin 403 em tudo; AdminLog nas 5 ações (abrir + 4); shape público das séries e do leitor sem contagens (grep); export com sinalizações; exclusão apaga sinalizações e S cai.
Frontend: botão nos 3 feeds (guest disabled, logado abre modal, já sinalizada estado fixo), modal i18n ×4 com `outro` exigindo descrição, sem contagem em lugar nenhum; admin: fila com graves primeiro, 4 ações com payloads pinados, badge, histórico; portal: selo "Em revisão editorial" sem números.
