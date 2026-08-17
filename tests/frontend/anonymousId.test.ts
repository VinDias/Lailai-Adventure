import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAnonymousId, ANON_STORAGE_KEY } from '../../utils/anonymousId';

// Mesma regex que o backend usa para validar o cabeçalho X-Anonymous-Id (utils/requestIdentity
// no lado do servidor) — qualquer caminho de geração precisa produzir algo que passe aqui.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('identificador do visitante', () => {
  beforeEach(() => localStorage.clear());

  it('gera um UUID v4 no primeiro acesso', () => {
    const id = getAnonymousId();
    expect(id).toMatch(UUID_V4);
  });

  it('reaproveita o mesmo identificador nas chamadas seguintes', () => {
    const primeiro = getAnonymousId();
    expect(getAnonymousId()).toBe(primeiro);
    expect(localStorage.getItem(ANON_STORAGE_KEY)).toBe(primeiro);
  });

  it('descarta valor corrompido e gera outro', () => {
    localStorage.setItem(ANON_STORAGE_KEY, 'lixo');
    const id = getAnonymousId();
    expect(id).not.toBe('lixo');
  });
});

// Regressão do achado de revisão da Task 7: getAnonymousId() roda em TODA chamada de
// API (services/api.ts injeta o cabeçalho em request()), então ela nunca pode lançar —
// nem em navegador/WebView Android antigo sem crypto.randomUUID (API só existe a partir
// do Chrome 92/2021; o app roda como TWA, dependente do Chrome do aparelho).
describe('geração de UUID sem crypto.randomUUID (navegador/WebView antigo)', () => {
  const cryptoOriginal = globalThis.crypto;

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.stubGlobal('crypto', cryptoOriginal);
  });

  it('usa crypto.getRandomValues quando randomUUID não existe, gerando UUID v4 válido', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) % 256;
        return arr;
      },
    });
    const id = getAnonymousId();
    expect(id).toMatch(UUID_V4);
  });

  it('cai para Math.random quando nem randomUUID nem getRandomValues existem', () => {
    vi.stubGlobal('crypto', {});
    const id = getAnonymousId();
    expect(id).toMatch(UUID_V4);
  });

  it('cai para Math.random quando crypto.getRandomValues lança', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: () => { throw new Error('não suportado neste WebView'); },
    });
    const id = getAnonymousId();
    expect(id).toMatch(UUID_V4);
  });

  it('nunca lança, mesmo sem nenhuma API de crypto disponível', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => getAnonymousId()).not.toThrow();
    expect(getAnonymousId()).toMatch(UUID_V4);
  });
});
