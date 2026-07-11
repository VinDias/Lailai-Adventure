# Plano de Implementação — Pacote Completo (Testers + Tradução + Foto + Fase 3)
**Data:** 2026-07-11
**Status:** 🚧 Em implementação
**Escopo comercial:** pacote fechado com o cliente (R$ 2.200) cobrindo 4 entregas.
**Plano anterior** (Módulo de Produtividade Admin, mar/2026): entregue — ver histórico do git.

---

## Ordem de Entrega

| # | Entrega | Estimativa | Status |
|---|---------|-----------|--------|
| 1 | Melhorias dos testers (avaliação, walkthrough, login Google, ASO) | 2 dias | 🚧 |
| 2 | Foto de perfil | 1 dia | ⏳ |
| 3 | Tradução do aplicativo (UI + conteúdo) | 2-3 dias | ⏳ |
| 4 | Fase 3 — Motor de Royalties e Anti-fraude | ~1 semana | ⏳ aguarda 3 decisões |

**Processo (definido pelo Fellipe):** planejar → documentar contextos → escrever testes → CI/CD → codar.
Cada entrega: testes verdes + build ok → commit → push → deploy manual na VPS pelo Fellipe.

---

## 1. Melhorias dos Testers

### 1a. Botão "Avaliar o app"
- `App.tsx` (aba Conta): botão abrindo `https://play.google.com/store/apps/details?id=com.lorflux.twa` em nova aba.
- Sem backend. Ícone `Star` (lucide).

### 1b. Walkthrough de primeiro uso
- Novo `components/Onboarding.tsx`: overlay fullscreen com 4 passos (HQCine, VCine, Hi-Qua, Conta/Favoritos), indicador de progresso, "Próximo/Começar" e "Pular apresentação".
- Flag `lorflux_onboarded` no localStorage; exibido uma única vez, após login ou restauração de sessão (`App.tsx`).
- Usuários existentes veem uma vez (bom: o revisor do Google também verá).

### 1c. Login com Google
Fluxo mínimo do **Google Identity Services (GIS)** — ID token, sem client secret, sem scopes além de perfil básico.

**Backend (`server.js`):**
- `POST /api/auth/google` (com `accountLimiter`): recebe `{ credential }`, verifica assinatura/audience via `google-auth-library` (`OAuth2Client.verifyIdToken`), exige `email_verified === true`.
- Conta existente com mesmo e-mail → **vincula** (`providerId`, avatar se vazio) e loga — decisão aprovada (e-mail já verificado pelo Google). `isActive === false` → 403.
- Conta nova → cria com `provider: 'google'`, consentimento LGPD registrado (o aceite é apresentado junto ao botão).
- Sessão idêntica ao login normal: JWT 15m + refresh 7d + cookies httpOnly + `premiumExpiresAt` na resposta.
- **Dormente sem `GOOGLE_CLIENT_ID` no env** (rota responde 503; botão não aparece) — deploy seguro antes da configuração do Google Cloud.

**CSP/COOP (`server.js`):** `accounts.google.com` em scriptSrc/styleSrc/frameSrc; `crossOriginOpenerPolicy: same-origin-allow-popups` (o default `same-origin` quebra o popup do GIS).

**Frontend:**
- `google_client_id` exposto em `GET /api/settings/public` (vem do env; presente = botão aparece). `SettingsContext` ganha o campo.
- `utils/googleSignIn.ts`: carrega o script GIS sob demanda (uma vez, com retry em falha).
- `components/Auth.tsx`: divisor "ou" + botão oficial do Google (renderButton) nos modos login/cadastro + texto "Ao continuar com o Google, você aceita os Termos e a Política de Privacidade". Callback → `api.googleLogin(credential)` → `onLogin`.
- `services/api.ts`: `googleLogin(credential)`.

**Páginas legais públicas (pré-requisito da tela de consentimento OAuth):**
- O App passa a reconhecer `/privacidade` e `/termos` na URL e abre o modal `LegalPolicy` correspondente (funciona deslogado). URLs para informar no Google Cloud Console.

