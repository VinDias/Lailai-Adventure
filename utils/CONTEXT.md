# utils/

## Responsabilidade

Funções utilitárias transversais usadas pelo backend — logging, geração de tokens e gerenciamento de diretórios.

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

## Observações

- Todos os arquivos são CommonJS (`.js`) — o backend não usa TypeScript
- O `logger.js` é o único mecanismo de log do backend; nunca use `console.log` em produção
