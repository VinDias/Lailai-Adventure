/**
 * Testes unitários — ApiService: métodos de "Classificação etária e
 * Preferências de conteúdo" + PIN de proteção (Fase 5 Bloco 2, Task 7).
 * Shapes REAIS de routes/parental.js (GET/PUT /api/parental, POST
 * /api/parental/pin, POST /api/parental/pin/recuperar[/confirmar]).
 * Mesmo padrão de tests/frontend/api.portal.test.ts.
 *
 * Cobre também um detalhe crítico do `request()` genérico: 401 é tratado
 * hoje como "sessão expirada" — tenta refresh e REPETE a chamada original.
 * Para as 3 rotas onde 401 é resultado de NEGÓCIO (PIN errado/senha errada,
 * não sessão expirada), repetir dobraria a contagem de tentativas no
 * servidor (ver services/parentalPinService.js, pinTentativas). Por isso
 * updateParental/setParentalPin/recuperarPin pedem `retryAuthOn401=false`
 * ao `request()` — os testes abaixo pinam isso: fetch é chamado EXATAMENTE
 * uma vez em 401, nunca dispara o refresh.
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

describe('getParental', () => {
  it('GET /parental — devolve prefs + temPin + vocabulario', async () => {
    const payload = {
      classificacaoEtaria: 'teen',
      tagsBloqueadas: ['terror'],
      temPin: true,
      vocabulario: [{ slug: 'romance', rotuloPt: 'Romance' }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getParental();

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/parental');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined(); // GET (default)
    expect(result).toEqual(payload);
  });
});

describe('updateParental', () => {
  it('PUT /parental sem pin (temPin false) — body sem a chave pin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ classificacaoEtaria: 'kids', tagsBloqueadas: [], temPin: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.updateParental({ classificacaoEtaria: 'kids', tagsBloqueadas: [] });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/parental');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ classificacaoEtaria: 'kids', tagsBloqueadas: [] });
    expect(body.pin).toBeUndefined();
  });

  it('PUT /parental com pin — sempre STRING no body (nunca Number)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ classificacaoEtaria: 'young', tagsBloqueadas: [], temPin: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.updateParental({ classificacaoEtaria: 'young', tagsBloqueadas: [], pin: '001234' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.pin).toBe('001234');
    expect(typeof body.pin).toBe('string');
  });

  it('401 (PIN incorreto, com tentativasRestantes) — Error carrega status e tentativasRestantes, SEM tentar refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: 'PIN incorreto.', tentativasRestantes: 3 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: any;
    try {
      await api.updateParental({ pin: '9999' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('PIN incorreto.');
    expect(caught.status).toBe(401);
    expect(caught.tentativasRestantes).toBe(3);
    // Nunca dobra a tentativa: exatamente 1 chamada de rede (sem refresh + replay).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 (bloqueado) — Error carrega status 429 e a mensagem com o tempo restante, SEM tentar refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: 'PIN bloqueado por excesso de tentativas. Tente novamente em 15 minuto(s).' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: any;
    try {
      await api.updateParental({ pin: '9999' });
    } catch (err) {
      caught = err;
    }
    expect(caught.status).toBe(429);
    expect(caught.message).toContain('15 minuto');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('setParentalPin', () => {
  it('criar (sem PIN prévio) — body só com novoPin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ temPin: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.setParentalPin({ novoPin: '1234' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/parental/pin');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ novoPin: '1234' });
  });

  it('trocar — body com pinAtual + novoPin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ temPin: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.setParentalPin({ pinAtual: '1111', novoPin: '2222' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pinAtual: '1111', novoPin: '2222' });
  });

  it('remover — body com pinAtual + remover:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ temPin: false }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.setParentalPin({ pinAtual: '1111', remover: true });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pinAtual: '1111', remover: true });
  });

  it('401 (pinAtual errado) não tenta refresh — 1 única chamada de rede', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: 'PIN incorreto.', tentativasRestantes: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.setParentalPin({ pinAtual: '0000', novoPin: '1111' })).rejects.toThrow('PIN incorreto.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('recuperarPin', () => {
  it('conta local — envia { password }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: 'Enviamos um link.' }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.recuperarPin('minhaSenha123');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/parental/pin/recuperar');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'minhaSenha123' });
  });

  it('conta social — sem password, body vazio', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: 'Enviamos um link.' }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.recuperarPin(undefined);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it('401 (senha incorreta, conta local) não tenta refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: 'Senha incorreta.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.recuperarPin('senhaErrada')).rejects.toThrow('Senha incorreta.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('confirmarRecuperacaoPin', () => {
  it('POST /parental/pin/recuperar/confirmar — envia { token }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'PIN removido. Defina um novo PIN quando quiser.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.confirmarRecuperacaoPin('token-abc');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/parental/pin/recuperar/confirmar');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'token-abc' });
    expect(result.message).toContain('PIN removido');
  });

  it('400 (token inválido/expirado) rejeita com a mensagem do servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ error: 'Link inválido ou expirado.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.confirmarRecuperacaoPin('tok')).rejects.toThrow('Link inválido ou expirado.');
  });
});
