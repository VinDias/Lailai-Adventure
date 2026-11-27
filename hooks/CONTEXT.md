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

### `useTelaCheiaNaLeitura.ts` (retorno do cliente, 27/11/2026)
Põe a PÁGINA em tela cheia enquanto o `WebtoonReader` está na tela, para esconder a hora e a bateria no celular e no app Android (TWA).
- Só em aparelho de toque (`pointer: coarse`) e onde `documentElement.requestFullscreen` existe; no computador e no iPhone não faz nada
- Pede ao montar; se o navegador recusar (sem toque recente), pede de novo no primeiro toque na área de leitura (toque em botão não pede)
- Sai da tela cheia ao desmontar, só se foi ele que entrou
- O "voltar" do Android em tela cheia só tira da tela cheia: com a página visível, o hook chama `aoSairPeloSistema` (o leitor passa o `onClose`), para o leitor fechar com um voltar; com a página oculta ou recém-voltada (troca de app), não fecha
- Não usado no `VerticalPlayer` (lá a tela cheia é do botão) nem na prévia do moderador
- `public/manifest.json` continua `"display": "standalone"` de propósito: `fullscreen` esconderia a barra no app INTEIRO (PWA instalada) e não muda a TWA sem gerar outro APK

---

## Observações

- Novos hooks devem ser criados aqui ao extrair lógica reutilizável dos componentes
