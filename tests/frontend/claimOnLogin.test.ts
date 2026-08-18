import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrarProgressoDoVisitante, PRAZO_MIGRACAO_MS } from '../../utils/claimProgress';
import { api } from '../../services/api';
import { ANON_STORAGE_KEY } from '../../utils/anonymousId';

describe('migração do progresso ao entrar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('leva o histórico do visitante para a conta', async () => {
    localStorage.setItem(ANON_STORAGE_KEY, '11111111-2222-4333-8444-555555555555');
    const spy = vi.spyOn(api, 'claimProgress').mockResolvedValue({ movidos: 2, fundidos: 0 });

    await migrarProgressoDoVisitante();

    expect(spy).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555');
  });

  it('nao chama nada quando o aparelho ainda nao tem identificador', async () => {
    const spy = vi.spyOn(api, 'claimProgress');
    await migrarProgressoDoVisitante();
    expect(spy).not.toHaveBeenCalled();
  });

  it('falha silenciosa: erro de rede nao atrapalha o login', async () => {
    localStorage.setItem(ANON_STORAGE_KEY, '11111111-2222-4333-8444-555555555555');
    vi.spyOn(api, 'claimProgress').mockRejectedValue(new Error('rede'));
    await expect(migrarProgressoDoVisitante()).resolves.toBeUndefined();
  });

  describe('prazo contra rede lenta (achado da revisao da Task 11)', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('nao trava o login indefinidamente: desiste apos o prazo se a chamada nunca responder', async () => {
      vi.useFakeTimers();
      localStorage.setItem(ANON_STORAGE_KEY, '11111111-2222-4333-8444-555555555555');
      // Simula uma chamada de rede que nunca resolve nem rejeita.
      vi.spyOn(api, 'claimProgress').mockReturnValue(new Promise(() => {}));

      const promessa = migrarProgressoDoVisitante();
      let resolvida = false;
      promessa.then(() => { resolvida = true; });

      await vi.advanceTimersByTimeAsync(PRAZO_MIGRACAO_MS - 1);
      expect(resolvida).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resolvida).toBe(true);
      await expect(promessa).resolves.toBeUndefined();
    });
  });
});
