# Fase 5.1 — escopo levantado (11/09/2026)

> Levantamento automatico em 4 frentes (ledgers da Fase 5, marcacoes no codigo, pedidos do cliente, riscos de producao), com evidencia `arquivo:linha` conferida. Base: HEAD 8a07301, tudo em producao.
> **56 itens.** Tamanhos: P = ate meio dia, M = 1 a 2 dias, G = 3 dias ou mais.

Distribuicao: 16 pequenos, 33 medios, 7 grandes.

---

## LENTE A — Dívidas registradas nos ledgers e specs da Fase 5 (Blocos 1, 2 e 3)

Li os três ledgers (.superpowers/sdd/2026-09-02-fase5-bloco1/progress.md, .../2026-09-03-fase5-bloco2/progress.md, .../2026-09-04-fase5-bloco3/progress.md) e as três specs (docs/superpowers/specs/2026-09-0{2,3,4}-fase5-bloco{1,2,3}-*.md), com foco nas seções "Fora deste bloco (registrado)", "Decisões nascidas na execução", "Dívidas 5.1 relevantes", "Comunicar ao Vin na entrega" e em toda menção literal a "5.1". Extraí 24 itens explicitamente adiados ou registrados como dívida, já com as duplicatas entre blocos agrupadas (ex.: "validação de host de imagem" aparece no B1 e no B2; "temporadas/legendas/DDLS/publicidade" aparece nos dois). Conferi no código todas as afirmações com arquivo:linha que cito. Itens que os ledgers registram como já FECHADOS foram descartados (followers[] cru, CastError→404 nas rotas inventariadas, backfill parental de boot, mutex/token da curadoria após as 3 rodadas, aba Curadoria ligada no App, índice parcial do EngagementEvent). O bloco de maior valor comercial é o pacote que o próprio B1 empurrou para a 5.1 por decisão do Vin (gate pago de temporada, crédito de reprovação, legendas, capas DDLS, publicidade) — o portal já tem a seção bloqueada no ar esperando por ele. O bloco de maior risco operacional é a calibração da curadoria: com os limiares entregues, na prática só o gatilho "grave" abre caso no catálogo atual do Vin, e não existe tela que mostre as sinalizações abaixo do gatilho nem chave de desligamento. NÃO incluí o deploy pendente do B2+B3 na VPS (dry-run das tags, smoke da recomendação) porque é conclusão da Fase 5, não escopo da 5.1. Não propus preço nem redigi proposta.

### [G] Gate pago de temporada HQCine/VCine (checkout)

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:33,:41,:87 · .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:36-37 (ruling P6) · components/PortalEstudio.tsx:829-830 · i18n/translations.ts:270-271

**O que e:** O portal do ilustrador já mostra as seções CINECOMICS e VERTICALSHOW BLOQUEADAS, com o aviso 'Publicação mediante contratação de temporada' + 'Em breve' nos 4 idiomas. Falta tudo que vem depois: checkout da temporada (HQCine 13 eps, VCine 60 eps, valores do PDF de 26/08), registro da compra, liberação da aba comprada e a regra de o que acontece quando a temporada acaba.

**Por que importa:** É a única monetização direta do artista prometida no PDF de 26/08 e o cliente já vê o aviso no ar — hoje é uma promessa visível e não cumprível. Enquanto não existe, HQCine/VCine continuam publicáveis só pelo admin.

### [M] Crédito de reprovação (obra reprovada vira crédito)

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:4 ('decisões do Vin em 28/08: Gênero fica; reprovação vira crédito — crédito é da 5.1')

**O que e:** Regra decidida pelo Vin em 28/08 e explicitamente empurrada para a 5.1: quando o Master reprova/devolve uma obra cuja temporada foi paga, o valor não se perde — vira crédito para o artista usar numa próxima submissão.

**Por que importa:** É a contrapartida justa do gate pago: sem o crédito, o artista paga a temporada e perde o dinheiro numa devolução editorial. Só faz sentido junto com o checkout, e o desenho do crédito precisa entrar na mesma modelagem.

### [G] Legendas de vídeo

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88 · docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105

**O que e:** Registrado como 'Fora deste bloco' nas duas specs, na mesma lista de 'temporadas/legendas/DDLS/publicidade (5.1)'. Não existe nenhum campo, upload, modelo ou player de legenda no código hoje.

**Por que importa:** O app é multi-idioma (4 idiomas em todo texto do leitor) mas o conteúdo de vídeo não é: sem legenda, VCine/HQCine só servem o público que entende o áudio original. É o que trava a promessa internacional do catálogo de vídeo.

### [G] Publicidade Google × Originals

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88-89 · docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105

**O que e:** Adiado nas duas specs. É a integração/roteamento entre anúncios do Google e os anúncios 'Originals' (próprios) — que na divisão 60/40 é a fonte de receita que alimenta o pool de royalties.

**Por que importa:** Royalties já estão implementados e conferidos, mas dependem de receita de anúncio entrando. Sem essa camada, o pool depende só de assinatura e Super Reader — o freelancer entregou o repartidor, falta a torneira.

### [M] Capas DDLS

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88 · docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105 · docs/sistema-de-tags-dos-autores-e-do-usuario.pdf (PDF de regras do Vin, 26/08)

**O que e:** Item das regras finais do Vin (PDF de 26/08), registrado como fora do Bloco 1 e do Bloco 2, sem nenhuma implementação no código. As specs não detalham o comportamento — o escopo exato precisa ser reconfirmado com o Vin antes de dimensionar com precisão.

**Por que importa:** Está numa lista de regras que o cliente considera fechada; enquanto não entra, a entrega dos PDFs de 26/08 fica declaradamente incompleta.

### [M] Recalibrar os limiares da curadoria (hoje o gatilho normal é inalcançável)

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:153-156 · utils/curadoriaLimiares.js:13-30 · docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:103

**O que e:** As faixas de V (visualizações únicas) foram decisão nossa, não do Vin: piso de 20 sinalizações, 30% de V até o teto de 100, depois 100/200/300/500 por patamar. A revisão final mediu que, com o catálogo atual do Vin, o gatilho normal é praticamente inalcançável (V=100 exige 30 sinalizações válidas) — na prática só o gatilho grave (5 sinalizações) abre caso. A spec registra que expor essas faixas na UI do Master ficou fora do bloco (hoje só se ajusta por deploy).

**Por que importa:** A curadoria semiautomática foi vendida como funcionando sozinha; calibrada assim, ela quase nunca dispara no volume real e o cliente vai concluir que 'não funciona'. Ajustar as constantes é barato; dar ao Master um lugar para ajustar sem deploy é o que fecha o item de verdade.

### [M] Master não enxerga as sinalizações abaixo do gatilho

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:155-157 · routes/adminCuradoria.js:44,:66 (a fila lê só CasoCuradoria, nunca Sinalizacao)

**O que e:** A fila do admin lista apenas casos já abertos (CasoCuradoria com emAberto:true, ou status:'fechado' no histórico). As sinalizações que não atingiram o limiar existem no banco e ficam invisíveis. Não há como distinguir 'ninguém sinalizou' de 'o limiar está alto demais'.

**Por que importa:** É o instrumento que permite ao Master (e a nós) calibrar o item anterior com dado, não com palpite; e é o que evita o cliente achar que o sistema está parado quando na verdade está acumulando sinalizações silenciosamente.

### [M] Royalties não são estornados quando a obra é removida pela curadoria

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:149-151 (achado CORRIGIR_ANTES da revisão final, resolvido como item de documentação e virou item da lista ao Vin)

**O que e:** Quando o Master remove uma obra pela curadoria — inclusive por motivo grave, como direitos autorais — nada acontece com os royalties já acumulados ou já pagos por aquela obra. A revisão final registrou isso como comportamento conhecido e não implementou nenhum estorno, retenção ou congelamento.

**Por que importa:** É uma regra de negócio em aberto que envolve dinheiro: uma obra removida por plágio segue tendo gerado receita para quem a subiu. Precisa de decisão do Vin antes do código, mas é dívida registrada e de alto impacto comercial.

### [M] Artista não consegue corrigir e reenviar obra removida pela curadoria

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:108-110 (item 2 da lista ao Vin) · docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:147

**O que e:** 'Remover' despublica e limpa submittedAt, então em tese o artista pode reenviar. Mas a regra herdada do Bloco 1 exige, para reenviar, um episódio em rascunho COM painéis — e painel de obra que já foi publicada só o editor consegue corrigir. Resultado: o caminho de correção existe no papel e trava na prática.

**Por que importa:** A curadoria foi vendida com a promessa de ser reversível e educativa ('o artista corrige e reenvia'). Hoje toda correção volta como trabalho manual do Master. É o item que mais gera atrito com artistas.

### [M] Notificação ativa ao Master (hoje só badge no load)

**Onde:** docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:103 (Fora deste bloco) e :130 (item 10 da lista ao Vin)

**O que e:** O único aviso de caso novo é o badge no painel admin, calculado no fetch de GET /admin/aprovacoes quando o Master abre a tela. Não há e-mail, push nem polling. A spec registra isso explicitamente como fora do bloco.

**Por que importa:** Um caso grave (direitos autorais, conteúdo proibido) pode ficar dias no ar se o Master não abrir o painel. É exatamente o cenário de risco jurídico que a curadoria deveria cobrir.