**Configuração externa (Fellipe, em paralelo):**
1. Google Cloud Console → Credenciais → ID do cliente OAuth (App Web) com origens `https://www.lorflux.com` e `https://lorflux.com` (+ `http://localhost:5173` para dev).
2. Tela de consentimento: nome, logo, domínio, URL da política (`https://www.lorflux.com/privacidade`).
3. `GOOGLE_CLIENT_ID=...` no `.env` da VPS + `pm2 restart`.

### 1d. Texto ASO
- Reescrever `PLAY_STORE.md`: descrição curta (≤80 chars) e longa (≤4000 chars) com palavras-chave (quadrinhos, webtoon, HQ, comics, mangá, leitor de quadrinhos, filmes verticais), bullets de funcionalidades. Fellipe cola no Play Console.

---

## 2. Foto de Perfil

**Backend:**
- `POST /api/account/me/avatar` (`verifyToken`, multer memória, máx 5MB, `image/*`): redimensiona com `sharp` (512×512, cover, webp q80) → Bunny Storage `lorflux/avatars/<userId>.webp` (helper reutilizado do upload de imagens existente) → atualiza `User.avatar` → retorna URL.
- Sem Bunny configurado (dev/test): 503 explícito.
- LGPD: avatar (URL) já sai no export de dados; na exclusão de conta, remoção best-effort do arquivo no Bunny.

**Frontend (`App.tsx`, aba Conta):**
- Botão de lápis sobreposto ao avatar → file picker → spinner → `api.uploadAvatar(file)` → atualiza `user.avatar` no estado.

---

## 3. Tradução do Aplicativo

**Idiomas:** PT (base), EN, ES, ZH — os mesmos do leitor Hi-Qua. Título das obras **não** é traduzido (pedido do cliente). Textos legais (Termos/Privacidade) permanecem em PT (segurança jurídica).

**3a. Interface (frontend puro):**
- `i18n/translations.ts`: dicionários `pt/en/es/zh` com todas as strings de UI voltadas ao usuário (navegação, Auth, feeds, reader, player, conta, favoritos, onboarding, anúncios, busca). Admin permanece PT.
- `contexts/I18nContext.tsx`: provider com `lang` + `t(key)`; persiste em **`lorflux_language`** (a MESMA chave que o WebtoonReader já usa → trocar idioma da UI troca os balões dos quadrinhos junto). Idioma inicial: localStorage → `navigator.language` → pt.
- Seletor de idioma na aba Conta (PT/EN/ES/中文).
- `WebtoonReader` passa a ler/escrever o idioma via contexto (uma fonte de verdade).

**3b. Conteúdo do catálogo (backend + admin):**
- `models/Series.js`: `+ translations: { en: { genre, description }, es: {...}, zh: {...} }`.
- `models/Episode.js`: `+ translations: { en: { description }, es: {...}, zh: {...} }`.
- `services/translationService.js` (novo, backend CommonJS): traduz via `@google/genai` (`GEMINI_API_KEY` no env; modelo flash). Chamado **fire-and-forget** no create/update de série/episódio quando `description`/`genre` mudam; sem chave → no-op silencioso (campos vazios, UI cai no PT).
- Frontend: helpers `localizeSeries(series, lang)` / `localizeEpisode(ep, lang)` com fallback PT; aplicados nos feeds, modais e busca.
- `.env.example`: `+ GEMINI_API_KEY`.
- Obs.: `services/geminiService.ts` atual é código morto de frontend (usa `process.env.API_KEY` no browser) — será removido.

---

## 4. Fase 3 — Motor de Royalties e Anti-fraude

