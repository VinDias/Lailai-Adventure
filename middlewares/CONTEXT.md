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
