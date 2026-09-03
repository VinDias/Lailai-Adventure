# components/

## Responsabilidade

Todos os componentes React da interface do usuário. É a maior camada do frontend, responsável por renderizar cada seção da plataforma.

---

## Componentes de Conteúdo

| Arquivo | Propósito |
|---------|-----------|
| `HQCine.tsx` | Navegação e seleção de episódios de quadrinhos cinematográficos (com banner de anúncio para free e curtida/favorito por obra). Fase 4, Bloco 4: a grade carrega via `api.getRecommendations('hqcine')` (ordem do algoritmo de recomendação); erro OU lista vazia caem no fallback `api.getSeries()` filtrado por `content_type` (a ordem manual de hoje) — a recomendação nunca pode derrubar o feed |
| `VFilm.tsx` | Player e navegação de filmes verticais (VCine). Fase 4, Bloco 4: mesmo padrão de carga do `HQCine.tsx` — `api.getRecommendations('vcine')` com fallback para `api.getSeries()` |
| `HiQua.tsx` | Navegação e seleção de séries de webtoon. Fase 4, Bloco 4: mesmo padrão de carga do `HQCine.tsx` — `api.getRecommendations('hiqua')` com fallback para `api.getSeries()` |
| `MyFavorites.tsx` | Tela "Meus Favoritos" — lista de obras favoritadas pela conta |

> Removidos em jul/2026 (código morto, sem imports): `HQCineHome.tsx`, `ComicFeed.tsx`, `HiQuaFeed.tsx`, `UserTab.tsx`.

## Player e Leitor

| Arquivo | Propósito |
|---------|-----------|
| `VerticalPlayer.tsx` | Player de vídeo avançado com HLS.js, múltiplas trilhas de áudio, troca de qualidade, sistema de votação e exibição de anúncios para usuários não-premium |
| `WebtoonReader.tsx` | Leitor de webtoon com navegação entre capítulos, suporte a múltiplos idiomas (PT/EN/ES/ZH) via camadas de tradução sobre os painéis |

> Atenção: `VerticalPlayer.tsx` e `WebtoonReader.tsx` são componentes de alto volume de código, contendo toda a lógica de reprodução/leitura.

## Autenticação e Usuário

| Arquivo | Propósito |
|---------|-----------|
| `Auth.tsx` | Tela de login/registro por e-mail/senha + botão "Entrar com Google" (Google Identity Services; aparece só quando `google_client_id` está nas settings públicas) + fluxos de esqueci/redefinir senha |
| `Onboarding.tsx` | Walkthrough de primeiro uso — 4 passos apresentando HQCine/VCine/Hi-Qua/Conta; exibido uma vez (flag `lorflux_onboarded` no localStorage) |
| `SubscriptionTab.tsx` | Aba com status da assinatura premium e opção de upgrade |
| `Logout.tsx` | Botão e lógica de logout |

> `Profile.tsx` foi **removido** na Fase 5, Bloco 1 (Task 9): era código morto — não importado por `App.tsx` — e a única coisa que ainda chamava era o antigo `POST /api/channels` aberto a qualquer usuário, que virou admin-only neste bloco. A aba Conta sempre foi renderizada pelo próprio `App.tsx`.

> A aba Conta (renderizada em `App.tsx`) inclui: troca de foto de perfil (upload → `/api/account/me/avatar`), Meus Favoritos, Avaliar o app (link Play Store), seletor de idioma (i18n), Centro de Privacidade e — só para donos de canal — o cartão "Meu Estúdio".

## Portal do Ilustrador (Fase 5, Bloco 1)

