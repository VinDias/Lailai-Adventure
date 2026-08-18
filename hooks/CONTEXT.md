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

### `useProgress.ts` (Fase 4)
Registra onde o usuário parou (leitura/reprodução) sem inundar o servidor. Usado por `WebtoonReader.tsx` e `VerticalPlayer.tsx`.
- Grava no máximo uma vez a cada 3s (webtoon) ou 10s (vídeo — contra o limitador global de 300 req/15min por IP em `server.js`)
- Descarta a escrita quando a variação é menor que 2% de percentual OU (só para vídeo) menor que 5s de `position`
- Descarrega o pendente incondicionalmente ao desmontar E quando `document.visibilityState` vira `'hidden'` (Android: sair quase nunca é desmontar o React — é apertar Home)
- `WebtoonReader`/`VerticalPlayer` NÃO desmontam ao trocar de capítulo/vídeo (só trocam a prop) — o hook trata isso explicitamente no cleanup do efeito de saída, que roda a cada troca

---

## Observações

- Novos hooks devem ser criados aqui ao extrair lógica reutilizável dos componentes
