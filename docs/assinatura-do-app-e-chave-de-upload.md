# Assinatura do app Android e chave de upload

Pacote: `com.lorflux.twa` (TWA do site, "Lorflux - Cinematic Comics").
O app usa **Play App Signing**: existem DUAS chaves e confundi-las quebra coisas
diferentes.

## As duas chaves, e qual é qual

| | Quem guarda | Para que serve | Muda? |
|---|---|---|---|
| **Chave de assinatura do app** | o Google | assina os APKs que chegam ao usuário | não muda |
| **Chave de upload** | nós | só prova que o AAB enviado é nosso | pode ser redefinida |

Impressões digitais SHA-256:

- **Assinatura do app:** `40:B3:F3:82:18:74:E2:C5:44:11:F7:AA:B4:DE:78:D4:4C:F6:A2:70:AA:48:21:AA:78:6D:B8:F5:96:32:26:74`
  É a que o próprio Play Console manda colocar no Digital Asset Links
  (Protegido com o Google Play > Assinatura de apps), e por isso é a que
  **tem de permanecer** em `public/.well-known/assetlinks.json`. Removê-la
  quebra o App Link do app publicado.
- **Chave de upload NOVA (22/10/2026):** `83:F3:E8:8C:86:94:8D:09:F8:3B:87:E9:86:DA:7B:A6:D7:29:3F:4E:E9:2B:77:03:E8:B6:0D:2E:F6:ED:AF:B8`
- **Chave de upload ANTIGA:** `84:3C:6D:B5:F6:50:8E:B4:E3:4B:76:52:F1:C5:CB:9B:13:C8:D8:73:41:11:D1:51:A5:CA:A1:78:8D:2E:43:76`
  Está no `assetlinks.json` e vira entulho quando a redefinição entrar em
  vigor. Só importa para APK instalado à mão: o app distribuído pela Play é
  reassinado com a chave de assinatura, que já está declarada.

## A redefinição pedida em 22/10/2026

A chave de upload original ficou no computador que foi formatado. Pedido feito
no Play Console em **22/10/2026**, motivo "Perdi a chave de upload", anexando o
certificado `.pem` da chave nova. Resposta do console:

> Sua nova chave de upload está sendo processada e será válida a partir de
> **24 de outubro de 2026, 23:33**.

Até essa data e hora, nenhum AAB novo pode ser enviado. Depois dela, só a chave
nova vale. O console mantém um "Cancelar pedido" enquanto está pendente.

## Onde a chave nova mora (NÃO está neste repositório)

`~/projects/lorfrux/chaves-twa` no servidor de desenvolvimento `fap233`
(pasta 700, fora de qualquer repositório git). Do Windows:
`\\fap233\projects\lorfrux\chaves-twa`.

- `lorflux-upload-2026.jks` — RSA 2048, validade até 09/03/2054,
  `CN=Lorflux, OU=Lorflux Studio, O=Lorflux Studio, L=Sao Paulo, ST=SP, C=BR`
- `upload_certificate.pem` — o que foi enviado ao Google
- a senha fica no gerenciador de senhas do Fellipe, nunca aqui

Conferir a identidade a qualquer momento, sem depender desta página:

```
keytool -list -v -keystore lorflux-upload-2026.jks -alias lorflux
```

Perder o `.jks` **e** a senha significa outro pedido de dias ao Google. Perder
só este arquivo de documentação não custa nada.

## O que vem depois da chave

1. AAB novo com `"features": { "playBilling": { "enabled": true } }` no
   `twa-manifest.json`, assinado com a chave nova.
2. Faixa de teste interno e uma compra de teste real — é ela que valida o
   Play Billing escrito na Fase 6 (`services/playBillingService.js`,
   `services/playBilling.ts`, `routes/mobilePayment.js`).
3. O mesmo AAB carrega a barra de status imersiva prometida na Fase 5, que
   dependia do keystore.
