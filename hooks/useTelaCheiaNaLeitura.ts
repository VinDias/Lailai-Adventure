import { useEffect, useRef } from 'react';

/**
 * Tela cheia durante a leitura do quadrinho (retorno do cliente em
 * 27/11/2026: "esconder a hora e a duração da bateria no momento da
 * leitura"). No app Android (uma TWA) e no Chrome do celular a Fullscreen API
 * esconde a barra de status (hora, bateria) e a barra de navegação.
 *
 * COMO FUNCIONA
 * - Só em aparelho de toque (`pointer: coarse`) e só onde a API existe. No
 *   computador nada muda (ninguém pediu o leitor em tela cheia lá, e o
 *   navegador mostraria o aviso "pressione Esc"). O iPhone não tem a API para
 *   páginas: lá nada acontece.
 * - A tela cheia é pedida para a PÁGINA inteira (`documentElement`), não para
 *   o leitor: a rolagem do leitor, o cabeçalho dele e qualquer coisa que abra
 *   por cima continuam como são.
 * - O navegador só aceita o pedido logo depois de um toque. Ao abrir o leitor
 *   o toque que abriu o capítulo costuma valer; se não valer (anúncio antes,
 *   carregamento demorado), o primeiro toque na área de leitura pede de novo.
 *   Toque em botão não pede (o botão de fechar não pisca a tela cheia).
 * - Ao fechar o leitor, sai da tela cheia, se foi ele que entrou.
 * - Botão voltar: no Android o primeiro "voltar" em tela cheia é consumido
 *   pelo navegador para SAIR da tela cheia, sem avisar a página. Para o
 *   leitor continuar fechando com UM voltar, a saída da tela cheia com a
 *   página visível chama `aoSairPeloSistema` (o leitor passa o próprio
 *   fechar). Saída com a página oculta ou recém-voltada (troca de app, tela
 *   bloqueada) NÃO fecha o leitor: o próximo toque volta à tela cheia.
 *
 * O QUE SÓ SE CONFERE NO APARELHO: se a barra some de fato na TWA instalada,
 * o aviso de tela cheia do Chrome ao entrar, e o voltar em um toque.
 */

// Depois de a página voltar a ficar visível, uma saída da tela cheia dentro
// deste intervalo é tratada como efeito da troca de app, não como "voltar".
const JANELA_DE_VOLTA_MS = 1500;

export function ehAparelhoDeToque(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function useTelaCheiaNaLeitura(ativo: boolean, aoSairPeloSistema?: () => void): void {
  const aoSairRef = useRef(aoSairPeloSistema);
  aoSairRef.current = aoSairPeloSistema;

  useEffect(() => {
    if (!ativo || typeof document === 'undefined') return;
    const raiz = document.documentElement as HTMLElement & { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
    if (typeof raiz.requestFullscreen !== 'function' || !ehAparelhoDeToque()) return;

    let pedindo = false;     // há um pedido de tela cheia sem resposta
    let entrou = false;      // a tela cheia atual é deste leitor
    let desistiu = false;    // o leitor saiu de propósito (voltar): não insiste
    let desmontado = false;
    let visivelDesde = document.visibilityState === 'visible' ? 0 : Number.POSITIVE_INFINITY;

    const sair = () => {
      if (document.fullscreenElement !== raiz || typeof document.exitFullscreen !== 'function') return;
      try { Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch { /* já fora */ }
    };

    const pedir = () => {
      if (desmontado || desistiu || pedindo || document.fullscreenElement) return;
      pedindo = true;
      let resposta: Promise<void> | undefined;
      try {
        resposta = raiz.requestFullscreen!({ navigationUI: 'hide' });
      } catch {
        pedindo = false;
        return;
      }
      Promise.resolve(resposta).then(() => {
        pedindo = false;
        entrou = true;
        // O leitor fechou enquanto o navegador ainda respondia.
        if (desmontado) sair();
      }).catch(() => { pedindo = false; });
    };

    const aoMudar = () => {
      if (document.fullscreenElement) {
        if (pedindo && document.fullscreenElement === raiz) entrou = true;
        return;
      }
      if (!entrou) return;
      entrou = false;
      const oculta = document.visibilityState !== 'visible';
      const acabouDeVoltar = Date.now() - visivelDesde < JANELA_DE_VOLTA_MS;
      // Troca de app ou tela bloqueada: fica no leitor; o próximo toque na
      // leitura volta à tela cheia.
      if (oculta || acabouDeVoltar) return;
      // "Voltar" (ou Esc): o leitor quis sair.
      desistiu = true;
      aoSairRef.current?.();
    };

    const aoMudarVisibilidade = () => {
      visivelDesde = document.visibilityState === 'visible' ? Date.now() : Number.POSITIVE_INFINITY;
    };

    const aoTocar = (e: Event) => {
      const alvo = e.target as Element | null;
      if (alvo && typeof alvo.closest === 'function' && alvo.closest('button, a, input, select, textarea, label')) return;
      pedir();
    };

    document.addEventListener('fullscreenchange', aoMudar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    document.addEventListener('click', aoTocar, true);
    pedir();

    return () => {
      desmontado = true;
      document.removeEventListener('fullscreenchange', aoMudar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      document.removeEventListener('click', aoTocar, true);
      if (entrou) sair();
    };
  }, [ativo]);
}
