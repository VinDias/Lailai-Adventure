# Lorflux - Documentação de Operação

## Acesso ao Painel Admin

1. Acesse `https://lorflux.com` e faça login com as credenciais de superadmin
2. O painel admin estará disponível na navegação para usuários com role `admin` ou `superadmin`
3. Credenciais iniciais do admin:
   - **Email:** `vin@lorflux.com`
   - **Senha:** Definida no seed (trocar após primeiro login)

Para criar o admin inicial:
```bash
npm run seed:admin
```

---

## Upload de Vídeo (HQCine / VCine)

1. Acesse o painel admin → **Upload Content**
2. Selecione o tipo: `video`
3. Selecione a seção: `HQCINE` ou `VCINE`
4. Preencha título e metadados
5. Faça upload do arquivo de vídeo e thumbnail
6. O vídeo será enfileirado para processamento via BullMQ
7. Após processamento, o status muda para `published`

### Via Bunny.net Stream
- Vídeos são enviados para o Bunny.net via API
- O processamento (transcode) é feito automaticamente pelo Bunny
- Quando o encode termina, um webhook notifica o backend (`/api/bunny/webhook`)
- As URLs de embed e diretas são geradas automaticamente

---

## Upload de Webtoon (Hi-Qua)

1. Acesse o painel admin → **Upload Content**
2. Selecione o tipo: `panels`
3. Selecione a seção: `HIQUA`
4. Faça upload dos painéis (até 120 imagens por episódio)
5. Os painéis são armazenados via S3/R2

---

## Configurar Chaves Stripe em Produção

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Desative o **Test Mode**
3. Copie as chaves de produção:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → `whsec_...`
4. Crie um **Product** com preço recorrente (R$ 3,99/mês) e copie o `STRIPE_PRICE_ID`
5. Configure o webhook em produção:
   - URL: `https://api.lorflux.com/api/payment/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.deleted`
6. Atualize as variáveis no servidor de produção

---

## Super Reader — Apoio Direto ao Autor (Fase 4, Bloco 3)

Apoio direto do leitor ao autor de uma obra (80% autor / 20% plataforma), separado da assinatura Premium. Reaproveita a integração Stripe já existente — **nenhuma variável de ambiente nova**.

