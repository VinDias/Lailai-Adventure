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
  });

  const args = { seriesId: 's1', episodeId: 'e1', contentType: 'hiqua' as const };

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
});
