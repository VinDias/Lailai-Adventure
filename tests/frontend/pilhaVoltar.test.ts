/**
 * Testes — utils/pilhaVoltar.ts: sentinela única de histórico (no máximo UMA
 * entrada física, independente de quantas camadas estejam empilhadas
 * logicamente) para o botão voltar do Android fechar overlays (um por vez)
 * em vez de fechar o app direto.
 *
 * Sobre o mock de history.back(): jsdom processa history.back() de forma
 * ASSÍNCRONA (comprovado à parte, e também em Chromium real: o popstate
 * real leva algum tempo pra chegar — nem um microtask nem um macrotask
 * curto bastam). Deixar isso rolar de verdade nos testes seria lento e
 * instável. Por isso history.back é mockado (sem operação) em todo teste
 * daqui, e o "voltar do Android" é simulado diretamente com
 * window.dispatchEvent(new PopStateEvent('popstate')) — o listener do
 * módulo não tem como diferenciar esse evento de um disparado de verdade
 * pelo navegador. O desregistro de camada agora NUNCA chama history.back()
 * na hora (é o próprio ponto da correção — ver cabeçalho do módulo) — ele
 * agenda uma reavaliação por microtask, então testes que dependem dela
 * usam `await flush()` (um `await Promise.resolve()`) para deixá-la rodar
 * antes de checar o resultado.
 *
 * A corrida real que motivou o redesenho (fechar uma camada e abrir outra
 * no MESMO commit React — ex.: abrir um episódio de dentro do modal de
 * detalhe da série fecha o modal e abre o player ao mesmo tempo) foi
 * validada separadamente em Chromium real via Playwright (não dá pra
 * reproduzir com fidelidade em jsdom, que não implementa a assincronia real
 * do history.back() do jeito que os navegadores implementam) — ver o
 * relatório da tarefa.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { registrarCamada, useCamadaVoltar, __resetParaTeste } from '../../utils/pilhaVoltar';

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
// Deixa a microtask agendada por um desregistro (queueMicrotask) rodar.
const flush = () => Promise.resolve();

describe('pilhaVoltar', () => {
  let backSpy: ReturnType<typeof vi.spyOn>;
  let pushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // O módulo guarda pilha/sentinelaAtiva/consumindo como singleton (ver
    // __resetParaTeste) — sem zerar, um teste que deixa camada aberta de
    // propósito (pra testar outra coisa) vazaria sentinelaAtiva=true pro
    // próximo teste.
    __resetParaTeste();
    // Sem isso, o back() real (assíncrono, ver comentário do topo) podia
    // disparar um popstate atrasado durante outro teste.
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    // pushState continua rodando de verdade (é síncrono, sem risco de
    // vazar entre testes) — só observado, para checar quantas vezes o
    // módulo empilhou/re-empilhou a sentinela.
    pushSpy = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('transição 0→1 camadas faz exatamente 1 pushState (cria a sentinela)', () => {
    registrarCamada(vi.fn());
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('segunda camada NÃO faz pushState (reaproveita a sentinela já ativa)', () => {
    registrarCamada(vi.fn());
    registrarCamada(vi.fn());
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('popstate com 2 camadas fecha só o topo e re-empilha a sentinela (1 pushState a mais)', () => {
    const fechar1 = vi.fn();
    const fechar2 = vi.fn();
    registrarCamada(fechar1);
    registrarCamada(fechar2);
    pushSpy.mockClear();

    disparaVoltar();
    expect(fechar2).toHaveBeenCalledTimes(1);
    expect(fechar1).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(1); // re-empilhou pra a camada restante
  });

  it('popstate com 1 camada fecha e NÃO re-empilha (próximo voltar sai do app)', () => {
    const fechar = vi.fn();
    registrarCamada(fechar);
    pushSpy.mockClear();

    disparaVoltar();
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('duas camadas, dois voltares seguidos: o 1º fecha o topo (re-empilha), o 2º fecha a de baixo (não re-empilha)', () => {
    const fechar1 = vi.fn();
    const fechar2 = vi.fn();
    registrarCamada(fechar1);
    registrarCamada(fechar2);
    pushSpy.mockClear();

    disparaVoltar();
    expect(fechar2).toHaveBeenCalledTimes(1);
    expect(fechar1).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(1);

    pushSpy.mockClear();
    disparaVoltar();
    expect(fechar1).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('fechar uma camada e abrir outra no MESMO tick síncrono (caso modal→player): zero back() e zero pushState extra', async () => {
    const fecharModal = vi.fn();
    const desregistrarModal = registrarCamada(fecharModal);
    pushSpy.mockClear();

    // Mesma sequência síncrona que o React garante dentro de um commit:
    // todos os cleanups (desregistro do modal) antes de todos os setups
    // novos (registro do player) — sem nenhum await entre os dois.
    desregistrarModal();
    const fecharPlayer = vi.fn();
    registrarCamada(fecharPlayer);

    // A reavaliação da sentinela (queueMicrotask) só roda depois disso.
    await flush();

    expect(backSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled(); // reaproveitou a sentinela existente
    expect(fecharModal).not.toHaveBeenCalled();
    expect(fecharPlayer).not.toHaveBeenCalled();

    // E o próximo voltar de verdade fecha o player (não sai do app).
    disparaVoltar();
    expect(fecharPlayer).toHaveBeenCalledTimes(1);
    expect(fecharModal).not.toHaveBeenCalled();
  });

  it('fechamento programático da última camada: back() só depois da microtask, nunca na hora', async () => {
    const desregistrar = registrarCamada(vi.fn());
    desregistrar();

    expect(backSpy).not.toHaveBeenCalled(); // não é síncrono — é o ponto da correção
    await flush();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('recuperação: back() pendente + registrar antes do popstate atrasado chegar → o swallow repõe a sentinela', async () => {
    const desregistrar = registrarCamada(vi.fn());
    desregistrar();
    await flush(); // dispara o back() pendente (mockado — não gera popstate sozinho aqui)
    expect(backSpy).toHaveBeenCalledTimes(1);
    pushSpy.mockClear();

    // Usuário reabre algo antes do popstate atrasado (assíncrono, na vida
    // real) chegar de volta.
    const fecharNova = vi.fn();
    registrarCamada(fecharNova);
    expect(pushSpy).not.toHaveBeenCalled(); // reaproveitou a sentinela (ainda ativa)

    // O popstate atrasado finalmente chega.
    disparaVoltar();
    expect(fecharNova).not.toHaveBeenCalled(); // engolido — é o eco do nosso back()
    expect(pushSpy).toHaveBeenCalledTimes(1); // repôs a sentinela pra camada que sobrou
  });

  it('popstate com pilha vazia e nada pendente não lança (ex.: state órfão de reload)', () => {
    expect(() => disparaVoltar()).not.toThrow();
    expect(() => disparaVoltar()).not.toThrow();
  });

  it('StrictMode: registrar → desregistrar → registrar no mesmo tick faz 1 pushState só, 0 back()', async () => {
    const fechar = vi.fn();
    const desregistrarPrimeiro = registrarCamada(fechar);
    desregistrarPrimeiro();
    registrarCamada(fechar);

    expect(pushSpy).toHaveBeenCalledTimes(1);
    await flush();
    expect(backSpy).not.toHaveBeenCalled();

    disparaVoltar();
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  describe('useCamadaVoltar', () => {
    it('registra ao abrir e desregistra ao fechar/desmontar', async () => {
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
      await flush();
      // já foi fechada pelo popstate — desmontar não deve tentar consumir de novo
      expect(backSpy).not.toHaveBeenCalled();
    });

    it('React: fechar uma camada e abrir outra no mesmo commit (modal→player) não mexe no histórico', async () => {
      const fecharModal = vi.fn();
      const fecharPlayer = vi.fn();
      let tela: 'modal' | 'player' = 'modal';
      const Comp: React.FC = () => {
        useCamadaVoltar(tela === 'modal', fecharModal);
        useCamadaVoltar(tela === 'player', fecharPlayer);
        return null;
      };

      const { rerender } = render(React.createElement(Comp));
      expect(pushSpy).toHaveBeenCalledTimes(1); // abriu o "modal"

      pushSpy.mockClear();
      tela = 'player'; // um único re-render: cleanup do modal + setup do player, mesmo commit
      rerender(React.createElement(Comp));

      expect(pushSpy).not.toHaveBeenCalled();
      await flush();
      expect(backSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();

      // Confirma quem fecha no próximo voltar: o player, não o app inteiro.
      disparaVoltar();
      expect(fecharPlayer).toHaveBeenCalledTimes(1);
      expect(fecharModal).not.toHaveBeenCalled();
    });

    it('StrictMode real (dupla montagem do React) faz 1 pushState só', async () => {
      const fechar = vi.fn();
      const Comp: React.FC = () => {
        useCamadaVoltar(true, fechar);
        return null;
      };

      render(React.createElement(React.StrictMode, null, React.createElement(Comp)));
      expect(pushSpy).toHaveBeenCalledTimes(1);
      await flush();
      expect(backSpy).not.toHaveBeenCalled();

      disparaVoltar();
      expect(fechar).toHaveBeenCalledTimes(1);
    });

    it('fechamento programático (aberto vira false) não afeta outra camada aberta', async () => {
      const fecharDeBaixo = vi.fn();
      registrarCamada(fecharDeBaixo); // camada externa, já aberta
      pushSpy.mockClear();

      let aberto = true;
      const fechar = vi.fn();
      const Comp: React.FC = () => {
        useCamadaVoltar(aberto, fechar);
        return null;
      };
      const { rerender } = render(React.createElement(Comp));
      expect(pushSpy).not.toHaveBeenCalled(); // reaproveitou a sentinela da camada externa

      aberto = false;
      rerender(React.createElement(Comp)); // ex.: clique no X do próprio componente
      await flush();
      expect(backSpy).not.toHaveBeenCalled(); // ainda sobra a camada de baixo — nada a consumir

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
    __resetParaTeste();
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
