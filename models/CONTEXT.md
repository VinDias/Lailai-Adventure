# models/

## Responsabilidade

Schemas Mongoose que definem a estrutura dos dados no MongoDB. Cada arquivo corresponde a uma coleção do banco de dados.

---

## Schemas

### `User.js`
Usuários da plataforma.
- Campos: `email`, `passwordHash`, `name`, `avatar`
- OAuth: suporte a login via Google e Microsoft
- Roles: `user` | `admin` | `superadmin`
- Premium: `isPremium` (boolean), `premiumExpiresAt` (Date)
- Stripe: `stripeCustomerId`, `stripeSubscriptionId`
- Lista de canais seguidos

### `Series.js`
Séries de conteúdo (container de episódios).
- Campos: `title`, `genre`, `description`, `cover_image`
- Tipo: `hqcine` | `vcine` | `hiqua`
- `isPremium` (boolean) — se a série é exclusiva para assinantes
- `order_index` — ordenação manual na listagem
- `isPublished` — controla visibilidade pública (default `false`; catálogo exige `true` estrito)
- `translations` — `{ en|es|zh: { genre, description } }`, preenchido automaticamente pelo `translationService` no save (título NÃO é traduzido — decisão do cliente)
- `channelId` (Fase 3) — ref ao `Channel` do ilustrador; agrupa a obra no relatório de royalties

### `Episode.js`
Episódios de uma série.
- Referência para `Series`
- `episode_number`, `title`, `description`, `duration`
- Vídeo: `video_url`, `bunnyVideoId`, `thumbnail`
- Webtoon: array de objetos `panels` (`image_url`, `order`, `translationLayers[]`)
- Áudio: `audioTrack1Url`..`audioTrack4Url` + labels — consumidos pelo `VerticalPlayer`
- `isPremium`, `status` (`draft` | `processing` | `published`)
- `views`, `order_index`, `webtoonLanguageLabels`
- `translations` — `{ en|es|zh: { description } }`, automático via `translationService`

### `Ad.js`
Campanhas publicitárias próprias (interstitial + banner de feed).
- `title`, `image_url` (obrigatória; capa/fallback), `video_url` (opcional — interstitial toca vídeo), `link_url`, `advertiser`
- `isActive` + janela de veiculação `startsAt`/`endsAt` (endsAt inclusivo até o fim do dia)
- Métricas: `impressions`, `clicks` (registradas pelo AdComponent/Ads via `/api/admin/ads/:id/impression|click`)

### `Favorite.js`
Lista "Meus Favoritos" por conta — índice único composto (`userId`, `seriesId`).

### `SeriesVote.js`
Curtida única por obra — índice único composto (`userId`, `seriesId`), `type: like|dislike` (UI só usa like).

### `EngagementEvent.js` (Fase 3)
Log **append-only com cadeia de hash** (sha256 encadeado por `seq`/`prevHash`) — telemetria auditável de `view`/`read`/`ad_impression`/`ad_click`, base do Motor de Royalties.
- `seq` único via counter atômico (`Counter.js`); append serializado em processo (app roda em fork único no PM2)
- `ipHash`/`uaHash` pseudonimizados com salt (LGPD) — nunca IP puro
- Anti-fraude no log: `flagged`/`flagReason` (`dedupe` 6h, `burst` 60s) — evento flagged fica NO log e FORA do cálculo
- NUNCA editar/deletar documentos desta coleção — a verificação de integridade re-percorre a cadeia

### `RoyaltyPeriod.js` (Fase 3)
Fechamento mensal de royalties: `period` (YYYY-MM, único), `poolSuggested` (CPM + assinaturas), `poolFinal` (confirmado pelo admin), `breakdown[{channelId, channelName, points, share, amount}]`, `status: draft|closed`.

### `Counter.js` (Fase 3)
Sequências atômicas (`findOneAndUpdate` + `$inc`) — usado pelo `seq` do EngagementEvent.

### `Vote.js`
Engajamento dos usuários com conteúdo.
- Referências para `User` e episódio/vídeo
- `voteType`: `like` | `dislike`
- Timestamp da ação

### `Channel.js`
Canais de criadores de conteúdo.
- `name`, `description`, `avatarUrl`, `bannerUrl`
- `followerCount`
- `isMonetized` — indica se o canal tem monetização ativa

### `RefreshToken.js`
Gerenciamento de refresh tokens JWT.
- Referência para `User`
- `token` (string única)
- `expiresAt` — data de expiração para invalidação

### `AdminLog.js`
Auditoria de ações administrativas.
- Registra qual admin fez qual ação e quando
- Usado por `adminManagement.js`

---

## Observações

- Todos os models usam **Mongoose** com **CommonJS** (`module.exports`)
- O banco de dados é configurado via `MONGO_URI` no `.env`
- Nenhuma migração formal — o Mongoose aplica o schema automaticamente
