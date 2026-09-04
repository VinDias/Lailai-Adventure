/**
 * Testes unitários — ApiService: sinalização do leitor e Fila de Revisão do
 * admin (Fase 5 Bloco 3). Shapes REAIS de routes/sinalizacao.js e
 * routes/adminCuradoria.js. Molde: tests/frontend/api.parental.test.ts.
 *
 * Fix round, item 4: o repasse `if (body.code) error.code = body.code` do
 * `request()` não tinha NENHUM teste — apagá-lo deixava a suíte inteira
 * verde, porque o único teste que lê `error.code` (sinalizarButton) FABRICA o
 * erro no mock do api. Sem essa linha o dono da obra recebe a mensagem
 * genérica em vez de "Você não pode sinalizar a própria obra". Aqui o `code`
 * é conferido no ponto onde ele nasce: a resposta HTTP.
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

describe('sinalizarSerie', () => {
  it('POST /content/series/:id/sinalizar com { motivo, descricao }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ jaSinalizada: false }) });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.sinalizarSerie('s1', { motivo: 'direitos_autorais', descricao: 'Arte copiada.' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/content/series/s1/sinalizar');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ motivo: 'direitos_autorais', descricao: 'Arte copiada.' });
    expect(r.jaSinalizada).toBe(false);
  });

  it('400 do DONO da obra: o Error carrega code "propria_obra" E status 400 (a UI escolhe a mensagem pelo code, não pelo texto PT)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Você não pode sinalizar a própria obra.', code: 'propria_obra' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: any;
    try {
      await api.sinalizarSerie('s1', { motivo: 'spam_ou_enganoso' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('propria_obra');
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('Você não pode sinalizar a própria obra.');
  });

  it('400 SEM code (motivo inválido): sem `code` no Error, só status e mensagem', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Motivo inválido.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: any;
    try {
      await api.sinalizarSerie('s1', { motivo: 'violencia_excessiva' });
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBeUndefined();
    expect(caught.status).toBe(400);
  });

  it('404 (obra despublicada/invisível) rejeita com status 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: 'Série não encontrada.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.sinalizarSerie('s1', { motivo: 'outro', descricao: 'x' })).rejects.toThrow('Série não encontrada.');
  });
});

describe('getMinhaSinalizacao', () => {
  it('GET /content/series/:id/sinalizacao — devolve só o estado do próprio usuário', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ jaSinalizada: true, motivo: 'outro' }) });
    vi.stubGlobal('fetch', fetchMock);

    const r = await api.getMinhaSinalizacao('s9');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/content/series/s9/sinalizacao');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(r).toEqual({ jaSinalizada: true, motivo: 'outro' });
  });
});

describe('Fila de Revisão (admin)', () => {
  it('getAdminCuradoria: default "abertos" e a aba de histórico na query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ casos: [], total: 0, graves: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.getAdminCuradoria();
    await api.getAdminCuradoria('fechado');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/admin/curadoria?status=abertos');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3000/admin/curadoria?status=fechado');
  });

  it('as 4 ações postam nos caminhos e com os corpos do backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ caso: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.curadoriaAprovar('c1', { abuso: true });
    await api.curadoriaReclassificar('c1', { content_rating: 'teen' });
    await api.curadoriaSolicitarCorrecao('c1', { texto: 'Troque a capa.' });
    await api.curadoriaRemover('c1', { motivo: 'Cópia.' });

    const chamada = (i: number) => ({ url: fetchMock.mock.calls[i][0], ...fetchMock.mock.calls[i][1] });
    expect(chamada(0).url).toBe('http://localhost:3000/admin/curadoria/c1/aprovar');
    expect(JSON.parse(chamada(0).body)).toEqual({ abuso: true });
    expect(chamada(1).url).toBe('http://localhost:3000/admin/curadoria/c1/reclassificar');
    expect(JSON.parse(chamada(1).body)).toEqual({ content_rating: 'teen' });
    expect(chamada(2).url).toBe('http://localhost:3000/admin/curadoria/c1/solicitar-correcao');
    expect(JSON.parse(chamada(2).body)).toEqual({ texto: 'Troque a capa.' });
    expect(chamada(3).url).toBe('http://localhost:3000/admin/curadoria/c1/remover');
    expect(JSON.parse(chamada(3).body)).toEqual({ motivo: 'Cópia.' });
    expect(chamada(0).method).toBe('POST');
  });

  it('aprovar sem argumentos manda body vazio (o backend trata abuso ausente como false)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ caso: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.curadoriaAprovar('c2');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it('409 (outro curador decidiu antes) chega ao painel com status 409 e a mensagem do servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 409,
      json: () => Promise.resolve({ error: 'Caso já fechado.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: any;
    try {
      await api.curadoriaRemover('c1', { motivo: 'Cópia.' });
    } catch (err) {
      caught = err;
    }

    expect(caught.status).toBe(409);
    expect(caught.message).toBe('Caso já fechado.');
  });
});
