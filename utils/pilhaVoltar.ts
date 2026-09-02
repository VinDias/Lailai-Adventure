/**
 * utils/pilhaVoltar.ts — botão voltar do Android fecha camadas antes de sair do app.
 *
 * O app é uma SPA sem gestão de histórico: toda navegação (modal de detalhe
 * de série, leitor, player, busca, agenda, modal legal, aba atual) é estado
 * React puro em memória. Sem entradas no History API, o botão voltar do
 * Android chama history.back() sem ter para onde voltar — o WebView/TWA
 * simplesmente fecha o app, mesmo com um overlay aberto na tela.
 *
 * Este módulo mantém uma pilha própria de "camadas" (cada overlay/aba aberta
 * conta como uma), sincronizada com o History API: registrar uma camada
 * empilha e faz UM history.pushState; o voltar do Android dispara um evento
 * `popstate`, que este módulo escuta para desempilhar e fechar a camada mais
 * recente — em vez de deixar o navegador simplesmente navegar (ou fechar o
 * app, na ausência de para onde ir).
 *
 * Pilha vazia = nada nosso para fechar: o listener não faz nada (não chama
 * preventDefault nem stopPropagation) e o popstate segue seu curso normal —
 * é assim que o App.tsx consegue ter SEU PRÓPRIO uso deste mesmo mecanismo
 * (a aba atual também é só mais uma camada, registrada com o hook abaixo;
 * ver App.tsx) e é assim que um popstate de state órfão (ex.: reload da
 * página com uma entrada de histórico de uma sessão anterior) não quebra
 * nada — ver `onPopState` abaixo.
 *
 * ## O problema bidirecional do fechamento programático
 *
 * Uma camada pode fechar de duas formas, e as duas precisam terminar no
 * MESMO estado do histórico:
 *   1. Voltar do Android → popstate → desempilha e chama o `fechar` dela.
 *   2. Fechamento programático (clique no X, navegação para outra tela,
 *      desmontagem do componente) → chama `fechar` diretamente → precisa
 *      TAMBÉM consumir a entrada de histórico que essa camada empilhou,
 *      senão ela fica "sobrando": um voltar seguinte cairia nela e fecharia
 *      a camada errada (ou a aba, ou o app) no lugar de simplesmente não
 *      fazer nada de diferente do que o usuário já viu.
 *
 * Consumir essa entrada (caminho 2) significa chamar history.back() — mas
 * isso TAMBÉM dispara um popstate, que cairia no listener deste módulo e
 * tentaria desempilhar de novo, fechando a PRÓXIMA camada por engano (ou,
 * de pilha vazia, vazando pro tratamento de aba do App.tsx). A flag
 * `ignorarProximoPopstate` existe só para isso: é ligada imediatamente antes
 * do history.back() programático, e o listener, ao vê-la ligada, consome
 * esse popstate em silêncio (desliga a flag e sai) em vez de desempilhar.
 *
 * Cada camada é identificada por um objeto próprio (não pela função
 * `fechar` em si) — assim, se o popstate real do usuário já desempilhou e
 * fechou uma camada, o desregistro programático que vem depois (o cleanup
 * do useEffect, ver `useCamadaVoltar`) encontra a camada ausente da pilha
 * e não tenta consumir a entrada de novo (ela já foi consumida pela
 * navegação real que gerou o popstate).
 */

import React from 'react';

type Fechar = () => void;

interface Camada {
  fechar: Fechar;
}

let pilha: Camada[] = [];

// Ver "o problema bidirecional" acima.
let ignorarProximoPopstate = false;

function onPopState() {
  if (ignorarProximoPopstate) {
    ignorarProximoPopstate = false;
    return;
  }
  const camada = pilha.pop();
  // Pilha vazia: este popstate não é nosso (aba do App.tsx, ou state órfão
  // de uma sessão/reload anterior) — repassa, sem lançar e sem mexer em nada.
  if (!camada) return;
  camada.fechar();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
}

/**
 * Empilha uma camada e faz UM history.pushState. Devolve uma função de
 * desregistro, para chamar no cleanup de quem registrou (fechamento
 * programático OU desmontagem) — ela remove a camada da pilha e consome a
 * entrada de histórico correspondente (ver o mecanismo da flag acima), a
 * menos que a camada já tenha sido removida por um popstate real, caso em
 * que não há nada a consumir.
 *
 * Uso direto é raro — prefira o hook `useCamadaVoltar` abaixo, que cuida do
 * registro/desregistro no ciclo de vida do componente (incluindo
 * StrictMode).
 */
export function registrarCamada(fechar: Fechar): () => void {
  const camada: Camada = { fechar };
  pilha.push(camada);
  window.history.pushState({ lorflux: pilha.length }, '');

  let desregistrada = false;
  return function desregistrar() {
    if (desregistrada) return;
    desregistrada = true;

    const idx = pilha.indexOf(camada);
    if (idx === -1) {
      // Já foi removida por um popstate real (o próprio usuário apertou
      // voltar) — a entrada de histórico já foi consumida por essa
      // navegação. Nada a fazer.
      return;
    }
    pilha.splice(idx, 1);

    ignorarProximoPopstate = true;
    window.history.back();
  };
}

/**
 * ÚNICA API que os componentes devem usar. Registra uma camada quando
 * `aberto` vira `true` e desregistra no cleanup — fechamento programático
 * (ex.: clique no X que muda o estado que controla `aberto`) OU
 * desmontagem do componente (ex.: trocar de aba enquanto um modal interno
 * estava aberto).
 *
 * `fechar` é lido por uma ref atualizada a cada render (não entra no array
 * de dependências do efeito que registra a camada): assim, um popstate
 * chama sempre a versão mais recente de `fechar` sem precisar desregistrar
 * e registrar de novo a cada render só porque a função mudou de
 * referência — só quando `aberto` de fato vira true é que empilhamos.
 *
 * À prova de StrictMode: em dev, o efeito de montagem roda
 * registrar→desregistrar→registrar no mesmo tick; como o desregistro do
 * meio acontece ANTES do segundo registro, a pilha nunca chega a ter duas
 * entradas para a mesma camada lógica — sobra só a última.
 */
export function useCamadaVoltar(aberto: boolean, fechar: Fechar): void {
  const fecharRef = React.useRef(fechar);
  React.useEffect(() => {
    fecharRef.current = fechar;
  }, [fechar]);

  React.useEffect(() => {
    if (!aberto) return;
    const desregistrar = registrarCamada(() => fecharRef.current());
    return desregistrar;
  }, [aberto]);
}
