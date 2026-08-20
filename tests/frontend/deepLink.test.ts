/**
 * Testes unitários — utils/deepLink: parser puro do link de notificação push
 * (`/?abrir=<seriesId>&tipo=<content_type>`, gerado pelo servidor).
 */
import { describe, it, expect } from 'vitest';
import { parseDeepLink } from '../../utils/deepLink';

describe('parseDeepLink', () => {
  it('retorna null sem o parâmetro abrir', () => {
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('?tipo=hqcine')).toBeNull();
    expect(parseDeepLink('?foo=bar')).toBeNull();
  });

  it('retorna null quando abrir vem vazio', () => {
    expect(parseDeepLink('?abrir=&tipo=hqcine')).toBeNull();
  });

  it('extrai seriesId e tipo válido (hqcine, vcine, hiqua)', () => {
    expect(parseDeepLink('?abrir=serie123&tipo=hqcine')).toEqual({ seriesId: 'serie123', tipo: 'hqcine' });
    expect(parseDeepLink('?abrir=serie123&tipo=vcine')).toEqual({ seriesId: 'serie123', tipo: 'vcine' });
    expect(parseDeepLink('?abrir=serie123&tipo=hiqua')).toEqual({ seriesId: 'serie123', tipo: 'hiqua' });
  });

  it('funciona com a string de busca sem o "?" inicial', () => {
    expect(parseDeepLink('abrir=serie123&tipo=hqcine')).toEqual({ seriesId: 'serie123', tipo: 'hqcine' });
  });

  it('ignora tipo desconhecido (lixo) sem descartar o seriesId', () => {
    expect(parseDeepLink('?abrir=serie123&tipo=lixo')).toEqual({ seriesId: 'serie123', tipo: null });
  });

  it('tipo ausente vira null, mas o seriesId ainda é aproveitado', () => {
    expect(parseDeepLink('?abrir=serie123')).toEqual({ seriesId: 'serie123', tipo: null });
  });

  it('decodifica o seriesId (URL-encoded)', () => {
    expect(parseDeepLink('?abrir=abc%20123&tipo=hqcine')).toEqual({ seriesId: 'abc 123', tipo: 'hqcine' });
  });

  it('outros params na query não atrapalham', () => {
    expect(parseDeepLink('?utm_source=push&abrir=serie123&tipo=vcine&utm_campaign=x')).toEqual({ seriesId: 'serie123', tipo: 'vcine' });
  });
});
