/**
 * Testes unitários — ApiService: métodos novos da Task 10 (Fase 5 Bloco 1):
 * canal público (leitor) + admin (Fila de Aprovação, form de canal, mensagens
 * por canal). Pina os shapes REAIS de routes/channels.js e
 * routes/adminPortal.js. Mesmo padrão de tests/frontend/api.portal.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));

let api: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../services/api');
  api = mod.api;
  (api as any).accessToken = 'tok';
  (api as any).refreshTokenValue = null;
  (api as any).isOffline = false;
});

afterEach(() => vi.restoreAllMocks());

describe('getChannel', () => {
  it('GET /channels/:id — devolve followersCount/isFollowing, sem followers[]', async () => {
    const payload = {
      _id: 'c1', name: 'Canal 1', description: 'Desc', avatar: null, banner: null,
      isActive: true, followersCount: 3, isFollowing: false,
      ownerId: { _id: 'u1', nome: 'Dono' },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getChannel('c1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/channels/c1');
    expect(result).toEqual(payload);
    expect((result as any).followers).toBeUndefined();
  });

  it('404 (canal inexistente/inativo) vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: 'Canal não encontrado.' }),
    }));
    await expect(api.getChannel('c-inexistente')).rejects.toThrow('Canal não encontrado.');
  });
});

describe('followChannel / unfollowChannel', () => {
  it('POST /channels/:id/follow — devolve { success, followers }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, followers: 4 }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.followChannel('c1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/channels/c1/follow');
    expect(opts.method).toBe('POST');
    expect(result).toEqual({ success: true, followers: 4 });
  });

  it('DELETE /channels/:id/follow — devolve { success, followers }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, followers: 2 }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.unfollowChannel('c1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/channels/c1/follow');
    expect(opts.method).toBe('DELETE');
    expect(result).toEqual({ success: true, followers: 2 });
  });
});

describe('getAdminAprovacoes', () => {
  it('GET /admin/aprovacoes — devolve { itens } flat com tipo series/episode', async () => {
    const payload = {
      itens: [
        { tipo: 'series', id: 's1', title: 'Obra 1', genre: null, tags: [], canal: { id: 'c1', name: 'Canal 1' }, submittedAt: '2026-08-20T00:00:00.000Z' },
        { tipo: 'episode', id: 'e1', title: 'Cap 1', serie: { id: 's2', title: 'Obra 2', isPublished: true }, canal: { id: 'c1', name: 'Canal 1' }, submittedAt: '2026-08-21T00:00:00.000Z' },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.getAdminAprovacoes();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/admin/aprovacoes');
    expect(result).toEqual(payload);
  });
});

describe('aprovarSerieAdmin / aprovarEpisodioAdmin', () => {
  it('POST /admin/aprovacoes/series/:id/aprovar com genre/tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 's1', isPublished: true, genre: 'Aventura' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.aprovarSerieAdmin('s1', { genre: 'Aventura', tags: ['acao', 'aventura'] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/admin/aprovacoes/series/s1/aprovar');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ genre: 'Aventura', tags: ['acao', 'aventura'] });
  });

  it('POST /admin/aprovacoes/series/:id/aprovar sem body — manda {}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 's1' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.aprovarSerieAdmin('s1');
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({});
  });

  it('POST /admin/aprovacoes/episodes/:id/aprovar (plural na URL — rota real)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'e1', status: 'published' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.aprovarEpisodioAdmin('e1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/admin/aprovacoes/episodes/e1/aprovar');
    expect(opts.method).toBe('POST');
  });

  it('400 "aprove a série primeiro" vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Aprove a série primeiro — este episódio pertence a uma série ainda não publicada.' }),
    }));
    await expect(api.aprovarEpisodioAdmin('e1')).rejects.toThrow('Aprove a série primeiro');
  });

  it('400 sem gênero vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Série publicada precisa de gênero preenchido.' }),
    }));
    await expect(api.aprovarSerieAdmin('s1', {})).rejects.toThrow(/g[eê]nero/i);
  });
});

describe('devolverAprovacao', () => {
  it('POST /admin/aprovacoes/:tipo/:id/devolver — tipo "series"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, mensagem: { _id: 'm1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.devolverAprovacao('series', 's1', 'Ajuste a capa.');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/admin/aprovacoes/series/s1/devolver');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ texto: 'Ajuste a capa.' });
  });

  it('POST /admin/aprovacoes/:tipo/:id/devolver — tipo "episode"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, mensagem: { _id: 'm2' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.devolverAprovacao('episode', 'e1', 'Painel cortado.');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/admin/aprovacoes/episode/e1/devolver');
  });

  it('400 texto ausente vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'texto é obrigatório.' }),
    }));
    await expect(api.devolverAprovacao('series', 's1', '')).rejects.toThrow('texto é obrigatório.');
  });
});

describe('updateChannelAdmin', () => {
  it('PUT /channels/:id com ownerEmail', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'c1', ownerId: 'u2' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.updateChannelAdmin('c1', { ownerEmail: 'novo-dono@lorflux.test' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/channels/c1');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ ownerEmail: 'novo-dono@lorflux.test' });
  });

  it('404 e-mail inexistente vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: 'Usuário com esse e-mail não encontrado.' }),
    }));
    await expect(api.updateChannelAdmin('c1', { ownerEmail: 'nada@lorflux.test' })).rejects.toThrow('Usuário com esse e-mail não encontrado.');
  });
});

describe('desativarCanal', () => {
  it('POST /channels/:id/desativar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'c1', isActive: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.desativarCanal('c1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/channels/c1/desativar');
    expect(opts.method).toBe('POST');
    expect(result.isActive).toBe(false);
  });
});

describe('getAdminMensagensCanal / sendAdminMensagem', () => {
  it('GET /admin/mensagens/:canalId — devolve { canalId, threads }', async () => {
    const payload = {
      canalId: 'c1',
      threads: [
        { ownerUserId: 'u1', vigente: true, arquivadaEm: null, mensagens: [{ _id: 'm1', autorTipo: 'ilustrador', texto: 'Oi' }] },
        { ownerUserId: 'u0', vigente: false, arquivadaEm: '2026-08-01T00:00:00.000Z', mensagens: [] },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.getAdminMensagensCanal('c1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/admin/mensagens/c1');
    expect(result).toEqual(payload);
  });

  it('POST /admin/mensagens/:canalId com texto e refTipo/refId opcionais', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'm3', autorTipo: 'editor' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.sendAdminMensagem('c1', { texto: 'Devolvido', refTipo: 'series', refId: 's1' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/admin/mensagens/c1');
    expect(JSON.parse(opts.body)).toEqual({ texto: 'Devolvido', refTipo: 'series', refId: 's1' });
  });
});
