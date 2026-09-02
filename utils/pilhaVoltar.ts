/**
 * utils/pilhaVoltar.ts — botão voltar do Android fecha camadas antes de sair do app.
 *
 * O app é uma SPA sem gestão de histórico: toda navegação (modal de detalhe
 * de série, leitor, player, busca, agenda, modal legal, aba atual) é estado
 * React puro em memória. Sem entradas no History API, o botão voltar do
 * Android chama history.back() sem ter para onde voltar — o WebView/TWA
 * simplesmente fecha o app, mesmo com um overlay aberto na tela.
 *
 * ## Por que UMA sentinela só (não uma entrada de histórico por camada)
 *
 * A primeira versão deste módulo empilhava uma entrada de histórico POR
 * camada (um pushState a cada registro, um history.back() a cada
 * desregistro). Isso quebrou num caso real e comum: abrir um episódio de
 * dentro do modal de detalhe da série fecha o modal E abre o player no
 * MESMO commit do React — cleanups e efeitos novos de um commit rodam
 * nessa ordem (garantia do React: todos os cleanups antes de todos os
 * setups), então o desregistro do modal (que chamava history.back(),
 * assíncrono) e o registro do player (que chamava history.pushState(),
 * síncrono) aconteciam nessa sequência, no mesmo tick síncrono.
 *
 * Medido empiricamente em Chromium real (não é teoria): o back() assíncrono
 * NÃO resolve contra a posição do histórico no momento em que foi chamado —
 * resolve contra a posição em que o navegador está quando ele finalmente
 * EXECUTA, e essa posição já tinha avançado por causa do pushState síncrono
 * do player, que rodou logo depois, ainda no mesmo tick. Resultado:
 * consistentemente 2 posições atrás do esperado — o primeiro voltar do
 * usuário saía do app com o player ainda aberto. O bug original, disfarçado.
 *
 * A correção estrutural: manter NO MÁXIMO UMA entrada física de histórico
 * (a "sentinela"), independente de quantas camadas estejam empilhadas
 * logicamente — isso vive só em `pilha`, um array comum em memória, nunca
 * no histórico do navegador. A sentinela é criada apenas na transição 0→1
 * camadas e nunca duplicada enquanto pelo menos uma camada está (ou pode vir
 * a estar) aberta. Fechamento programático NUNCA chama history.back() na
 * hora: agenda uma reavaliação por microtask (queueMicrotask), que roda
 * DEPOIS que todos os cleanups E todos os setups do commit atual já
 * terminaram — inclusive um possível registro de camada nova no mesmo
 * commit (o caso modal→player). Se essa reavaliação encontra a pilha
 * não-vazia, não faz nada: zero chamadas de histórico, a sentinela
 * existente continua servindo para a(s) camada(s) que sobrou(aram). A
 * corrida deixa de existir porque o back() só é chamado quando, depois de
 * toda a poeira do commit assentar, a pilha realmente está vazia — e nesse
 * caso back() é exatamente a semântica certa (não sobrou nada nosso para
 * fechar).
 *
 * ## O que o popstate faz tendo só uma sentinela
 *
 * Cada popstate real do usuário só pode estar consumindo A sentinela (não
 * "uma camada" — não existe mais essa correspondência 1:1), então o
 * listener reage de acordo com o que sobra na pilha lógica depois de fechar
 * o topo:
 *   - Ainda sobra camada? Re-empilha a sentinela SINCRONAMENTE, dentro do
 *     próprio handler — sem isso, o PRÓXIMO voltar não teria mais nenhuma
 *     entrada para consumir e sairia do app com camadas ainda abertas.
 *   - Não sobra nada? Não re-empilha — o PRÓXIMO voltar sai do app, que é
 *     exatamente o comportamento nativo esperado na aba inicial sem overlay.
 *
 * ## A flag `consumindo` e a recuperação
 *
 * Fechamento programático da ÚLTIMA camada agenda um history.back() (via
 * microtask) para consumir a sentinela que não serve mais para nada — mas
 * esse back() ainda é assíncrono (ver acima), e o popstate que ele gera
 * pode chegar bem depois, num tick totalmente separado. Se, nessa janela, o
 * usuário reabrir alguma coisa (uma camada nova registra), a sentinela é
 * reaproveitada — registrarCamada não empilha de novo enquanto
 * `sentinelaAtiva` já for true, mesmo que a pilha tenha passado por zero no
 * meio do caminho. Quando o popstate atrasado finalmente chega, o listener
 * sabe (pela flag `consumindo`) que foi ELE MESMO quem disparou essa
 * navegação, engole o evento em silêncio (não fecha nenhuma camada por
 * engano) e, se a pilha tiver crescido nesse meio tempo, repõe a sentinela
 * na hora — sem isso, a entrada ficaria faltando e um voltar seguinte
 * fecharia o app com a camada nova ainda aberta.
 *
 * ## StrictMode
 *
 * Mount → cleanup → remount do StrictMode em dev são todos síncronos,
 * dentro do mesmo commit — a mesma mecânica do caso modal→player acima
 * cobre isso de graça: o registro do remount vê `sentinelaAtiva` já true
 * (do mount original) e não empilha de novo; a microtask agendada pelo
 * cleanup do meio só roda depois, quando a pilha já tem de volta o item do
 * remount — no-op. Resultado: exatamente 1 pushState para a sequência
 * inteira, 0 chamadas a history.back().
 */

