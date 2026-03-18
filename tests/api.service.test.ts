/**
 * Testes unitários — ApiService (services/api.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do módulo config/api
vi.mock('../config/api', () => ({ default: 'http://localhost:3000' }));

let ApiService: any;
let api: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../services/api');
  api = mod.api;
  // Resetar estado interno
  (api as any).accessToken = null;
  (api as any).refreshTokenValue = null;
  (api as any).isOffline = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiService.setToken / setRefreshToken', () => {
  it('armazena accessToken', () => {
    api.setToken('abc123');
    expect((api as any).accessToken).toBe('abc123');
  });

  it('armazena refreshToken', () => {
    api.setRefreshToken('refresh456');
    expect((api as any).refreshTokenValue).toBe('refresh456');
  });
});

describe('ApiService.request — resposta ok', () => {
  it('retorna JSON da resposta', async () => {
    const mockData = [{ _id: '1', title: 'Série A' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }));

    const result = await (api as any).request('/content/series');
    expect(result).toEqual(mockData);
  });
});

describe('ApiService.request — erro de rede', () => {
  it('lança erro e marca isOffline = true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect((api as any).request('/content/series')).rejects.toThrow('Network error');
    expect(api.isOffline).toBe(true);
  });
});

describe('ApiService.request — resposta 401 com refresh bem-sucedido', () => {
  it('renova o token e repete a chamada', async () => {
    api.setRefreshToken('valid-refresh');

    const fetchMock = vi.fn()
      // 1ª chamada: 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Token inválido.' }) })
      // refresh: ok
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accessToken: 'new-token' }) })
      // 2ª tentativa: ok
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'ok' }) });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() });

    const result = await (api as any).request('/content/series');
    expect(result).toEqual({ data: 'ok' });
    expect((api as any).accessToken).toBe('new-token');
  });
});

describe('ApiService.request — 401 sem refreshToken', () => {
  it('chama onAuthExpired e lança o erro', async () => {
    const onExpired = vi.fn();
    api.setAuthExpiredCallback(onExpired);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Token inválido.' }),
    }));

    await expect((api as any).request('/content/series')).rejects.toThrow('Token inválido.');
    expect(onExpired).toHaveBeenCalledOnce();
  });
});

describe('ApiService.request — erro 400 não dispara refresh', () => {
  it('lança o erro diretamente sem tentar refresh', async () => {
    const onExpired = vi.fn();
    api.setAuthExpiredCallback(onExpired);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'title é obrigatório.' }),
    }));

    await expect((api as any).request('/content/series', { method: 'POST' }))
      .rejects.toThrow('title é obrigatório.');
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('ApiService.login', () => {
  it('armazena accessToken e refreshToken após login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { id: '1', email: 'a@b.com', nome: 'Test', role: 'user', isPremium: false },
        accessToken: 'acc-tok',
        refreshToken: 'ref-tok',
      }),
    }));

    const result = await api.login({ email: 'a@b.com', password: '123' });
    expect((api as any).accessToken).toBe('acc-tok');
    expect((api as any).refreshTokenValue).toBe('ref-tok');
    expect(result.accessToken).toBe('acc-tok');
    expect(result.refreshToken).toBe('ref-tok');
  });
});
