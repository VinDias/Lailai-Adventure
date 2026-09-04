# middlewares/

## Responsabilidade

Middlewares Express para processamento de requisições — autenticação, autorização, controle de acesso e upload de arquivos.

---

## Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `verifyToken.js` | Autentica o usuário — extrai e valida o JWT do header `Authorization: Bearer <token>` ou de um cookie. Popula `req.user` com os dados do token |
| `requireAdmin.js` | Autorização — verifica se o usuário autenticado tem role `admin` ou `superadmin`. Retorna 403 caso contrário |
| `requirePremium.js` | Verifica se o usuário possui assinatura premium ativa (`isPremium === true` e `premiumExpiresAt` não expirado). Bloqueia acesso a conteúdo premium |
| `requireRole.js` | Middleware genérico de controle de acesso baseado em role — parametrizável para qualquer role do sistema |
| `verifyMediaToken.js` | Valida tokens de acesso para mídia hospedada no CDN — previne acesso não autorizado a arquivos de vídeo e imagem |
| `uploadConfig.js` | Configuração do Multer para upload de arquivos — define limites de tamanho, tipos MIME aceitos e diretório de armazenamento temporário |
| `premium.middleware.ts` | Versão TypeScript do middleware de verificação premium — usada em contextos que exigem tipagem |
| `accountLimiter.js` (Fase 5, Bloco 2) | Rate limit de rotas sensíveis de conta — 10 requests por 15 min por IP (`accountLimiter.js:8-15`). **Extraído de `server.js`**, onde era um `const` local, para `routes/parental.js` poder usá-lo sem require circular do próprio `server.js`. Aplicado em cadastro, esqueci-a-senha, redefinir senha e (Bloco 2) `POST /api/parental/pin/recuperar` + `/recuperar/confirmar`. Em `NODE_ENV=test` vira um passthrough `(req,res,next)=>next()`. **Balde compartilhado por IP** com as rotas de senha — decisão registrada: uma casa atrás do mesmo NAT divide a cota (aceito; o rate limit do PIN em si é o persistido por `userId` em `services/parentalPinService.js`, não este) |

---

## Ordem de Uso nas Rotas

Rotas protegidas seguem esta sequência:

```
verifyToken → requireAdmin (ou requirePremium / requireRole) → handler da rota
```

Rotas públicas não usam nenhum middleware de autenticação.

---

## Observações

- `verifyToken` aceita token via header HTTP **ou** via cookie, suportando ambos os fluxos (browser e cliente mobile)
- O limite de upload é configurado via `MAX_UPLOAD_SIZE` no `.env` (padrão: 500MB)
- Arquivos enviados pelo Multer são salvos temporariamente e limpos após o processamento