| Arquivo | Propósito |
|---------|-----------|
| `MeuEstudioCard.tsx` | Cartão "Meu Estúdio" na aba Conta, montado dentro do bloco `{user && ...}` de `App.tsx` (visitante nunca o monta). Consulta `GET /api/portal/meu-estudio` ao montar e decide sozinho se existe: **200 → renderiza** (com badges de pendências de aprovação e mensagens não lidas somadas entre os canais); **qualquer falha → não renderiza nada**. Tratar todo erro como "não mostrar" é deliberado — 403 é o caso normal da maioria dos leitores, e distinguir 403 de outras falhas por texto de mensagem não seria contrato estável. Não derruba a sessão porque `services/api.ts` só reage a 401 |
| `PortalEstudio.tsx` | Tela do portal (`ViewMode.PORTAL_ESTUDIO`), abas **Números** / **Obras** / **Mensagens**. Números: mês corrente sem R$ (só pontos/views/share), períodos fechados com R$. Obras: lista com 3 estados derivados (rascunho / em análise / publicada), criar e editar rascunho, criar capítulo, upload de capa/thumbnail/painéis com progresso e o botão "Enviar para aprovação". **Todos os campos de imagem são `<input type="file">` — não existe nenhum campo de URL no formulário**, e não existe campo Gênero (o Master preenche na aprovação); a "Classificação sugerida" é um `<select>` kids/teen/young. Seções **CINECOMICS** e **VERTICALSHOW** aparecem sempre, bloqueadas, com o aviso de temporada ("em breve") — sem checkout e sem upload. Seletor de canal aparece só para quem tem mais de um. Rótulos dos tipos sempre por `utils/contentTypeLabels.ts` (`NOME_ABA`), nunca hardcode |
| `CanalPublico.tsx` | Página pública do canal, alcançada pelo clique no nome do canal no modal de detalhe da obra nos 3 feeds. Consome o shape novo de `GET /api/channels/:id` (`followersCount` + `isFollowing`, sem `followers[]`); as obras do canal vêm de `GET /api/content/series` filtradas por `channelId` no cliente (sem rota nova — o mesmo custo dos feeds atuais; rota dedicada quando o catálogo crescer). Seguir/Seguindo com atualização otimista e rollback em erro; **visitante vê o botão desabilitado**, mesmo padrão do favoritar nos feeds |
| `Admin/AprovacoesPanel.tsx` | Fila de Aprovação (admin, PT fixo). Cards ordenados por antiguidade com preview (capa/thumbnail), descrição, classificação sugerida, canal e — no episódio — contagem de painéis e o estado da série-mãe. **Aprovar de série fica desabilitado enquanto o campo Gênero OU a Classificação etária estiverem vazios** (`AprovacoesPanel.tsx:160`, `podeAprovarSerie` — Fase 5 Bloco 2, Task 6); episódio fica desabilitado enquanto a série-mãe não estiver publicada. Reusa o `TagsChipInput` do `AdminDashboard`. Devolver abre textarea obrigatória. Após cada ação, refetch da fila e atualização do badge da sidebar via `onCountChange` |
| `Admin/CanaisPanel.tsx` | Gerenciamento de canais (admin, PT fixo): campo "E-mail do dono" (transfere a titularidade via `PUT /api/channels/:id`), botão "Desativar canal" (com `confirm`, `POST /:id/desativar`) e aba **Mensagens** por canal, que mostra a thread vigente e as arquivadas. O resultado da transferência usa uma flag booleana de erro (não heurística sobre o texto), para o 404 de e-mail inexistente não ser pintado de verde. **Fase 5 Bloco 2, Task 8 (higiene do Bloco 1):** a lista carrega com `api.listChannels(true)` → `GET /channels?includeInactive=true` (`CanaisPanel.tsx:47`) — TODOS os canais, com `isActive` vindo direto do backend (sem estado local paralelo); canal `isActive:false` mostra o botão **"Reativar canal"** (`POST /:id/reativar`, `CanaisPanel.tsx:120`) no lugar de "Desativar canal" — reativar NÃO desarquiva nenhuma `MensagemPortal` (a thread arquivada é do ex-dono). Como o canal inativo continua na lista, a aba Mensagens continua acessível para ele (a thread arquivada não perde porta de entrada) |

## Monetização

| Arquivo | Propósito |
|---------|-----------|
| `Premium.tsx` | Página de apresentação da assinatura premium com features e botão de checkout Stripe |
| `Ads.tsx` | Componente de listagem/controle de anúncios |
| `AdComponent.tsx` | Componente individual de exibição de um anúncio em vídeo |
| `DonateButton.tsx` | Botão de doação integrado ao backend |

## Notificações e Agenda (Fase 4, Bloco 2)

