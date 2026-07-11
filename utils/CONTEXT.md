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

---

### Helpers do frontend (`.ts`)

| Arquivo | Propósito |
|---------|-----------|
| `consent.ts` | Consentimento de cookies/anúncios (LGPD) + carregamento condicional do AdSense |
| `premium.ts` | `isPremiumActive(user)` — premium só vale se não expirado (checa `premiumExpiresAt`) |
| `localizedPrice.ts` | Preço da assinatura formatado pela locale |
| `googleSignIn.ts` | Carrega o script do Google Identity Services sob demanda (uma vez, com retry) para o botão "Entrar com Google" |

## Observações

- Backend usa apenas os `.js` (CommonJS); nunca use `console.log` em produção — use o `logger.js`
