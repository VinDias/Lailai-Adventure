import { describe, it, expect, beforeEach } from 'vitest';
import { getAnonymousId, ANON_STORAGE_KEY } from '../../utils/anonymousId';

describe('identificador do visitante', () => {
  beforeEach(() => localStorage.clear());

  it('gera um UUID v4 no primeiro acesso', () => {
    const id = getAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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
