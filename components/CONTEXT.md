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

## Admin

| Arquivo | Propósito |
|---------|-----------|
| `Admin/AdminDashboard.tsx` | Painel administrativo completo — inclui estatísticas, gerenciamento de séries/episódios, uploads diretos para Bunny CDN, gestão de campanhas de anúncios, gerenciamento de usuários e rastreamento de pagamentos |

## UI Geral

| Arquivo | Propósito |
|---------|-----------|
| `ThemeToggle.tsx` | Botão de alternância entre tema claro e escuro |
| `BrandLogo.tsx` | Componente do logotipo Lorflux |

---

## Padrões Utilizados

- Todos os componentes são escritos em **TypeScript** (`.tsx`)
- Estilização via **Tailwind CSS** com suporte a `dark:` variants
- Comunicação com o backend via `services/api.ts`
- Estado local gerenciado com `useState`/`useEffect` do React 19
- Nenhuma biblioteca de gerenciamento de estado global (sem Redux/Zustand)
- **i18n:** strings de UI voltadas ao usuário vêm de `i18n/translations.ts` via hook `useT()` do `contexts/I18nContext.tsx` (PT/EN/ES/ZH, persistido em `lorflux_language` — a mesma chave usada pelo `WebtoonReader` para os balões). Textos do Admin e conteúdo legal permanecem em PT.
