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

---

## Observações

- Nenhum desses scripts é executado automaticamente — todos requerem execução manual
- `seedAdmin.js` e `validateEnv.js` dependem das variáveis de ambiente definidas no `.env`
- `backup.sh` requer que o `mongodump` esteja instalado no servidor
