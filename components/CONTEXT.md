# components/

## Responsabilidade

Todos os componentes React da interface do usuário. É a maior camada do frontend, responsável por renderizar cada seção da plataforma.

---

## Componentes de Conteúdo

| Arquivo | Propósito |
|---------|-----------|
| `HQCineHome.tsx` | Página inicial da seção HQCine com destaque de séries |
| `HQCine.tsx` | Navegação e seleção de episódios de quadrinhos cinematográficos |
| `VFilm.tsx` | Player e navegação de filmes verticais (VCine) |
| `HiQua.tsx` | Navegação e seleção de séries de webtoon |
| `ComicFeed.tsx` | Feed de conteúdo de quadrinhos |
| `HiQuaFeed.tsx` | Feed de conteúdo de webtoons |
| `VideoFeed.tsx` | Feed de conteúdo de vídeo |
| `Discover.tsx` | Interface de descoberta e busca de conteúdo |

## Player e Leitor

| Arquivo | Propósito |
|---------|-----------|
| `VerticalPlayer.tsx` | Player de vídeo avançado com HLS.js, múltiplas trilhas de áudio, troca de qualidade, sistema de votação e exibição de anúncios para usuários não-premium |
| `WebtoonReader.tsx` | Leitor de webtoon com navegação entre capítulos, suporte a múltiplos idiomas (PT/EN/ES/ZH) via camadas de tradução sobre os painéis |

> Atenção: `VerticalPlayer.tsx` e `WebtoonReader.tsx` são componentes de alto volume de código, contendo toda a lógica de reprodução/leitura.

## Autenticação e Usuário

| Arquivo | Propósito |
|---------|-----------|
| `Auth.tsx` | Tela de login e registro com suporte a email/senha e OAuth (Google, Microsoft) |
| `Profile.tsx` | Página de perfil do usuário com acesso às abas de conta e assinatura |
| `UserTab.tsx` | Aba com informações da conta do usuário |
| `SubscriptionTab.tsx` | Aba com status da assinatura premium e opção de upgrade |
| `Logout.tsx` | Botão e lógica de logout |

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
