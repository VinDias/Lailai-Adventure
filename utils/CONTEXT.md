# utils/

## Responsabilidade

Funções utilitárias transversais — arquivos `.js` (CommonJS) são do backend; arquivos `.ts` são helpers do frontend.

---

## Arquivos

### `logger.js`
Logger estruturado com **Winston**.
- Cria logs rotativos diariamente (`winston-daily-rotate-file`)
- Dois destinos: `error.log` (apenas erros) e `combined.log` (todos os níveis)
- Retenção de 30 dias
- Em desenvolvimento (`NODE_ENV !== production`), também exibe logs no console
- Usado em todo o backend para substituir `console.log`

### `generateMediaToken.js`
Geração de tokens JWT para acesso seguro a mídia no CDN.
- Gera um token assinado com `MEDIA_TOKEN_SECRET`
- Token com expiração por tempo (evita acesso permanente a URLs de mídia)
- Usado pelo backend antes de retornar URLs de vídeo/imagem protegidas

### `storageManager.js`
Gerenciamento da estrutura de diretórios locais.
- Cria as pastas de conteúdo necessárias no sistema de arquivos
- Usado durante o setup inicial e no processamento de uploads temporários

### `requestIdentity.js` (Fase 4)
`getIdentity(req)` — descobre de quem é a requisição de progresso: conta logada (`req.user.id`) sempre vence; senão cai para o visitante via cabeçalho `X-Anonymous-Id` (validado como UUID v4). Devolve `null` quando nenhum dos dois está presente. Usado por `routes/progress.js`.

---

### Helpers do frontend (`.ts`)

| Arquivo | Propósito |
|---------|-----------|
| `consent.ts` | Consentimento de cookies/anúncios (LGPD) + carregamento condicional do AdSense |
| `premium.ts` | `isPremiumActive(user)` — premium só vale se não expirado (checa `premiumExpiresAt`) |
| `localizedPrice.ts` | Preço da assinatura formatado pela locale |
| `googleSignIn.ts` | Carrega o script do Google Identity Services sob demanda (uma vez, com retry) para o botão "Entrar com Google" |
| `anonymousId.ts` (Fase 4) | `getAnonymousId()` — UUID v4 do visitante sem conta, gerado uma vez e persistido em `localStorage` (`lorflux_anonymous_id`); nunca lança (roda em toda chamada de API via `api.ts`) — usa `crypto.randomUUID`/`crypto.getRandomValues` com fallback pra `Math.random` (TWA roda no Chrome instalado do aparelho, que pode estar desatualizado) |
| `progressPosition.ts` (Fase 4) | `posicaoDeVolta(percent, alturaTotal, alturaVisivel)` e `percentualLido(...)` — conversão entre percentual salvo e posição de scroll do `WebtoonReader` (percentual, não pixel, pra funcionar entre telas de tamanhos diferentes) |
| `claimProgress.ts` (Fase 4) | `migrarProgressoDoVisitante()` — chamada logo após login/cadastro para levar o progresso do visitante (`anonymousId` do `localStorage`) à conta via `api.claimProgress`; falha em silêncio e nunca segura o login além de `PRAZO_MIGRACAO_MS` (2s) |
| `pushManager.ts` (Fase 4, Bloco 2) | Gerenciador de notificações push no frontend — wrapper sobre Web Push API. `subscribe(contentTypes)` → chama `api.push.subscribe()`; `unsubscribe()` → remove inscrição; `getStatus()` → devolve `{isSubscribed, contentTypes}`; `handlePushMessage(event)` (chamado pelo service worker v3 quando push chega) — extrai deep link do payload e navega sem fechar o app (permissão sempre visualizada ao usuário antes de inscrever) |

## Observações

- Backend usa apenas os `.js` (CommonJS); nunca use `console.log` em produção — use o `logger.js`
