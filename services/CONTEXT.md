# services/

## Responsabilidade

Lógica de negócio e integrações com APIs e serviços externos. Separa as regras de negócio das rotas Express e dos componentes React.

---

## Arquivos

### Frontend (TypeScript)

| Arquivo | Propósito |
|---------|-----------|
| `api.ts` | Cliente HTTP centralizado do frontend — wrapper sobre `fetch` com gerenciamento de JWT, detecção de offline, e métodos para todas as chamadas à API (auth — incluindo `googleLogin` —, séries, episódios, votação, favoritos, avatar, métricas de anúncio, admin, checkout, progresso de leitura — `saveProgress`/`getContinueList`/`getProgressForEpisode`/`claimProgress`) |
| `subscription.service.ts` | Helpers de gerenciamento de status de assinatura premium no frontend |
| `media.service.ts` | Extração de metadados de mídia e validação de formatos de vídeo/imagem |
| `mockData.ts` | Dados fictícios para desenvolvimento local — canais, episódios, anúncios, quadrinhos e aulas com interfaces tipadas |

> `geminiService.ts` foi removido em jul/2026 (código morto: usava `process.env.API_KEY` no browser). A integração Gemini agora é backend, via `translationService.js`.

### Backend (JavaScript)

| Arquivo | Propósito |
|---------|-----------|
| `bunnyService.js` | Wrapper da API Bunny.net — orquestra uploads de vídeo para o Bunny Stream e imagens de painéis para o Bunny Storage |
| `transcodeService.js` | Pipeline de transcodificação de vídeo com FFmpeg para geração de HLS |
| `stripeService.js` | Métodos de integração com a API Stripe — criação de clientes, assinaturas e sessões de checkout |
| `emailService.js` | Serviço de e-mail transacional com nodemailer — `sendEmail()` genérico + templates prontos: `sendWelcome()`, `sendPremiumConfirmation()`, `sendPasswordReset()`. Lazy transporter (só conecta ao SMTP na primeira chamada). Ver `EMAIL_SETUP.md` para configuração DNS. |
| `donationService.js` | Processamento de doações |
| `mobilePaymentService.js` | Integração com processador de pagamento alternativo para mobile |
| `translationService.js` | Tradução automática de conteúdo do catálogo (genre/description de Series, description de Episode) para EN/ES/ZH via `@google/genai` (`GEMINI_API_KEY`). Fire-and-forget no create/update; sem chave → no-op silencioso (UI cai no PT). Título NUNCA é traduzido. |
| `engagementLogger.js` | Fase 3 — grava `EngagementEvent` com cadeia de hash e anti-fraude (dedupe 6h, burst 60s). Append serializado por fila de promessas em processo (requer app em instância única no PM2). Chamado fire-and-forget pelas rotas de conteúdo/anúncio; falha de log NUNCA afeta a resposta. |
| `progressService.js` | Fase 4 — regras de progresso de leitura/reprodução e do carrossel "Continuar", isoladas do Express (`routes/progress.js`) para testar direto. `saveProgress` (upsert com tratamento de corrida E11000), `getProgressForEpisode` (linha crua de 1 episódio, sem as regras do carrossel), `buildContinueList` (poda de 90 dias, 1 linha por obra, VCine 10-90%, remove obra concluída/despublicada, teto de 20 — opcionalmente filtrado por `contentType`), `claimAnonymousProgress` (migra visitante→conta no login/cadastro, funde pelo MAIOR percentual, idempotente) |
| `notificationService.js` | Fase 4, Bloco 2 — push de "capítulo novo" (Web Push/VAPID) para quem favoritou a série, disparado fire-and-forget pelos 6 pontos que tornam um episódio consumível (criação já publicada, edição para publicado, republicação da série, anexo de painéis, webhook do Bunny Status 4 e sincronização manual do status Bunny). `notifyEpisodePublished(episodeId)` — claim atômico via `findOneAndUpdate({_id, notificationSentAt: null}, {$set: {notificationSentAt: now}})`: garante envio único mesmo com 2 caminhos concorrentes; desfaz o claim (`notificationSentAt` volta a `null`) se a série não estiver publicada ou o episódio ainda não tiver conteúdo consumível (nem `panels` nem `video_url`), para um caminho de publicação futuro poder notificar de verdade; envia em lotes de 10 (`Promise.allSettled`, melhor esforço — falha de uma subscription não impede as demais); poda subscriptions mortas (status 404/410) do banco. `getVapidPublicKey()` — expõe a chave pública VAPID já configurada (config lazy via `ensureVapid()`: produção sem chaves desativa o envio com log de erro; dev sem chaves gera par efêmero). `__setTransportForTests(transport)` — mesmo padrão de `utils/bunnyStorage.js`: injeta transporte, só em `NODE_ENV=test` |
| `superReaderService.js` | Fase 4, Bloco 3 — apoio direto ao autor de uma obra (80% autor / 20% plataforma). `lerMinimoCents()` — lê `Setting` chave `superReaderMinCents` (centavos); ausente ou inválido (não-inteiro ou ≤ 0) → default **500**. `criarSessaoDeApoio({userId, seriesId, amountCents, currency})` — valida `amountCents` inteiro ≥ mínimo, `currency` somente `brl` (decisão da revisão final — o relatório de repasse agrega por canal sem separar moeda; multimoeda é dívida), série existe/`isPublished`/com `channelId` (erros lançam `Error` com `.status`, padrão `progressService`); cria a sessão Stripe `mode: 'payment'` com `metadata: {tipo: 'super_reader', userId, seriesId, channelId}`, `success_url`/`cancel_url` apontando para `FRONTEND_URL/?superreader=success\|cancelled`; devolve `{ url }`. `registrarContribuicao(session)` — chamado pelo webhook (`routes/payment.js`) em `checkout.session.completed` com `metadata.tipo === 'super_reader'`; o valor gravado (`amountCents`) vem SEMPRE de `session.amount_total` (nunca do metadata — metadata ecoa o pedido, `amount_total` é o que foi pago); calcula e CONGELA `authorShareCents = Math.round(amountCents * 0.8)` e `platformShareCents = amountCents - authorShareCents`; grava via `findOneAndUpdate` com `$setOnInsert` + `upsert: true` por `stripeSessionId` (idempotente contra retry do Stripe); corrida real de dois webhooks quase simultâneos pode gerar `E11000` no perdedor — o `catch` rebusca e devolve o doc já gravado pelo vencedor, sem lançar. Stripe client é **lazy** (`getStripe()`, `require('stripe')` só na primeira chamada real) — sem `STRIPE_SECRET_KEY` configurada, lança `Error` simples (sem `.status`) ao tentar criar a sessão; permite o test seam (`__setStripeForTests`, só em `NODE_ENV=test`, mesmo padrão de `ensureVapid`) funcionar sem a chave |

---

## Fluxo de Upload de Vídeo

```
AdminDashboard
    → bunnyService.js (upload para Bunny Stream)
    → Bunny envia webhook para routes/bunnyWebhook.js
    → Episode.transcodingStatus atualizado no MongoDB
    → VerticalPlayer carrega via HLS.js do Bunny CDN
```

## Fluxo de Pagamento Premium

```
Premium.tsx
    → api.ts (POST /payment/checkout)
    → stripeService.js (cria Checkout Session)
    → Usuário redireciona para Stripe
    → Stripe envia webhook para routes/payment.js
    → User.isPremium = true, premiumExpiresAt atualizado
    → emailService.js (sendPremiumConfirmation) — e-mail de confirmação
```

## Fluxo de Upload de Áudio

```
AdminDashboard (modal de canais de áudio)
    → api.ts uploadAudioToBunny()
    → POST /api/bunny/upload-audio → Bunny Storage (lorflux/audio/)
    → api.ts updateEpisodeAudio()
    → PATCH /api/admin/management/episodes/:id/audio → Episode.audioTrack1Url / audioTrack2Url no MongoDB
    → VerticalPlayer carrega os canais via <audio> tags (audioTrack1Url / audioTrack2Url)
```
