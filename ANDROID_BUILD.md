# Lorflux — Android TWA (Trusted Web Activity)

Guia para gerar o AAB/APK e publicar na Google Play Store usando Bubblewrap, **a partir da máquina Windows do Fellipe com PowerShell**.

> **Conferido em 27/10/2026.** Este guia foi escrito em 30/05/2026 e ficou desatualizado em três pontos que quebram o build: a chave, a impressão digital conferida e a faixa de publicação. O histórico da chave está em `docs/assinatura-do-app-e-chave-de-upload.md`, que é a página autoritativa sobre assinatura. Leia o bloco abaixo antes de rodar qualquer coisa.

## O que mudou desde 30/05/2026

1. **A chave de upload é outra.** A original (`84:3C:6D:B5:...`) ficou no computador que foi formatado. A redefinição foi pedida ao Google em 22/10 e a chave nova (`83:F3:E8:8C:...`) vale desde **24/10/2026 às 23:33**. O keystore novo **não está no Windows**: ele mora no servidor `fap233`, em `\\fap233\projects\lorfrux\chaves-twa\lorflux-upload-2026.jks`, alias `lorflux`.
2. **O `assetlinks.json` mudou junto** (27/10): declara a chave de assinatura do app e a chave de upload **nova**, e não declara mais a perdida. Conferir com `node scripts/verificarAssetLinks.js`, que olha o arquivo versionado, o que o site serve e o que o Google tem em cache.
3. **O AAB precisa de Play Billing ligado** e vai para a faixa de **teste interno**, não para produção. Sem um pacote enviado, o Play Console não deixa nem criar o produto de assinatura (conferido na página em 27/10).

**Antes de começar, confirmar que o ambiente sobreviveu à formatação.** O JDK, o Bubblewrap, o Android SDK e a pasta `%USERPROFILE%\lorflux-twa` (onde vive o `twa-manifest.json`) estavam todos naquela máquina. Uma linha responde:

```powershell
bubblewrap doctor; Test-Path "$env:USERPROFILE\lorflux-twa\twa-manifest.json"
```

Se o `doctor` reclamar ou o `Test-Path` devolver `False`, o caminho é a seção 2 (init do zero), não a 3.

## Estado do ambiente (instalado em 2026-05-28, reconfirmar depois da formatação)

- **JDK 17** (Temurin) em `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot` — `JAVA_HOME` no escopo User.
- **Bubblewrap CLI** global via `npm install -g @bubblewrap/cli`.
- **Android SDK** (cmdline-tools + platform-tools + build-tools;34.0.0 + platforms;android-34) em `%USERPROFILE%\.bubblewrap\android_sdk` — `ANDROID_HOME` persistido, licenças aceitas.
- **Config do Bubblewrap** em `%USERPROFILE%\.bubblewrap\config.json` apontando para o JDK e o SDK acima.
- **Keystore de upload**: ver o item 1 acima. O antigo `%USERPROFILE%\.android-keystores\lorflux-release.keystore` **não serve mais** — um AAB assinado com ele é recusado pelo Play desde 24/10.

## Pré-requisitos para publicar

- Conta Google Play Developer (taxa única US$ 25) — já paga, app publicado.
- Site em produção servindo `/.well-known/assetlinks.json` com as impressões digitais corretas **antes** de enviar o AAB.

## 1. Verificar o Asset Links em produção

Daqui, de qualquer máquina com rede:

```
node scripts/verificarAssetLinks.js
```

Ele falha com mensagem explicando o que falta. Do Windows, à mão:

```powershell
Invoke-WebRequest https://www.lorflux.com/.well-known/assetlinks.json | Select-Object -ExpandProperty Content
```

Tem de conter as **duas**:

| Impressão SHA-256 | O que é | Por que está lá |
|---|---|---|
| `40:B3:F3:82:...:74` | chave de **assinatura do app** (o Google guarda) | é a do app publicado, em qualquer faixa, inclusive teste interno. Tirar daqui quebra o App Link de quem já instalou |
| `83:F3:E8:8C:...:B8` | chave de **upload** em vigor | o `bubblewrap build --apk` assina com ela. Sem esta linha, o APK de teste abre com a barra de endereço do Chrome em cima e parece build quebrado |

A visão que o Chrome usa de verdade é o cache do Google, que leva até 1 hora para atualizar:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.lorflux.com&relation=delegate_permission/common.handle_all_urls
```

## 2. Gerar o projeto TWA com Bubblewrap

Só é necessário se o `twa-manifest.json` não existir mais. Numa pasta dedicada, fora do repo:

```powershell
$twa = "$env:USERPROFILE\lorflux-twa"
if (-not (Test-Path $twa)) { New-Item -ItemType Directory -Path $twa | Out-Null }
Set-Location $twa
bubblewrap init --manifest https://www.lorflux.com/manifest.json
```

Respostas:

| Prompt | Resposta |
|---|---|
| Domain | `www.lorflux.com` |
| URL path | `/` |
| Application ID (package name) | `com.lorflux.twa` |
| App name | `Lorflux - Cinematic Comics` |
| Launcher name | `Lorflux` |
| App version code | o próximo número livre (ver seção 3) |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar / splash color | `#000000` |
| Include shortcuts | `N` |
| **Play Billing** | **`Y`** — é o motivo deste build existir |
| Location delegation / First run flag / ARCore / Notifications / AppsFlyer | `N` |
| Key store location | `\\fap233\projects\lorfrux\chaves-twa\lorflux-upload-2026.jks` |
| Key alias | `lorflux` |
| Keystore password | *(do gerenciador de senhas; também em `senha.txt` na mesma pasta do servidor)* |
| Key password | *(a mesma)* |

