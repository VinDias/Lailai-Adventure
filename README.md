<div align="center">

# Loreflux - Cinematic Comics

**Plataforma de cinematic storytelling com streaming vertical e webtoons.**

</div>

## Sobre

Loreflux é uma plataforma de entretenimento digital focada em cinema vertical (9:16), webtoons e conteúdo interativo. Combina streaming de vídeo com quadrinhos digitais em uma experiência mobile-first.

### Funcionalidades
- **HQCine** — Cinematic comics com narração e animação
- **VCine** — Vídeos verticais de cinema experimental
- **Hi-Qua** — Webtoons de alta qualidade com leitura vertical
- **Assinatura Premium** — Acesso a conteúdo exclusivo via Stripe
- **Painel Admin** — Upload de conteúdo e gerenciamento

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Banco de Dados | MongoDB (Mongoose) |
| Pagamentos | Stripe |
| Filas | BullMQ + Redis |
| Streaming | Bunny.net Stream |

## Instalação

```bash
npm install
```

### Desenvolvimento

```bash
# Frontend
npm run dev

# Backend
npm run server

# Worker de vídeo
npm run worker
```

### Variáveis de ambiente
Copie `.env.example` para `.env` e preencha as variáveis necessárias.

### Seed do admin
```bash
npm run seed:admin
```

## Build

```bash
npm run build
```
