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
- **Chave de upload ANTIGA (revogada):** `84:3C:6D:B5:F6:50:8E:B4:E3:4B:76:52:F1:C5:CB:9B:13:C8:D8:73:41:11:D1:51:A5:CA:A1:78:8D:2E:43:76`
  **Tirada do `assetlinks.json` em 27/10/2026.** Não era entulho inofensivo:
  enquanto estivesse declarada, qualquer APK assinado com ela abriria as URLs
  de lorflux.com, e ela está num computador formatado, fora do nosso controle.
  Era exatamente isso que a redefinição existia para encerrar. Nada
  legítimo dependia dela: o app da Play é reassinado com a chave de assinatura,
  e não há como produzir APK novo com a chave perdida.

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

- `lorflux-upload-2026.jks` — RSA 2048, alias `lorflux`, validade até
  09/03/2054, `CN=Lorflux, OU=Lorflux Studio, O=Lorflux Studio, L=Sao Paulo, ST=SP, C=BR`
- `upload_certificate.pem` — o que foi enviado ao Google
- `senha.txt` — a senha **também está nessa pasta** (conferido em 27/10/2026).
  A versão anterior desta página dizia que ela ficava só no gerenciador de
  senhas; não é verdade. A pasta é 700 e o arquivo 600, fora de qualquer
  repositório, o que é aceitável neste servidor de um usuário só, mas não
  substitui o gerenciador: se este disco morrer, morre a chave **e** a senha
  juntas, que é o cenário de pedir outra redefinição ao Google.

Conferir a identidade a qualquer momento, sem depender desta página:

```
keytool -list -v -keystore lorflux-upload-2026.jks -alias lorflux
```

Perder o `.jks` **e** a senha significa outro pedido de dias ao Google. Perder
só este arquivo de documentação não custa nada.

## O que vem depois da chave

A ordem importa, e ela **não** é a intuitiva (criar o produto e depois enviar o
app). Conferido na própria página em 27/10/2026, ver a seção do fim.

1. AAB novo com `"features": { "playBilling": { "enabled": true } }` no
   `twa-manifest.json`, assinado com a chave nova.
2. Enviar para a faixa de **teste interno**. Só depois de existir um pacote
   enviado o console deixa criar produto de assinatura.
3. Criar a assinatura com id exatamente `premium_mensal`
   (`services/playBilling.ts:21`, ou `VITE_PLAY_PRODUCT_ID` no build).
4. Credencial da Play no servidor e tópico Pub/Sub do RTDN: são para
   **verificar** a compra e receber renovação, não para criar o produto.
5. Uma compra de teste real — é ela que valida o Play Billing escrito na
   Fase 6 (`services/playBillingService.js`, `services/playBilling.ts`,
   `routes/mobilePayment.js`).

O mesmo AAB carrega a barra de status imersiva prometida na Fase 5, que
dependia do keystore.

## Pré-requisitos que só o proprietário da conta resolve

Conferido em 22/10/2026 com a conta convidada (`fellipe306@gmail.com`, acesso de
app, não de conta):

- **Monetizar > Assinaturas** responde: *"O proprietário da conta precisa
  configurar uma conta do comerciante do Google Payments para que você tenha
  acesso a esta página"*. Sem esse perfil de pagamentos não existe produto de
  assinatura na Play, logo o Play Billing não pode ser nem configurado nem
  testado. O perfil pede nome legal, endereço, dados fiscais e conta bancária
  do titular, então é do Vin e não é delegável.
- **Configurações de pagamento** e **Acesso à API** (nível de conta)
  redirecionam para a página inicial com esse acesso. Vincular um projeto do
  Google Cloud, de onde sai a conta de serviço lida por
  `services/playBillingService.js` e o tópico Pub/Sub das notificações
  (`POST /api/mobile/notificacoes`), é ação do proprietário.

Ou seja, **no estado de 22/10**: a chave de upload tinha data, mas a venda
dentro do app dependia de dois passos que só o dono da conta executa.

## Conferido em 27/10/2026: as duas paredes do Vin caíram, o gargalo virou nosso

