/**
 * Testes unitários — ApiService: métodos do Portal do Ilustrador (Fase 5
 * Bloco 1, Task 9). Pinam os shapes REAIS de routes/portal.js e o contrato
 * PRÓPRIO de upload do dono (`seriesId` real no body, diferente do
 * `seriesSlug` texto-livre do admin — ver routes/bunnyWebhook.js,
 * resolveUploadSlug). Mesmo padrão de tests/frontend/api.superReader.test.ts.
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

describe('getMeuEstudio', () => {
  it('GET /portal/meu-estudio — devolve { canais }', async () => {
    const payload = {
      canais: [{ channelId: 'c1', name: 'Canal 1', avatar: null, obras: 2, pendentes: 1, mensagensNaoLidas: 3 }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getMeuEstudio();

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/portal/meu-estudio');
    expect(result).toEqual(payload);
  });

  it('403 (não é dono) vira Error rejeitado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: 'Você não é dono de nenhum canal ativo.' }),
    }));
    await expect(api.getMeuEstudio()).rejects.toThrow('Você não é dono de nenhum canal ativo.');
  });
});

describe('getPortalResumo', () => {
  it('sem period — GET /portal/resumo sem query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ period: '2026-09', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await api.getPortalResumo();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/portal/resumo');
  });

  it('com period — GET /portal/resumo?period=YYYY-MM; mês aberto NUNCA traz amount', async () => {
    const payload = {
      period: '2026-09',
      status: 'aberto' as const,
      canais: [{ channelId: 'c1', channelName: 'Canal 1', points: 50, share: 0.5 }],
      superReader: { porCanal: [{ channelId: 'c1', channelName: 'Canal 1', apoios: 2, autorCents: 4000 }] },
      periodosFechadosDisponiveis: ['2026-08'],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getPortalResumo('2026-09');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/portal/resumo?period=2026-09');
    expect(result).toEqual(payload);
    expect(result.canais[0].amount).toBeUndefined();
  });

  it('período fechado traz amount em R$ por canal', async () => {
    const payload = {
      period: '2026-08',
      status: 'fechado' as const,
      canais: [{ channelId: 'c1', channelName: 'Canal 1', points: 50, share: 0.5, amount: 123.45 }],
      superReader: { porCanal: [] },
      periodosFechadosDisponiveis: ['2026-08'],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }));
    const result = await api.getPortalResumo('2026-08');
    expect(result.canais[0].amount).toBe(123.45);
  });
});

describe('getPortalSeries', () => {
  it('GET /portal/series — devolve { series }', async () => {
    const payload = { series: [{ _id: 's1', title: 'Obra 1', isPublished: false, submittedAt: null }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await api.getPortalSeries();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/portal/series');
    expect(result).toEqual(payload);
  });
});

describe('createPortalSeries / updatePortalSeries', () => {
  it('POST /portal/series com title/description/content_rating_sugerida', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 's1', title: 'Nova Obra' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.createPortalSeries({ title: 'Nova Obra', description: 'Desc', content_rating_sugerida: 'kids' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/series');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ title: 'Nova Obra', description: 'Desc', content_rating_sugerida: 'kids' });
  });

  it('PUT /portal/series/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 's1', cover_image: 'https://x/y.jpg' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.updatePortalSeries('s1', { cover_image: 'https://x/y.jpg' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/series/s1');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ cover_image: 'https://x/y.jpg' });
  });

  it('403/400 do backend vira Error com a mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: 'Só é possível editar uma série em rascunho.' }),
    }));
    await expect(api.updatePortalSeries('s1', { title: 'X' })).rejects.toThrow('Só é possível editar uma série em rascunho.');
  });
});

describe('createPortalEpisodio', () => {
  it('POST /portal/series/:id/episodios', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'ep1', title: 'Cap 1' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.createPortalEpisodio('s1', { title: 'Cap 1', episode_number: 1, thumbnail: 'https://x/thumb.jpg' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/series/s1/episodios');
    expect(JSON.parse(opts.body)).toEqual({ title: 'Cap 1', episode_number: 1, thumbnail: 'https://x/thumb.jpg' });
  });
});

describe('addPortalPaineis', () => {
  it('POST /portal/episodios/:id/paineis — devolve { success, panelCount, episode }', async () => {
    const payload = { success: true, panelCount: 2, episode: { _id: 'ep1', panels: [{}, {}] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);
    const panels = [{ image_url: 'https://x/p1.jpg', order: 0 }, { image_url: 'https://x/p2.jpg', order: 1 }];
    const result = await api.addPortalPaineis('ep1', panels);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/episodios/ep1/paineis');
    expect(JSON.parse(opts.body)).toEqual({ panels });
    expect(result).toEqual(payload);
  });
});

describe('enviarPortalSerie / enviarPortalEpisodio', () => {
  it('POST /portal/series/:id/enviar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 's1', submittedAt: '2026-09-02T00:00:00.000Z' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.enviarPortalSerie('s1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/series/s1/enviar');
    expect(opts.method).toBe('POST');
  });

  it('POST /portal/episodios/:id/enviar; 400 de validação vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Adicione ao menos um painel antes de enviar para aprovação.' }),
    }));
    await expect(api.enviarPortalEpisodio('ep1')).rejects.toThrow('Adicione ao menos um painel antes de enviar para aprovação.');
  });
});

describe('getPortalMensagens / sendPortalMensagem', () => {
  it('GET /portal/mensagens sem params — sem query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ canalId: 'c1', mensagens: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.getPortalMensagens();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/portal/mensagens');
  });

  it('GET /portal/mensagens com canalId/limit/before', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ canalId: 'c1', mensagens: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.getPortalMensagens({ canalId: 'c1', limit: 50, before: '2026-09-01T00:00:00.000Z' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('canalId=c1');
    expect(url).toContain('limit=50');
    expect(url).toContain('before=2026-09-01T00%3A00%3A00.000Z');
  });

  it('mensagens vêm em ordem ASC, refTipo/refId do editor presentes na devolução', async () => {
    const payload = {
      canalId: 'c1',
      mensagens: [
        { _id: 'm1', autorTipo: 'ilustrador', texto: 'Oi', refTipo: null, refId: null, lidaEm: null, createdAt: '2026-09-01T00:00:00.000Z' },
        { _id: 'm2', autorTipo: 'editor', texto: 'Ajuste a capa', refTipo: 'series', refId: 's1', lidaEm: '2026-09-02T00:00:00.000Z', createdAt: '2026-09-01T01:00:00.000Z' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }));
    const result = await api.getPortalMensagens();
    expect(result).toEqual(payload);
  });

  it('POST /portal/mensagens com texto (e canalId quando informado)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ _id: 'm3', autorTipo: 'ilustrador', texto: 'Oi de novo' }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.sendPortalMensagem({ texto: 'Oi de novo', canalId: 'c1' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/portal/mensagens');
    expect(JSON.parse(opts.body)).toEqual({ texto: 'Oi de novo', canalId: 'c1' });
  });
});

describe('uploadPortalImage', () => {
  it('POST /bunny/upload-image com FormData contendo seriesId (NÃO seriesSlug)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: 'https://cdn/x.jpg' }) });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['conteudo'], 'capa.jpg', { type: 'image/jpeg' });

    const url = await api.uploadPortalImage(file, 'series-real-id');

    const [fetchedUrl, opts] = fetchMock.mock.calls[0];
    expect(fetchedUrl).toBe('http://localhost:3000/bunny/upload-image');
    const form = opts.body as FormData;
    expect(form.get('seriesId')).toBe('series-real-id');
    expect(form.get('seriesSlug')).toBeNull();
    expect(url).toBe('https://cdn/x.jpg');
  });

  it('erro do backend vira Error legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: 'Série não encontrada.' }),
    }));
    const file = new File(['x'], 'capa.jpg', { type: 'image/jpeg' });
    await expect(api.uploadPortalImage(file, 'series-alheia')).rejects.toThrow('Série não encontrada.');
  });
});

describe('uploadPortalImagesBatch', () => {
  it('POST /bunny/upload-image-batch com várias imagens + seriesId', async () => {
    const payload = {
      results: [
        { success: true, filename: 'p1.jpg', index: 0, url: 'https://cdn/p1.jpg' },
        { success: true, filename: 'p2.jpg', index: 1, url: 'https://cdn/p2.jpg' },
      ],
      successCount: 2, failCount: 0, total: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);
    const files = [new File(['a'], 'p1.jpg', { type: 'image/jpeg' }), new File(['b'], 'p2.jpg', { type: 'image/jpeg' })];

    const result = await api.uploadPortalImagesBatch(files, 'series-real-id');

    const [fetchedUrl, opts] = fetchMock.mock.calls[0];
    expect(fetchedUrl).toBe('http://localhost:3000/bunny/upload-image-batch');
    const form = opts.body as FormData;
    expect(form.getAll('images')).toHaveLength(2);
    expect(form.get('seriesId')).toBe('series-real-id');
    expect(result).toEqual(payload);
  });
});
