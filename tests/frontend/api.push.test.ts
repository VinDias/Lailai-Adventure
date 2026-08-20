/**
 * Testes unitários — ApiService: métodos de push (Fase 4 Bloco 2).
 *
 * Achado da revisão da Task 7: subscribePush/unsubscribePush estavam tipados
 * como `{ success: boolean }`, mas o backend (routes/push.js) responde
 * `{ subscribed: true }` no POST e `{ removed: n }` no DELETE — inofensivo
 * hoje (ninguém lia `.success`), mas armadilha silenciosa para quem for ler
 * o resultado (Task 8: toggle da Conta). Estes testes fixam o shape real.
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

describe('getPushPublicKey', () => {
  it('faz GET /push/public-key (rota sem auth) e devolve a chave', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: 'BEl62i...' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getPushPublicKey();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/push/public-key', expect.anything());
    expect(result).toEqual({ publicKey: 'BEl62i...' });
  });

  it('publicKey null quando o servidor não tem VAPID configurado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: null }),
    }));
    expect(await api.getPushPublicKey()).toEqual({ publicKey: null });
  });
});

describe('subscribePush', () => {
  it('faz POST /me/push/subscribe com a subscription e devolve { subscribed: true } (shape real do backend)', async () => {
    (api as any).accessToken = 'tok';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ subscribed: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    const result = await api.subscribePush(sub);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/me/push/subscribe');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(sub);
    // Shape real — NÃO { success: boolean }, que nunca existiu na resposta do backend.
    expect(result).toEqual({ subscribed: true });
    expect((result as any).success).toBeUndefined();
  });
});

describe('unsubscribePush', () => {
  it('faz DELETE /me/push/subscribe com o endpoint e devolve { removed: n } (shape real do backend)', async () => {
    (api as any).accessToken = 'tok';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ removed: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.unsubscribePush('https://push.example/abc');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/me/push/subscribe');
    expect(opts.method).toBe('DELETE');
    expect(JSON.parse(opts.body)).toEqual({ endpoint: 'https://push.example/abc' });
    expect(result).toEqual({ removed: 1 });
    expect((result as any).success).toBeUndefined();
  });

  it('removed: 0 quando o endpoint não existia (idempotente)', async () => {
    (api as any).accessToken = 'tok';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ removed: 0 }),
    }));
    expect(await api.unsubscribePush('https://push.example/inexistente')).toEqual({ removed: 0 });
  });
});

describe('getPushStatus', () => {
  it('faz GET /me/push/status?endpoint=... com o endpoint codificado', async () => {
    (api as any).accessToken = 'tok';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ thisDevice: true, anyDevice: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getPushStatus('https://push.example/abc?x=1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:3000/me/push/status?endpoint=${encodeURIComponent('https://push.example/abc?x=1')}`);
    expect(result).toEqual({ thisDevice: true, anyDevice: true });
  });
});
