import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
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
});
