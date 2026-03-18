# Plano de Implementação — Módulo de Produtividade Admin
**Data:** 2026-03-18
**Status:** ✅ Implementado e entregue

---

## Escopo

Três funcionalidades novas no painel administrativo da plataforma Lorflux:

1. [Batch Upload de Painéis](#1-batch-upload-de-painéis)
2. [Interface de upload dos 3 canais de áudio](#2-interface-de-upload-dos-3-canais-de-áudio)
3. [Configuração de e-mail profissional](#3-configuração-de-e-mail-profissional)

---

## 1. Batch Upload de Painéis

### Objetivo
Permitir upload simultâneo de múltiplas imagens (até ~138 painéis) por capítulo de Hi-Qua, substituindo o fluxo atual de upload imagem a imagem.

### Estado Atual
- O `AdminDashboard.tsx` já tem a tela de painéis com upload individual via `handlePanelImageUpload`
- O backend já possui `POST /api/bunny/upload-image` que envia uma imagem para o Bunny Storage
- `api.ts` já expõe `uploadImageToBunny(file)` e `addPanels(episodeId, panels[])`

### O que Falta

**Backend (`routes/bunnyWebhook.js`)**
- Novo endpoint `POST /api/bunny/upload-image-batch` que recebe múltiplos arquivos (`multer.array('images', 138)`)
- Processa uploads em paralelo (Promise.allSettled) e retorna array de resultados `{ success, url, filename, error }`
- Falhas individuais não abortam o lote — retorna relatório de sucesso/falha por arquivo

**Frontend (`services/api.ts`)**
- Novo método `uploadImagesBatchToBunny(files: File[]): Promise<BatchUploadResult[]>`
- Faz POST multipart com todos os arquivos de uma vez

**Frontend (`components/Admin/AdminDashboard.tsx`)**
- Substituir o `<input type="file">` de painel único por `multiple` com drag-and-drop
- Mostrar fila de upload com progresso visual por arquivo (lista com status: pendente → enviando → ok/erro)
- Ao concluir, chamar `api.addPanels()` com todos os URLs retornados, respeitando a ordem de seleção
- Botão "Cancelar" que aborta uploads pendentes

### Fluxo
```
Admin seleciona N imagens → Preview em grade (miniaturas ordenadas)
→ Clica "Enviar tudo"
→ POST /api/bunny/upload-image-batch (multipart, até 138 arquivos)
→ Backend: upload paralelo → Bunny Storage
→ Resposta: [{url, order}, ...]
→ POST /api/content/episodes/:id/panels (todos os painéis de uma vez)
→ UI atualiza galeria
```

### Arquivos a Modificar
| Arquivo | Mudança |
|---------|---------|
| `routes/bunnyWebhook.js` | Adicionar endpoint `/upload-image-batch` |
| `services/api.ts` | Adicionar `uploadImagesBatchToBunny()` |
| `components/Admin/AdminDashboard.tsx` | Substituir upload de painel para suportar múltiplos arquivos + UI de progresso |

---

## 2. Interface de Upload dos 3 Canais de Áudio

### Objetivo
Permitir que o admin faça upload dos 3 canais de áudio de um episódio diretamente pelo painel, associando-os ao episódio correto.

### Estado Atual
- `VerticalPlayer.tsx` já consome `video.audioTrack1Url` e `video.audioTrack2Url` (áudio original é o próprio vídeo)
- `Episode.js` (model) **não tem campos de áudio** — precisam ser adicionados
- Não existe endpoint nem interface de upload de áudio

### Mapeamento dos 3 Canais
| Canal | Nome no Player | Campo no DB |
|-------|---------------|-------------|
| Original | `'original'` | (embutido no vídeo — sem campo extra) |
| Dublagem / Voice Comic | `'audio1'` → `audioTrack1Url` | `audioTrack1Url` |
| Trilha Sonora / Alternativo | `'audio2'` → `audioTrack2Url` | `audioTrack2Url` |

> O canal "original" é o áudio do próprio vídeo — não precisa de upload separado.

### O que Falta

**Model (`models/Episode.js`)**
- Adicionar campos `audioTrack1Url: { type: String }` e `audioTrack2Url: { type: String }`

**Backend (`routes/bunnyWebhook.js`)**
- Novo endpoint `POST /api/bunny/upload-audio` que:
  - Recebe um arquivo de áudio via multer (MP3, AAC, M4A, OGG — limite 200MB)
  - Envia para Bunny Storage (pasta `lorflux/audio/`)
  - Retorna a URL pública do arquivo

**Backend (`routes/admin.js` ou `routes/content.js`)**
- Novo endpoint `PATCH /api/admin/episodes/:id/audio` que:
  - Recebe `{ audioTrack1Url?, audioTrack2Url? }`
  - Salva nos campos do episódio

**Frontend (`services/api.ts`)**
- `uploadAudioToBunny(file: File): Promise<{ url: string }>`
- `updateEpisodeAudio(episodeId: string, payload: { audioTrack1Url?: string, audioTrack2Url?: string })`

**Frontend (`components/Admin/AdminDashboard.tsx`)**
- Na tela de episódios (para séries de tipo `hqcine` / `vcine`), adicionar botão de áudio ao lado do botão de vídeo
- Modal/painel de gerenciamento de áudio com:
  - Canal 1 (Dublagem): campo de upload + preview da URL atual + botão de remover
  - Canal 2 (Trilha): campo de upload + preview da URL atual + botão de remover
  - Indicador visual de quais canais já estão configurados (badge verde/vermelho)

### Fluxo
```
Admin clica no ícone de áudio do episódio
→ Modal abre com status dos 2 canais
→ Admin faz upload do arquivo de áudio
→ POST /api/bunny/upload-audio → Bunny Storage → retorna URL
→ PATCH /api/admin/episodes/:id/audio { audioTrack1Url: url }
→ Modal atualiza badge do canal para "configurado"
```

### Arquivos a Modificar
| Arquivo | Mudança |
|---------|---------|
| `models/Episode.js` | Adicionar `audioTrack1Url`, `audioTrack2Url` |
| `routes/bunnyWebhook.js` | Adicionar endpoint `/upload-audio` |
| `routes/admin.js` | Adicionar `PATCH /episodes/:id/audio` |
| `services/api.ts` | Adicionar métodos de áudio |
| `components/Admin/AdminDashboard.tsx` | Botão + modal de gerenciamento de áudio na tela de episódios |

---

## 3. Configuração de E-mail Profissional

### Objetivo
Garantir entregabilidade do e-mail institucional `@lorflux.com` (ou domínio configurado), evitando classificação como spam. Esta é uma tarefa de infraestrutura DNS, não de código da aplicação.

### Provedores Envolvidos
- **Hostgator** — hospedagem do e-mail / servidor SMTP
- **Cloudflare** — DNS autoritativo do domínio

### Passos de Configuração

#### 3.1 Registros DNS no Cloudflare

**Registro MX** (roteamento de e-mail para o Hostgator)
```
Tipo: MX
Nome: @  (domínio raiz, ex: lorflux.com)
Valor: mail.hostgator.com  (ou o hostname fornecido pela Hostgator)
Prioridade: 10
Proxy: DNS only (nuvem cinza — OBRIGATÓRIO para MX)
```

**Registro SPF** (autoriza servidores a enviar em nome do domínio)
```
Tipo: TXT
Nome: @
Valor: "v=spf1 include:hostgator.com ~all"
```
> Ajustar o `include:` conforme o servidor exato da Hostgator (verificar no painel cPanel → Email Deliverability)

**Registro DKIM** (assinatura criptográfica dos e-mails)
```
Tipo: TXT
Nome: default._domainkey  (ou o seletor fornecido pela Hostgator)
Valor: "v=DKIM1; k=rsa; p=<chave-pública>"
```
> A chave pública é gerada no cPanel da Hostgator → Email Deliverability → DKIM

**Registro DMARC** (política de tratamento de falhas SPF/DKIM — recomendado)
```
Tipo: TXT
Nome: _dmarc
Valor: "v=DMARC1; p=none; rua=mailto:dmarc@lorflux.com"
```
> Começar com `p=none` (somente monitoramento) antes de endurecer para `p=quarantine` ou `p=reject`

#### 3.2 Configuração no Código (nodemailer)

O backend usa (ou deverá usar) `nodemailer` para envio transacional. As variáveis de ambiente a configurar:

```env
SMTP_HOST=mail.hostgator.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@lorflux.com
SMTP_PASS=<senha-do-e-mail>
FROM_EMAIL=noreply@lorflux.com
FROM_NAME=Lorflux
```

**Arquivo a criar/atualizar:** `services/emailService.js`

```js
// services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to, subject, html
  });
}

module.exports = { sendEmail };
```

#### 3.3 Checklist de Verificação

Após configurar os registros DNS (propagação pode levar até 24h):

- [ ] `dig MX lorflux.com` retorna o hostname da Hostgator
- [ ] `dig TXT lorflux.com` contém o registro SPF
- [ ] `dig TXT default._domainkey.lorflux.com` retorna a chave DKIM
- [ ] Enviar e-mail de teste e verificar headers: `Authentication-Results` deve mostrar `spf=pass` e `dkim=pass`
- [ ] Ferramenta de validação: https://mxtoolbox.com/emailhealth/

### Arquivos a Modificar / Criar
| Arquivo | Mudança |
|---------|---------|
| `services/emailService.js` | Criar serviço de e-mail com nodemailer |
| `.env.example` | Adicionar variáveis `SMTP_*` |
| DNS Cloudflare | Configurar MX, SPF, DKIM, DMARC (fora do código) |

---

## Ordem de Implementação Sugerida

```
Sprint 1 (backend-first):
  1. Adicionar audioTrack1Url / audioTrack2Url no model Episode
  2. Endpoint /upload-image-batch (bunnyWebhook.js)
  3. Endpoint /upload-audio (bunnyWebhook.js)
  4. Endpoint PATCH /episodes/:id/audio (admin.js)
  5. Criar emailService.js + atualizar .env.example

Sprint 2 (frontend):
  6. Atualizar api.ts com novos métodos
  7. UI de batch upload de painéis no AdminDashboard
  8. UI de gerenciamento de canais de áudio no AdminDashboard

Sprint 3 (infraestrutura):
  9. Configurar registros DNS no Cloudflare
  10. Verificar entregabilidade com mxtoolbox
```

---

## Dependências Novas

| Pacote | Finalidade | Já instalado? |
|--------|-----------|---------------|
| `nodemailer` | Envio de e-mail transacional | A verificar |
| `multer` | Upload de arquivos | ✅ já instalado |
| `axios` | Upload de vídeo streaming | ✅ já instalado |

```bash
# Verificar / instalar nodemailer se necessário:
npm list nodemailer || npm install nodemailer
```
