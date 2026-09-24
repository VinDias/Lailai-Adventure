/**
 * Testes unitários — ApiService: envios multipart (upload de imagem, lote de
 * painéis, avatar) e downloads passam pela MESMA renovação de sessão do
 * request().
 *
 * Bug do cliente (17/09/2026): "quando se faz uns 3 uploads ele dá erro, é
 * preciso fazer um refresh para ele voltar ao normal". O accessToken vive 15
 * minutos (server.js) e essas chamadas usavam `fetch` cru, sem o retry de
 * 401 — o F5 só "consertava" porque o bootstrap renovava a sessão pelo
 * cookie. Aqui o 401 é encenado de verdade: falha, refresh, repete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));

let api: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../services/api');
  api = mod.api;
  (api as any).accessToken = 'token-velho';
  (api as any).refreshTokenValue = null;
  (api as any).isOffline = false;
});

afterEach(() => vi.restoreAllMocks());

const arquivo = () => new File(['x'], 'painel.png', { type: 'image/png' });

function fetchQueDevolve(respostas: any[]) {
  const mock = vi.fn();
  respostas.forEach(r => mock.mockResolvedValueOnce(r));
  vi.stubGlobal('fetch', mock);
  return mock;
}

const resposta401 = { ok: false, status: 401, json: () => Promise.resolve({ error: 'Token inválido.' }) };
const respostaRefresh = { ok: true, status: 200, json: () => Promise.resolve({ accessToken: 'token-novo' }) };

describe('uploadImagesBatchToBunny — sessão expirada no meio do trabalho', () => {
  it('401 renova o token e REPETE o upload, sem exigir F5', async () => {
    const fetchMock = fetchQueDevolve([
      resposta401,
      respostaRefresh,
      { ok: true, status: 200, json: () => Promise.resolve({ results: [{ success: true, url: 'https://cdn/p1.png', filename: 'painel.png', index: 0 }] }) },
    ]);

    const out = await api.uploadImagesBatchToBunny([arquivo()], 'serie-teste');

    expect(out.results[0].url).toBe('https://cdn/p1.png');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('/bunny/upload-image-batch');
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh-token');
    // O reenvio leva o token NOVO, não o que expirou.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer token-novo');
  });

  it('refresh falhou: avisa sessão expirada e propaga o erro (sem repetir para sempre)', async () => {
    const onAuthExpired = vi.fn();
    api.setAuthExpiredCallback(onAuthExpired);
    const fetchMock = fetchQueDevolve([
      resposta401,
      { ok: false, status: 401, json: () => Promise.resolve({}) },
    ]);

    await expect(api.uploadImagesBatchToBunny([arquivo()])).rejects.toThrow();
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('demais envios autenticados fora do request()', () => {
  it('uploadImageToBunny repete depois do refresh', async () => {
    const fetchMock = fetchQueDevolve([
      resposta401,
      respostaRefresh,
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://cdn/capa.png' }) },
    ]);

    await expect(api.uploadImageToBunny(arquivo())).resolves.toBe('https://cdn/capa.png');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uploadPortalImagesBatch (autor no Meu Estúdio) repete depois do refresh', async () => {
    const fetchMock = fetchQueDevolve([
      resposta401,
      respostaRefresh,
      { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) },
    ]);

    await api.uploadPortalImagesBatch([arquivo()], 'serie-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer token-novo');
  });

  it('upload que dá certo de primeira NÃO chama refresh', async () => {
    const fetchMock = fetchQueDevolve([
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://cdn/ok.png' }) },
    ]);

    await api.uploadImageToBunny(arquivo());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
