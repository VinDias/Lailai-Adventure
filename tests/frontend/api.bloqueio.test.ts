/**
 * Teste unitário — ApiService: o 403 de conteúdo pago (Fase 6) precisa chegar
 * à UI com `code` E com `obra` (título e capa).
 *
 * Existe por causa de um achado do E2E da T7: `construirErro` copiava `status`,
 * `tentativasRestantes` e `code`, mas não `obra`. Na tela, o leitor caía no
 * fallback e mostrava o título do EPISÓDIO sem capa — exatamente o contrário
 * do que a tela de convite deveria ser. Os testes de componente não pegavam,
 * porque entregam `obra` já montado ao componente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));

let api: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../services/api');
  api = mod.api;
  (api as any).accessToken = 'tok';
  (api as any).isOffline = false;
});

afterEach(() => vi.unstubAllGlobals());

const OBRA = { title: 'Obra Paga', cover_image: 'https://cdn/capa.jpg' };

function responder403(code: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: () => Promise.resolve({ error: 'Crie uma conta para ter acesso.', code, obra: OBRA }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('403 de conteúdo pago', () => {
  it('carrega status, code e OBRA (título e capa) no Error', async () => {
    responder403('login_necessario');

    let capturado: any;
    try {
      await api.getEpisode('ep-1');
    } catch (e) {
      capturado = e;
    }

    expect(capturado.status).toBe(403);
    expect(capturado.code).toBe('login_necessario');
    expect(capturado.obra).toEqual(OBRA);
  });

  it('vale também para assinatura_necessaria', async () => {
    responder403('assinatura_necessaria');

    let capturado: any;
    try {
      await api.getEpisode('ep-1');
    } catch (e) {
      capturado = e;
    }

    expect(capturado.code).toBe('assinatura_necessaria');
    expect(capturado.obra).toEqual(OBRA);
  });

  it('erro sem obra no corpo não inventa uma', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: () => Promise.resolve({ error: 'Origem não permitida.' }),
    }));

    let capturado: any;
    try {
      await api.getEpisode('ep-1');
    } catch (e) {
      capturado = e;
    }

    expect(capturado.status).toBe(403);
    expect(capturado.obra).toBeUndefined();
    expect(capturado.code).toBeUndefined();
  });
});
