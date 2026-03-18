# validators/

## Responsabilidade

Schemas de validação de dados de entrada usando a biblioteca **Joi**. Garante que os dados recebidos pelas rotas do backend estejam no formato correto antes de serem persistidos.

---

## Arquivos

### `contentValidator.js`
Validação de criação e edição de conteúdo.
- Schema para criação de **séries**: valida campos obrigatórios (`title`, `type`), formatos e restrições
- Schema para criação de **episódios**: valida `episodeNumber`, `seriesId`, URLs de mídia e flags de premium/publicação
- Retorna erro 400 com mensagem descritiva se a validação falhar

---

## Observações

- Usado como middleware nas rotas `POST /series` e `POST /episodes` em `routes/content.js`
- A validação ocorre **antes** de qualquer lógica de negócio ou acesso ao banco de dados
- Atualmente cobre apenas criação de conteúdo — outras rotas fazem validação manual ou nenhuma
