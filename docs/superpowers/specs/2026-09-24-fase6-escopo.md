# Fase 6 — escopo levantado (24/09/2026)

Base: mensagens do Vin de 16/09 (lista final das 21:14), 17/09 (planos de produtores
entram nesta fase; dúvida do upload de diálogos) e 21/09 (saque a partir de
US$ 20; ideia do Leo de capa para Coleções). PDF do cliente:
`docsprivados/implementacao-do-sistema-de-compartilhamento.pdf` (17 páginas, 18
critérios de aceite na pág. 16).

Levantamento no código conferido em arquivo:linha. Estimativas de preço são
referência de esforço para o Fellipe fechar com o cliente, não compromisso.

---

## Bloco 1 — Compartilhamento e Coleções

**O que o cliente pediu:** link público permanente de obra e de episódio abrindo
sem login, botão "Opções" com Compartilhar e Adicionar à Coleção, Coleções de até
20 itens (obra inteira ou episódio, ordem manual), privadas por padrão, públicas
por link permanente, prévia de link em WhatsApp/Telegram/Discord, nada de rede
social. Adição do Leo (21/09): capa da Coleção.

**O que existe hoje:**

| Peça | Situação | Evidência |
|---|---|---|
| Rotas por URL | Não existe. A tela é estado `ViewMode`, e a URL só é lida para `/privacidade`, `/termos`, `/recuperar-pin` e `/redefinir-senha` | `App.tsx:65,117-121,162-165`; `types.ts:52-77` |
| Endereço amigável da obra | Não existe campo de slug em Series nem em Episode; o único "slug" é derivado do título para a pasta do Bunny, sem gravar nem garantir unicidade | `models/Series.js`; `routes/bunnyWebhook.js:13,46` |
| Prévia de link (og:) | Nenhuma tag og no HTML e o servidor só devolve o arquivo no catch-all | `index.html`; `server.js:699-710` |
| Compartilhar | Nenhum uso de `navigator.share` nem de clipboard no app | grep no projeto |
| Modelo parecido | Favoritos (userId + seriesId, índice único, sem ordem nem limite) serve de molde | `models/Favorite.js`; `routes/favorites.js:18-31,49-57` |
| Visitante | Já navega o catálogo, mas o primeiro acesso cai na tela de login | `App.tsx:195-215,329-333` |
| Link abre o app Android | `assetlinks.json` dá `handle_all_urls` ao pacote `com.lorflux.twa` | `public/.well-known/assetlinks.json` |

**Trabalho:** slug único por obra com backfill do acervo e tratamento de colisão;
leitura da URL antes da tela de login, convivendo com a pilha do botão voltar
(`utils/pilhaVoltar.ts`); injeção das tags og no HTML dentro do catch-all do
servidor (crawler não roda JavaScript); modelo Collection com itens mistos, ordem
e `publicId` não adivinhável; API de coleções; tela "Minhas Coleções" dentro da
Conta; página pública da coleção; menu Opções nas três seções e nos episódios;
capa da coleção (upload) e uso dela no og:image.

**Riscos e decisões:**
- Item despublicado tem que sumir da coleção pública sem quebrar a página (pág. 14 do PDF).
- Coleção pública e filtro parental: visitante não passa por filtro etário (`utils/parentalFilter.js:137-148`), então uma coleção pública pode expor obra adulta a quem não tem conta. Decidir a regra com o cliente.
- Premium hoje não bloqueia conteúdo (`routes/content.js:430`): link de episódio Premium abre para qualquer um depois de um anúncio. Link aberto torna isso visível.
- Abertura por link infla views e eventos que alimentam royalties.

**Estimativa:** R$ 2.200.

---

## Bloco 2 — Assinatura pelo Google Play

**O que existe hoje:**
- Premium é cobrado por cartão no Stripe (`routes/payment.js:31-74`), e o app Android manda o usuário para o checkout do Stripe (`App.tsx:562`).
- Existe um esqueleto de validação de compra do Google que **nada no app chama**: `routes/mobilePayment.js:16-32` e `services/mobilePaymentService.js:9-39`. Ele usa a API antiga `purchases.subscriptions.get`, não confirma a compra (o Google estorna compra não confirmada em 3 dias) e não amarra o comprovante a um usuário, então o mesmo comprovante liberaria várias contas.
- Não existe recebimento das notificações do Google (renovação, cancelamento, reembolso) nem rotina que encerre o Premium vencido.
- O app Android é o site dentro de um invólucro (TWA), então a compra depende de ligar o Play Billing no build (recurso existe no Bubblewrap 1.25) e publicar versão nova.

