/**
 * Testes unitários — ApiService: métodos novos do pacote
 * (googleLogin, uploadAvatar)
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

describe('googleLogin', () => {
  it('faz POST /auth/google com o credential e guarda os tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 'u1', email: 'g@g.com', nome: 'G' },
        accessToken: 'acc-tok',
        refreshToken: 'ref-tok',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = await api.googleLogin('jwt-google');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ credential: 'jwt-google' }),
      })
    );
    expect(user.email).toBe('g@g.com');
    expect(user.accessToken).toBe('acc-tok');
    expect((api as any).accessToken).toBe('acc-tok');
    expect((api as any).refreshTokenValue).toBe('ref-tok');
  });

  it('propaga erro da API (ex.: 401 credential inválido)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: 'Credencial do Google inválida.' }),
    }));
    await expect(api.googleLogin('ruim')).rejects.toThrow(/credencial/i);
  });
});

describe('uploadAvatar', () => {
  it('envia multipart com o campo avatar e retorna a URL', async () => {
    (api as any).accessToken = 'tok';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ avatar: 'https://cdn.lorflux.com/lorflux/avatars/u1.webp' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
    const result = await api.uploadAvatar(file);

    expect(result.avatar).toMatch(/avatars\/u1\.webp$/);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/account/me/avatar');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get('avatar')).toBe(file);
    // Multipart NÃO deve forçar Content-Type manual (boundary é do browser)
    expect(opts.headers?.['Content-Type']).toBeUndefined();
    expect(opts.headers?.['Authorization']).toBe('Bearer tok');
  });

  it('lança erro quando o upload falha', async () => {
    (api as any).accessToken = 'tok';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503,
      json: () => Promise.resolve({ error: 'Storage não configurado.' }),
    }));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    await expect(api.uploadAvatar(file)).rejects.toThrow();
  });
});
