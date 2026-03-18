# src/

## Responsabilidade

Ponto de entrada do frontend React e camada de estilos globais.

## Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `index.css` | Estilos globais com as diretivas do Tailwind CSS (`@tailwind base/components/utilities`) |
| `App.tsx` | Componente raiz da aplicação — gerencia todas as views e navegação principal |
| `index.tsx` | Entry point do React DOM — renderiza `<App>` e registra o service worker do PWA |
| `constants.tsx` | Constantes globais: paleta de cores, definições de ícones e configurações de UI |

## Observações

- `App.tsx` controla o estado de `viewMode` que determina qual componente é renderizado (home, hqcine, vcine, hiqua, perfil, admin, etc.)
- O service worker registrado em `index.tsx` habilita o funcionamento offline e a instalação como PWA
- Os estilos em `index.css` são mínimos — toda a estilização é feita via classes Tailwind diretamente nos componentes
