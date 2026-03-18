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
- Campos: `title`, `genre`, `description`, `coverUrl`
- Tipo: `hqcine` | `vcine` | `hiqua`
- `isPremium` (boolean) — se a série é exclusiva para assinantes
- `orderIndex` — ordenação manual na listagem
- `isPublished` — controla visibilidade pública

### `Episode.js`
Episódios de uma série.
- Referência para `Series`
- `episodeNumber`, `title`, `description`, `duration`
- Vídeo: `videoUrl`, `bunnyVideoId`, `thumbnailUrl`
- Webtoon: array de URLs de painéis (`panelUrls`)
- `isPremium`, `isPublished`
- `transcodingStatus` — rastreia o status do processamento no Bunny Stream

### `Ad.js`
Campanhas publicitárias.
- `advertiserId`, `videoUrl`
- `duration`, `maxViews`
- `format`, `resolution`
- `isActive` — controla se o anúncio está em exibição

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