### Arquitetura proposta
- **`models/EngagementEvent.js`** — log **append-only com cadeia de hash** (imutabilidade auditável): `{ seq, type: 'view'|'read'|'ad_impression'|'ad_click', seriesId, episodeId, userId?, ipHash, uaHash, flagged, flagReason, prevHash, hash, createdAt }`. `hash = sha256(prevHash + seq + type + ids + createdAt)`. Endpoint admin de **verificação de integridade** que re-percorre a cadeia.
- **Instrumentação:** view de episódio (GET /episodes/:id), leitura de capítulo, impressão/clique de anúncio (endpoints existentes passam a gravar evento).
- **Anti-fraude (eventos `flagged` ficam FORA do cálculo, mas NO log):**
  1. Dedupe: 1 view válida por (usuário ou ipHash) × episódio × janela de 6h.
  2. Burst: >N eventos do mesmo ipHash em 1 min → flag.
  3. Anomalia: série com razão views/usuários-únicos acima de limiar → flag para revisão manual.
- **`Series.creator`** (novo campo, texto) — atribuição de obra a ilustrador, editável no admin.
- **Admin → aba "Royalties":** período (mês), tabela por criador/série (views válidas, leituras, impressões atribuídas, % do pool, valor), export CSV, botão de verificação de integridade.

### ⚠️ Três decisões em aberto (Fellipe/Vin) — bloqueiam SÓ a Fase 3
1. **Pool de receita:** valor manual informado por mês (recomendado — Vin controla) OU estimativa automática (CPM × impressões + % premium)?
2. **Chave de rateio:** views válidas simples OU ponderação (ex.: vídeo 1.0 / leitura de capítulo 0.5)?
3. **Criador:** campo texto livre na série (recomendado — simples) OU vincular ao modelo `Channel` existente?

---

## Estratégia de Testes (escritos ANTES do código)

| Arquivo | Cobre |
|---------|-------|
| `tests/backend/googleAuth.test.js` | 503 sem env, 400 sem credential, happy path (mock `google-auth-library`), vínculo de conta existente, conta desativada, e-mail não verificado |
| `tests/backend/avatar.test.js` | 401 sem auth, tipo de arquivo inválido, 503 sem storage, upload ok (mock storage) |
| `tests/backend/translations.test.js` | translations persistidas no create/update (mock do serviço), GET devolve campo, no-op sem API key |
| `tests/frontend/onboarding.test.tsx` | passos, pular grava flag, não reexibe com flag |
| `tests/frontend/i18n.test.tsx` | t() nos 4 idiomas, fallback PT, persistência em lorflux_language |
| `tests/frontend/components.test.tsx` | + botão Avaliar o app, + botão Google (aparece só com client_id) |
| Fase 3 (na sua vez) | cadeia de hash, dedupe, flags, cálculo de rateio, integridade |

## CI/CD (GitHub Actions)

- **`.github/workflows/ci.yml`** — em push/PR para `main`: `npm ci` → typecheck (`tsc --noEmit`) → testes frontend → testes backend (mongodb-memory-server com cache do binário) → `vite build`. Node 20.
- Para o typecheck ficar verde: remover componentes mortos (`ComicFeed`, `HiQuaFeed`, `HQCineHome`, `UserTab`, `geminiService.ts` — nenhum import no app) e corrigir tipos dos configs do vitest.
- **Deploy (opcional, desligado por padrão):** job `deploy` só roda com a variável de repositório `DEPLOY_ENABLED=true` + secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`; executa na VPS o fluxo atual (`git pull && npm ci && npm run build && pm2 restart lorflux-app`). Enquanto não configurado, deploy segue manual (fluxo de hoje).

## Riscos e Dependências Externas

| Risco/Dependência | Mitigação |
|---|---|
| `GOOGLE_CLIENT_ID` não configurado | Feature dormente; botão oculto; rota 503 |
| `GEMINI_API_KEY` não configurado | Tradução de conteúdo vira no-op; UI cai no PT |
| Tela de consentimento OAuth exige URL de privacidade | Rotas `/privacidade` e `/termos` na entrega 1 |
| Custo Gemini | Tradução só no save (não por leitura); textos curtos |
| Fase 3: regras comerciais | 3 perguntas explícitas antes de codar |
