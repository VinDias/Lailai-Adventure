/**
 * Testes unitários — utils/superReaderReturn: parser puro do retorno do
 * checkout do Super Reader (`/?superreader=success|cancelled`, gerado pelo
 * Stripe via success_url/cancel_url de services/superReaderService.js).
 * Mesmo espírito de tests/frontend/deepLink.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { parseSuperReaderReturn } from '../../utils/superReaderReturn';

describe('parseSuperReaderReturn', () => {
  it('retorna null sem o parâmetro superreader', () => {
    expect(parseSuperReaderReturn('')).toBeNull();
    expect(parseSuperReaderReturn('?foo=bar')).toBeNull();
  });

  it('extrai "success"', () => {
    expect(parseSuperReaderReturn('?superreader=success')).toBe('success');
  });

  it('extrai "cancelled"', () => {
    expect(parseSuperReaderReturn('?superreader=cancelled')).toBe('cancelled');
  });

  it('funciona com a string de busca sem o "?" inicial', () => {
    expect(parseSuperReaderReturn('superreader=success')).toBe('success');
  });

  it('ignora valor desconhecido (lixo) e vira null', () => {
    expect(parseSuperReaderReturn('?superreader=lixo')).toBeNull();
  });

  it('valor vazio vira null', () => {
    expect(parseSuperReaderReturn('?superreader=')).toBeNull();
  });

  it('outros params na query não atrapalham', () => {
    expect(parseSuperReaderReturn('?utm_source=x&superreader=success&utm_campaign=y')).toBe('success');
    expect(parseSuperReaderReturn('?abrir=serie123&tipo=hqcine&superreader=cancelled')).toBe('cancelled');
  });
});
