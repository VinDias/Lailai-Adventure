/**
 * Testes unitários — ApiService: getRecommendations (Fase 4 Bloco 4, Task 7).
 *
 * Pina o shape REAL de routes/content.js: GET /content/recommendations?type=
 * devolve um array de séries (mesmo shape do GET /content/series). A
 * identidade anônima (X-Anonymous-Id) já é injetada globalmente por
 * request() (services/api.ts:152) — o teste confirma que o header continua
 * saindo também nesta chamada, sem precisar de nenhum código novo para isso.
 * Mesmo padrão de tests/frontend/api.superReader.test.ts.
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
});

afterEach(() => vi.restoreAllMocks());

describe('getRecommendations', () => {
  it('faz GET /content/recommendations?type=hqcine e devolve o array de séries', async () => {
    const payload = [
      { _id: 's1', title: 'Série A', content_type: 'hqcine' },
      { _id: 's2', title: 'Série B', content_type: 'hqcine' },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getRecommendations('hqcine');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/content/recommendations?type=hqcine');
    expect(opts.method ?? 'GET').toBe('GET');
    expect(result).toEqual(payload);
  });

  it('envia o type correto para vcine e hiqua na URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await api.getRecommendations('vcine');
    await api.getRecommendations('hiqua');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/content/recommendations?type=vcine');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3000/content/recommendations?type=hiqua');
  });

  it('reusa o MESMO mecanismo do progresso: X-Anonymous-Id sai no header, sem código novo pra isso', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await api.getRecommendations('hqcine');

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['X-Anonymous-Id']).toEqual(expect.any(String));
    expect(opts.headers['X-Anonymous-Id'].length).toBeGreaterThan(0);
  });

  it('erro do backend ({error}) vira Error com a mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'type é obrigatório e deve ser um de: hqcine, vcine, hiqua.' }),
    }));
    await expect(api.getRecommendations('hqcine' as any)).rejects.toThrow('type é obrigatório');
  });
});