### [M] Verificação de e-mail no cadastro (antibrigada)

**Onde:** docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:103 · utils/curadoriaLimiares.js:33-38 (comentário: 'cadastro não exige verificação de e-mail e o accountLimiter dá 10 contas/15min por IP')

**O que e:** O antiabuso entregue é '1 conta por obra + consumo real + idade mínima da conta (3 dias, 7 para graves)'. A spec registra que ir além disso — em especial exigir verificação de e-mail no cadastro — seria 5.1. Hoje dá para criar 10 contas a cada 15 minutos por IP, sem validar e-mail.

**Por que importa:** É o furo que permite uma brigada organizada derrubar a obra de um concorrente: basta esperar 3 dias com contas criadas em lote. Também fecha um buraco de qualidade de base geral (contas fantasma no cadastro).

### [M] Busca textual por tag

**Onde:** docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:107 ('busca TEXTUAL por tag: NÃO entra — decisão futura com o Vin (registrado para não virar cobrança)')

**O que e:** O Bloco 2 entregou o vocabulário fechado de 19 tags, os chips no admin e no portal, e o filtro parental por tag — mas a busca/descoberta por tag ficou deliberadamente de fora, com a nota explícita de que é decisão futura com o Vin.

**Por que importa:** O cliente investiu num sistema de tags inteiro; a leitura natural dele é que dá para procurar por tag. A spec já antecipou que isso viraria cobrança — é o item que mais provavelmente o Vin vai pedir 'de graça' se não estiver no escopo.

### [M] Push para seguidores de canal

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:90-91 (último item de 'Fora deste bloco')

**O que e:** O Bloco 1 entregou canal público com botão seguir/deixar de seguir (com rollback otimista) e o push de novo episódio para seguidores da SÉRIE. O push para quem segue o CANAL — ou seja, avisar quando o artista publica qualquer obra nova — ficou registrado como fora do bloco.

**Por que importa:** Sem ele, seguir um canal não faz nada de útil para o leitor: o botão existe e não entrega benefício. É a funcionalidade que dá sentido à página de canal que já está no ar.

### [M] Cache do resumo de royalties do portal

**Onde:** .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:138-140 (nota BAIXA (b) da T3)

**O que e:** GET /portal/resumo roda o buildReport integral a cada request — o relatório completo de royalties do período, para responder o painel de números de um único ilustrador. Foi aceito como preço do ponto único de verdade, com a nota 'candidato a cache se ilustradores crescerem'.

**Por que importa:** É a aba que todo ilustrador abre primeiro. Com dezenas de ilustradores checando os números no fechamento do mês, isso vira o gargalo de CPU da VPS — e é justamente o momento em que o cliente NÃO quer lentidão.

### [M] Rota dedicada para as obras do canal público

**Onde:** .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:397-398 (dívida (b) da T10)

**O que e:** A página de canal público busca GET /content/series (o catálogo inteiro) e filtra por canal no cliente. Foi decisão consciente de não abrir rota nova, com a nota 'rota dedicada quando catálogo crescer'.

**Por que importa:** Custa o catálogo inteiro trafegado para mostrar 3 obras — e piora linearmente conforme o Vin publica. Com a TWA na Play Store, isso é consumo de dados móveis do leitor.

### [M] Mitigação do bypass do controle parental

