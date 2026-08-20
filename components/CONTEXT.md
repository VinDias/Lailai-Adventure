# components/

## Responsabilidade

Todos os componentes React da interface do usuário. É a maior camada do frontend, responsável por renderizar cada seção da plataforma.

---

## Componentes de Conteúdo

| Arquivo | Propósito |
|---------|-----------|
| `HQCine.tsx` | Navegação e seleção de episódios de quadrinhos cinematográficos (com banner de anúncio para free e curtida/favorito por obra) |
| `VFilm.tsx` | Player e navegação de filmes verticais (VCine) |
| `HiQua.tsx` | Navegação e seleção de séries de webtoon |
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
| `Profile.tsx` | Página de perfil do usuário com acesso às abas de conta e assinatura |
| `SubscriptionTab.tsx` | Aba com status da assinatura premium e opção de upgrade |
| `Logout.tsx` | Botão e lógica de logout |

> A aba Conta (renderizada em `App.tsx`) inclui: troca de foto de perfil (upload → `/api/account/me/avatar`), Meus Favoritos, Avaliar o app (link Play Store), seletor de idioma (i18n) e Centro de Privacidade.

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
| `Admin/AdminDashboard.tsx` | Painel administrativo completo — inclui estatísticas, gerenciamento de séries/episódios, uploads diretos para Bunny CDN, gestão de campanhas de anúncios, gerenciamento de usuários e rastreamento de pagamentos. Na seção de edição de série, novo campo `releaseDay` (select 0–6 ou null) para agenda e notificações push. |

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
