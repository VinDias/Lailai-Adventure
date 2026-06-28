# Segurança & Conformidade LGPD — Lorflux

Documento das correções de segurança e da adequação à LGPD aplicadas ao projeto,
com as ações manuais que ainda dependem de configuração de ambiente/infra.

Data: 23/05/2026

---

## 1. Vulnerabilidades corrigidas

| # | Severidade | Vulnerabilidade | Correção |
|---|-----------|-----------------|----------|
| 1 | **Crítica** | Injeção NoSQL em `reset-password` permitia takeover de conta (`{"token":{"$gt":""}}`) | Validação de tipo `string` + sanitização global de operadores `$`/`.` |
| 2 | **Crítica** | Injeção NoSQL em `refresh-token` | Validação de tipo + sanitização global |
| 3 | **Alta** | Webhook do Bunny sem autenticação (qualquer um sobrescrevia `video_url`/status) | `verifyBunnyWebhook` exige `BUNNY_WEBHOOK_SECRET` (fail-closed) |
| 4 | **Alta** | CSP desabilitada + tokens JWT no `localStorage` (roubo via XSS) | CSP restritiva no Helmet + tokens em cookies `httpOnly`/`Secure`/`SameSite=strict` |
| 5 | **Alta** | Broken access control: `GET /episodes/:id` entregava mídia premium a qualquer um | `optionalAuth` + remoção de `video_url`/`bunnyVideoId`/`panels` para não-assinantes |
| 6 | **Média** | Mass-assignment via `{ $set: req.body }` (séries/episódios/anúncios) | Whitelist de campos (`utils/pick.js`) |
| 7 | **Média** | `verifyMediaToken` com checagem fraca (`String.includes`) | Correspondência de caminho rígida + validação de tipo |
| 8 | **Média** | Sem rate-limit em cadastro/recuperação/redefinição de senha | `accountLimiter` (10/15min) |
| 9 | **Média** | Vazamento de `err.message` (stack/infra) nas respostas | Mensagens genéricas + handler global de erros JSON |
| 10 | **Média** | Validação de pagamento mobile aceitava assinatura cancelada e não persistia | Reescrita: valida expiração/estado e grava no banco |
| 11 | **Média** | Política de senha fraca (mín. 6, sem regra) | Mín. 8 com letra + número (`validators/authValidator.js`) |
| 12 | **Média** | `seedAdmin` com senha hardcoded | Lê de `SEED_ADMIN_*` e exige senha forte |
| 13 | **Baixa** | Refresh token sem rotação, sem revalidar conta | Rotação + checagem de `isActive`/role no banco |
| 14 | **Baixa** | CORS liberava `localhost` em produção | `localhost` só fora de produção |
| 15 | **Baixa** | Conta desativada continuava válida até expirar token | Middleware global revalida `isActive` em `/api` |
| 16 | **Baixa** | Segredos fracos/iguais não detectados | `validateEnv` checa força e unicidade |
| 17 | **Baixa** | Enumeração de usuário no login (timing) | `bcrypt.compare` dummy quando o usuário não existe |

Defesas adicionais: HSTS em produção, `frame-ancestors 'self'` (anti-clickjacking),
limite de body JSON reduzido (2 MB) e correção de race condition no logger.

---

## 2. Conformidade com a LGPD

- **Base de consentimento (Art. 8º):** aceite explícito de Termos + Política no
  cadastro, gravado em `User.consent` (data + IP).
- **Banner de consentimento de cookies:** o script do **Google AdSense não carrega
  até o usuário aceitar** (`utils/consent.ts`, `components/ConsentBanner.tsx`).
  Antes do aceite, apenas anúncios próprios (sem cookies de terceiros).
- **Política de Privacidade + Termos de Uso:** `components/LegalPolicy.tsx`
  (controlador, Encarregado, dados coletados, finalidades/bases legais,
  compartilhamento, transferência internacional, retenção, direitos, segurança).
- **Direitos do titular (Art. 18)** em `routes/account.js` + UI em
  `components/PrivacyCenter.tsx`:
  - `GET /api/account/me/export` — acesso/portabilidade (download JSON).
  - `PUT /api/account/me/consent` — revogar/atualizar consentimento de marketing.
  - `DELETE /api/account/me` — eliminação dos dados (com confirmação por senha;
    cancela assinatura Stripe, remove votos/canais/tokens).
- **Minimização de dados:** e-mails são mascarados nos logs (`utils/pii.js`).

---

## 3. AÇÕES MANUAIS NECESSÁRIAS (operador / infra)

> Sem estes passos, partes da segurança não ficam ativas.

1. **Segredos do `.env`** (≥ 32 caracteres, únicos):
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Defina `JWT_SECRET`, `REFRESH_SECRET`, `MEDIA_TOKEN_SECRET` (todos diferentes).
2. **`BUNNY_WEBHOOK_SECRET`**: defina no `.env` e configure a URL do webhook no
   painel do Bunny como `https://SEU_DOMINIO/api/bunny/webhook?token=SEGREDO`.
3. **Proteção de vídeo Bunny** (ver `memory/tech-debt-bunny-security.md`):
   ative *Token Authentication* na library, configure *Allowed Referrers* e
   defina `BUNNY_TOKEN_KEY`.
4. **HTTPS obrigatório** em produção (cookies `Secure` só trafegam via HTTPS).
5. **Definir o e-mail do Encarregado (DPO)**: hoje é o placeholder
   `contato@lorflux.com` em `components/LegalPolicy.tsx` — ajuste conforme o
   canal real e revise os textos legais com apoio jurídico.
6. **Seed do admin**: defina `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` antes de
   `npm run seed:admin` (a senha antiga hardcoded foi removida; troque qualquer
   admin que tenha usado `SENHA_TEMPORARIA_TROCAR`).

---

## 4. Recomendações de follow-up (não implementadas)

- **`VerticalPlayer.tsx`**: remover o fallback que toca a URL não assinada quando
  `signed-url` falha (depende do item 3 acima).
- Considerar **2FA** para administradores.
- **MFA/limite de tentativas por conta** (hoje o limite é por IP).
- Revisão jurídica formal dos textos de Privacidade/Termos.
- Code-splitting do bundle (> 500 kB) — performance, não segurança.

---

## 5. Testes

`tests/backend/security.test.js` cobre injeção NoSQL, política de senha,
consentimento obrigatório, exportação/exclusão de conta e webhook autenticado.

```
npm run test:backend   # 103 testes (backend)  — OK
npm test               # 81 testes (frontend)  — OK
```
