/**
 * Testes: i18n da interface (contexts/I18nContext + i18n/translations)
 * Contrato: 4 idiomas (pt base, en, es, zh), fallback pt, persistência
 * em lorflux_language (mesma chave dos balões do WebtoonReader).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { I18nProvider, useI18n, useT } from '../../contexts/I18nContext';
import { TRANSLATIONS } from '../../i18n/translations';

beforeEach(() => {
  localStorage.clear();
  // jsdom expõe navigator.language='en-US'; fixa pt-BR como "idioma do aparelho"
  // para os testes de default (a detecção por navigator é testada à parte).
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('pt-BR');
});

afterEach(() => vi.restoreAllMocks());

const Probe: React.FC = () => {
  const t = useT();
  const { lang, setLang } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="next">{t('onboarding.next')}</span>
      <span data-testid="logout">{t('account.logout')}</span>
      <span data-testid="missing">{t('chave.que.nao.existe' as any)}</span>
      <button onClick={() => setLang('en')}>en</button>
      <button onClick={() => setLang('zh')}>zh</button>
    </div>
  );
};

const renderProbe = () => render(<I18nProvider><Probe /></I18nProvider>);

describe('I18nContext', () => {
  it('idioma padrão é pt e as strings vêm do dicionário pt', () => {
    renderProbe();
    expect(screen.getByTestId('lang').textContent).toBe('pt');
    expect(screen.getByTestId('next').textContent).toBe(TRANSLATIONS.pt['onboarding.next']);
  });

  it('trocar para en muda as strings e persiste em lorflux_language', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByTestId('next').textContent).toBe(TRANSLATIONS.en['onboarding.next']);
    expect(localStorage.getItem('lorflux_language')).toBe('en');
  });

  it('zh renderiza as strings chinesas', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'zh' }));
    expect(screen.getByTestId('next').textContent).toBe(TRANSLATIONS.zh['onboarding.next']);
  });

  it('sem idioma salvo, detecta o idioma do aparelho (navigator.language)', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('es-MX');
    renderProbe();
    expect(screen.getByTestId('lang').textContent).toBe('es');
  });

  it('idioma do aparelho não suportado cai no pt', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('fr-FR');
    renderProbe();
    expect(screen.getByTestId('lang').textContent).toBe('pt');
  });

  it('inicializa a partir do lorflux_language salvo', () => {
    localStorage.setItem('lorflux_language', 'es');
    renderProbe();
    expect(screen.getByTestId('lang').textContent).toBe('es');
    expect(screen.getByTestId('next').textContent).toBe(TRANSLATIONS.es['onboarding.next']);
  });

  it('chave inexistente cai no próprio nome da chave (nunca quebra)', () => {
    renderProbe();
    expect(screen.getByTestId('missing').textContent).toBe('chave.que.nao.existe');
  });

  it('useT funciona SEM provider (default pt) — componentes legados não quebram', () => {
    render(<Probe />);
    expect(screen.getByTestId('next').textContent).toBe(TRANSLATIONS.pt['onboarding.next']);
  });
});

describe('Dicionários', () => {
  it('en/es/zh cobrem todas as chaves do pt (pt é a fonte de verdade)', () => {
    const ptKeys = Object.keys(TRANSLATIONS.pt);
    for (const lang of ['en', 'es', 'zh'] as const) {
      const langKeys = new Set(Object.keys(TRANSLATIONS[lang]));
      const missing = ptKeys.filter(k => !langKeys.has(k));
      expect(missing, `chaves faltando em ${lang}: ${missing.join(', ')}`).toHaveLength(0);
    }
  });

  it('nenhuma tradução é string vazia', () => {
    for (const lang of ['pt', 'en', 'es', 'zh'] as const) {
      for (const [key, value] of Object.entries(TRANSLATIONS[lang])) {
        expect(value, `${lang}.${key} vazia`).not.toBe('');
      }
    }
  });
});