### Nenhuma configuração nova de Stripe
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PRICE_ID*` já estão documentados acima (seção "Configurar Chaves Stripe em Produção") e em `.env.example` — o Super Reader usa a mesma `STRIPE_SECRET_KEY`, sem chave própria
- O webhook `POST /api/payment/webhook` já assinado para o Premium **não precisa de nenhuma mudança**: o evento `checkout.session.completed` que ele já recebe é o mesmo evento que o Super Reader trata (a rota distingue pelo `metadata.tipo === 'super_reader'` da sessão). Só confira no painel do Stripe que o endpoint de produção continua com esse evento marcado — nada a adicionar

### Setting opcional: `superReaderMinCents`
- Valor mínimo de apoio, em **centavos** (500 = R$5,00; Super Reader é BRL apenas — ver seção acima)
- Chave `superReaderMinCents` na coleção `Setting`, configurável via `PUT /api/settings/:key` com token admin — **não** existe campo para ela no painel de configurações admin (`components/Admin/AdminDashboard.tsx`, formulário hardcoded com as 9 chaves de `PUBLIC_KEYS`); adicionar esse campo ao painel é dívida de produto registrada aqui
  ```bash
  curl -X PUT https://api.lorflux.com/api/settings/superReaderMinCents -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" -d '{"value":"1000"}'
  ```
- **Ausente ou inválido** (não-inteiro ou ≤ 0) → o backend usa o default **500** automaticamente (`services/superReaderService.js`) — não é obrigatório criar a chave para o recurso funcionar

### Comportamento sem `STRIPE_SECRET_KEY`
- `GET /api/superreader/min` e `GET /api/superreader/me` funcionam normalmente — não tocam no Stripe
- `POST /api/superreader/create-session` falha: o serviço tenta montar o cliente Stripe só na primeira chamada real (lazy) e lança um erro simples (sem `.status`) quando a chave não está configurada; a rota devolve **500** genérico (`"Erro ao criar a sessão de apoio."`) ao cliente — o motivo real (`STRIPE_SECRET_KEY não configurada`) fica só no log do servidor

---

## Algoritmo de Recomendação — Score e Tags (Fase 4, Bloco 4)

Score por obra (0–100) e distribuição 50/30/20 nos 3 feeds (HQCine/VCine/Hi-Qua). Reaproveita a infraestrutura existente — **nenhuma variável de ambiente nova**.

### Nenhum passo manual pós-deploy
O primeiro boot depois do deploy já dispara a varredura inicial sozinho: `server.js` chama `recommendationService.iniciarVarreduraPeriodica()` ao conectar no MongoDB, que checa se existe alguma série publicada sem `SeriesScore` (ou com score vencido, mais velho que 24h) e, se sim, roda `computeAllScores()` em segundo plano — os scores **nascem sozinhos**, sem seed nem comando manual. Depois disso, a varredura se repete a cada 24h e cada ação forte (voto, favorito, Super Reader, capítulo publicado, conclusão de leitura) recalcula a obra afetada na hora.

### Curadoria de tags é opcional e progressiva
Tags internas (`Series.tags`) alimentam só a Afinidade do algoritmo — nunca aparecem para o leitor (o campo `genre` continua sendo o rótulo visível). Acervo sem tags (`tags: []`, o default) funciona normalmente: toda obra sem tags recebe **12,5 pts neutros** de Afinidade (metade dos 25 possíveis), em vez de ser penalizada por falta de curadoria. Adicionar tags a uma obra é opcional e pode ser feito aos poucos, série por série, no admin (chips no formulário de criar/editar série, mínimo 5 quando informadas) — não é passo obrigatório do deploy nem exige tocar o acervo inteiro de uma vez.

### Setting de limiares de penalização NÃO existe
Os limiares das penalizações (retenção baixa <30% da escala, abandono ≥60% dos leitores presos no capítulo 1, inatividade >60 dias sem capítulo novo) estão fixos em código (`services/recommendationService.js`) — **não existe** nenhuma chave em `Setting` nem rota para ajustá-los em produção. Registrado como dívida na spec (`docs/superpowers/specs/2026-08-20-algoritmo-recomendacao-design.md`, seção "Fora de escopo"); mudar um limiar hoje exige editar o código e fazer deploy.

---

## Portal do Ilustrador (Fase 5, Bloco 1)

Cada ilustrador com conta própria vinculada a um canal: página pública com botão Seguir, painel com os números dele, upload dos próprios capítulos (que só entram no ar depois da aprovação do Master) e mensagem privada editor↔ilustrador. Reaproveita a infraestrutura existente — **nenhuma variável de ambiente nova, nenhuma chave nova, nenhum passo de migração**.

### Nenhum passo manual pós-deploy
Os campos novos (`Series.content_rating_sugerida`, `Series.submittedAt`, `Episode.submittedAt`) têm `default: null` e a coleção `mensagemportals` nasce vazia no primeiro uso — o Mongoose aplica o schema sozinho, sem script de migração. O acervo existente continua funcionando como está.

### Como vincular um ilustrador a um canal (é o único passo operacional)
"Ilustrador" **não é um role** — é derivado de ser dono de um canal ativo. São dois passos no painel admin, nesta ordem:

1. **Criar o canal** — `POST /api/channels` virou **admin-only** neste bloco (antes, qualquer usuário autenticado criava canal; sem essa mudança qualquer leitor se autopromoveria a ilustrador). O canal nasce com o próprio admin como dono.
2. **Transferir a titularidade** — painel admin → **Canais** → selecionar o canal → campo **"E-mail do dono (transferir titularidade)"** → Transferir. O e-mail precisa ser de um usuário **já cadastrado** no Lorflux; e-mail sem conta responde "Usuário com esse e-mail não encontrado." Feito isso, o cartão **"Meu Estúdio"** aparece sozinho na aba Conta desse usuário no próximo carregamento.

> **A transferência arquiva a thread de mensagens do dono anterior.** É intencional (LGPD): o sucessor não lê o histórico privado do antecessor. O admin continua vendo tudo em Canais → Mensagens. Transferir para o **mesmo** e-mail já vigente é no-op e não arquiva nada.

### Revogar um ilustrador
Painel admin → **Canais** → **Desativar canal**. O canal some do catálogo público (`GET /api/channels/:id` passa a responder 404), o ex-dono perde o acesso a todo o portal (403) e a exclusão de conta dele deixa de ser bloqueada. As obras publicadas **continuam no ar** — desativar canal nunca apaga conteúdo.

- **Reativar tem botão desde a Fase 5, Bloco 2** (higiene do Bloco 1 — antes só dava para mexer no Mongo na mão): o painel **Canais** lista também os inativos e o canal desativado mostra **"Reativar canal"** no lugar de "Desativar canal" (`POST /api/channels/:id/reativar`, admin). Reativar **não** desarquiva as mensagens da thread — a thread arquivada é do ex-dono, e continua acessível pela aba Mensagens do canal.
- Transferir a titularidade para outra pessoa é a alternativa a desativar, quando a obra deve continuar tendo um dono ativo.

### O que o Master precisa fazer para uma obra ir ao ar
Painel admin → **Aprovações** (badge na sidebar = itens pendentes). Nada enviado pelo ilustrador entra no catálogo sozinho.
- **Gênero é obrigatório para aprovar uma série** — a obra do portal nasce sem gênero (o formulário do ilustrador não tem esse campo, por decisão de contrato) e o botão Aprovar fica desabilitado até o Master preencher. Tags são opcionais — 0 a 8 do vocabulário fechado (Fase 5, Bloco 2) — e podem ser preenchidas na mesma tela.
- **Classificação etária também é obrigatória para aprovar uma série** (Fase 5, Bloco 2). Aprovar sem ela responde `400 "Classificação etária é obrigatória para aprovar"`, e o botão Aprovar fica desabilitado até o Master escolher Kids/Teen/Young. A **classificação sugerida pelo ilustrador aparece como dica, mas NUNCA é copiada automaticamente** — o seletor abre sem valor pré-selecionado; a decisão é sempre um ato do Master. Essa exigência vale só na Fila de Aprovação: o `PUT` do admin em **Gerenciar Séries** continua publicando sem classificação (fail-safe abaixo cobre).
- **Obra sem classificação só aparece para o perfil `young`** (fail-safe). É por isso que existe o badge **"N não classificadas"** no cabeçalho de Gerenciar Séries e o chip **"Sem classificação"** em cada série publicada sem `content_rating` — é a lista de trabalho do Master para o acervo antigo, que foi publicado antes de o campo existir.
- **Aprove a série antes do capítulo.** Aprovar um capítulo de série ainda não publicada responde 400 com essa orientação.
- **Devolver** limpa o marcador de envio (a obra volta a ser editável pelo ilustrador) e cria automaticamente a mensagem do editor na thread dele, já apontando qual obra/capítulo. Devolver uma série **não** devolve os capítulos dela em cascata.
- Aprovar e devolver ficam registrados no `AdminLog` (`APROVAR_SERIE_PORTAL`, `APROVAR_EPISODIO_PORTAL`, `DEVOLVER_SERIE_PORTAL`, `DEVOLVER_EPISODIO_PORTAL`).
- O card da fila mostra capa/thumbnail, descrição, classificação sugerida e a contagem de painéis — **não** um leitor página a página. Para revisar as páginas de um capítulo antes de aprovar, use **Gerenciar Conteúdo** (que lista também as séries não publicadas).

### O painel de números do ilustrador não mostra R$ no mês corrente
Decisão de contrato, não limitação técnica: o mês em aberto mostra **pontos, views válidas e % de share**, sem valor em reais, porque o pool só é confirmado no fechamento (`POST /api/admin/royalties/close`). R$ aparece só em períodos **fechados**, lidos do `RoyaltyPeriod.breakdown` filtrado ao canal, mais os apoios de Super Reader por mês. São exatamente os mesmos números do relatório admin (mesmas funções, em `services/royaltyReportService.js`) — não existe segundo cálculo que possa divergir na hora de pagar.

### Uploads: o que o ilustrador pode e não pode subir
- **Pode**: imagens (capa, thumbnail de capítulo, painéis) — `POST /api/bunny/upload-image` e `/upload-image-batch` aceitam admin **ou** dono do canal da série alvo. O ilustrador manda o `seriesId`; **o servidor deriva a pasta do storage do título da série** e ignora qualquer caminho informado no corpo.
- **Não pode**: vídeo e áudio (`/upload`, `/upload-video`, `/upload-audio` seguem admin-only). Abrir vídeo ao ilustrador antes do gate de temporada da 5.1 reabriria o buraco do "vídeo grátis".
- As abas **CINECOMICS** e **VERTICALSHOW** aparecem no portal **bloqueadas**, com o aviso "Publicação mediante contratação de temporada — em breve". Não há checkout nem upload por trás delas neste bloco.

### Efeito colateral esperado no catálogo antigo
A partir deste deploy as rotas públicas passam a filtrar por publicado (busca, detalhe de série, lista e detalhe de capítulo, `signed-url`). Se hoje existir no ar algum **capítulo `draft` dentro de uma série publicada**, ele deixará de aparecer para o leitor — isso é a correção, não uma regressão. Para colocá-lo de volta no ar, publique o capítulo normalmente pelo admin. Admin e dono do canal continuam vendo os próprios rascunhos, e abrir um rascunho **não** conta view nem gera evento de royalties.

---

## Controle Parental + Tags (Fase 5, Bloco 2)

Classificação etária oficial (`Series.content_rating`) e filtro pessoal por tags do vocabulário fechado (19 slugs, `utils/tagsVocabulario.json`). Reaproveita a infraestrutura existente — **nenhuma variável de ambiente nova**.

### O que o leitor vê (Conta → "Classificação etária e Preferências de conteúdo")
Duas coisas **independentes**, e a nomenclatura é obrigatória (letra do cliente, PDF de 31/08 — nunca chamar o filtro do usuário de "controle de classificação", que confundiria com Kids/Teen/Young):
- **Classificação etária** — Kids / Teen / Young, definida oficialmente pela Lorflux por obra. O perfil `kids` vê só obras Kids; `teen` vê Kids e Teen; `young` (o default de toda conta) vê tudo, inclusive as ainda não classificadas.
- **Preferências de conteúdo** — 19 toggles "ocultar", um por tag do vocabulário. Bloquear uma tag **elimina aquelas obras da experiência DESTE usuário** — a obra segue publicada, disponível e recomendável para todos os outros. Não é censura e não é visível para ninguém: o artista **nunca** vê nem altera as preferências de quem quer que seja, e as tags da obra continuam **nunca exibidas na obra** (o rótulo visível segue sendo o Gênero).
- **PIN de proteção** (opcional, 4–6 dígitos). Com PIN definido, **qualquer** mudança nessas preferências exige o PIN — inclusive as tags que o próprio adulto bloqueou, e inclusive **excluir a conta** (senão a criança apagaria e recriaria a conta sem restrição). 5 erros bloqueiam por 15 min, com o dobro a cada novo lote de 5 (teto de 24h); o bloqueio é **persistido na conta**, então reiniciar o servidor não zera. Esqueceu: "Esqueci meu PIN" manda um link por e-mail (senha também é exigida em conta local) que **remove** o PIN — as preferências continuam intactas.

O filtro é aplicado **no servidor**, em todas as superfícies: catálogo, busca (séries e capítulos), agenda, recomendação (inclusive o fallback), favoritos, continuar lendo, canal público, detalhe da obra, lista de capítulos, leitor, URL assinada de vídeo, **push de capítulo novo** e os writes de engajamento (favoritar/votar/apoiar respondem 404 numa obra invisível). Favorito antigo de obra que passou a ser bloqueada **continua no banco** — some da lista e volta sozinho ao desbloquear a tag.

**Limitações conscientes, a comunicar ao cliente:** o parental é da **conta**, não do aparelho — sair da conta (modo visitante) ou criar uma segunda conta contorna o filtro por definição. Mitigação por dispositivo é escopo futuro. Admin e o **dono do canal** enxergam a própria obra mesmo com a tag dela bloqueada (senão o painel e o portal quebrariam), mas nas **listas** o filtro vale para todos, inclusive para o dono.

### Passo manual pós-deploy: migrar as tags livres do acervo para o vocabulário fechado

Antes deste bloco, `Series.tags` aceitava qualquer string livre (Bloco 4 da Fase 4). O validator agora só aceita 0–8 slugs do vocabulário oficial (`models/Series.js:40-45`) — sem migrar, a primeira edição de uma série com tags livres antigas (inclusive um draft do portal) responde 400. Rode nesta ordem, **na VPS, a partir de `/var/www/lorflux`** (o script usa `dotenv` para ler `MONGO_URI` do `.env` do diretório onde é chamado — `scripts/migrarTagsVocabulario.js:388` — rodar de outro diretório faz cair no default `mongodb://localhost:27017/lorflux`, **não** no banco de produção), depois do `git pull`:

1. **Dry-run primeiro (não escreve nada):**
   ```bash
   node scripts/migrarTagsVocabulario.js
   ```
   Sem argumento (ou com `--dry-run` explícito) o script roda em modo leitura. **Parse estrito dos argumentos** (`scripts/migrarTagsVocabulario.js:361-380`): só `--apply` e `--dry-run` são reconhecidos — os dois juntos, ou qualquer typo (`--APPLY`, `apply`, `--bogus`), é erro alto (mensagem + `exit(1)`, sem conectar no Mongo) em vez de cair num dry-run silencioso disfarçado. A saída lista: total de séries, todas as tags livres distintas do acervo real com a contagem de obras e o mapeamento proposto (`tag → slug` ou `NÃO MAPEADA`), o antes/depois por obra e um resumo. **Copie essa saída e mande para quem escreveu o script** — o mapa manual (próximo passo) é fechado com base nela, porque o desenvolvimento não tem acesso às tags de produção.

2. **Ajuste o mapa se necessário.** O mapa fica em `scripts/mapaTagsVocabulario.js` (objeto `{ 'tag livre normalizada': 'slug' }`, já pré-populado com o óbvio: identidade, rótulo em português, sinônimos evidentes). Qualquer tag "NÃO MAPEADA" no dry-run que devesse virar um slug entra ali — a ORDEM das entradas do objeto define a prioridade de qual tag sobrevive quando uma obra tem mais de 8 tags mapeáveis (comentário no topo do arquivo explica o porquê).