O Vin resolveu os dois pré-requisitos: o **perfil de pagamentos** em 23/10 e o
**Acesso à API** em 26/10 (projeto `peerless-list-512822-v6`, conta de serviço
criada e adicionada como usuária do Play Console).

Com isso, `Monetizar > Assinaturas` **abre** — a mensagem de 22/10 sumiu. Mas a
página mostra "O app ainda não tem assinaturas" e **não oferece botão de criar**:
o único botão é *"Faça upload de um novo APK"*. O console não deixa criar
produto de assinatura antes de existir um pacote enviado. **Logo o AAB é o
primeiro passo, não o último**, e a credencial deixou de ser o caminho crítico.

Sobre a credencial, que continua pendente mas fora do caminho crítico: a
política `iam.disableServiceAccountKeyCreation` da organização dele bloqueia
baixar a chave JSON. Não é impedimento — o próprio aviso do Google diz que um
administrador com `roles/orgpolicy.policyAdmin` desativa a restrição. E
`services/playBillingService.js:47` usa `new google.auth.GoogleAuth({ scopes })`,
que é ADC e aceita os três formatos pelo mesmo `GOOGLE_APPLICATION_CREDENTIALS`,
**sem mudar uma linha**: chave de conta de serviço, `authorized_user` (refresh
token de OAuth, caminho oficial da API da Play) e `external_account` (Workload
Identity). Ordem recomendada: afrouxar a política só naquele projeto; se
recusarem, cliente OAuth; Workload Identity por último, porque fora da nuvem do
Google ela exige guardar uma chave privada nossa no mesmo VPS, que é o risco que
a política existe para evitar.

Visto de passagem, de 23/10, na mesma página: a notificação *"É hora de se
inscrever para a taxa de serviço de 15%"*. A inscrição é do dono da conta e não
muda nada para assinatura (já é 15%); ela vale no dia em que compra avulsa
entrar no app, onde a taxa cheia é 30%.

## Os dois scripts de build do Windows estão desatualizados (27/10/2026)

`scripts/build-twa.ps1` e `scripts/setup-twa.ps1` são trabalho em andamento do
Fellipe na máquina dele, estão modificados na árvore e **não foram alterados
aqui**. Mas eles carregam valores de antes da redefinição da chave, e cada um
deles para o build de um jeito diferente:

| Onde | Valor atual | Problema |
|---|---|---|
| `build-twa.ps1:25` | `$ExpectedFingerprint = "84:3C:..."` | é a chave **perdida**. Desde o deploy do `assetlinks.json` novo ela não está mais no ar, então a validação da etapa 2 falha com "SHA-256 esperado NÃO está presente" e o script aborta antes de buildar. Trocar por `83:F3:E8:8C:86:94:8D:09:F8:3B:87:E9:86:DA:7B:A6:D7:29:3F:4E:E9:2B:77:03:E8:B6:0D:2E:F6:ED:AF:B8`, ou rodar com `-SkipAssetCheck` |
| `build-twa.ps1:12,44` e `setup-twa.ps1:16` | `%USERPROFILE%\.android-keystores\lorflux-release.keystore` | é o keystore perdido na formatação. O script aborta em "Keystore ausente"; se por acaso existir uma cópia velha, é pior, porque o AAB sai assinado com a chave que o Play já recusa. Trocar por `\\fap233\projects\lorfrux\chaves-twa\lorflux-upload-2026.jks` |
| `setup-twa.ps1:74` | instrução `Play Billing : N` | é exatamente o campo que precisa ser `Y`. Com `N` o build termina sem erro nenhum e a compra dentro do app simplesmente não existe |

Mais um ponto, independente da chave: `setup-twa.ps1:85` imprime a senha do
keystore em texto claro no console (`Write-Host "Senha que voce digitou: $plainPwd"`)
e só a esconde com `Start-Sleep 5` + `Clear-Host`. O `Clear-Host` não apaga o
buffer de rolagem do Windows Terminal, e a senha fica no histórico da sessão.
