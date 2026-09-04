/**
 * Teste — App.tsx: token de recuperação de PIN (Fase 5 Bloco 2, Task 7) NÃO
 * pode ser clobrado pelo `setView(HQCINE)` default do login. Fix round,
 * MÉDIA 1: sequência provada pelo revisor por leitura —
 *
 *   setUser(u) → useEffect([user]) consome pinRecoveryTokenRef e já troca
 *   pra PROFILE, ANTES do `await migrarProgressoDoVisitante()` de
 *   handleLogin resolver (rede real) → quando o await finalmente resolve,
 *   `if (!tinhaDeepLinkPendente) setView(HQCINE)` rodava por cima, porque o
 *   guard só olhava `deepLinkRef`, nunca `pinRecoveryTokenRef`.
 *
 * O fix adiciona `|| pinRecoveryTokenRef.current !== null` aos dois guards
 * (boot e handleLogin). Este teste reproduz a corrida de verdade: mocka
 * `migrarProgressoDoVisitante` com uma promise controlada manualmente, e
 * confere o estado ANTES e DEPOIS dela resolver.
 *
 * App inteiro é renderizado (sem providers — SettingsContext/I18nContext
 * têm defaults funcionais) porque o bug vive na composição de dois
 * useEffect + handleLogin, não em um componente isolado.
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
    confirmarRecuperacaoPin: vi.fn(),
    // Só usados pelo 2º teste (sem token pendente — vai mesmo pra HQCINE e
    // monta o feed de verdade): getRecommendations/getSeries/getContinueList
    // (HQCine.tsx) e getPublicSettings/getRandomAd (Ads.tsx, sempre montado
    // dentro do feed). Nenhum é tocado pelo 1º teste (fica em PROFILE).
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
  // Onboarding fora do caminho — não é o que este teste cobre, e a tela
  // cobriria a modal de confirmação em telas pequenas do jsdom.
  localStorage.setItem('lorflux_onboarded', '1');
  window.history.pushState({}, '', '/');

  vi.mocked(api.bootstrapSession).mockResolvedValue(null);
  vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
  vi.mocked(api.getSuperReaderMe).mockResolvedValue({ superReader: false, contribuicoes: [] } as any);
  vi.mocked(api.getParental).mockResolvedValue({
    classificacaoEtaria: 'young',
    tagsBloqueadas: [],
    temPin: true,
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

async function loginNaTelaDeAuth() {
  const emailInput = await screen.findByPlaceholderText('E-mail');
  fireEvent.change(emailInput, { target: { value: 'leitor@lorflux.com' } });
  fireEvent.change(screen.getByPlaceholderText(/Senha \(mín/), { target: { value: 'senha1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('App — token de recuperação de PIN sobrevive à corrida do login (MÉDIA 1)', () => {
  it('login com token pendente: a tela de confirmação abre ANTES da migração resolver e continua aberta DEPOIS — não é clobrada por setView(HQCINE)', async () => {
    window.history.pushState({}, '', '/recuperar-pin?token=tok-abc123');

    let resolveMigracao: () => void = () => {};
    vi.mocked(migrarProgressoDoVisitante).mockImplementation(
      () => new Promise<void>((resolve) => { resolveMigracao = resolve; })
    );
    vi.mocked(api.login).mockResolvedValue(fakeUser as any);

    render(<App />);
    await loginNaTelaDeAuth();

    // A URL já foi limpa e o token consumido pelo useEffect([user]) no
    // microtask seguinte ao setUser — isso acontece ENQUANTO
    // migrarProgressoDoVisitante ainda está pendurada (a promise controlada
    // acima nunca resolveu). Se a tela de confirmação já aparece aqui, a
    // corrida foi vencida: ParentalSettings só monta com view===PROFILE.
    await screen.findByText('Confirmar recuperação do PIN');

    // Libera a migração — o handleLogin original tentaria
    // setView(HQCINE) na sequência; com o fix, isso é pulado (mesmo guard
    // do deep link de push, agora cobrindo o token de PIN também).
    resolveMigracao();
    await waitFor(() => expect(migrarProgressoDoVisitante).toHaveBeenCalled());

    // Ainda na Conta, com a tela de confirmação — não foi clobrado para
    // HQCINE (o que desmontaria ParentalSettings e faria este texto sumir).
    await screen.findByText('Confirmar recuperação do PIN');
  });

  it('login SEM token pendente: continua indo para a aba inicial normalmente (guard não quebrou o caminho comum)', async () => {
    vi.mocked(migrarProgressoDoVisitante).mockResolvedValue(undefined);
    vi.mocked(api.login).mockResolvedValue(fakeUser as any);

    render(<App />);
    await loginNaTelaDeAuth();

    await waitFor(() => expect(migrarProgressoDoVisitante).toHaveBeenCalled());
    // A busca do feed (só existe dentro de HQCine, não em PROFILE) prova
    // que o setView(HQCINE) default rodou — sem token pendente, o guard
    // não deveria (e não deve) mudar esse caminho normal.
    await screen.findByPlaceholderText('Buscar por título ou gênero...');
    expect(screen.queryByText('Confirmar recuperação do PIN')).not.toBeInTheDocument();
  });
});