**Onde:** docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:108-109 · .superpowers/sdd/2026-09-03-fase5-bloco2/progress.md:551-552 (ataque #5: 'logout/token expirado/segunda conta contornam — comunicar ao Vin')

**O que e:** O parental é da CONTA. Sair da conta, usar o modo visitante, ou criar uma segunda conta contorna o filtro por completo — provado no ataque #5 da revisão final. A spec registra 'mitigação de bypass por logout/dispositivo' como fora do bloco.

**Por que importa:** É um controle PARENTAL: o cenário real é a criança fazendo logout. Mitigação total é impossível (limitação inerente), mas existem degraus úteis (travar o logout com o PIN, lembrar a preferência no dispositivo) que transformam 'não funciona' em 'atrapalha bastante'.

### [M] Atomicidade residual da curadoria (caso fantasma / outbox)

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:164-165 ('caso fantasma se o processo morrer entre o fechamento e o updateMany') e :438-446 (LIMITAÇÃO RESIDUAL declarada na rodada 3: perder a posse por expiração entre a reconferência e o applySeriesUpdate; 'outbox transacional resolveria — fora de escopo')

**O que e:** Depois de 3 rodadas de correção de concorrência, sobrou uma janela de milissegundos declarada no código: se o processo morrer ou o mutex expirar entre a reconferência da posse e a alteração da obra, o caso pode ficar meio-processado (obra alterada, aviso não enviado) até alguém repetir a ação. O fechamento definitivo exige transação ou padrão outbox, explicitamente registrado como fora do escopo do Bloco 3.

**Por que importa:** Hoje o risco é baixíssimo (janela de ms, retry idempotente, logger.error ligando as pontas), mas é a única inconsistência conhecida num fluxo que tira obra do ar. Vira material de auditoria se o Vin um dia precisar justificar uma remoção.

### [P] Validar o host das URLs de imagem contra o CDN do Bunny

**Onde:** .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:419-421 (achado NOVO P2-2 da revisão final, registrado 'p/ Bloco 2/5.1') · docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:106 ('validação de host de imagem (5.1)') · models/Series.js:54 (cover_image: String) · models/Episode.js:13 (image_url: String)

**O que e:** cover_image e image_url aceitam qualquer URL, sem validação de host. Não é XSS (a revisão confirmou), mas permite hotlink de servidor de terceiro e pixel de rastreio embutido na capa. É pré-existente do admin e foi herdado pelo portal do ilustrador.

**Por que importa:** Agora que o ilustrador (não só o admin) cria obras, um terceiro passa a poder apontar uma capa para o próprio servidor e rastrear cada leitor do Lorflux. Dívida registrada duas vezes, nos dois blocos.

### [P] upload-image: dono só é validado DEPOIS do upload inteiro subir

**Onde:** .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:214-216 (achado A3 da T5: 'buffering ~6,9GB de dono antes do 404 — ACEITO agora, melhoria na 5.1: Content-Length no gate ou seriesId na query') · routes/bunnyWebhook.js:223 (gate barato) vs :231 (multer) vs :237 (resolveUploadSlug) · :51 (fileSize 50MB, memoryStorage)

**O que e:** O gate barato ('é dono de algum canal ativo?') roda antes do multer, mas a checagem de que a série alvo é DELE só roda depois que o arquivo já foi inteiramente carregado em memória. Com 50 MB por imagem e até 138 painéis no batch, um dono de canal pode fazer o servidor bufferizar ~6,9 GB antes de receber 404.

**Por que importa:** É um vetor de DoS acessível a qualquer ilustrador cadastrado, numa VPS Hostinger com RAM apertada (os próprios ledgers registram crashes de worker por RAM na máquina de dev). O fix registrado é pequeno: ler seriesId da query ou checar Content-Length no gate.

### [P] Aviso ao artista é truncado pelo FIM (corta a instrução de recurso)

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:160-162 · services/curadoriaService.js:126-129 (texto.slice(0, 1999) + '…')

**O que e:** A mensagem de curadoria ao artista é cortada em 2000 caracteres pelo fim, para caber no maxlength de MensagemPortal. Como o convite a responder na thread fica no final do template, é exatamente ele que some quando o curador escreve um motivo longo.

**Por que importa:** O artista recebe a notícia de que a obra saiu do ar e perde a única instrução de como recorrer. A correção é reordenar o template ou truncar o meio — trivial, mas o efeito na relação com o artista é desproporcional.

### [P] Apagar uma série apaga também o histórico de casos JÁ FECHADOS

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:163-164 · routes/content.js:277-278 (deleteMany({ seriesId }) em Sinalizacao e CasoCuradoria, sem filtro de status)

**O que e:** DELETE /content/series/:id remove todas as sinalizações e TODOS os casos de curadoria da obra — inclusive os já decididos e arquivados no histórico. A limpeza foi desenhada para não deixar órfãos, mas não distingue caso aberto de caso encerrado.

**Por que importa:** O histórico de curadoria é a trilha de auditoria da decisão do Master. Apagar a obra apaga a prova de que ela foi analisada e por quê — justamente no caso em que alguém vai perguntar depois.

### [P] Chave de desligamento da curadoria e throttle da reavaliação

**Onde:** .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:157-159 e :339-340 · docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:147 ('Dívida 5.1: throttle da reavaliação ao abrir a fila') · routes/adminCuradoria.js:44-58 (reavaliarPendentes a cada abertura da fila)

**O que e:** Dois itens da mesma família, registrados juntos: (1) não existe flag para desligar a curadoria — só bloquear a rota no Nginx, e mesmo assim a reavaliação diária continua abrindo casos do que já está gravado; (2) abrir a fila dispara reavaliarPendentes, que custa ~7 + 2K queries (K = casos abertos), sem throttle. Nenhuma variável de ambiente de curadoria existe no código (conferido por grep).

**Por que importa:** Se a curadoria começar a abrir casos errados em produção (por limiar mal calibrado, por exemplo), não há como pausar sem editar código e reiniciar o PM2. É a válvula de segurança que falta num sistema que tira obra do ar sozinho.

### [M] Ajustes finos da curadoria pedidos pelo Vin ou registrados como higiene

**Onde:** docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md:122 (item 11: 'uma por ciclo' é ajuste pequeno para a 5.1), :73 e :103 (selo 'Em revisão editorial' cortado, opcional 5.1; AdminLog no PUT genérico; V só de logados) · .superpowers/sdd/2026-09-04-fase5-bloco3/progress.md:159-167 (V do card congelado, 4 constantes fora do objeto único, descrições sem limit, histórico sem índice, placeholder '(opcional)', router.use sem path, mensagem confusa ao reclassificar obra legada sem gênero) · components/Admin/CuradoriaPanel.tsx:68-70 (dívida do link para a thread do canal) · models/CasoCuradoria.js:26-31 (gatilho.V é snapshot)

**O que e:** Lote de ajustes pequenos já triados e registrados um a um: mudar 'uma sinalização por obra para sempre' para 'uma por ciclo' (se o Vin preferir, item 11 da lista de entrega); selo 'Em revisão editorial' no portal (cortado no Bloco 3, opcional na 5.1); AdminLog no PUT genérico de séries (republicação de obra removida hoje não tem trilha própria); link direto da fila para a thread do canal (o CanaisPanel não aceita canal alvo); V do card congelado na abertura; e a higiene registrada (constantes soltas, índice do histórico, textos).

**Por que importa:** São os itens que o Vin vai citar nominalmente ao usar o painel, porque vários vieram da lista de 19 itens que a entrega da Fase 5 mandou para ele. Individualmente triviais; juntos, são a diferença entre 'a curadoria está pronta' e 'a curadoria está polida'.

### [M] Lote de higiene registrada do Portal e do Parental (Blocos 1 e 2)

**Onde:** .superpowers/sdd/2026-09-02-fase5-bloco1/progress.md:52 e :437 (ownerEmail ''/null de admin → 404), :135-137 (R$ histórico de canal inativo some do resumo do ex-dono), :243-246 (paginação de mensagens pula gêmeas: cursor $lt sem desempate por _id) · .superpowers/sdd/2026-09-03-fase5-bloco2/progress.md:296-299 (dois TagsChipInput duplicados — conferido: components/Admin/AdminDashboard.tsx:2334 e components/PortalEstudio.tsx:25), :348-349 e :372-374 (login Google não devolve provider, raiz server.js:563-573; e 'code' no 401 em vez de acoplamento por string das mensagens do verifyToken), :441-442 (PUT /episodes/:id aceita episode_number já usado), :553 (PUT /me/progress aceita progresso em obra invisível pelo parental — conferido: routes/progress.js:23-28 e services/progressService.js sem filtro parental)

**O que e:** Sete dívidas BAIXAS registradas e conscientemente não fechadas nos Blocos 1 e 2, agrupadas porque nenhuma justifica um item próprio: ownerEmail vazio de admin retornando 404; R$ de período fechado de canal hoje inativo sumindo do resumo do ex-dono; paginação de mensagens que pula threads com createdAt idêntico; o componente de chips de tags duplicado em dois arquivos; o login Google que não devolve provider (quebra a detecção isLocal); o 401 acoplado ao TEXTO da mensagem em vez de um campo code; PUT de episódio aceitando número já usado (o POST já valida); e PUT /me/progress gravando progresso de obra que o parental esconde.

**Por que importa:** Nenhuma quebra nada hoje, mas três delas são armadilhas de manutenção que explodem na próxima mexida (o acoplamento por string do 401 degrada silenciosamente; o chips duplicado faz correção sair pela metade; o provider ausente já causou um fix round). Cabem num único dia de higiene e deixam a base pronta para os itens grandes acima.

---

## LENTE B — Marcações no CÓDIGO de produção (comentários que registram trabalho adiado)

Varri routes/, services/, models/, utils/, middlewares/, components/, contexts/, hooks/, i18n/, validators/, App.tsx e server.js (excluídos tests/ e docs) procurando marcações de trabalho adiado. O ruído foi alto porque "todos"/"toda" em português colide com TODO e o projeto quase não usa TODO/FIXME — o vocabulário real de dívida aqui é "dívida registrada na spec", "fora de escopo", "não existe ainda" e "fica para". Encontrei 10 itens com comentário explícito de adiamento e confirmei o efeito prático de cada um no código (não só o comentário). Descartei o que já foi fechado: a "Dívida T6 (1)" (CastError→404) está resolvida por utils/routeErrors.js, o vazamento de followers[] já tem .select('-followers') nas 4 rotas, e a "Dívida T6 (2)" já tem o refetch de badge implementado. Também descartei comentários que só documentam decisão fechada (admin em PT fixo, Potential/Confidence fora da API pública). O item de maior peso comercial é o gate de temporada: hoje o Portal do Ilustrador só publica Hi-Qua, com CINECOMICS e VERTICALSHOW mostrados como "Em breve".

### [G] Gate de temporada: CINECOMICS e VERTICALSHOW travados no Portal

**Onde:** components/PortalEstudio.tsx:821-823 ("mostradas SEMPRE, com aviso de temporada — sem checkout, sem upload"); routes/portal.js:256-257 e :292 (content_type 'hiqua' PINADO no servidor, body ignorado); i18n/translations.ts:270 ('Publicação mediante contratação de temporada') e :271 ('Em breve'); routes/bunnyWebhook.js:142-147, :372-377, :430-435 (upload, upload-audio e upload-video seguem admin-only via requireAdmin)

**O que e:** O Portal do Ilustrador entregue na Fase 5 só permite criar obra Hi-Qua. As duas seções pagas aparecem como cartões com cadeado e o rótulo 'Em breve'. Não existe checkout de temporada, não existe liberação de content_type por compra, e as três rotas de upload de vídeo/áudio continuam fechadas ao admin — o dono de canal só consegue subir imagem (upload-image e upload-image-batch). Falta: modelo de temporada comprada, checkout Stripe no portal, liberação do content_type conforme a temporada paga, e abrir upload de vídeo ao dono já gateado pela compra.

**Por que importa:** É a fonte de receita do próprio ilustrador no modelo do Vin (temporadas de 13 e 60 episódios). Enquanto o gate não existir, o Portal é uma ferramenta de Hi-Qua apenas, e os dois formatos que o cliente mais divulga ficam inacessíveis a quem não é admin. O comentário de bunnyWebhook também é explícito: abrir vídeo ao dono ANTES do gate reabriria o buraco do 'vídeo grátis'.

### [M] Super Reader trancado em BRL — relatório de repasse não separa moeda

**Onde:** services/superReaderService.js:17-22 ("Trancado em BRL até existir política cambial... Reabrir usd/eur exige agrupar o report por {channelId, currency} primeiro — dívida registrada na spec") e :22 (MOEDAS_VALIDAS = ['brl']); components/SuperReaderButton.tsx:8-13; services/royaltyReportService.js:139-144 (o $group usa _id: '$channelId', sem currency)

**O que e:** O apoio direto ao autor aceita só 'brl' e o botão envia sempre R$, independente do idioma do aparelho. A causa está confirmada no agregado de repasse: buildSuperReaderSummary soma authorShareCents e platformShareCents agrupando só por channelId — um apoio em USD entraria somado como se fosse BRL. Falta agrupar o report (e o CSV) por {channelId, currency}, depois reabrir usd/eur no serviço e no botão.

**Por que importa:** O app está publicado na Play Store e traduzido para 4 idiomas (pt/en/es/zh). Um leitor fora do Brasil vê o valor em reais e, se algum dia a moeda for reaberta sem corrigir o agrupamento, o repasse ao autor sai errado — é dinheiro de terceiro num relatório que o Vin usa para pagar.

### [G] Algoritmo: 4ª métrica de Retenção do PDF não é coletada

**Onde:** services/recommendationService.js:72-76 ("o PDF original tinha uma 4ª métrica, 'tempo médio de leitura' (10%), que o app NÃO coleta (ledger P2)... Dívida registrada na spec: voltar a 40/30/20/10 quando o tempo for coletado") e :8-10 no cabeçalho do módulo; confirmado por busca: não há readingTime/tempoLeitura/dwell/timeSpent em routes, services, models, utils nem components

**O que e:** A Etapa 3 do PDF do cliente define Retenção com 4 métricas em 40/30/20/10. Como o app não mede tempo de leitura, os pesos foram redistribuídos para 45/33/22 sobre as 3 métricas existentes. Falta instrumentar a medição (heartbeat/tempo de sessão no leitor), persistir o dado e então voltar aos pesos originais do PDF.

**Por que importa:** O algoritmo de recomendação é um entregável que o cliente especificou por escrito em um PDF, e hoje ele roda com uma fórmula diferente da contratada. Enquanto a métrica não existir, não há como afirmar ao Vin que a Etapa 3 está implementada como ele desenhou.

### [M] Limiares de curadoria e de penalização só mudam por deploy

**Onde:** services/recommendationService.js:82-85 ("Limiares são decisão nossa — documentados aqui, dívida registrada na spec (ficarem configuráveis por `Setting`)"); utils/curadoriaLimiares.js:2-6 ("O Vin deu os patamares 100/200/300/500 e '20 + 30%' para obras pequenas SEM mapear volumes; as faixas de V abaixo são decisão nossa... e ficam aqui... para ajuste por deploy sem tocar em lógica"); a infra já existe: routes/settings.js:43 (PUT /api/settings/:key, admin) e services/superReaderService.js:43 já lê um Setting

**O que e:** Os multiplicadores de penalização do algoritmo (retenção baixa, abandono rápido, inatividade) e as faixas de volume que definem o limiar de sinalizações da curadoria são constantes em arquivo. Ajustar qualquer um exige editar código, buildar e fazer deploy na VPS. Falta expor essas chaves via Setting e no painel do admin, com fallback para os valores atuais e preservando a propriedade de não-decrescimento testada em curadoriaLimiares.

**Por que importa:** As faixas de V foram decisão do desenvolvedor porque o Vin não mapeou volumes — quando o catálogo crescer e ele quiser calibrar, hoje isso é uma tarefa de desenvolvedor com deploy, não uma configuração do Master. É exatamente o tipo de ajuste que se faz várias vezes nos primeiros meses de operação.

### [M] Recálculo de score varre o catálogo inteiro a cada gatilho

**Onde:** services/progressService.js:35-48 ("cada `computeSeriesScore` avulso reconstrói o contexto de normalização varrendo o catálogo publicado do MESMO `content_type`... custo real O(catálogo do tipo) por gatilho — medido em ~142 queries com um catálogo de 20 obras... O custo estrutural O(catálogo do tipo) em si CONTINUA — não dá pra evitar sem persistir métricas por série (fora de escopo, spec 'Fora de escopo')"); services/recommendationService.js:813-816 ("Sequencial de propósito — o catálogo é pequeno (spec, 'Fora de escopo': cache/paginação da recomendação não é necessário nesta escala)")

**O que e:** Toda conclusão de leitura dispara um recálculo que reconstrói o contexto de normalização varrendo todas as obras publicadas do mesmo tipo. O próprio comentário registra a medição: cerca de 142 queries com apenas 20 obras. O fix round da Fase 4 reduziu o multiplicador, mas o custo estrutural continua. Falta persistir as métricas por série (ou cache invalidável) para o gatilho não varrer o catálogo.

**Por que importa:** É a única dívida do sistema que piora sozinha: o custo cresce com o catálogo E com a audiência ao mesmo tempo. Numa VPS Hostinger com Mongo no mesmo host, é o candidato natural para o primeiro incidente de lentidão quando o acervo do Vin passar de algumas dezenas de obras.

### [P] Nenhum ErrorBoundary no app — um campo ausente derruba o painel inteiro

**Onde:** components/Admin/CuradoriaPanel.tsx:51-54 ("não existe ErrorBoundary no repositório: um campo ausente derrubaria a árvore INTEIRA do admin, não só este painel"); confirmado por busca em todo o código de aplicação: as únicas ocorrências de ErrorBoundary/componentDidCatch/getDerivedStateFromError são esse comentário e um comentário de teste

**O que e:** O React não tem nenhuma barreira de erro no projeto. Hoje a proteção é manual e local: o CuradoriaPanel normaliza campo a campo na função `normalizar` (CuradoriaPanel.tsx:56-64) justamente porque não há rede de segurança. Qualquer outro painel ou feed que receba um shape inesperado da API desmonta a árvore toda e o usuário vê tela branca. Falta um ErrorBoundary envolvendo o AdminDashboard e as abas principais do app, com tela de erro e botão de recarregar.

**Por que importa:** Tela branca sem mensagem é o pior modo de falha possível num app de loja — o usuário não sabe se é o app, a internet ou a conta dele, e não há nada na tela que ajude o suporte. No admin, significa o Master perder o painel de aprovação por causa de um único registro malformado.

### [M] Página pública do canal baixa o catálogo inteiro para filtrar no cliente

**Onde:** components/CanalPublico.tsx:32-36 ("`GET /channels/:id` ... não devolve as obras do canal — não existe rota nova para isso (fora do escopo autorizado desta task); as obras publicadas são obtidas reusando `GET /content/series` ... e filtradas aqui pelo `channelId`"); a chamada está em CanalPublico.tsx:56 (api.getSeries() sem nenhum parâmetro)

**O que e:** Abrir a página de um canal dispara um GET de todas as séries publicadas, e o filtro por channelId acontece no navegador. Falta uma rota dedicada (GET /channels/:id/series) que devolva só as obras daquele canal, já com o filtro parental aplicado no servidor e paginação.

**Por que importa:** Cada visita ao perfil de um autor transfere o acervo inteiro para o aparelho do leitor. Em 3G e no TWA da Play Store isso é lentidão visível e consumo de dados do usuário, e piora a cada obra nova que o Vin publica.

### [M] Resíduo anti-fraude: releituras ainda infláveis por contas logadas

**Onde:** services/recommendationService.js:204-209 ("Releituras (10% restante) mede reincidência de LEITURA em si... o vetor residual ali é falsificar CONTAS logadas relendo (mitigado pelo `accountLimiter` da T2, não por este fix)... por isso fica de fora do 'fecha a dívida' e a dívida original segue registrada (agora só para esse resíduo)")

**O que e:** O fix da Fase 4 fechou a diluição do denominador por progresso anônimo, cobrindo 90% do peso interno da Qualidade (Super Reader, Favoritos, Likes). A fatia de Releituras (10%) continua manipulável por quem criar contas e reler — hoje só o accountLimiter (10 contas por 15 min por IP) segura. Falta uma contramedida específica: maturação mínima de conta para contar releitura, ou teto de releituras por conta e por obra.

**Por que importa:** O acervo do Vin vai ter autores concorrendo pela posição nos feeds, e a ordenação decide quem é visto. Um autor mal-intencionado com algumas dezenas de contas mexe no ranking. Vale notar que a curadoria da Fase 5 já resolveu o problema análogo com IDADE_MINIMA_CONTA_DIAS — a mesma ideia se aplica aqui.

### [P] Curadoria não leva o curador direto ao canal do artista

**Onde:** components/Admin/CuradoriaPanel.tsx:68-70 ("Leva à aba Canais (mensagens do artista). Dívida registrada: o CanaisPanel não aceita canal alvo, então o curador ainda escolhe o canal pelo nome — que o card mostra.")

**O que e:** Quando o curador decide um caso e quer falar com o artista, o botão abre a aba Canais genérica e ele precisa achar o canal manualmente pelo nome, lido no card do caso. Falta o CanaisPanel aceitar um canal alvo por prop e já abrir a thread correta.

**Por que importa:** É o ponto exato onde o Master atua sobre uma denúncia — o passo manual convida ao erro de escolher o canal errado e mandar uma mensagem de correção para o artista errado. É um ajuste pequeno num fluxo sensível que acabou de entrar em produção.

### [P] Convite de login inconsistente entre as ações do leitor

**Onde:** components/SuperReaderButton.tsx:47-50 ("não existe um padrão de 'gate de login' pronto no app (favoritar/curtir hoje só desabilitam o botão em silêncio), então esta é a primeira vez que o app mostra esse convite explícito")

**O que e:** O Super Reader mostra um convite de login quando o visitante toca no botão. Favoritar e curtir, para o mesmo visitante, apenas ficam desabilitados sem nenhuma explicação. Falta extrair o convite em um componente único e aplicá-lo às demais ações que exigem conta.

**Por que importa:** O modo visitante é a porta de entrada do app na Play Store e o principal caminho de conversão em conta. Um botão que simplesmente não responde não converte ninguém e ainda parece defeito — o convite explícito, que já existe e já está traduzido nos 4 idiomas, só precisa ser reaproveitado.

---

## LENTE C — Pedidos do CLIENTE (Vin) ainda não atendidos

Dez pedidos do cliente continuam abertos e têm evidência escrita. Três são os que a missão mandou conferir: (1) o autor ainda não consegue subir camadas de idioma — o backend do portal já aceita `translationLayers`, mas a UI e o tipo do cliente mandam só `{image_url, order}`, e as rotas de tradução de painel existente são admin-only; (2) não existe NADA do Creator Program no código (grep por "creator program" = zero ocorrências) — o único aceite gravado é o `consent.termsAcceptedAt` carimbado automaticamente no cadastro, sem versão e sem travar nada; (3) o Stripe existe para assinatura Premium e Super Reader, mas não há checkout de contratação de espaço — CINECOMICS/VERTICALSHOW aparecem como cartões com cadeado e "em breve". Ao redor desses três, as próprias specs da Fase 5 já registram por escrito outros cinco itens carimbados "(5.1)": crédito de reprovação, capas DDLS, legendas, publicidade Google×Originals e o motor de temporadas. Somam-se o upload de vídeo/áudio pelo autor (hoje admin-only, pré-requisito das abas pagas) e o único bug do PDF de 08/09 que o 8a07301 não tocou ("as histórias sumiram"). Observação honesta sobre tamanhos: os dois itens de temporada (checkout e motor de regras) são os únicos G e sozinhos pesam mais que todo o resto somado; dois itens (legendas, publicidade) estão registrados mas NÃO especificados pelo cliente e o tamanho deles é um chute até o Vin escrever a regra.

### [M] Upload de camadas de idioma pelo próprio autor

**Onde:** components/PortalEstudio.tsx:389-401 (handleAddPanels) e :994-1002 (modal de painéis, sem seletor de idioma); services/api.ts:898 (addPortalPaineis tipado como `{ image_url, order }[]`); routes/portal.js:402 + services/episodePanelService.js:19 (backend JÁ aceita translationLayers); routes/content.js:777 e :814 (PUT/DELETE de tradução de painel, ambas verifyToken+requireAdmin); routes/admin.js:184 (PATCH /episodes/:id/webtoon-labels, requireAdmin); models/Episode.js:14-18 e :25-30; docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:34 ("o payload de painéis do portal aceita translationLayers no MESMO shape da rota admin")

**O que e:** O cliente pediu: "O autor vai fazer o upload dos idiomas. Ele não pode ter acesso à aba lateral de mudança de nomes." Hoje a metade proibitiva já está satisfeita — o Portal do Estúdio não tem nenhuma tela de idiomas: grep por idioma/language/translation em components/PortalEstudio.tsx devolve zero, e o editor de rótulos (webtoonLanguageLabels) e o modal de tradução por painel vivem só em components/Admin/AdminDashboard.tsx:285-292 e :1456+, atrás de requireAdmin. A metade permissiva não existe. O autor abre o modal de painéis, escolhe arquivos, e handleAddPanels monta `{ image_url, order }` — sem nenhum campo de idioma. O backend do portal, por reusar episodePanelService.addPanels, já aceitaria translationLayers em painéis NOVOS; ninguém envia. E para acrescentar uma camada a um painel JÁ existente (que é o caso real: o autor sobe o base primeiro e traduz depois) só existem as duas rotas admin-only de routes/content.js. Falta: seletor de idioma (original/pt/en/es/zh) no modal do portal, passar translationLayers no payload, um par de rotas de tradução de painel com a guarda de dono do canal (o mesmo padrão de requireCanalDoUsuario já usado em routes/portal.js), e manter o editor de rótulos fora do portal.

**Por que importa:** Foi exatamente a dor que o Vin descreveu em 08/06 ("eu teria que ficar colocando URL em várias histórias com várias traduções e isso é um pouco complexo") — só que resolvida para ELE, no admin, e não para os autores. Enquanto o autor não puder subir as traduções, cada obra multilíngue volta para a mesa do Vin painel a painel, o que anula boa parte do ganho do Portal do Autor entregue na Fase 5. Dependência: as imagens de referência IdiomasNOVO.jpg citadas na mensagem não estão no repositório ("vin correcoes/" tem só 3 PNGs de 27/06 e nenhum deles é esse) — vale pedir de novo antes de desenhar a tela.

### [M] Aceite versionado dos Termos do Creator Program travando o upload

**Onde:** docsprivados/termos-de-servico-para-contratacao-de-espaco-e-upload-de-quadrinhos.pdf (17 seções; seção 9 "Ciência e concordância"); models/User.js:18-24 (consent.termsAcceptedAt, sem campo de versão); server.js:408-412 e :551-554 (termsAcceptedAt carimbado sozinho no cadastro local e no Google); routes/account.js:229-236 (PUT /me/consent só mexe em consent.marketing); components/LegalPolicy.tsx:105-130 (Termos de Uso genéricos da plataforma, 7 seções, texto fixo em PT); grep por "creator program" em components/, routes/, models/, i18n/, services/ = zero ocorrências

**O que e:** O cliente quer que o autor clique em aceitar antes de fazer uploads. No código hoje existe UM registro de consentimento e ele não serve: `consent.termsAcceptedAt` é gravado automaticamente no momento do cadastro (server.js:409 e :552), sem que ninguém clique em nada, sem número de versão, e apontando para os Termos de Uso genéricos de LegalPolicy.tsx — que falam de conta, assinatura premium e encerramento, e não têm uma linha sobre contratação de espaço, crédito, reembolso, IA ou curadoria. O texto do Creator Program não existe em lugar nenhum da aplicação. Nenhuma das rotas de escrita do portal (routes/portal.js:261 criar série, :351 criar episódio, :402 painéis, :430 enviar para aprovação) consulta consentimento algum. Falta: subdocumento próprio no User (versão aceita, data, IP), constante de versão do documento, o texto das 17 seções numa tela dedicada, um modal de aceite no primeiro upload, uma rota de aceite, e um middleware que devolva 403 com a versão pendente nas rotas de escrita do portal — para que uma revisão futura do termo force um novo aceite em vez de passar batido.

**Por que importa:** É o documento que sustenta juridicamente todo o modelo pago: a seção 2 diz que pagar não garante aprovação, a 3 converte reprovação em crédito em vez de reembolso, a 5 e a 11 proíbem obra integralmente feita por IA, a 12 dá à Lorflux o direito de rejeitar por qualidade percebida. Sem aceite registrado e versionado, qualquer autor rejeitado pode alegar que nunca viu essas regras — e a curadoria entregue no Bloco 3 fica apoiada no ar. É também pré-requisito prático do checkout: não faz sentido cobrar antes de existir o termo que diz o que o dinheiro compra.

### [G] Checkout pago do Creator Program (contratação de espaço por temporada)

**Onde:** components/PortalEstudio.tsx:820-831 (CINECOMICS/VERTICALSHOW como cartões com cadeado, "sem checkout, sem upload" no próprio comentário); routes/payment.js:30-72 (create-checkout, mode:'subscription', só Premium) e :93-160 (webhook trata 'super_reader' e Premium, nada mais); services/superReaderService.js:112-113 (mode:'payment', única sessão avulsa existente, travada em BRL por services/superReaderService.js:22); docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:33 e :87-88 ("sem entregar o gate pago (5.1)")

**O que e:** Existe Stripe no projeto, mas só em dois caminhos: assinatura Premium (routes/payment.js) e apoio avulso do Super Reader (services/superReaderService.js). Não existe produto, preço, sessão, webhook nem modelo de dados para contratação de espaço. A UI do portal já mostra as duas abas pagas com cadeado e o aviso de temporada — é a casca que o Bloco 1 entregou de propósito, com o gate pago adiado. Falta o caminho inteiro: catálogo de preços por formato e moeda (US$ 1,89 / R$ 9,73 para CINECOMICS e US$ 2,99 / R$ 15,40 para VERTICALSHOW, conforme as regras de 26/08), sessão de checkout mode:'payment' com metadata do tipo de contratação, tratamento do evento no webhook existente, registro persistido da contratação, e a liberação do upload na aba correspondente só depois do pagamento confirmado. Observação de risco já registrada no código: o Super Reader está deliberadamente travado em BRL (services/superReaderService.js:18-22) porque o relatório de repasse soma centavos sem separar moeda — cobrar em USD exige resolver isso ou manter a contratação num caminho de dados separado.

**Por que importa:** É a receita direta da plataforma e o único item da 5.1 que o cliente já precificou. Enquanto não existir, CINECOMICS e VERTICALSHOW seguem sendo duas abas com cadeado: nenhum autor publica vídeo, e as duas abas mais caras de manter (Bunny Stream) ficam alimentadas só pelo próprio Vin. Também é o que fecha o buraco do "vídeo grátis" que a spec do Bloco 1 cita explicitamente como motivo de manter o upload de vídeo admin-only.

### [G] Motor de temporadas: limites 13/60, teto de 3 minutos, bônus e fechamento automático

**Onde:** Regras de contratação do Vin de 26/08 (registradas em memory/fase5-pdfs-regras-finais-vin.md, item 3); docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:33 ("Publicação mediante contratação de temporada") e :87-88 ("Checkout/gate de temporada HQCine/VCine ... (5.1)"); docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105 ("temporadas/legendas/DDLS/publicidade (5.1)"); models/Series.js e models/Episode.js sem nenhum campo de temporada; services/api.ts:329-335 (getContent devolve `{ seasons: [], episodes }` — array vazio fixo, compatibilidade e nada mais); grep por temporada/season em models/, routes/ e services/ = nenhum modelo, nenhuma rota

**O que e:** As regras que o cliente escreveu vão muito além de cobrar: temporada de CINECOMICS = 13 episódios, de VERTICALSHOW = 60; máximo de 3 minutos por episódio, com bloqueio acima disso; primeira contratação dá 1 temporada + 1 temporada bônus grátis (eps 1-26 e 1-120); da terceira temporada em diante a cobrança é normal; o limite é por temporada e o sistema fecha a temporada sozinha ao bater o teto, abrindo a próxima quando houver saldo de publicação. Nada disso existe: não há entidade Temporada, não há contador de saldo, não há leitura da duração do vídeo para barrar acima de 3 minutos (grep por "3 minutos", "180" e "maxDuration" não acha nada — models/Episode.js tem `duration` mas ninguém o valida), e o `seasons` que o frontend consome é literalmente um array vazio fixo em services/api.ts:333. Separei este item do checkout de propósito: o Stripe é a parte pequena; a máquina de estado de saldo, bônus e fechamento automático é a parte grande, e ela também precisa aparecer no painel do autor (quantos episódios restam nesta temporada) e no do Master.

**Por que importa:** É o que transforma o pagamento avulso num modelo de assinatura editorial: sem saldo e sem fechamento automático, o autor paga uma vez e publica indefinidamente, e a plataforma perde o controle de custo de storage/stream — exatamente o que os Termos chamam de "contratação de espaço". O teto de 3 minutos, em particular, é o único freio de custo de Bunny Stream que o cliente pediu.

### [M] Upload de vídeo e áudio pelo autor (hoje admin-only)

**Onde:** routes/bunnyWebhook.js:430-435 (POST /upload-video com verifyToken + requireAdmin) e :371-375 (POST /upload-audio, mesma guarda); routes/bunnyWebhook.js:284 (upload-image-batch, o único que ganhou a regra "admin OU dono do canal"); docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:41 ("`upload`, `upload-video` e `upload-audio` permanecem admin-only até a 5.1")

**O que e:** Na Fase 5 só os uploads de IMAGEM foram abertos ao dono do canal — e com um contrato novo, em que o portal manda `seriesId` real e o servidor deriva o caminho no Bunny. Vídeo e áudio continuam exigindo requireAdmin. A própria spec do Bloco 1 diz por escrito que isso foi uma decisão de escopo ("abrir vídeo ao dono reabriria o 'vídeo grátis' que o gate de temporada da 5.1 vai cobrar"), não um esquecimento. Falta estender a mesma guarda de dono a upload-video e upload-audio, agora condicionada à temporada contratada, e expor a tela de envio de vídeo no Portal do Estúdio (que hoje só sabe subir capa, thumbnail e painéis).

**Por que importa:** Sem isto, o checkout do item anterior vende uma coisa que o autor não consegue usar: ele pagaria a temporada de VERTICALSHOW e continuaria tendo que mandar os arquivos por fora para o Vin subir no admin. É o par indissociável do gate pago — um sem o outro não entrega valor nenhum ao cliente.

### [M] Crédito de reprovação (seção 3 dos Termos)

**Onde:** docsprivados/termos-de-servico-para-contratacao-de-espaco-e-upload-de-quadrinhos.pdf, seção 3 "Obras em desacordo com as normas" ("o valor poderá ser convertido em crédito dentro da Lorflux ... podendo ser utilizado em uma nova submissão") e seção 15 (que remete de volta às "regras relativas à utilização de créditos previstas neste Termo"); docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:4 ("decisões do Vin em 28/08 (Gênero fica; reprovação vira crédito — crédito é da 5.1)") e :87 ("crédito de reprovação (5.1)"); grep por credito/crédito em models/, routes/, services/ e components/ só acha "créditos" no sentido de créditos finais de vídeo (models/ReadingProgress.js:3, components/VerticalPlayer.tsx:83)

**O que e:** Os Termos prometem que, quando a rejeição decorre de descumprimento das regras pelo criador, o valor pago não vira reembolso automático e sim crédito utilizável numa nova submissão. Não existe saldo de crédito no sistema: não há campo no User, não há modelo, não há rota, não há tela. As duas superfícies onde a rejeição acontece hoje — devolver na fila de aprovação (routes/adminPortal.js) e as quatro decisões da curadoria (routes/adminCuradoria.js) — encerram o caso sem nenhum efeito financeiro. Falta: saldo por usuário (ou por canal), crédito gerado na rejeição, consumo do crédito no checkout da contratação, extrato visível ao autor no Portal e ao Master no admin.

**Por que importa:** É a cláusula que permite ao Vin não devolver dinheiro quando a culpa é do autor — e ela só é defensável se o crédito existir de verdade e o autor conseguir ver o saldo. Hoje, se um autor pagasse e fosse reprovado, não haveria como cumprir o próprio termo. Depende do checkout existir primeiro.

### [M] Capas DDLS (capa sem texto + 4 camadas de título por idioma)

**Onde:** Regras do Vin de 26/08 (registradas em memory/fase5-pdfs-regras-finais-vin.md, item 3: "Capas com DDLS (Dynamic Dialogue Layer System, como os painéis do Hi-Qua): capa sem texto + 4 layers PNG de título, uma por idioma"); docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88 ("capas DDLS (5.1)"); docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105; models/Series.js:54 (`cover_image: { type: String }` — uma string só); models/Episode.js:14-18 (o padrão translationLayers que já existe para painéis e serviria de molde)

**O que e:** O cliente quer para as CAPAS o mesmo mecanismo que já existe para os painéis do Hi-Qua: a arte limpa, sem texto, e quatro PNGs de título sobrepostos, um por idioma, escolhidos conforme o idioma do leitor. O modelo de dados tem só `cover_image` como string única; o formulário de capa do portal e o do admin sobem um arquivo e pronto. Falta: campo de camadas de título na Series (mesmo shape `{ language, imageUrl }` do Episode), upload das camadas no portal e no admin, e a composição no leitor — em todos os pontos onde a capa aparece hoje (feeds, busca, favoritos, canal público, continuar assistindo), o que é a parte que o tamanho esconde.

**Por que importa:** É o argumento de internacionalização que o próprio Vin usa para a plataforma ("levar a língua brasileira ao mundo", uma plataforma única sem versão por país): hoje a capa carrega o título cravado numa língua só, então o catálogo se apresenta em português para um leitor de qualquer lugar, enquanto o CONTEÚDO já se traduz. É a última peça do sistema de idiomas que ficou pela metade.

### [M] Bug reportado em 08/09: "as histórias sumiram"

**Onde:** docsprivados/bugseacertos.pdf, última linha ("Um 'bug' aconteceu, creio que seja por causa da implementação do novo sistema. As histórias sumiram."); não endereçado no HEAD — o commit 8a07301 fechou só os três primeiros pedidos do mesmo PDF (fonte, tamanho e tradução das frases), mexendo em components/HQCine.tsx, HiQua.tsx, VFilm.tsx e i18n/translations.ts; suspeito principal: models/Series.js:71 (`content_rating` default null em todo o acervo) combinado com utils/parentalFilter.js:24-28 e :64-66 (escada POSITIVA: perfil kids vê só 'kids', teen vê 'kids'+'teen', e obra com rating null é tratada como 'young'); routes/adminPortal.js:192 conta justamente as séries publicadas sem classificação e components/Admin/AdminDashboard.tsx:1013-1019 mostra esse número como aviso no admin

**O que e:** Junto com os três ajustes de fonte que já foram feitos, o cliente relatou que as histórias sumiram, e ele mesmo associou o sumiço "ao novo sistema" — o Controle Parental e as tags, que foram ao ar na VPS em 11/09. O código tem um mecanismo que produz exatamente esse sintoma e que ainda não foi confrontado com o caso real dele: todo o acervo está sem `content_rating` (o dry-run da migração de tags, citado no registro de execução da Fase 5, acusou zero tags livres — o catálogo nunca foi classificado), e o filtro é positivo por decisão de design, então qualquer conta cujo perfil esteja em Kids ou Teen deixa de enxergar o catálogo inteiro. IMPORTANTE, para não afirmar o que não conferi: isso é o suspeito mais provável, não um diagnóstico fechado — o item é diagnosticar reproduzindo com a conta do cliente e só então corrigir. O trabalho provável inclui classificar o acervo publicado (o admin já sabe contar quantas faltam, mas a edição é obra a obra) e/ou dar um aviso visível ao leitor quando o filtro etário estiver escondendo tudo.

**Por que importa:** É o único item do último PDF do cliente que ficou em aberto, e é o pior tipo de regressão percebida: do ponto de vista do Vin, a entrega da Fase 5 fez o conteúdo dele desaparecer do próprio app. Precisa ser respondido antes de qualquer conversa sobre escopo novo.

### [M] Legendas (registrado como 5.1, ainda sem especificação do cliente)

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88 ("capas DDLS (5.1) · legendas (5.1)"); docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105 ("temporadas/legendas/DDLS/publicidade (5.1)"); models/Episode.js:20-24 (audioTrack1..4Url + audioTrack1..4Lang) e :24 (hlsAudioLabels) — o que existe hoje é dublagem/faixa de áudio, nunca legenda; grep por legenda/subtitle/vtt em models/, routes/, services/ e components/ = nada

**O que e:** O vídeo hoje suporta até quatro faixas de ÁUDIO com rótulos por idioma, mas nenhuma faixa de legenda: não há campo no Episode, não há upload, e o player não tem seletor. O item está registrado por escrito em duas specs como pertencente à 5.1. Sendo honesto sobre o que não sei: não encontrei nenhum documento do cliente detalhando o pedido — não sei se ele quer upload de arquivo .vtt/.srt por idioma, legendagem automática, ou legenda queimada. Antes de dimensionar de verdade é preciso que o Vin escreva a regra, como ele fez com temporadas e tags. A estimativa abaixo assume o caminho mais simples (upload de .vtt por idioma, servido pelo Bunny Stream, com seletor no player).

**Por que importa:** Completa o par com as faixas de áudio já entregues: hoje uma obra pode ser dublada em quatro idiomas mas não legendada em nenhum, o que é o modo mais barato de internacionalizar uma obra e o que a maioria dos autores pequenos conseguiria entregar. Também é acessibilidade — relevante para a ficha da Play Store.

### [P] Regra de exibição de publicidade Google × Originals (registrado como 5.1, sem regra escrita)

**Onde:** docs/superpowers/specs/2026-09-02-fase5-bloco1-portal-design.md:88-89 ("publicidade Google×Originals (5.1)"); docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md:105; components/Ads.tsx:22-23 e routes/settings.js:10 (AdSense por adsense_client_id/adsense_slot_id); models/Ad.js:1-17 (inventário próprio da Lorflux, com isActive, startsAt/endsAt, impressions e clicks)

**O que e:** O app tem hoje duas fontes de anúncio convivendo: o AdSense do Google, configurado por Settings no admin, e um inventário interno de anúncios próprios (models/Ad.js) com janela de veiculação e métricas. O que está registrado como 5.1 é a REGRA de arbitragem entre as duas — quando servir Google e quando servir o inventário próprio ("Originals"). Sendo honesto: não achei em nenhum documento do cliente o enunciado dessa regra; ela aparece só como rubrica nas duas specs. O tamanho abaixo pressupõe que a regra seja simples (prioridade do inventário próprio dentro da janela, fallback para AdSense) e que o ponto de decisão seja um só; se o Vin pedir prioridade por obra, por canal ou por país, muda de patamar.

**Por que importa:** Mexe direto na divisão de receita com os autores (60/40 sobre anúncio e assinatura): um anúncio próprio e um anúncio do Google não valem o mesmo nem se contabilizam do mesmo jeito, e hoje não há regra escrita de qual aparece. É o item de menor evidência desta lista — vale levá-lo ao Vin como pergunta antes de virar escopo.

---

## D — Riscos operacionais e de infraestrutura em produção

Levantei 11 itens com evidência conferida em arquivo:linha. Os 5 fatos da VPS se confirmam no código e, em três deles, o impacto real é maior do que parece: (a) o Redis derrubado não só mata a fila de vídeo — a rota de upload admin fica pendurada sem responder e cada processo do PM2 despeja dezenas de milhares de linhas de erro por dia (44.055 ocorrências em um único arquivo de log deste repositório, logs/error-2026-09-04.log, 16,5 MB); (b) o acervo sem content_rating não é só "dado faltando": pela semântica positiva do filtro (utils/parentalFilter.js:99-118), qualquer perfil kids/teen enxerga ZERO obras — o Controle Parental entregue na Fase 5 está funcionalmente vazio até alguém classificar as obras; e (c) o backup que o CONTEXT.md:150 anuncia como "backup do banco de dados" não toca o MongoDB (scripts/backup.sh:13 só faz tar da pasta do app, no mesmo disco) — o ledger append-only de royalties não tem cópia. Achei também um risco que o próprio time registrou e deixou em aberto: a dependência de req.ip (Cloudflare/Nginx real IP) que, se estiver errada, faz o antifraude marcar leitores legítimos como fraude e derrubar o cálculo de royalties. Nenhum preço, nenhuma proposta — só o levantamento.

### [M] Redis fora do ar: fila de vídeo morta e upload admin pendurado

**Onde:** queues/videoQueue.js:12-19; server.js:74 e server.js:349; workers/videoWorker.js:8-11; ecosystem.config.js:22-25; logs/error-2026-09-04.log (44.055 linhas "[Redis Connection Error] connect ECONNREFUSED 127.0.0.1:6379")

**O que e:** Só a fila BullMQ de transcodificação usa Redis — nenhum outro serviço, sessão, cache ou rate limit depende dele (grep de redis em services/, routes/, middlewares/, utils/ não devolve mais nada). Consequências concretas: (1) o worker lorflux-video-worker não consome nada; (2) a rota POST /api/admin/upload-content (server.js:334) chama videoQueue.add() em server.js:349 sobre uma conexão criada com maxRetriesPerRequest: null (queues/videoQueue.js:13) — o comando fica na fila offline do ioredis e a promise nunca resolve, ou seja, a requisição do admin fica pendurada até o timeout do cliente em vez de retornar erro; (3) o handler de erro em queues/videoQueue.js:17-19 loga uma linha por tentativa de reconexão, em TODOS os processos (ecosystem.config.js:24 usa instances: "max" para o worker, em modo cluster). O app web em si NÃO degrada: nenhuma rota de leitura, login, pagamento, parental ou curadoria toca Redis. Vale decidir se o Redis volta a subir (com systemd enable) ou se essa fila local é aposentada de vez — o caminho de vídeo em produção hoje é o Bunny via upload TUS (routes/bunnyWebhook.js:141-204), não esse worker.

**Por que importa:** Hoje o sistema está com um processo do PM2 rodando que não faz nada além de gerar erro, e um botão do painel admin que trava sem mensagem se alguém tentar usá-lo. Além disso é a origem do entupimento de log do item seguinte.

### [P] Log do PM2 sem rotação e enxurrada de erro repetido

**Onde:** ecosystem.config.js:17-19 e 34-36 (error_file/out_file sem max_size, retain ou rotação); utils/logger.js:10-25 (winston rotaciona, PM2 não); logs/error-2026-09-04.log = 16,5 MB num único dia

**O que e:** Os logs do winston (error-%DATE%.log / combined-%DATE%.log) rotacionam por dia com maxSize 20m, maxFiles 30d e zip (utils/logger.js:10-25). Os arquivos que o PM2 escreve (logs/app-out.log, app-err.log, worker-out.log, worker-err.log) não rotacionam nunca — não há pm2-logrotate nem configuração de tamanho no ecosystem.config.js. Some-se a isso que os N processos do worker (instances: "max") escrevem no MESMO arquivo DailyRotateFile do winston, o que além do volume gera corrida de rotação. Escopo: instalar/configurar pm2-logrotate, definir retenção, e cortar o log repetido da reconexão do Redis (log com throttle em vez de uma linha por tentativa).

**Por que importa:** Disco cheio na VPS derruba o MongoDB e o Node juntos, e é o tipo de incidente que acontece de madrugada sem aviso. Também torna o log inútil para diagnosticar qualquer outra coisa — o erro real fica afogado em 44 mil linhas de ECONNREFUSED.

### [P] frontend-dist ainda pode voltar e mascarar o deploy

**Onde:** server.js:687 (express.static de frontend-dist ANTES de dist), server.js:691-697 (sendStaticPage) e server.js:702-706 (fallback do SPA); package.json:17 (script build:frontend recria a pasta); docs/superpowers/plans/2026-09-04-fase5-bloco3-curadoria.md:3220 (runbook de deploy manda recriar)

**O que e:** O Express serve frontend-dist na frente de dist em três lugares independentes (estático, páginas da Play Store, fallback do index.html). A pasta já foi removida da VPS, mas duas fontes a recriam: o script npm run build:frontend (package.json:17, "npm run build && mkdir -p frontend-dist && cp -r dist/*") e o passo 2 do roteiro de deploy escrito no plano do Bloco 3 ("npm run build && rm -rf frontend-dist && cp -r dist frontend-dist && pm2 restart all"). Escopo: remover os três ramos de frontend-dist do server.js, apagar o script do package.json e corrigir o roteiro de deploy na documentação — deixando dist como única fonte.

**Por que importa:** Foi exatamente esse mecanismo que fez um deploy parecer aplicado sem estar: o build novo entrou em dist e o servidor continuou entregando a versão velha de frontend-dist. Enquanto os três ramos existirem, o mesmo incidente pode se repetir a qualquer momento e é dificílimo de diagnosticar (o código está certo, o site é que não é o código).

### [M] Deploy automático pronto no CI, mas desligado — e incompleto

**Onde:** .github/workflows/ci.yml:49-75 (job deploy com if vars.DEPLOY_ENABLED == 'true'); ci.yml:75 (só pm2 restart lorflux-app); ecosystem.config.js:22 (o segundo processo, lorflux-video-worker, nunca é reiniciado)

**O que e:** O job de deploy existe, está bem escrito e depende de três secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY) e da variável DEPLOY_ENABLED que nunca foram cadastrados — por isso o deploy segue 100% manual. Além de ligar isso, o script tem duas lacunas conferidas: reinicia só lorflux-app (ci.yml:75), deixando o worker rodando código velho, e não remove frontend-dist (item anterior). Escopo: gerar chave SSH dedicada, cadastrar secrets, corrigir o script (pm2 restart all ou reload do ecosystem + limpeza do frontend-dist) e validar um deploy real de ponta a ponta.