**Trabalho:** detectar o app Android e trocar o botão para a compra do Google;
validar no servidor com a API atual e confirmar a compra; guardar comprovante e
pedido com índice único por usuário; receber as notificações do Google; unificar
a regra de "Premium ativo" (hoje cada lugar checa de um jeito); mostrar o preço
vindo da própria Play; manter o Stripe para quem assina pelo navegador.

**Depende do cliente e do Fellipe:** perfil de pagamentos e produto de assinatura
no Play Console, conta de serviço com acesso à API, tópico de notificações no
Google Cloud, e o keystore do app (o mesmo da barra de status).

**Estimativa:** R$ 2.000.

---

## Bloco 3 — Planos de temporada para produtores e carteira do autor

**O que o cliente pediu:** temporada de 13 episódios em CINECOMICS e 60 em
VERTICALSHOW, teto de 3 minutos por episódio, primeira contratação com uma
temporada bônus, cobrança por temporada (US$ 1,89 e US$ 2,99), pagamento não
garante aprovação. Mais (21/09): o autor pede retirada a partir de R$ 100 ou
US$ 20, com preferência pelo dólar.

**O que existe hoje:** nada além dos cartões travados no portal
(`components/PortalEstudio.tsx:821-833`, textos em `i18n/translations.ts:270-271`)
e do portal fixado em Hi-Qua (`routes/portal.js:292`). Não existe modelo de
temporada (`services/api.ts:329-335` devolve lista vazia), não existe verificação
de duração (`models/Episode.js:11` guarda o número, ninguém valida) e **não existe
nenhuma rotina de saque ou carteira**: o motor de royalties fecha o período e
exporta CSV (`routes/royalties.js:43-73,118-132`), o pagamento é feito fora do app.
O Stripe do Super Reader só trabalha em real (`services/superReaderService.js:22`).

**Trabalho:** modelo de temporada com limites e fechamento automático; teto de
duração; checkout da contratação com bônus na primeira; liberar upload de vídeo
ao autor apenas com temporada paga; carteira do autor com saldo acumulado,
mínimo de saque, pedido, histórico e baixa pelo admin.

**Decisões:** moeda do saque (o Vin prefere dólar; o Stripe atual é só real);
cobrança da temporada dentro do app Android esbarra na política de pagamentos da
Play, então o caminho seguro é o produtor contratar pelo navegador.

**Estimativa:** R$ 2.400.

---

## Fase 7 sugerida — pacote de vídeo

| Item | Situação hoje | Estimativa |
|---|---|---|
| Legendas no player | Zero código de legenda no projeto; a API do Bunny aceita legendas e as credenciais já existem (`.env.example:26-38`). Não confirmado se a legenda entra no link assinado do vídeo | R$ 800 |
| Capas de vídeo com Dialogue Layer | Reaproveita o formato das camadas dos painéis (`models/Episode.js:12-19`) e o modo de empilhar imagem (`components/WebtoonReader.tsx:302-319`). Capa aparece em 11 telas e 8 consultas precisam do campo novo | R$ 900 |
| Publicidade de terceiros × Lorflux Original | O anúncio não tem tipo nem obra alvo (`models/Ad.js:3-16`) e o pool sugerido de royalties conta toda impressão pelo CPM (`services/royaltyReportService.js:104-120`), então promover obra própria incharia a sugestão. AdMob exige app nativo; no nosso caso é AdSense | R$ 600 |

---

## Pendências fora do escopo comercial

- Barra de status do Android em tela cheia (cortesia prometida em 16/09): depende do keystore.
- Backup do banco: `scripts/backup.sh:13` não faz dump do MongoDB.
- Redis fora do ar na VPS, com a fila de vídeo morta (levantamento de 11/09).
