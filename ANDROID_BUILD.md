# Lorflux — Android TWA (Trusted Web Activity)

Guia para gerar o APK/AAB e publicar na Google Play Store usando Bubblewrap.

## Pre-requisitos

- Node.js 18+
- Java JDK 11+ (`java -version`)
- Android SDK (ou Android Studio instalado)
- Conta Google Play Developer ($25 taxa unica)

## 1. Instalar Bubblewrap

```bash
npm install -g bubblewrap
```

## 2. Gerar Keystore

```bash
keytool -genkeypair \
  -alias lorflux \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore lorflux-release.keystore \
  -storepass SUA_SENHA_AQUI \
  -dname "CN=Lorflux, O=Lorflux, L=São Paulo, ST=SP, C=BR"
```

Guardar `lorflux-release.keystore` em local seguro. **NUNCA commitar no git.**

## 3. Obter SHA-256 do Keystore

```bash
keytool -list -v -keystore lorflux-release.keystore -alias lorflux | grep SHA256
```

Copiar o fingerprint (ex: `AA:BB:CC:...`) e colar em:
- `public/.well-known/assetlinks.json` — substituir `__SHA256_FINGERPRINT_HERE__`
- Fazer deploy do site com o assetlinks atualizado **antes** de submeter à Play Store

## 4. Inicializar projeto TWA com Bubblewrap

```bash
mkdir lorflux-twa && cd lorflux-twa

bubblewrap init --manifest https://www.lorflux.com/manifest.json
```

O Bubblewrap vai pedir:
- **Domain:** `www.lorflux.com`
- **Package name:** `com.lorflux.twa`
- **App name:** `Lorflux - Cinematic Comics`
- **Keystore path:** caminho para `lorflux-release.keystore`
- **Key alias:** `lorflux`

## 5. Build AAB (Android App Bundle)

```bash
bubblewrap build
```

Gera `app-release-bundle.aab` na pasta do projeto.

## 6. Testar localmente (APK)

```bash
bubblewrap build --apk
adb install app-release-signed.apk
```

## 7. Verificar Asset Links

Antes de submeter, confirmar que o arquivo está acessivel:

```
https://www.lorflux.com/.well-known/assetlinks.json
```

Deve retornar JSON com o SHA-256 correto. Testar com:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.lorflux.com&relation=delegate_permission/common.handle_all_urls
```

## 8. Publicar na Google Play

1. Acessar [Google Play Console](https://play.google.com/console)
2. Criar novo app → preencher ficha (titulo, descricao, screenshots)
3. Upload do AAB em **Producao > Criar nova versao**
4. Preencher classificacao de conteudo (IARC)
5. Definir preco (Gratis)
6. Enviar para revisao

### Screenshots necessarias
- 2+ screenshots phone (1080x1920)
- 1 feature graphic (1024x500)
- Icone hi-res (512x512) — ja existe em `/public/icons/icon-512.png`

## Checklist

- [ ] Keystore gerado e armazenado com seguranca
- [ ] SHA-256 copiado para `assetlinks.json`
- [ ] `assetlinks.json` acessivel em producao (`curl https://www.lorflux.com/.well-known/assetlinks.json`)
- [ ] `manifest.json` com `scope`, `id`, `categories`
- [ ] Build AAB gerado sem erros
- [ ] Testado em dispositivo Android real
- [ ] Ficha da Play Store preenchida
- [ ] Revisao do Google aprovada