**Por que importa:** Deploy manual por SSH é a causa raiz dos dois incidentes deste levantamento (a pasta mascarando o build e o Redis que nunca voltou depois de um restart). Automatizar transforma "push na main" em entrega verificada e tira o risco de esquecer um passo.

### [M] Acervo sem classificação etária: o Controle Parental entrega catálogo vazio

**Onde:** utils/parentalFilter.js:99-118 (getFiltroParental: kids → content_rating: 'kids'; teen → $in ['kids','teen']); utils/parentalFilter.js:26-30 (escada); models/Series.js:71 (content_rating default null); routes/adminPortal.js:192 (contador naoClassificadas); components/Admin/AdminDashboard.tsx:2164-2167 (campo de edição já existe na UI)

**O que e:** A semântica do filtro é positiva de propósito: $in nunca casa null nem campo ausente. Com as 5 obras em content_rating null, um perfil kids recebe a query { content_rating: 'kids' } e volta ZERO resultado; teen idem. Só o perfil young (o padrão) vê alguma coisa. Não é bug de código — a UI para classificar já existe no AdminDashboard e a fila de aprovação já exige o campo (routes/adminPortal.js:319-323). É trabalho de operação/curadoria: classificar as obras existentes e conferir que os feeds voltam a responder em cada perfil.