import React from 'react';

type Fechar = () => void;

interface Camada {
  fechar: Fechar;
}

const SENTINELA = { lorflux: 'sentinela' } as const;

let pilha: Camada[] = [];
let sentinelaAtiva = false;
// true entre o momento em que agendamos o history.back() que consome a
// sentinela (pilha vazia) e o popstate correspondente chegar de volta.
let consumindo = false;

// Roda como microtask, sempre depois de todos os efeitos (cleanups + setups)
// do commit React atual — ver "Por que UMA sentinela só" acima.
function avaliarSentinela() {
  if (pilha.length === 0 && sentinelaAtiva && !consumindo) {
    consumindo = true;
    window.history.back();
  }
}

function onPopState() {
  if (consumindo) {
    // Esse popstate é o eco do history.back() que NÓS agendamos (fechamento
    // programático da última camada). Engole — não fecha camada nenhuma.
    consumindo = false;
    sentinelaAtiva = false;
    // Recuperação: uma camada nova registrou nessa janela assíncrona,
    // reaproveitando a sentinela que estava a caminho de ser consumida —
    // repõe a entrada física agora, senão um voltar seguinte sairia do app
    // com ela ainda aberta.
    if (pilha.length > 0) {
      window.history.pushState(SENTINELA, '');
      sentinelaAtiva = true;
    }
    return;
  }

  if (pilha.length > 0) {
    // Voltar de verdade do usuário: fecha só a camada do topo.
    const camada = pilha.pop()!;
    camada.fechar();
    if (pilha.length > 0) {
      // Ainda sobra camada — arma a sentinela de novo para o próximo voltar.
      window.history.pushState(SENTINELA, '');
      sentinelaAtiva = true;
    } else {
      sentinelaAtiva = false;
    }
    return;
  }

  // Pilha vazia e não é a nossa consumição: entrada órfã (ex.: reload de uma
  // sessão anterior). Não lança, não faz nada — esse voltar simplesmente não
  // teve efeito, e é repassado (sem preventDefault/stopPropagation).
  sentinelaAtiva = false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
}

/**
 * Empilha uma camada. Faz UM history.pushState só na transição 0→1 —
 * enquanto a sentinela já estiver ativa (outra camada aberta, ou uma
 * consumição pendente que ainda não voltou, ver cabeçalho do módulo), essa
 * mesma entrada é reaproveitada.
 *
 * Devolve uma função de desregistro, para chamar no cleanup de quem
 * registrou (fechamento programático OU desmontagem). Ela NUNCA chama
 * history.back() na hora — só remove a camada da pilha e agenda uma
 * reavaliação por microtask (ver `avaliarSentinela`).
 *
 * Uso direto é raro — prefira o hook `useCamadaVoltar` abaixo.
 */
export function registrarCamada(fechar: Fechar): () => void {
  const camada: Camada = { fechar };
  pilha.push(camada);
  if (!sentinelaAtiva) {
    window.history.pushState(SENTINELA, '');
    sentinelaAtiva = true;
  }

  let desregistrada = false;
  return function desregistrar() {
    if (desregistrada) return;
    desregistrada = true;
    const idx = pilha.indexOf(camada);
    if (idx !== -1) pilha.splice(idx, 1);
    queueMicrotask(avaliarSentinela);
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

/**
 * SÓ PARA TESTES. O módulo guarda estado próprio (`pilha`, `sentinelaAtiva`,
 * `consumindo`) como singleton — inevitável, já que precisa ser o mesmo
 * estado visto pelo listener de popstate registrado uma única vez no
 * carregamento do módulo. Sem um jeito de zerar esse estado entre testes, um
 * teste que deixa uma camada aberta (de propósito, pra testar outra coisa)
 * vaza sentinelaAtiva=true pro próximo teste do mesmo arquivo. Nunca chame
 * isso fora de teste.
 */
export function __resetParaTeste(): void {
  pilha = [];
  sentinelaAtiva = false;
  consumindo = false;
}