3. **Aplicar de verdade:**
   ```bash
   node scripts/migrarTagsVocabulario.js --apply
   ```
   Cobre **todas** as séries — publicadas, despublicadas e drafts (`scripts/migrarTagsVocabulario.js:216` — `Series.find()` sem filtro nenhum). É seguro rodar mais de uma vez: uma obra só é regravada se o array de tags REALMENTE mudar (`scripts/migrarTagsVocabulario.js:182` calcula `mudou` comparando o array cru do doc contra o resultado canônico; `:238-257` só escreve quando `mudou === true`) — **atenção**: "já são slugs válidos" não é o mesmo que "não muda nada". A saída final é sempre CANÔNICA (deduplicada e ordenada pela prioridade do mapa); se uma obra já tiver só slugs válidos mas **fora dessa ordem**, a 1ª rodada ainda a regrava (reordenação, mesmas tags) — só a partir da 2ª rodada ela vira no-op de verdade. Se o mapa produzir algo inválido (slug fora do vocabulário, ou mais de 8 depois do corte), o script aborta **sem escrever nada** — nem as obras que estavam corretas (`scripts/migrarTagsVocabulario.js:157-176`, o ASSERT roda dentro de `planejarMigracao`, que termina 100% antes de qualquer `updateOne`). Se a escrita falhar **no meio** do loop (ex.: o Mongo cair depois de já ter gravado algumas obras), a mensagem de erro diz quantas obras já foram gravadas antes da falha — nunca afirma "nada foi gravado" quando não é verdade; é seguro só rodar `--apply` de novo (idempotente).

