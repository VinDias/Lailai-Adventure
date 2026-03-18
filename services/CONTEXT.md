# services/

## Responsabilidade

Lógica de negócio e integrações com APIs e serviços externos. Separa as regras de negócio das rotas Express e dos componentes React.

---

## Arquivos

### Frontend (TypeScript)

| Arquivo | Propósito |
|---------|-----------|
| `api.ts` | Cliente HTTP centralizado do frontend — wrapper sobre `fetch` com gerenciamento de JWT, detecção de offline, e métodos para todas as chamadas à API (auth, séries, episódios, votação, admin, checkout) |
| `geminiService.ts` | Integração com Google Gemini AI — recomendações de conteúdo baseadas em preferências do usuário e geração de resumos de episódios para marketing |
| `subscription.service.ts` | Helpers de gerenciamento de status de assinatura premium no frontend |
| `media.service.ts` | Extração de metadados de mídia e validação de formatos de vídeo/imagem |
| `mockData.ts` | Dados fictícios para desenvolvimento local — canais, episódios, anúncios, quadrinhos e aulas com interfaces tipadas |

### Backend (JavaScript)

| Arquivo | Propósito |
|---------|-----------|
| `bunnyService.js` | Wrapper da API Bunny.net — orquestra uploads de vídeo para o Bunny Stream e imagens de painéis para o Bunny Storage |
| `transcodeService.js` | Pipeline de transcodificação de vídeo com FFmpeg para geração de HLS |
| `stripeService.js` | Métodos de integração com a API Stripe — criação de clientes, assinaturas e sessões de checkout |
| `emailService.js` | Serviço de e-mail transacional com nodemailer — `sendEmail()` genérico + templates prontos: `sendWelcome()`, `sendPremiumConfirmation()`, `sendPasswordReset()`. Lazy transporter (só conecta ao SMTP na primeira chamada). Ver `EMAIL_SETUP.md` para configuração DNS. |
| `donationService.js` | Processamento de doações |
| `mobilePaymentService.js` | Integração com processador de pagamento alternativo para mobile |

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