| Arquivo | Propósito |
|---------|-----------|
| `PushPrompt.tsx` | Cartão contextual pós-favorito — escuta o evento `lorflux:favorited` (disparado por `services/api.ts::addFavorite`) e aparece uma única vez, de forma não-bloqueante, só quando `pushManager.isSupported()` e a permissão do navegador ainda está em `default` e o usuário nunca respondeu (flag `lorflux_push_asked` no `localStorage`, nunca limpa pelo app). Botão "Ativar" chama `pushManager.subscribeThisDevice()` (nunca lança — sucesso ou falha, o cartão fecha e grava a flag do mesmo jeito); "Agora não" só fecha. Lock síncrono via `useRef` evita duplo clique disparar duas assinaturas. `z-[1600]` — acima do modal de detalhe de série (1500, único ponto de favoritar) e abaixo do leitor (2000). |
| `PushAccountToggle.tsx` | Toggle "Notificações de capítulos novos" na aba Conta. Cinco estados (`carregando`/`ligado`/`desligado`/`negado`/`indisponivel`): carrega com `pushManager.getStatus()`; sem suporte do navegador (`isSupported() === false`) o componente inteiro não renderiza; permissão `denied` trava o toggle com dica; `getStatus()` retornando `null` (sem suporte residual ou erro) trava com aviso de "indisponível", nunca afirma "desligado" sobre status não confirmado. Clique chama `subscribeThisDevice()`/`unsubscribeThisDevice()` direto (não depende do `PushPrompt`). |
| `AgendaView.tsx` | Overlay de agenda de lançamentos (`z-[1550]`) — busca `api.getAgenda()` (`GET /api/content/agenda`) ao abrir, agrupado por dia da semana (0=domingo..6=sábado, igual `Date.getDay()`). Seletor horizontal dos 7 dias (nomes via `Intl.DateTimeFormat` na locale do idioma do APP, não do navegador) com o dia de hoje destacado e um dia selecionado (default: hoje); grade de capas (`cover_image` + `title`) do dia selecionado; clique abre a série (`onOpenSeries`) e fecha o overlay. Fecha por Escape ou clique no backdrop. |

## Super Reader (Fase 4, Bloco 3)

| Arquivo | Propósito |
|---------|-----------|
| `SuperReaderButton.tsx` | Botão de apoio direto ao autor de uma obra — inserido no modal de detalhe de série dos **3 feeds** (`HQCine.tsx`, `VFilm.tsx`, `HiQua.tsx`), na mesma linha do favoritar/curtir. Busca `GET /api/superreader/min` ao montar e mostra 3 valores rápidos (mínimo, 2x, 4x) + campo livre; converte o valor digitado (vírgula OU ponto) para **centavos** com `Math.round` antes de enviar (fronteira frontend→backend sempre em centavos). Visitante (`user: null`) vê o botão; ao abrir, mostra convite de login no lugar do formulário em vez do form (não desabilita em silêncio, ao contrário do padrão de favoritar/curtir). Lock síncrono via `useRef` contra duplo clique (mesma técnica de `PushPrompt.tsx`). Sucesso redireciona (`window.location.href = url`) para o Stripe |
| `SuperReaderThanks.tsx` | Cartão de agradecimento pós-checkout — `App.tsx` monta quando o boot detecta `?superreader=success` na query (via `utils/superReaderReturn.ts`, mesmo trecho que consome o deep link de push; `cancelled` só limpa a query, em silêncio). `z-[1600]`, mesma posição fixa de `PushPrompt.tsx` — **exclusão mútua**: enquanto o thanks está aberto, `PushPrompt` fica desmontado (`{user && !superReaderThanks && <PushPrompt />}`); se um favorito acontecer nessa janela, o convite de push fica para o próximo favorito, pois a flag de "já perguntou" só é gravada quando o cartão do `PushPrompt` de fato aparece |
| `SuperReaderBadge.tsx` | Selo Super Reader na aba Conta — consulta `GET /api/superreader/me` ao montar. `superReader: true` → selo (ícone `Crown`) + lista das contribuições (título da obra, valor formatado, data curta na locale do idioma do app, igual `AgendaView.tsx`); obra removida cai no texto de fallback i18n. `superReader: false` → convite discreto para apoiar. Falha da API (rede, 401 expirado etc.) → não renderiza nada, nunca quebra a Conta |

## Admin

