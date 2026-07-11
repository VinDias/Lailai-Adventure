/**
 * Testes: Botão "Entrar com Google" na tela de Auth
 * Contrato: botão (data-testid="google-signin") só aparece quando
 * google_client_id está nas settings públicas; credential do GIS →
 * api.googleLogin → onLogin.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));

// vi.mock é içado para o topo do arquivo: tudo que as factories usam precisa
// vir de vi.hoisted para existir antes da inicialização do módulo.
const { apiMock, initializeSpy, renderButtonSpy, gisState } = vi.hoisted(() => {
  const gisState: { callback: ((resp: { credential: string }) => void) | null } = { callback: null };
  return {
    gisState,
    initializeSpy: vi.fn(),
    renderButtonSpy: vi.fn(),
    apiMock: {
      getPublicSettings: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      googleLogin: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
    },
  };
});

vi.mock('../../services/api', () => ({ api: apiMock }));

// Mock do carregador do script GIS: injeta window.google fake
vi.mock('../../utils/googleSignIn', () => ({
  loadGoogleSignIn: vi.fn().mockImplementation(() => {
    (window as any).google = {
      accounts: {
        id: {
          initialize: (cfg: any) => { initializeSpy(cfg); gisState.callback = cfg.callback; },
          renderButton: renderButtonSpy,
        },
      },
    };
    return Promise.resolve();
  }),
}));

import Auth from '../../components/Auth';
import { SettingsProvider } from '../../contexts/SettingsContext';

const renderAuth = async (settings: Record<string, any>) => {
  apiMock.getPublicSettings.mockResolvedValue(settings);
  const utils = render(
    <SettingsProvider>
      <Auth onLogin={vi.fn()} />
    </SettingsProvider>
  );
  return utils;
};

beforeEach(() => {
  vi.clearAllMocks();
  gisState.callback = null;
  delete (window as any).google;
});

describe('Botão Entrar com Google', () => {
  it('não aparece sem google_client_id nas settings', async () => {
    await renderAuth({});
    // Dá tempo do effect rodar
    await waitFor(() => expect(apiMock.getPublicSettings).toHaveBeenCalled());
    expect(screen.queryByTestId('google-signin')).not.toBeInTheDocument();
    expect(renderButtonSpy).not.toHaveBeenCalled();
  });

  it('aparece e renderiza o botão do GIS quando configurado', async () => {
    await renderAuth({ google_client_id: 'client-123' });
    await waitFor(() => expect(screen.getByTestId('google-signin')).toBeInTheDocument());
    await waitFor(() => expect(renderButtonSpy).toHaveBeenCalled());
    expect(initializeSpy).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }));
  });

  it('credential do Google → api.googleLogin → onLogin', async () => {
    const onLogin = vi.fn();
    const fakeUser = { id: 'u1', email: 'g@g.com', nome: 'G', accessToken: 'tok' };
    apiMock.googleLogin.mockResolvedValue(fakeUser);
    apiMock.getPublicSettings.mockResolvedValue({ google_client_id: 'client-123' });

    render(
      <SettingsProvider>
        <Auth onLogin={onLogin} />
      </SettingsProvider>
    );

    await waitFor(() => expect(initializeSpy).toHaveBeenCalled());
    // Simula o callback do GIS com um credential
    await gisState.callback!({ credential: 'jwt-do-google' });

    await waitFor(() => expect(apiMock.googleLogin).toHaveBeenCalledWith('jwt-do-google'));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(fakeUser));
  });

  it('exibe o aviso de aceite dos termos junto ao botão', async () => {
    await renderAuth({ google_client_id: 'client-123' });
    await waitFor(() => expect(screen.getByTestId('google-signin')).toBeInTheDocument());
    expect(screen.getByText(/ao continuar com o google/i)).toBeInTheDocument();
  });
});