**Por que importa:** O Controle Parental foi entregue e pago na Fase 5. Se o Vin (ou qualquer pai) ativar o modo kids hoje, o app fica visualmente vazio e parece quebrado. É o risco de percepção mais alto da lista, e o mais barato de eliminar.

### [M] Vocabulário de tags nunca migrado: algoritmo de recomendação rodando neutro

**Onde:** scripts/mapaTagsVocabulario.js:35-40 ("Eu não tenho acesso às tags de produção — rode o dry-run na VPS primeiro"); scripts/migrarTagsVocabulario.js:1-60; services/recommendationService.js:1051 (série sem tags → NEUTRO_AFINIDADE) e :1181 (duas obras sem tags nunca conflitam por tema)

**O que e:** O script de migração para o vocabulário fechado de 19 slugs foi escrito com um mapa inicial e a instrução explícita de rodar primeiro em dry-run na VPS (lista as tags livres reais do acervo com contagem), completar o mapa com o que aparecer, e só então rodar --apply. Isso nunca foi feito. Enquanto as obras estiverem sem tags, o componente de Afinidade do score (até 25 pontos, services/recommendationService.js:950 e :1051) devolve o mesmo valor neutro para todas as obras, e a regra de diversidade por tema (:1181) nunca dispara. Escopo: rodar o dry-run, completar o mapa com o Vin, aplicar, e conferir os feeds.

