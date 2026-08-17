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
});