Responder `N` ao Play Billing é o erro silencioso desta etapa: o build sai, instala, abre, e a compra dentro do app simplesmente não aparece, porque `getDigitalGoodsService` devolve nada (`services/playBilling.ts:23-30`, que nesse caso cai no checkout do navegador de propósito).

Se o `twa-manifest.json` **já existir** sem Play Billing, não precisa refazer o init: acrescentar a chave e rodar `bubblewrap update`.

```json
"features": { "playBilling": { "enabled": true } }
```

## 3. Conferir o versionCode antes do build

O Play recusa AAB com `versionCode` já usado, e a conta tem versões enviadas desde maio. O número em uso aparece em **Play Console > Versões do app**. No `twa-manifest.json`:

```powershell
(Get-Content "$env:USERPROFILE\lorflux-twa\twa-manifest.json" -Raw | ConvertFrom-Json).appVersionCode
```

`scripts\build-twa.ps1 -BumpVersion` incrementa de um.

## 4. Build do AAB

```powershell
Set-Location "$env:USERPROFILE\lorflux-twa"
bubblewrap build
```

Saída: `app-release-bundle.aab` (vai para a Play) e `app-release-signed.apk` (o teste em aparelho).

## 5. Testar no Android antes de publicar

```powershell
adb install "$env:USERPROFILE\lorflux-twa\app-release-signed.apk"
```

Android por USB com depuração ativa. O app deve abrir em tela cheia, **sem a barra do Chrome**. Se a barra aparecer, o `assetlinks.json` em produção não está declarando a chave de upload nova — voltar à seção 1.

Atenção ao que este APK **não** prova: ele é assinado localmente e instalado à mão, então a Play não reconhece a compra. A tela de assinatura vai cair no checkout do navegador. Play Billing só funciona num app **instalado pela Play**, por uma conta na lista de testadores da faixa de teste interno. É por isso que a prova de verdade é a compra de teste da seção 6.

## 6. Publicar e criar a assinatura (a ordem importa)

A ordem **não** é a intuitiva. Conferido na própria página em 27/10/2026: `Monetizar > Assinaturas` abre, mas o único botão é *"Faça upload de um novo APK"*.

1. **Teste interno > Criar nova versão** → upload do `app-release-bundle.aab`.
2. Adicionar os e-mails de testadores na faixa e aceitar o convite no aparelho.
3. **Monetizar > Assinaturas > Criar assinatura**, id exatamente `premium_mensal` (`services/playBilling.ts:20-21`, ou `VITE_PLAY_PRODUCT_ID` no build). Preço R$ 10,90.
4. No servidor: `ANDROID_PACKAGE_NAME` (`services/playBillingService.js:53`), `PLAY_RTDN_SECRET` (`routes/mobilePayment.js:270`), tópico Pub/Sub do RTDN apontando para `POST /api/mobile/notificacoes` (`routes/mobilePayment.js:280`), e um restart. A credencial da Play entra por `GOOGLE_APPLICATION_CREDENTIALS`, que o nosso código nunca lê: `services/playBillingService.js:47` usa `new google.auth.GoogleAuth({ scopes })`, e é a biblioteca do Google que procura a variável. Por isso os três formatos de credencial servem sem mudar uma linha. Ela é para **verificar** a compra, não para criar o produto.
5. **Uma compra de teste real** pelo app instalado da faixa de teste. É ela que valida `services/playBillingService.js`, `services/playBilling.ts` e `routes/mobilePayment.js`.
6. Só depois, **Produção > Criar nova versão**, promovendo a mesma versão.

O mesmo AAB carrega a barra de status imersiva prometida na Fase 5, que dependia do keystore.

### Assets da ficha

| Asset | Tamanho | Onde |
|---|---|---|
| Ícone hi-res | 512×512 | `public/icons/icon-512.png` |
| Feature graphic | 1024×500 | `play-store-assets/feature-graphic.png` |
| Screenshots phone (mín. 2) | 1080×1920 | `play-store-assets/screenshots/` |

## Checklist final

- [ ] **Keystore de upload com backup** em pelo menos 2 lugares. Perder o `.jks` **e** a senha custa outro pedido de dias ao Google — foi o que aconteceu em outubro.
- [ ] `node scripts/verificarAssetLinks.js` passando, e o site já com o deploy do arquivo.
- [ ] `twa-manifest.json` com `features.playBilling.enabled = true`.
- [ ] `versionCode` maior que o último enviado.
- [ ] APK local testado em Android real (tela cheia, login, vídeo, anúncio).
- [ ] AAB na faixa de teste interno, assinatura `premium_mensal` criada, compra de teste concluída.
- [ ] **`BUNNY_TOKEN_KEY`** no `.env` de produção e Token Authentication ligada no painel da library Bunny.
- [ ] **Allowed Referrers** (`lorflux.com`) configurado no Bunny contra hotlink.
- [ ] Páginas `/privacidade` e `/termos` acessíveis publicamente.
- [ ] Ficha da Play conferida com base em `PLAY_STORE.md`.