**Por que importa:** O algoritmo de recomendação é uma das peças vendidas como diferencial do produto, e hoje ele está ligado mas sem insumo — ordena por popularidade e retenção, e a personalização por tema não acontece. Também é pré-requisito do filtro pessoal de tags bloqueadas do Controle Parental (utils/parentalFilter.js:114-116), que sem tags no acervo não bloqueia nada.

### [M] O backup não faz backup do banco

**Onde:** scripts/backup.sh:13 (tar da pasta do app, sem mongodump); scripts/backup.sh:5 (BACKUP_DIR=/home/backups, mesmo disco); CONTEXT.md:150 ("npm run backup — Backup do banco de dados"); models/EngagementEvent.js:1-14 (ledger append-only dos royalties)

**O que e:** O script faz tar --exclude=node_modules da pasta da aplicação e guarda em /home/backups na PRÓPRIA VPS, apagando o que tem mais de 7 dias. Não existe mongodump, não existe cópia fora da máquina e não há cron chamando o script (nenhuma referência a cron no repositório). A documentação (CONTEXT.md:150) afirma o contrário, o que é pior do que não ter: cria a sensação de estar coberto. O MongoDB é local (server.js:21, fallback mongodb://localhost:27017/lorflux), nó único. Escopo: mongodump agendado, retenção, destino fora da VPS e um teste de restauração de verdade.

**Por que importa:** Perder o disco da VPS hoje significa perder contas de usuário, progresso de leitura, contratos de curadoria e — o mais grave — o EngagementEvent, que é o log encadeado por hash em cima do qual os royalties dos autores são calculados e auditados. Esse dado não é reconstituível de lugar nenhum.

### [P] IP real atrás do Cloudflare: risco direto sobre o cálculo de royalties

**Onde:** server.js:67 (app.set("trust proxy", 1)); routes/content.js:466 (ip: req.ip alimentando o ledger); services/engagementLogger.js:61, :71-83 (dedupe por $or [userId, ipHash]) e :87-92 (burst: 30 eventos do mesmo IP em 60s = flagged); docs/superpowers/plans/2026-09-04-fase5-bloco3-curadoria.md:3225 ("Conferir a config do Nginx" — deixado em aberto)

**O que e:** O próprio roteiro de deploy do Bloco 3 registra a dependência e manda conferir, e essa conferência nunca foi fechada: se o Nginx não tiver set_real_ip_from + real_ip_header CF-Connecting-IP, req.ip vira o IP do edge do Cloudflare para todo mundo. Nesse cenário o antifraude vira uma armadilha: o dedupe usa $or entre userId e ipHash (engagementLogger.js:79-82), então o SEGUNDO leitor de um episódio em 6 horas é marcado como duplicado mesmo estando logado; e passando de 30 eventos em 60 segundos no site inteiro, tudo vira 'burst' (:92). Eventos marcados ficam fora do cálculo de royalties. Escopo: conferir a config do Nginx, corrigir se preciso e medir quantos eventos já foram marcados por esse motivo. Ponto anexo visível no mesmo arquivo: IP_HASH_SALT (engagementLogger.js:32) não está no .env.example nem na lista de validateEnv.js:13-22 e cai em JWT_SECRET — trocar o JWT no futuro invalida silenciosamente todo o histórico de ipHash.

**Por que importa:** É dinheiro dos autores. Se estiver errado, o relatório de royalties está subcontando consumo legítimo e o painel de curadoria (que lê ipsDistintos) mostra números falsos — e nada nisso aparece como erro em lugar nenhum.

### [P] /health não checa nada e não há monitoramento externo

**Onde:** server.js:96-103 (responde status ok com uptime, sem tocar Mongo nem Redis); server.js:86-92 e :682-684 (Sentry só se SENTRY_DSN existir; a variável está no .env.example:19 mas não no .env do repositório)

**O que e:** O endpoint de saúde devolve 200 e "status: ok" enquanto o processo estiver de pé — mesmo com o Mongo fora, o Redis recusando conexão ou o backfill parental tendo falhado. Não existe uptime check externo, alerta ou notificação configurada no repositório. Escopo: fazer o /health realmente pingar Mongo (e Redis, se ele for mantido) devolvendo 503 quando algo estiver fora, e plugar um monitor externo com alerta por e-mail/WhatsApp.

**Por que importa:** O Redis está caído desde 02/09 e ninguém foi avisado — a descoberta foi manual, nove dias depois. Sem health check honesto e sem alerta, o próximo incidente (que pode ser o Mongo, não o Redis) só aparece quando o cliente ou um leitor reclamar.

### [P] validateEnv existe mas nunca roda no boot

**Onde:** scripts/validateEnv.js (checa 8 variáveis obrigatórias e força de segredos); nenhuma referência a ele em server.js, ecosystem.config.js ou .github/workflows/ci.yml (grep sem resultado)

**O que e:** O validador é bom (exige >= 32 caracteres, barra valores de exemplo, exige JWT_SECRET != REFRESH_SECRET) mas é um npm script manual: npm run validate:env. Nada no boot do PM2 nem no CI o executa. Uma variável faltando ou trocada só aparece como erro de runtime na primeira requisição que dependa dela — e o server.js:21 ainda tem fallback silencioso para mongodb://localhost:27017/lorflux, que num deploy com MONGO_URI ausente sobe apontando para um banco vazio em vez de falhar. Escopo: chamar o validador no pre-start do ecosystem e no CI, e remover o fallback silencioso do Mongo.

**Por que importa:** Deploy que sobe com configuração errada e parece saudável é a pior falha possível — foi essencialmente isso que aconteceu com o frontend-dist. Custa pouco e fecha a porta.

### [P] uploads/tmp sem limpeza (agravado pela fila parada)

**Onde:** middlewares/uploadConfig.js:7 e :14 (tudo cai em uploads/tmp), :39 (limite de 800 MB por arquivo); workers/videoWorker.js:23-25 (só apaga o arquivo de entrada APÓS transcodificar com sucesso)

**O que e:** Todo upload da rota admin (vídeo, thumbnail e até 120 painéis, server.js:334-338) é gravado em disco em uploads/tmp. A única limpeza existente é o unlink do vídeo de entrada depois de um transcode bem-sucedido; thumbnails e painéis nunca são apagados de lá, e com o Redis fora nenhum job roda, então nem o vídeo é removido. Não há rotina de varredura de temporários. Escopo: rotina de limpeza por idade e verificação do que já está acumulado na VPS.

**Por que importa:** É a segunda via para encher o disco da VPS, junto com o log — e aqui cada arquivo pode ter até 800 MB. Vale conferir o tamanho atual da pasta na máquina antes de dimensionar.

### [P] Series e Episode sem nenhum índice (preventivo)

**Onde:** models/Series.js e models/Episode.js — zero chamadas a .index() em ambos (as demais coleções têm: models/EngagementEvent.js:31-48, models/CasoCuradoria.js:56-63, models/ReadingProgress.js:38-54)

**O que e:** As duas coleções centrais do catálogo não declaram índice algum, embora as queries de feed filtrem por content_type, isPublished, content_rating e tags (utils/parentalFilter.js:99-118 e routes/content.js) e os episódios sejam sempre buscados por seriesId. Sendo honesto: com 5 obras no acervo isso não custa nada hoje — é item preventivo, não incidente. O momento natural de resolver é junto com a classificação/tags do acervo, porque é exatamente aí que esses campos passam a ser filtrados de verdade.

**Por que importa:** Barato agora, caro depois: quando o acervo crescer, a lentidão vai aparecer como "o app está travando" sem causa óbvia, e o autoIndex do Mongoose constrói índice em coleção grande no boot, o que é mais arriscado do que fazer agora com 5 obras.

---

