/**
 * Teste — App.tsx: a aba Conta precisa rolar (pedido do cliente, 11/09/2026:
 * "a rolagem não funciona, fica presa, não há possibilidade de ver os
 * idiomas").
 *
 * O <main> do App é overflow-hidden de propósito — cada tela traz a própria
 * área de rolagem (feeds, PortalEstudio, Favoritos). A Conta não trazia: tudo
 * abaixo da dobra (idioma, Classificação etária, Privacidade) ficava cortado
 * no celular. O jsdom não faz layout, então o teste pina a estrutura: entre
 * o conteúdo da Conta e o <main> tem que existir um contêiner overflow-y-auto.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    setStatusCallback: vi.fn(),
    setAuthExpiredCallback: vi.fn(),
    bootstrapSession: vi.fn(),
    login: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    logout: vi.fn(),
    getMeuEstudio: vi.fn(),
    getSuperReaderMe: vi.fn(),
    getParental: vi.fn(),
    getPrecosPremium: vi.fn().mockResolvedValue({ precos: {} }),
    getRecommendations: vi.fn(),
    getSeries: vi.fn(),
    getContinueList: vi.fn(),
    getPublicSettings: vi.fn(),
    getRandomAd: vi.fn(),
    trackAdImpression: vi.fn(),
    trackAdClick: vi.fn(),
  },
}));

vi.mock('../../utils/claimProgress', () => ({
  migrarProgressoDoVisitante: vi.fn(),
}));

import { api } from '../../services/api';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
import App from '../../App';

const fakeUser = {
  id: 'u1',
  email: 'leitor@lorflux.com',
  nome: 'Leitor Teste',
  avatar: '',
  isPremium: false,
  role: 'user',
  provider: 'local',
  criadoEm: '2026-01-01T00:00:00.000Z',
  followingChannelIds: [],
  accessToken: 'acc-token',
  refreshToken: 'ref-token',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('lorflux_onboarded', '1');
  window.history.pushState({}, '', '/');

  vi.mocked(api.bootstrapSession).mockResolvedValue(null);
  vi.mocked(api.login).mockResolvedValue(fakeUser as any);
  vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);
  vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
  vi.mocked(api.getSuperReaderMe).mockResolvedValue({ superReader: false, contribuicoes: [] } as any);
  vi.mocked(api.getParental).mockResolvedValue({
    classificacaoEtaria: 'young',
    tagsBloqueadas: [],
    temPin: false,
    vocabulario: [],
  } as any);
  vi.mocked(api.getRecommendations).mockResolvedValue([]);
  vi.mocked(api.getSeries).mockResolvedValue([]);
  vi.mocked(api.getContinueList).mockResolvedValue([]);
  vi.mocked(api.getPublicSettings).mockResolvedValue({} as any);
  vi.mocked(api.getRandomAd).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function temRolagemAteOMain(el: HTMLElement): boolean {
  let atual: HTMLElement | null = el.parentElement;
  while (atual && atual.tagName !== 'MAIN') {
    if (atual.classList.contains('overflow-y-auto')) return true;
    atual = atual.parentElement;
  }
  return false;
}

describe('App — aba Conta rola até o fim', () => {
  it('idioma e Classificação etária ficam dentro de uma área de rolagem própria, abaixo do <main>', async () => {
    render(<App />);
    fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'leitor@lorflux.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(migrarProgressoDoVisitante).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole('button', { name: /Conta/ }));

    const idioma = await screen.findByText('Idioma');
    const parental = await screen.findByText('Classificação etária e Preferências de conteúdo');
    expect(idioma.closest('main')).not.toBeNull();
    expect(temRolagemAteOMain(idioma)).toBe(true);
    expect(temRolagemAteOMain(parental)).toBe(true);
  });
});
