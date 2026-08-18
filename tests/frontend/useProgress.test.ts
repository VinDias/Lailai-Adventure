import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from '../../hooks/useProgress';
import { api } from '../../services/api';

describe('useProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'saveProgress').mockResolvedValue({} as any);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  const args = { seriesId: 's1', episodeId: 'e1', contentType: 'hiqua' as const };
  const setVisibility = (valor: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: valor, configurable: true });
  };

  it('nao grava antes do intervalo combinado', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.2, 0); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('grava depois do intervalo', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.2, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 's1', episodeId: 'e1', percent: 0.2 }),
    );
  });

  it('ignora mudanca menor que o limiar', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.20, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    act(() => { result.current.report(0.21, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
  });

  it('grava o que estiver pendente ao desmontar', () => {
    const { result, unmount } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.5, 0); });
    unmount();
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 0.5 }),
    );
  });

  it('descarrega ao desmontar mesmo com variacao abaixo do limiar', () => {
    const { result, unmount } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.5, 0); });
    act(() => { vi.advanceTimersByTime(3500); }); // grava 0.50, ultimoGravado = 0.50
    act(() => { result.current.report(0.505, 0); }); // delta de 0.5%, abaixo do limiar de 2%
    unmount();
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 0.505 }),
    );
  });

  // Achado CRITICAL da revisão final: o WebtoonReader não desmonta ao trocar
  // de capítulo — só troca `episodeId`/`seriesId` (ver comentário em
  // WebtoonReader.tsx sobre `jaRestaurou`). Isso dispara o cleanup do efeito
  // de saída (porque `gravar` muda de identidade) sem o componente
  // desmontar de verdade. Antes da correção, esse cleanup cancelava o timer
  // sem zerar `timer.current`, e como `report()` faz `if (timer.current)
  // return`, nenhum timer novo era agendado depois disso — a gravação
  // periódica morria pelo resto da sessão.
  it('continua gravando periodicamente depois de trocar de episodio com timer pendente', () => {
    const { result, rerender } = renderHook(
      ({ episodeId }: { episodeId: string }) => useProgress({ ...args, episodeId }),
      { initialProps: { episodeId: 'e1' } },
    );

    // Agenda a gravação do capítulo 1, mas o timer ainda não disparou.
    act(() => { result.current.report(0.1, 0); });

    // Troca de capítulo sem desmontar (mesmo cenário do WebtoonReader real) —
    // dispara o cleanup do efeito de saída, que descarrega o pendente do
    // capítulo 1 à força.
    rerender({ episodeId: 'e2' });
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 'e1', percent: 0.1 }),
    );
    vi.mocked(api.saveProgress).mockClear();

    // Se `timer.current` não tiver sido zerado no cleanup acima, esta chamada
    // cai no `if (timer.current) return;` e nunca agenda nada — a gravação
    // periódica do capítulo 2 fica morta.
    act(() => { result.current.report(0.3, 0); });
    act(() => { vi.advanceTimersByTime(3500); });

    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 'e2', percent: 0.3 }),
    );
  });

  // Achado IMPORTANT da revisão final: vídeo tinha o mesmo intervalo de 3s do
  // webtoon. Em VCine (~30s), o limiar de 2% nunca segurava nada sozinho
  // (2% de 30s = 0,6s) — o spec pede 10s para vídeo.
  describe('cadência por tipo de conteúdo', () => {
    const argsVideo = { seriesId: 's1', episodeId: 'e1', contentType: 'vcine' as const };

    it('video nao grava em 3s (intervalo de webtoon) — precisa de 10s', () => {
      const { result } = renderHook(() => useProgress(argsVideo));
      act(() => { result.current.report(0.2, 6); });
      act(() => { vi.advanceTimersByTime(3500); });
      expect(api.saveProgress).not.toHaveBeenCalled();
    });

    it('video grava depois de 10s', () => {
      const { result } = renderHook(() => useProgress(argsVideo));
      act(() => { result.current.report(0.2, 6); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(api.saveProgress).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'vcine', percent: 0.2, position: 6 }),
      );
    });

    it('webtoon continua gravando em 3s', () => {
      const { result } = renderHook(() => useProgress(args)); // hiqua
      act(() => { result.current.report(0.2, 0); });
      act(() => { vi.advanceTimersByTime(3500); });
      expect(api.saveProgress).toHaveBeenCalled();
    });

    // Achado IMPORTANT: falta o descarte por variação de posição menor que
    // 5s (spec: "Descarta a escrita se a mudança for menor que 5 segundos ou
    // 2%"). Aqui o percentual muda bastante (10%), mas a posição real (em
    // segundos) muda pouco — ainda assim tem que descartar.
    it('descarta a escrita de video quando a posicao varia menos de 5s, mesmo com percentual acima do limiar', () => {
      const { result } = renderHook(() => useProgress(argsVideo));
      act(() => { result.current.report(0.10, 3); });
      act(() => { vi.advanceTimersByTime(10000); }); // grava (primeira escrita, sem baseline)
      expect(api.saveProgress).toHaveBeenCalledTimes(1);
      vi.mocked(api.saveProgress).mockClear();

      // +10% de percentual (bem acima do limiar de 2%), mas só +4s de posição
      // (abaixo do limiar de 5s) — tem que descartar.
      act(() => { result.current.report(0.20, 7); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(api.saveProgress).not.toHaveBeenCalled();
    });

    it('nao descarta por posicao quando o webtoon reporta (position sempre 0)', () => {
      // Webtoon sempre chama report(percent) sem position — o gate de 5s não
      // pode se aplicar a ele, senão nenhuma gravação de webtoon aconteceria.
      const { result } = renderHook(() => useProgress(args)); // hiqua
      act(() => { result.current.report(0.10); });
      act(() => { vi.advanceTimersByTime(3500); });
      expect(api.saveProgress).toHaveBeenCalledTimes(1);
      vi.mocked(api.saveProgress).mockClear();

      act(() => { result.current.report(0.15); }); // +5%, position continua 0
      act(() => { vi.advanceTimersByTime(3500); });
      expect(api.saveProgress).toHaveBeenCalledTimes(1);
    });
  });

  // Achado IMPORTANT da revisão final: sem flush no `visibilitychange`, sair
  // do app no Android (apertar Home, processo morto pelo sistema) perdia o
  // progresso pendente — "sair" ali quase nunca é desmontar o React.
  describe('flush ao ir para segundo plano', () => {
    it('descarrega o pendente quando document.visibilityState vira "hidden"', () => {
      const { result } = renderHook(() => useProgress(args));
      act(() => { result.current.report(0.42, 0); });
      expect(api.saveProgress).not.toHaveBeenCalled(); // ainda dentro do intervalo de 3s

      act(() => {
        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(api.saveProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 0.42 }),
      );
    });

    it('nao faz nada quando o evento dispara mas a visibilidade continua "visible"', () => {
      const { result } = renderHook(() => useProgress(args));
      act(() => { result.current.report(0.42, 0); });
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(api.saveProgress).not.toHaveBeenCalled();
    });

    it('remove o listener de visibilitychange ao desmontar', () => {
      const { unmount } = renderHook(() => useProgress(args));
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });
});