4. `npm run build` e reinicie o PM2 como de costume (`npm run restart`).

### `content_rating`/`tags` ausentes no documento — corrigido sozinho no boot, sem passo manual
Séries de antes deste bloco não têm `content_rating` gravado (o campo nasceu com `default: null` na Task 1, mas o Mongoose só aplica default em `create()`/`save()`, nunca retroativamente a documentos já existentes); séries de antes da Fase 3/4 também podem não ter `tags`. O boot do servidor roda um backfill idempotente **antes** de aceitar conexões (`server.js:740-750` — `app.listen` só chama depois de `backfillCamposParental()` terminar; falha aqui derruba o boot em vez de servir 500 silencioso) — `services/parentalBackfill.js:51-58`. O passo 3 acima (`--apply`) chama a **mesma função**, então rodar a migração já cobre isso também; o backfill do boot é a rede de segurança para o que a migração não tocar (séries sem `tags` no documento) e para qualquer novo deploy futuro.

### Smoke manual da recomendação antes/depois (não é teste automatizado)
O algoritmo de recomendação (`services/recommendationService.js`) usa `Series.tags` para a Afinidade — migrar o acervo muda a cardinalidade das tags reais (Bloco 4 tinha mínimo 5; este bloco não tem mínimo, até 8). `scripts/devMock.js` (script local, não versionado neste repositório) **já semeia o catálogo com slugs do vocabulário oficial e `content_rating` por obra** — não é mais tags livres à moda do Bloco 4. Rodar `node scripts/migrarTagsVocabulario.js` (dry-run) contra ele mostra **0 tags removidas/não mapeadas** (todo o seed já usa o vocabulário); pode aparecer `MUDARIA` em algumas obras mesmo assim — é só **reordenação** (mesmas tags, canonizadas pela prioridade do mapa, ver seção acima), não perda de tag nenhuma. Depois de um `--apply` local, uma 2ª rodada mostra `0 modificadas` de verdade. **O mapa manual só se fecha com o dry-run de PRODUÇÃO** (passo 1 acima) — o seed local não tem as tags livres reais do acervo, então não serve pra descobrir "NÃO MAPEADA" nenhuma. Para o smoke: compare `GET /api/content/recommendations` antes e depois de aplicar a migração no mesmo ambiente local.

