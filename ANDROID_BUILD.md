# Lorflux — Android TWA (Trusted Web Activity)

Guia para gerar o AAB/APK e publicar na Google Play Store usando Bubblewrap, **a partir desta máquina Windows com PowerShell**.

## Estado atual do ambiente

Já está pronto nesta máquina (instalado em 2026-05-28):

- **JDK 17** (Temurin) em `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot` — `JAVA_HOME` persistido no escopo User.
- **Bubblewrap CLI** global via `npm install -g @bubblewrap/cli`.
- **Android SDK** (cmdline-tools moderno + platform-tools + build-tools;34.0.0 + platforms;android-34) em `C:\Users\felli\.bubblewrap\android_sdk` — `ANDROID_HOME` persistido. Licenças aceitas.
- **Config do Bubblewrap** em `C:\Users\felli\.bubblewrap\config.json` apontando para o JDK e SDK acima.
- **Keystore de release** em `C:\Users\felli\.android-keystores\lorflux-release.keystore` (alias `lorflux`, 10 000 dias). Senha guardada no gerenciador do Fellipe.
- **`public/.well-known/assetlinks.json`** já preenchido com o SHA-256 do keystore (`84:3C:6D:B5:...:76`).

Para validar o ambiente a qualquer momento:

```powershell
bubblewrap doctor
```

## Pré-requisitos para publicar

- Conta Google Play Developer (taxa única US$ 25).
- Site Lorflux em produção (`https://www.lorflux.com`) servindo `/.well-known/assetlinks.json` com o SHA-256 atualizado **antes** de submeter o AAB.

## 1. Verificar o Asset Links em produção

Antes de gerar o build, confirmar que o arquivo está acessível e correto:

```powershell
Invoke-WebRequest https://www.lorflux.com/.well-known/assetlinks.json | Select-Object -ExpandProperty Content
```

Deve conter o SHA-256:
`84:3C:6D:B5:F6:50:8E:B4:E3:4B:76:52:F1:C5:CB:9B:13:C8:D8:73:41:11:D1:51:A5:CA:A1:78:8D:2E:43:76`

Também dá pra validar via API do Google:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.lorflux.com&relation=delegate_permission/common.handle_all_urls
```

## 2. Gerar o projeto TWA com Bubblewrap

Numa pasta dedicada (fora do repo Lorflux, pra não misturar):

```powershell
$twa = "C:\Users\felli\lorflux-twa"
if (-not (Test-Path $twa)) { New-Item -ItemType Directory -Path $twa | Out-Null }
Set-Location $twa
bubblewrap init --manifest https://www.lorflux.com/manifest.json
```

O Bubblewrap vai perguntar:

| Prompt | Resposta |
|---|---|
| Domain | `www.lorflux.com` |
| Application ID (package name) | `com.lorflux.twa` |
| App name | `Lorflux - Cinematic Comics` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#000000` |
| Splash screen color | `#000000` |
| Keystore path | `C:\Users\felli\.android-keystores\lorflux-release.keystore` |
| Key alias | `lorflux` |
| Keystore password | *(do gerenciador de senhas)* |
| Key password | *(mesma senha)* |

Isso gera `twa-manifest.json` e a estrutura Android dentro de `lorflux-twa/`.

## 3. Build AAB

```powershell
Set-Location C:\Users\felli\lorflux-twa
bubblewrap build
```

Saída: `app-release-bundle.aab` na pasta do projeto. É esse arquivo que vai para a Play Console.

## 4. Testar no Android antes de publicar

```powershell
bubblewrap build --apk
adb install app-release-signed.apk
```

Conectar um Android via USB com depuração ativa. O app deve abrir em fullscreen (sem barra do Chrome). Se a barra aparecer, o `assetlinks.json` em produção ainda não está correto.

## 5. Publicar na Google Play Console

1. Acessar [Google Play Console](https://play.google.com/console).
2. Criar app → ficha (título, descrição, categoria — ver `PLAY_STORE.md`).
3. **Produção → Criar nova versão** → upload do `app-release-bundle.aab`.
4. Preencher classificação de conteúdo (IARC) — ver respostas pré-rascunhadas em `PLAY_STORE.md`.
5. Preencher **Segurança de Dados (Data Safety)** — respostas em `PLAY_STORE.md`.
6. Definir preço (Grátis) e países.
7. Enviar para revisão.

### Assets da ficha

| Asset | Tamanho | Onde |
|---|---|---|
| Ícone hi-res | 512×512 | `public/icons/icon-512.png` ✅ |
| Feature graphic | 1024×500 | gerar com `scripts/generateFeatureGraphic.js` |
| Screenshots phone (mín. 2) | 1080×1920 | capturar do app rodando local |

## Checklist final

- [ ] **Keystore com backup** em pelo menos 2 lugares (gerenciador de senhas + outro local seguro).
- [ ] **`BUNNY_TOKEN_KEY`** setado no `.env` de produção e **Token Authentication ligada** no painel da library Bunny (ver `memory/tech-debt-bunny-security.md`).
- [ ] **Allowed Referrers** (`lorflux.com`) configurado no Bunny contra hotlink.
- [ ] `assetlinks.json` acessível em `https://www.lorflux.com/.well-known/assetlinks.json` e validado via Digital Asset Links API.
- [ ] Páginas `https://www.lorflux.com/privacidade` e `/termos` acessíveis publicamente.
- [ ] Build AAB testado em Android real (fullscreen ok, login funciona, vídeo toca, ad aparece).
- [ ] Ficha da Play preenchida com base em `PLAY_STORE.md`.
- [ ] Revisão do Google aprovada.
