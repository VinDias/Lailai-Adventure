/**
 * Testes unitários — ApiService
 * Cobre: tokens, refresh, offline, login, register, todos os métodos
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));

let api: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../services/api');
  api = mod.api;
  (api as any).accessToken = null;
  (api as any).refreshTokenValue = null;
  (api as any).isOffline = false;
  (api as any).onAuthExpired = null;
  vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() });
});

afterEach(() => vi.restoreAllMocks());

// ─── Tokens ───────────────────────────────────────────────────────────────────

describe('Gerenciamento de tokens', () => {
  it('setToken armazena accessToken', () => {
    api.setToken('abc');
    expect((api as any).accessToken).toBe('abc');
  });

  it('setRefreshToken armazena refreshToken', () => {
    api.setRefreshToken('ref');
    expect((api as any).refreshTokenValue).toBe('ref');
  });

  it('Authorization header é enviado quando token está definido', async () => {
    api.setToken('meu-token');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    await (api as any).request('/content/series');
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe('Bearer meu-token');
  });

  it('sem token, Authorization header não é enviado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    await (api as any).request('/content/series');
    const headers = vi.mocked(fetch).mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});

// ─── Resposta OK ──────────────────────────────────────────────────────────────

describe('request() — respostas bem-sucedidas', () => {
  it('retorna JSON parseado', async () => {
    const data = [{ _id: '1', title: 'A' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) }));
    expect(await (api as any).request('/content/series')).toEqual(data);
  });

  it('constrói URL corretamente com e sem barra inicial', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetch);
    await (api as any).request('content/series');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3000/content/series');
    await (api as any).request('/content/series');
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:3000/content/series');
  });
});

// ─── Erros de rede ────────────────────────────────────────────────────────────

describe('request() — erro de rede (offline)', () => {
  it('marca isOffline=true e lança erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect((api as any).request('/content/series')).rejects.toThrow('Network error');
    expect(api.isOffline).toBe(true);
  });

  it('chama onStatusChange(true) ao ir offline', async () => {
    const cb = vi.fn();
    api.setStatusCallback(cb);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    await expect((api as any).request('/x')).rejects.toThrow();
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('marca isOffline=false e chama onStatusChange(false) ao voltar online', async () => {
    const cb = vi.fn();
    api.setStatusCallback(cb);
    (api as any).isOffline = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
    await (api as any).request('/x');
    expect(api.isOffline).toBe(false);
    expect(cb).toHaveBeenCalledWith(false);
  });
});

// ─── Erros HTTP ───────────────────────────────────────────────────────────────

describe('request() — erros HTTP', () => {
  it('400 lança erro com mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Campo obrigatório.' }),
    }));
    await expect((api as any).request('/x', { method: 'POST' })).rejects.toThrow('Campo obrigatório.');
  });

  it('400 NÃO tenta refresh (apenas 401 faz isso)', async () => {
    const onExpired = vi.fn();
    api.setAuthExpiredCallback(onExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    }));
    await expect((api as any).request('/x')).rejects.toThrow();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('500 lança erro genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({}),
    }));
    await expect((api as any).request('/x')).rejects.toThrow('Erro 500');
  });
});

// ─── Refresh automático ───────────────────────────────────────────────────────

describe('request() — refresh automático em 401', () => {
  it('renova token e repete chamada com sucesso', async () => {
    api.setRefreshToken('valid-refresh');
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Token inválido.' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accessToken: 'novo-token' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'ok' }) });
    vi.stubGlobal('fetch', fetch);
    const result = await (api as any).request('/content/series');
    expect(result).toEqual({ data: 'ok' });
    expect((api as any).accessToken).toBe('novo-token');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('sem refreshToken chama onAuthExpired e lança erro', async () => {
    const onExpired = vi.fn();
    api.setAuthExpiredCallback(onExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: 'Token inválido.' }),
    }));
    await expect((api as any).request('/x')).rejects.toThrow('Token inválido.');
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('refresh falha → chama onAuthExpired', async () => {
    api.setRefreshToken('expired-refresh');
    const onExpired = vi.fn();
    api.setAuthExpiredCallback(onExpired);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'expirado' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    await expect((api as any).request('/x')).rejects.toThrow();
    expect(onExpired).toHaveBeenCalled();
  });

  it('não faz duplo refresh (retried=true pula refresh)', async () => {
    api.setRefreshToken('r');
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'exp' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ accessToken: 'new' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'exp' }) });
    vi.stubGlobal('fetch', fetch);
    api.setAuthExpiredCallback(vi.fn());
    await expect((api as any).request('/x')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3); // original + refresh + retry (sem 4ª chamada)
  });
});

// ─── Login / Register ─────────────────────────────────────────────────────────

describe('api.login()', () => {
  it('armazena accessToken e refreshToken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({
        user: { id: '1', email: 'a@b.com', nome: 'A', role: 'user', isPremium: false },
        accessToken: 'acc', refreshToken: 'ref',
      }),
    }));
    const result = await api.login({ email: 'a@b.com', password: '123' });
    expect((api as any).accessToken).toBe('acc');
    expect((api as any).refreshTokenValue).toBe('ref');
    expect(result.accessToken).toBe('acc');
    expect(result.refreshToken).toBe('ref');
  });
});

describe('api.register()', () => {
  it('armazena tokens após registro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({
        user: { id: '2', email: 'b@c.com', nome: 'B', role: 'user', isPremium: false },
        accessToken: 'acc2', refreshToken: 'ref2',
      }),
    }));
    const result = await api.register({ email: 'b@c.com', password: '123', nome: 'B' });
    expect((api as any).accessToken).toBe('acc2');
    expect(result.refreshToken).toBe('ref2');
  });
});

// ─── Métodos de conteúdo ──────────────────────────────────────────────────────

describe('Métodos de conteúdo', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
  });

  it('getSeries() chama GET /content/series', async () => {
    await api.getSeries();
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/content/series');
  });

  it('getSeries(type) inclui query param type', async () => {
    await api.getSeries('hiqua');
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('type=hiqua');
  });

  it('getEpisodesBySeries(id) chama rota correta', async () => {
    await api.getEpisodesBySeries('series-1');
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/content/series/series-1/episodes');
  });

  it('getEpisodesBySeries() retorna [] em caso de erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await api.getEpisodesBySeries('x');
    expect(result).toEqual([]);
  });

  it('getSeriesContent() retorna { seasons, episodes }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ _id: 'e1' }]) }));
    const result = await api.getSeriesContent('s-1');
    expect(result).toHaveProperty('seasons');
    expect(result).toHaveProperty('episodes');
    expect(result.episodes[0]._id).toBe('e1');
  });

  it('getSeriesContent() retorna episodes vazio em erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await api.getSeriesContent('x');
    expect(result.episodes).toEqual([]);
  });
});

// ─── Votos ────────────────────────────────────────────────────────────────────

describe('Métodos de votos', () => {
  it('vote() chama POST /content/episodes/:id/vote', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ type: 'like' }) });
    vi.stubGlobal('fetch', fetch);
    await api.vote('ep-1', 'like');
    expect(fetch.mock.calls[0][0]).toContain('/content/episodes/ep-1/vote');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('removeVote() chama DELETE', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetch);
    await api.removeVote('ep-1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('getMyVote() retorna null em caso de erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await api.getMyVote('ep-1');
    expect(result).toBeNull();
  });
});
