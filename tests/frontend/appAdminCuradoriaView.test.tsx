/**
 * Fix round do frontend, item 1 (ALTO) — a aba "Curadoria" não existia na
 * APLICAÇÃO real: `App.tsx` enumerava as views que renderizam o
 * AdminDashboard numa cadeia de `||` e ninguém acrescentou ADMIN_CURADORIA.
 * Clicar na aba desmontava o dashboard inteiro e deixava o <main> vazio.
 * Nenhum teste pegou porque todos montam o AdminDashboard direto.
 *
 * Aqui o App REAL é renderizado (molde de tests/frontend/appPinRecovery.test.tsx):
 * login de superadmin → botão Admin → clique em "Curadoria" na sidebar → o
 * painel tem de montar e buscar a fila. O 2º bloco é o teste de DADOS que
 * impede a recaída na PRÓXIMA aba: todo ViewMode `ADMIN_*` precisa estar na
 * lista exportada por App.tsx (importada, nunca duplicada aqui).
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
    // Feed que o login abre antes de irmos ao admin.
    getRecommendations: vi.fn(),
    getSeries: vi.fn(),
    getContinueList: vi.fn(),
    getPublicSettings: vi.fn(),
    getRandomAd: vi.fn(),
    trackAdImpression: vi.fn(),
    trackAdClick: vi.fn(),
    getFavorites: vi.fn(),
    // AdminDashboard.
    getAdminStats: vi.fn(),
    getAdminContent: vi.fn(),
    getAdminAprovacoes: vi.fn(),
    listChannels: vi.fn(),
    // CuradoriaPanel — a prova do item 1.
    getAdminCuradoria: vi.fn(),
  },
}));

vi.mock('../../utils/claimProgress', () => ({ migrarProgressoDoVisitante: vi.fn() }));

import { api } from '../../services/api';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
import App, { ADMIN_VIEWS } from '../../App';
import { ViewMode } from '../../types';

const superadmin = {
  id: 'a1', email: 'master@lorflux.com', nome: 'Master', avatar: '', isPremium: false,
  role: 'superadmin', provider: 'local', criadoEm: '2026-01-01T00:00:00.000Z',
  followingChannelIds: [], accessToken: 'acc', refreshToken: 'ref',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('lorflux_onboarded', '1');
  window.history.pushState({}, '', '/');

  vi.mocked(api.bootstrapSession).mockResolvedValue(null);
  vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
  vi.mocked(api.getSuperReaderMe).mockResolvedValue({ superReader: false, contribuicoes: [] } as any);
  vi.mocked(api.getParental).mockResolvedValue({ classificacaoEtaria: 'young', tagsBloqueadas: [], temPin: false, vocabulario: [] } as any);
  vi.mocked(api.getRecommendations).mockResolvedValue([] as any);
  vi.mocked(api.getSeries).mockResolvedValue([] as any);
  vi.mocked(api.getContinueList).mockResolvedValue([] as any);
  vi.mocked(api.getFavorites).mockResolvedValue([] as any);
  vi.mocked(api.getPublicSettings).mockResolvedValue({} as any);
  vi.mocked(api.getRandomAd).mockResolvedValue(null as any);
  vi.mocked(api.getAdminStats).mockResolvedValue({} as any);
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0, curadoria: { abertos: 2, graves: 1 } } as any);
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
  vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined as any);
  vi.mocked(api.login).mockResolvedValue(superadmin as any);
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('App — aba Curadoria ligada de verdade (fix round, item 1)', () => {
  it('superadmin: Admin → clique em "Curadoria" monta o painel e busca a fila (o dashboard NÃO some)', async () => {
    render(<App />);

    fireEvent.change(await screen.findByPlaceholderText('E-mail'), { target: { value: 'master@lorflux.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    fireEvent.click(await screen.findByText('Admin'));
    // Sidebar do dashboard no ar.
    const linkCuradoria = await screen.findByText('Curadoria');
    fireEvent.click(linkCuradoria);

    // Painel montado (h2 do CuradoriaPanel) + a fila buscada. Antes do fix
    // este findByRole estourava: o <main> ficava vazio.
    expect(await screen.findByRole('heading', { name: 'Curadoria' })).toBeInTheDocument();
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenCalledWith('abertos'));
    // O resto do dashboard continua montado (a sidebar tem as outras abas).
    expect(screen.getByText('Aprovações')).toBeInTheDocument();
  });
});

describe('App — toda view ADMIN_* precisa estar em ADMIN_VIEWS (anti-recaída)', () => {
  it('nenhum ViewMode com prefixo ADMIN_ fica de fora da lista de App.tsx', () => {
    const doEnum = Object.values(ViewMode).filter(v => String(v).startsWith('ADMIN_'));
    expect(doEnum.length).toBeGreaterThan(0);
    const faltando = doEnum.filter(v => !ADMIN_VIEWS.has(v as ViewMode));
    expect(faltando).toEqual([]);
    // E o contrário: a lista não inventa view que o enum não tem.
    expect(ADMIN_VIEWS.size).toBe(doEnum.length);
  });
});
