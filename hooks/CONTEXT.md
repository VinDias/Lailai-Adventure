# hooks/

## Responsabilidade

Custom hooks React que encapsulam lógica de estado reutilizável entre componentes.

---

## Arquivos

### `useTheme.ts`
Gerenciamento do tema da aplicação (claro / escuro).
- Lê e persiste a preferência do usuário no `localStorage`
- Aplica/remove a classe `dark` no elemento raiz do DOM (estratégia class-based do Tailwind)
- Expõe `theme` (estado atual) e `toggleTheme` (função de alternância)
- Usado pelo componente `ThemeToggle.tsx`

---

## Observações

- A pasta está pequena atualmente — lógica de estado mais complexa está embutida diretamente nos componentes (principalmente em `VerticalPlayer.tsx` e `WebtoonReader.tsx`)
- Novos hooks devem ser criados aqui ao extrair lógica reutilizável dos componentes
