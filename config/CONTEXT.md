# config/

## Responsabilidade

Configurações e constantes centralizadas da aplicação frontend.

---

## Arquivos

### `api.ts`
URL base da API backend.
- Exporta a constante `API_URL` usada por `services/api.ts` em todas as requisições HTTP
- Lê a variável de ambiente `VITE_API_URL` (injetada pelo Vite no build)
- Fallback padrão: `http://localhost:3000/api` para desenvolvimento local

---

## Observações

- Configurações do backend (como conexão com banco de dados, chaves de API, etc.) são gerenciadas diretamente via variáveis de ambiente no `server.js` e nos serviços, sem arquivo de config separado
- O `tailwind.config.js` e `vite.config.ts` na raiz também são arquivos de configuração, mas pertencem ao tooling do projeto, não à lógica da aplicação