---

## Ativar Notificações Push na VPS

### Gerar Chaves VAPID (uma única vez)

Chaves VAPID identificam seu servidor aos provedores de push (Firefox, Chrome, etc) e habilitam criptografia de ponta a ponta. **Gere-as uma única vez por instância de produção e guarde com segurança.**

1. **Na VPS (`/var/www/lorflux`)**, execute:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Você receberá:
   ```
   Public Key: B3d...xyz
   Private Key: 2Qw...abc
   ```

2. **Adicione ao `.env` em produção:**
   ```env
   VAPID_PUBLIC_KEY=B3d...xyz
   VAPID_PRIVATE_KEY=2Qw...abc
   VAPID_SUBJECT=mailto:contato@lorflux.com
   ```
   - `VAPID_SUBJECT` é seu e-mail ou URL (obrigatório; padronizado para o contato da empresa)
   - A chave privada é sensível — nunca compartilhe em logs ou repositórios

3. **Instale a dependência (se não incluída):**
   ```bash
   npm install
   ```

4. **Rode o backfill de episódios legados (uma vez, idempotente):**
   ```bash
   node scripts/backfillNotificationSentAt.js
   ```
   Marca o acervo já publicado como notificado, para que o primeiro edit de
   um episódio antigo (ex.: trocar a thumbnail) não dispare um push falso de
   "capítulo novo" para quem favoritou. Rodar de novo não faz nada (idempotente).