| Arquivo | Propósito |
|---------|-----------|
| `Admin/AdminDashboard.tsx` | Painel administrativo completo — inclui estatísticas, gerenciamento de séries/episódios, uploads diretos para Bunny CDN, gestão de campanhas de anúncios, gerenciamento de usuários e rastreamento de pagamentos. Na seção de edição de série, campo `releaseDay` (select 0–6 ou null) para agenda e notificações push. **Fase 5 Bloco 2, Task 6 (RE-PINADO do Bloco 4):** componente interno `TagsChipInput` (`AdminDashboard.tsx:2302`, não é arquivo próprio) nos formulários de criar/editar série — **seletor FECHADO**: 19 chips do vocabulário oficial (`utils/tagsVocabulario.json`, rótulo PT), clique liga/desliga, máx 8 (chips extras desabilitados ao atingir o teto, contador "n/8"), SEM input livre e SEM o antigo aviso de "mínimo 5" (revogado — spec rev.3). Mesmo componente reusado na Fila de Aprovação (`Admin/AprovacoesPanel.tsx`); o form do portal usa um componente IRMÃO com i18n (`PortalTagsChipInput`, `components/PortalEstudio.tsx:25`), mesmo JSON. **Fase 5 Bloco 2, Task 8 (Dívida T6 (2)):** o badge "N não classificadas" do cabeçalho (`naoClassificadasCount`) refaz `GET /admin/aprovacoes` (`refetchAprovacoesBadges`, `AdminDashboard.tsx:301`) depois de `handleSaveSeriesEdit` E `handleCreateSeries` (além do refetch já existente do `AprovacoesPanel` via `onNaoClassificadasChange`); na própria lista de Gerenciar Séries, cada série PUBLICADA sem `content_rating` (null ou campo ausente) ganha o chip **"Sem classificação"** (`AdminDashboard.tsx:1062`) — para o Master achar QUAIS obras faltam classificar, não só o total do badge |
| `ParentalSettings.tsx` | "Classificação etária e Preferências de conteúdo" + PIN de proteção (Fase 5, Bloco 2, Task 7) — seção da Conta do LEITOR, renderizada ANTES do `PrivacyCenter` em `App.tsx`, molde do próprio `PrivacyCenter.tsx`. Nomenclatura EXATA da spec — NUNCA "controle de classificação"/"controle parental" em texto visível. Etária (3 opções + explicação) e os 19 toggles de tags vêm de `GET /api/parental` (campo `vocabulario`) — NUNCA um import direto do JSON (esse canal é só dos chips do admin/portal); rótulo de cada toggle tenta `tags.<slug>` no i18n primeiro, cai para o `rotuloPt` do próprio GET se a chave não existir. Salva em LOTE (botão "Salvar preferências", PIN pedido 1x por lote quando `temPin`). PIN: definir/trocar/remover (`POST /api/parental/pin`), recuperação por token de e-mail (`?token=` detectado no boot de `App.tsx`, mesma técnica do deep link de push), 401/429 tratados com contagem de tentativas restantes. `request()` de `services/api.ts` tem o 4º parâmetro `retryAuthOn401=false` nas 3 rotas de PIN — sem isso, o retry automático em 401 reenviaria um PIN errado e dobraria `pinTentativas` por tentativa do usuário |

## UI Geral

| Arquivo | Propósito |
|---------|-----------|
| `ThemeToggle.tsx` | Botão de alternância entre tema claro e escuro |
| `BrandLogo.tsx` | Componente do logotipo Lorflux |
| `ProgressBar.tsx` (Fase 4) | Barra fina de progresso — some quando `percent` é 0/ausente (obra não iniciada). Usada dentro de `ContinueCarousel` e nos cards do catálogo (`HQCine`/`HiQua`/`VFilm`) |
| `ContinueCarousel.tsx` (Fase 4) | Carrossel "Continuar" no topo de cada aba — busca `GET /api/me/continue?contentType=` (o backend já aplica poda/dedupe/teto por tipo). Aceita `items` opcional: quando a aba já buscou a lista pra pintar a barra de progresso dos cards do catálogo, passa aqui e o carrossel não busca de novo |

---

## Padrões Utilizados

- Todos os componentes são escritos em **TypeScript** (`.tsx`)
- Estilização via **Tailwind CSS** com suporte a `dark:` variants
- Comunicação com o backend via `services/api.ts`
- Estado local gerenciado com `useState`/`useEffect` do React 19
- Nenhuma biblioteca de gerenciamento de estado global (sem Redux/Zustand)
- **i18n:** strings de UI voltadas ao usuário vêm de `i18n/translations.ts` via hook `useT()` do `contexts/I18nContext.tsx` (PT/EN/ES/ZH, persistido em `lorflux_language` — a mesma chave usada pelo `WebtoonReader` para os balões). Textos do Admin e conteúdo legal permanecem em PT.
