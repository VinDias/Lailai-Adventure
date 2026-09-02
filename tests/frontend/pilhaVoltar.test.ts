/**
 * Testes — utils/pilhaVoltar.ts: pilha de camadas sincronizada com o
 * History API, para o botão voltar do Android fechar overlays (um por vez)
 * em vez de fechar o app direto.
 *
 * Sobre o mock de history.back(): jsdom processa history.back() de forma
 * ASSÍNCRONA (comprovado à parte: o popstate real só chega dezenas/centenas
 * de ms depois — nem um setTimeout(0) nem um microtask bastam). Deixar isso
 * rolar de verdade nos testes seria lento e instável (um popstate perdido
 * podia chegar atrasado no MEIO de um teste seguinte, já que a pilha do
 * módulo é um singleton compartilhado por todo o arquivo). Por isso
 * history.back é mockado (sem operação) em todo teste, e o "voltar do
 * Android" é simulado diretamente com
 * window.dispatchEvent(new PopStateEvent('popstate')) — o listener do
 * módulo não tem como diferenciar esse evento de um disparado de verdade
 * pelo navegador.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { registrarCamada, useCamadaVoltar } from '../../utils/pilhaVoltar';

// Mocks da integração leve (descrita mais abaixo) — ficam no topo por causa
// do hoisting do vi.mock, mas só são usados pelo describe de integração.
vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/Ads', () => ({ default: () => null }));
vi.mock('../../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getRecommendations: vi.fn().mockResolvedValue([]),
    getEpisodesBySeries: vi.fn().mockResolvedValue([]),
    getContinueList: vi.fn().mockResolvedValue([]),
    getFavorites: vi.fn().mockResolvedValue([]),
    getSeriesVote: vi.fn().mockResolvedValue({ myVote: null, likes: 0 }),
    voteSeries: vi.fn().mockResolvedValue({ success: true }),
    removeSeriesVote: vi.fn().mockResolvedValue({ success: true }),
    addFavorite: vi.fn().mockResolvedValue({ favorited: true }),
    removeFavorite: vi.fn().mockResolvedValue({ favorited: false }),
    getSuperReaderMin: vi.fn().mockResolvedValue({ minCents: 500 }),
    createSuperReaderSession: vi.fn(),
  },
}));

import { api } from '../../services/api';
import HQCine from '../../components/HQCine';

const disparaVoltar = () => window.dispatchEvent(new PopStateEvent('popstate'));

describe('pilhaVoltar', () => {
  let backSpy: ReturnType<typeof vi.spyOn>;
  let pushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Sem isso, o back() real de um teste podia disparar um popstate
    // atrasado (assíncrono, ver comentário do topo) durante outro teste.
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    // pushState continua rodando de verdade (é síncrono, sem risco de
    // vazar entre testes) — só observado, para os testes que checam quantas
    // vezes o módulo empilhou.
    pushSpy = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registrar → popstate → fechar chamado e pilha vazia', () => {
    const fechar = vi.fn();
    registrarCamada(fechar);
    expect(pushSpy).toHaveBeenCalledTimes(1);

    disparaVoltar();
    expect(fechar).toHaveBeenCalledTimes(1);

    // pilha já vazia: outro popstate não pode lançar nem fechar de novo
    // (também cobre o caso de state órfão sobrando de um reload).
    expect(() => disparaVoltar()).not.toThrow();
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it('duas camadas: popstate fecha só a de cima; o segundo fecha a de baixo', () => {
    const fechar1 = vi.fn();
    const fechar2 = vi.fn();
    registrarCamada(fechar1);
    registrarCamada(fechar2);

    disparaVoltar();
    expect(fechar2).toHaveBeenCalledTimes(1);
    expect(fechar1).not.toHaveBeenCalled();

    disparaVoltar();
    expect(fechar1).toHaveBeenCalledTimes(1);
  });

  it('fechamento programático (desregistro) consome a entrada sem disparar fechar de outra camada', () => {
    const fechar1 = vi.fn();
    const fechar2 = vi.fn();
    registrarCamada(fechar1);
    const desregistrar2 = registrarCamada(fechar2);

    // Ex.: clique no X da camada de cima — não é um popstate.
    desregistrar2();
    expect(backSpy).toHaveBeenCalledTimes(1); // consumiu a entrada dela
    expect(fechar2).not.toHaveBeenCalled(); // desregistro não chama fechar de novo

    // O popstate que esse history.back() geraria de verdade (mockado aqui,
    // ver beforeEach) precisa ser absorvido em silêncio pela flag interna —
    // sem ela, fecharia a camada 1 por engano (o problema bidirecional
    // documentado no módulo).
    disparaVoltar();
    expect(fechar1).not.toHaveBeenCalled();

    // Um voltar de verdade, na sequência, tem que fechar a camada 1 normalmente.
    disparaVoltar();
    expect(fechar1).toHaveBeenCalledTimes(1);
  });

  it('popstate com pilha vazia não lança (ex.: state órfão de reload)', () => {
    expect(() => disparaVoltar()).not.toThrow();
    expect(() => disparaVoltar()).not.toThrow();
  });

  it('desregistro depois que a própria camada já fechou por popstate não chama history.back de novo', () => {
    const fechar = vi.fn();
    const desregistrar = registrarCamada(fechar);

    disparaVoltar(); // "voltar" de verdade fecha a camada
    expect(fechar).toHaveBeenCalledTimes(1);
    backSpy.mockClear();

    // Cleanup do useEffect rodando depois (ex.: desmontagem) — a entrada já
    // foi consumida pela navegação real acima, não há o que consumir de novo.
    desregistrar();
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('StrictMode: registrar → desregistrar → registrar no mesmo tick deixa só UMA entrada ativa', () => {
    const fechar = vi.fn();
    const desregistrarPrimeiro = registrarCamada(fechar);
    desregistrarPrimeiro();
    registrarCamada(fechar);

    expect(pushSpy).toHaveBeenCalledTimes(2); // cada registrarCamada empilha uma vez
    expect(backSpy).toHaveBeenCalledTimes(1); // o desregistro do meio consumiu a primeira

    // O history.back() do desregistro do meio está mockado (ver beforeEach)
    // — na vida real ele dispararia exatamente um popstate, mais cedo ou
    // mais tarde, consumido em silêncio pela flag. Aqui simulamos esse
    // popstate primeiro (é o que o `ignorarProximoPopstate` está esperando).
    disparaVoltar();
    expect(fechar).not.toHaveBeenCalled();

    // Prova comportamental de que só sobrou UMA camada ativa: o PRÓXIMO
    // voltar (de verdade) fecha, e um voltar seguinte não acha mais nada —
    // não sobrou uma "camada fantasma" da dupla montagem.
    disparaVoltar();
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(() => disparaVoltar()).not.toThrow();
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  describe('useCamadaVoltar', () => {
    it('registra ao abrir e desregistra ao fechar/desmontar', () => {
      const fechar = vi.fn();
      let aberto = false;
      const Comp: React.FC = () => {
        useCamadaVoltar(aberto, fechar);
        return null;
      };

      const { rerender, unmount } = render(React.createElement(Comp));
      expect(pushSpy).not.toHaveBeenCalled();

      aberto = true;
      rerender(React.createElement(Comp));
      expect(pushSpy).toHaveBeenCalledTimes(1);

      disparaVoltar();
      expect(fechar).toHaveBeenCalledTimes(1);

      unmount();
      // já foi fechada pelo popstate — desmontar não deve tentar consumir de novo
      expect(backSpy).not.toHaveBeenCalled();
    });

    it('StrictMode real (dupla montagem do React) não duplica a entrada', () => {
      const fechar = vi.fn();
      const Comp: React.FC = () => {
        useCamadaVoltar(true, fechar);
        return null;
      };

      render(React.createElement(React.StrictMode, null, React.createElement(Comp)));
      // Em dev, o StrictMode monta, desmonta e remonta o componente uma vez a
      // mais só para achar efeitos não idempotentes — isso já rodou (síncrono
      // dentro do render acima) e armou a flag de ignorar um popstate (o
      // history.back() do desmonte extra, mockado — ver beforeEach). Consome
      // esse popstate simulado primeiro, exatamente como a vida real faria
      // (mais cedo ou mais tarde, um só) antes do voltar de verdade do usuário.
      disparaVoltar();
      expect(fechar).not.toHaveBeenCalled();

      // O registro final ainda tem que ser só UM: este voltar fecha.
      disparaVoltar();
      expect(fechar).toHaveBeenCalledTimes(1);
    });

    it('fechamento programático (aberto vira false) consome a entrada sem afetar outra camada', () => {
      const fecharDeBaixo = vi.fn();
      registrarCamada(fecharDeBaixo); // camada externa, simula outro overlay já aberto

      let aberto = true;
      const fechar = vi.fn();
      const Comp: React.FC = () => {
        useCamadaVoltar(aberto, fechar);
        return null;
      };
      const { rerender } = render(React.createElement(Comp));
      expect(pushSpy).toHaveBeenCalledTimes(2); // camada externa + esta

      aberto = false;
      rerender(React.createElement(Comp)); // ex.: clique no X do próprio componente
      // Esse fechamento programático já consumiu (history.back() mockado —
      // ver beforeEach) a entrada dele; simula o popstate que isso geraria
      // de verdade antes do voltar real do usuário (mesmo raciocínio de
      // sempre: um history.back() sempre gera exatamente um popstate).
      disparaVoltar();
      expect(fecharDeBaixo).not.toHaveBeenCalled();
      expect(fechar).not.toHaveBeenCalled();

      disparaVoltar();
      expect(fecharDeBaixo).toHaveBeenCalledTimes(1); // fechou a de baixo, não a que já foi embora
      expect(fechar).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integração leve: HQCine de verdade, modal de detalhe fechando por popstate.
// ═══════════════════════════════════════════════════════════════════════════

describe('pilhaVoltar — integração num feed (HQCine)', () => {
  beforeEach(() => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abre o modal de detalhe da série e o popstate fecha (só o modal, não a página inteira)', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([
      { _id: 's1', title: 'Série Teste', genre: 'Ação', description: 'desc', cover_image: '', content_type: 'hqcine', isPremium: false, isPublished: true } as any,
    ]);

    render(React.createElement(HQCine, { user: null, onOpen: vi.fn() }));

    await waitFor(() => expect(screen.getByText('Série Teste')).toBeInTheDocument());
    // Só o card da grade por enquanto — modal ainda fechado.
    expect(screen.getAllByText('Série Teste')).toHaveLength(1);

    fireEvent.click(screen.getByText('Série Teste'));
    // Abrir o modal monta um segundo "Série Teste" (título dentro dele).
    await waitFor(() => expect(screen.getAllByText('Série Teste')).toHaveLength(2));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(screen.getAllByText('Série Teste')).toHaveLength(1));
  });
});