5. **Reinicie o PM2:**
   ```bash
   npm run restart
   # ou
   pm2 restart all
   ```

### Aviso Crítico

**Trocar VAPID_PRIVATE_KEY invalida TODAS as inscrições ativas.** Antes de regerar:
- Notifique usuários sobre qualquer interrupção de notificações
- Faça backup do `.env` anterior (caso seja necessário reverter temporariamente)
- `PushSubscription` não tem TTL nem expira sozinha: o `notificationService` só remove uma inscrição quando o envio falha com 404/410 (endpoint morto), o que uma chave trocada não necessariamente causa. Ou seja, inscrições antigas podem ficar paradas no banco sem receber nada até o usuário reabrir o app e reativar manualmente (o toggle da Conta ou o cartão pós-favorito criam uma inscrição nova)

### Se Push Ficar Desativado

Se as variáveis VAPID não estiverem no `.env`:
- O app funciona normalmente (todos os recursos disponíveis) — a ausência de push nunca derruba o boot
- Em produção, `notificationService.notifyEpisodePublished` fica desativado (log de erro, sem lançar) — nada é enviado, mas a publicação do episódio segue normal
- Em desenvolvimento, um par de chaves efêmero é gerado a cada start (aviso no log) — inscrições não sobrevivem a um restart
- Reiniciar o PM2 com as chaves corretas reativa o push

---

## Adicionar Novos Admins

Via MongoDB:
```javascript
// No shell do MongoDB
db.users.updateOne(
  { email: "email@exemplo.com" },
  { $set: { role: "admin" } }
)
```

Ou crie um novo seed script modificando `scripts/seedAdmin.js`.

**Limite:** Máximo de `MAX_ADMIN_COUNT` admins (configurável no `.env`, padrão: 10).

---

## URLs dos Serviços

| Serviço | URL |
|---------|-----|
| **Frontend (Vercel)** | `https://lorflux.com` |
| **Backend API** | `https://api.lorflux.com` |
| **MongoDB Atlas** | Configurado em `MONGO_URI` no `.env` |
| **Bunny.net Stream** | Dashboard em [bunny.net](https://bunny.net) |
| **Stripe Dashboard** | [dashboard.stripe.com](https://dashboard.stripe.com) |
| **Cloudflare DNS** | [dash.cloudflare.com](https://dash.cloudflare.com) |
| **Sentry (Monitoramento)** | Configurado em `SENTRY_DSN` no `.env` |

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão: 3000) |
| `NODE_ENV` | `development` ou `production` |
| `JWT_SECRET` | Chave secreta para tokens JWT |
| `REFRESH_SECRET` | Chave secreta para refresh tokens |
| `MONGO_URI` | URI de conexão MongoDB |
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook Stripe |
| `STRIPE_PRICE_ID` | ID do preço da assinatura |
| `REDIS_URL` | URL de conexão Redis |
| `BUNNY_API_KEY` | API Key do Bunny.net |
| `BUNNY_LIBRARY_ID` | ID da library Bunny.net |
| `BUNNY_CDN_HOSTNAME` | Hostname CDN do Bunny.net |
| `FRONTEND_URL` | URL do frontend |

---

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Frontend (Vite dev server)
npm run server       # Backend (Express)
npm run worker       # Video worker (BullMQ)

# Produção
npm run build        # Build do frontend
npm run start        # Inicia via PM2
npm run stop         # Para via PM2
npm run restart      # Reinicia via PM2

# Utilitários
npm run seed:admin   # Criar admin inicial
npm run validate:env # Validar variáveis de ambiente
npm run backup       # Backup do projeto
```
