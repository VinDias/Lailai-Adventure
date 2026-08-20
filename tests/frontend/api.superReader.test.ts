/**
 * Testes unitários — ApiService: métodos do Super Reader (Fase 4 Bloco 3).
 *
 * Pinam os shapes REAIS de routes/superReader.js: POST /create-session envia
 * {seriesId, amountCents, currency} (amountCents em CENTAVOS — ruling P1 do
 * bloco) e devolve {url}; GET /me devolve {superReader, contribuicoes}; GET
 * /min (sem auth) devolve {minCents}. Mesmo padrão de
 * tests/frontend/api.push.test.ts.
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

describe('createSuperReaderSession', () => {
  it('faz POST /superreader/create-session com seriesId, amountCents em centavos e currency; devolve {url}', async () => {
    (api as any).accessToken = 'tok';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/session-xyz' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.createSuperReaderSession('serie1', 750, 'brl');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/superreader/create-session');
    expect(opts.method).toBe('POST');
    // Centavos, não reais — o erro exato que o DonateButton morto cometeu.
    expect(JSON.parse(opts.body)).toEqual({ seriesId: 'serie1', amountCents: 750, currency: 'brl' });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session-xyz' });
  });

  it('erro do backend ({error}) vira Error com a mensagem (sem alert no service)', async () => {
    (api as any).accessToken = 'tok';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'O apoio mínimo é de 500 centavos.' }),
    }));
    await expect(api.createSuperReaderSession('serie1', 100, 'brl')).rejects.toThrow('O apoio mínimo é de 500 centavos.');
  });
});

describe('getSuperReaderMe', () => {
  it('faz GET /superreader/me e devolve {superReader, contribuicoes} (shape real do backend)', async () => {
    (api as any).accessToken = 'tok';
    const payload = {
      superReader: true,
      contribuicoes: [
        { seriesTitle: 'Obra X', amountCents: 1000, currency: 'brl', createdAt: '2026-08-01T00:00:00.000Z' },
        // seriesTitle null: série apagada (populate some, rota não explode).
        { seriesTitle: null, amountCents: 500, currency: 'usd', createdAt: '2026-07-15T00:00:00.000Z' },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getSuperReaderMe();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/superreader/me');
    expect(result).toEqual(payload);
  });

  it('selo false e lista vazia quando o usuário nunca apoiou', async () => {
    (api as any).accessToken = 'tok';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ superReader: false, contribuicoes: [] }),
    }));
    expect(await api.getSuperReaderMe()).toEqual({ superReader: false, contribuicoes: [] });
  });
});

describe('getSuperReaderMin', () => {
  it('faz GET /superreader/min (rota sem auth) e devolve {minCents}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ minCents: 500 }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getSuperReaderMin();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/superreader/min', expect.anything());
    expect(result).toEqual({ minCents: 500 });
  });
});
