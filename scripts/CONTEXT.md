# scripts/

## Responsabilidade

Scripts utilitários de setup, manutenção e operação do servidor. Executados manualmente ou via `npm run` — não fazem parte do fluxo da aplicação em produção.

---

## Arquivos

### `seedAdmin.js`
Cria o primeiro usuário administrador no banco de dados.
- Configura email, nome e senha via hardcode ou variáveis de ambiente
- Hash da senha com bcrypt antes de salvar
- Role definida como `superadmin`
- Executar apenas uma vez no setup inicial: `npm run seed:admin`

### `validateEnv.js`
Valida se todas as variáveis de ambiente obrigatórias estão definidas antes de iniciar o servidor.
- Lista as variáveis necessárias e verifica cada uma
- Exibe mensagem de erro descritiva e encerra o processo (`process.exit(1)`) se alguma estiver faltando
- Executar antes de iniciar em produção: `npm run validate:env`

### `backup.sh`
Script Bash para backup automático do banco de dados MongoDB.
- Usa `mongodump` para exportar os dados
- Comprime o backup em arquivo `.gz`
- Pode ser agendado via cron para execução periódica
- Executar: `npm run backup`

### `migrarTagsVocabulario.js` + `mapaTagsVocabulario.js` (Fase 5, Bloco 2)
Migra as tags livres do acervo (`Series.tags`, regra antiga do Bloco 4) para o vocabulário fechado de 19 slugs. **Passo manual obrigatório no deploy deste bloco** — sem ele, a primeira edição de uma série com tags livres antigas leva 400 do validator novo (0 a 8, todas do vocabulário). Roteiro completo em `DOCS.md` → "Controle Parental + Tags (Fase 5, Bloco 2)".
- **Default é DRY-RUN**: sem argumento (ou com `--dry-run`) só lê e imprime o plano — `parseArgv` (`migrarTagsVocabulario.js:361-380`) é **estrito**: `--apply` e `--dry-run` juntos, ou qualquer argumento desconhecido (`--APPLY`, `apply`, `--bogus`), é erro alto com `exit(1)` **antes de conectar no Mongo** — nunca cai num dry-run silencioso disfarçado
- `--apply` escreve. Cobre **todos** os docs de `Series` — publicadas, despublicadas e drafts (`Series.find()` sem filtro, `migrarTagsVocabulario.js:216`)
- Pipeline por obra: normaliza (`normalizarChaveTag`: trim + minúsculas + sem acento) → resolve (slug válido passa direto; senão consulta `mapaTagsVocabulario.js`; não mapeável é **removida**) → dedupe → **cap em 8** pela ordem das entradas do mapa (= prioridade)
- **ASSERT atômico antes de qualquer escrita** (`migrarTagsVocabulario.js:157-176`): `planejarMigracao` roda 100% em memória e lança se sobrar >8 ou um slug fora do vocabulário — o script inteiro aborta **sem gravar nada**, nem as obras que estavam corretas
- Idempotente: a saída é sempre canônica (deduplicada e ordenada por prioridade), então a 2ª rodada é no-op. **Atenção**: "já são slugs válidos" ≠ "não muda nada" — slugs válidos **fora da ordem canônica** são regravados uma vez na 1ª rodada
- Falha no MEIO do loop de escrita: o erro carrega `escritasFeitas` e a mensagem da CLI diz quantas obras já foram gravadas — nunca afirma "nada foi gravado" quando não é verdade
- Ao final, com `--apply`, chama `services/parentalBackfill.backfillCamposParental()` (`migrarTagsVocabulario.js:258`) — a MESMA função do boot do servidor, sem reimplementar
- `mapaTagsVocabulario.js` é o mapa manual `{ 'tag livre normalizada': 'slug' }` (40 entradas pré-populadas). **A ORDEM das entradas define a prioridade do cap 8.** O mapa só se fecha depois do dry-run de PRODUÇÃO — o desenvolvimento não tem acesso às tags reais do acervo
- Lógica exportada como funções puras (`planejarMigracao`, `aplicarMigracao`, `resolverTag`, `prioridadeDoSlug`, `normalizarChaveTag`, `parseArgv`) para os testes (`tests/backend/migrarTagsVocabulario.test.js`)
- Executar **a partir de `/var/www/lorflux`**: o `dotenv` (`migrarTagsVocabulario.js:388`) lê o `.env` do diretório atual — de outro diretório cai no default `mongodb://localhost:27017/lorflux`, não no banco de produção

### `backfillNotificationSentAt.js` (Fase 4, Bloco 2)
Marca episódios legados (`status: 'published'` sem `notificationSentAt`) como já notificados, para o push de capítulo novo não disparar falso na primeira edição pós-deploy de um episódio antigo.
- Idempotente — pode rodar mais de uma vez sem efeito colateral
- Executar uma vez no deploy do push (ver `DOCS.md` → "Ativar Notificações Push na VPS"): `node scripts/backfillNotificationSentAt.js`

---

## Observações

- Nenhum desses scripts é executado automaticamente — todos requerem execução manual
- `seedAdmin.js` e `validateEnv.js` dependem das variáveis de ambiente definidas no `.env`
- `backup.sh` requer que o `mongodump` esteja instalado no servidor
