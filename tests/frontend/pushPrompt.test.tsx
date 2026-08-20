/**
 * Testes — Fase 4 Bloco 2 (Task 8):
 * - PushPrompt: cartão contextual pós-favorito, disparado pelo evento
 *   `lorflux:favorited` (api.addFavorite). Aparece uma única vez.
 * - PushAccountToggle: toggle de notificações na aba Conta, três estados
 *   (ligado/desligado/negado) + o estado "indisponível" (getStatus() null).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../utils/pushManager', () => ({
  pushManager: {
    isSupported: vi.fn(),
    getPermission: vi.fn(),
    subscribeThisDevice: vi.fn(),
    unsubscribeThisDevice: vi.fn(),
    getStatus: vi.fn(),
  },
}));

import { pushManager } from '../../utils/pushManager';
import PushPrompt from '../../components/PushPrompt';
import PushAccountToggle from '../../components/PushAccountToggle';

const dispararFavoritado = () => {
  window.dispatchEvent(new CustomEvent('lorflux:favorited'));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PushPrompt
// ═══════════════════════════════════════════════════════════════════════════════

describe('PushPrompt', () => {
  it('permissão default e sem flag: evento lorflux:favorited mostra o cartão', async () => {
    (pushManager.getPermission as any).mockReturnValue('default');
    render(<PushPrompt />);

    expect(screen.queryByText('Quer ser avisado quando sair capítulo novo?')).not.toBeInTheDocument();
    dispararFavoritado();

    await waitFor(() =>
      expect(screen.getByText('Quer ser avisado quando sair capítulo novo?')).toBeInTheDocument()
    );
  });

  it('"Agora não" grava a flag e o próximo evento não mostra mais o cartão', async () => {
    (pushManager.getPermission as any).mockReturnValue('default');
    render(<PushPrompt />);

    dispararFavoritado();
    await waitFor(() => expect(screen.getByText('AGORA NÃO')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AGORA NÃO'));
    await waitFor(() => expect(screen.queryByText('AGORA NÃO')).not.toBeInTheDocument());

    expect(localStorage.getItem('lorflux_push_asked')).not.toBeNull();

    dispararFavoritado();
    // Dá tempo para um possível (indevido) re-render antes de afirmar ausência.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('AGORA NÃO')).not.toBeInTheDocument();
  });

  it('flag já gravada anteriormente: evento não mostra o cartão', async () => {
    localStorage.setItem('lorflux_push_asked', '1');
    (pushManager.getPermission as any).mockReturnValue('default');
    render(<PushPrompt />);

    dispararFavoritado();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('AGORA NÃO')).not.toBeInTheDocument();
  });

  it('permissão granted: evento não mostra o cartão', async () => {
    (pushManager.getPermission as any).mockReturnValue('granted');
    render(<PushPrompt />);

    dispararFavoritado();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('AGORA NÃO')).not.toBeInTheDocument();
  });

  it('permissão denied: evento não mostra o cartão', async () => {
    (pushManager.getPermission as any).mockReturnValue('denied');
    render(<PushPrompt />);

    dispararFavoritado();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('AGORA NÃO')).not.toBeInTheDocument();
  });

  it('"Ativar" chama pushManager.subscribeThisDevice, grava a flag e fecha o cartão', async () => {
    (pushManager.getPermission as any).mockReturnValue('default');
    (pushManager.subscribeThisDevice as any).mockResolvedValue(true);
    render(<PushPrompt />);

    dispararFavoritado();
    await waitFor(() => expect(screen.getByText('ATIVAR')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ATIVAR'));
    expect(pushManager.subscribeThisDevice).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.queryByText('ATIVAR')).not.toBeInTheDocument());
    expect(localStorage.getItem('lorflux_push_asked')).not.toBeNull();
  });

  it('"Ativar" grava a flag e fecha mesmo se subscribeThisDevice resolver false', async () => {
    (pushManager.getPermission as any).mockReturnValue('default');
    (pushManager.subscribeThisDevice as any).mockResolvedValue(false);
    render(<PushPrompt />);

    dispararFavoritado();
    await waitFor(() => expect(screen.getByText('ATIVAR')).toBeInTheDocument());
    fireEvent.click(screen.getByText('ATIVAR'));

    await waitFor(() => expect(screen.queryByText('ATIVAR')).not.toBeInTheDocument());
    expect(localStorage.getItem('lorflux_push_asked')).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PushAccountToggle
// ═══════════════════════════════════════════════════════════════════════════════

describe('PushAccountToggle', () => {
  it('sem suporte no navegador: oculta a seção inteira', async () => {
    (pushManager.isSupported as any).mockReturnValue(false);
    const { container } = render(<PushAccountToggle />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    expect(pushManager.getStatus).not.toHaveBeenCalled();
  });

  it('estado ligado (thisDevice true): clique chama unsubscribeThisDevice', async () => {
    (pushManager.isSupported as any).mockReturnValue(true);
    (pushManager.getPermission as any).mockReturnValue('granted');
    (pushManager.getStatus as any).mockResolvedValue({ thisDevice: true, anyDevice: true });
    (pushManager.unsubscribeThisDevice as any).mockResolvedValue(true);

    render(<PushAccountToggle />);

    const botao = await screen.findByRole('button', { name: /notificações de capítulos novos/i });
    await waitFor(() => expect(botao).toHaveAttribute('aria-pressed', 'true'));
    expect(botao).not.toBeDisabled();

    fireEvent.click(botao);
    await waitFor(() => expect(pushManager.unsubscribeThisDevice).toHaveBeenCalledTimes(1));
  });

  it('estado desligado (thisDevice false): clique chama subscribeThisDevice', async () => {
    (pushManager.isSupported as any).mockReturnValue(true);
    (pushManager.getPermission as any).mockReturnValue('default');
    (pushManager.getStatus as any).mockResolvedValue({ thisDevice: false, anyDevice: false });
    (pushManager.subscribeThisDevice as any).mockResolvedValue(true);

    render(<PushAccountToggle />);

    const botao = await screen.findByRole('button', { name: /notificações de capítulos novos/i });
    await waitFor(() => expect(botao).toHaveAttribute('aria-pressed', 'false'));
    expect(botao).not.toBeDisabled();

    fireEvent.click(botao);
    await waitFor(() => expect(pushManager.subscribeThisDevice).toHaveBeenCalledTimes(1));
  });

  it('permissão negada: toggle desabilitado com push.deniedHint, sem consultar getStatus', async () => {
    (pushManager.isSupported as any).mockReturnValue(true);
    (pushManager.getPermission as any).mockReturnValue('denied');

    render(<PushAccountToggle />);

    const botao = await screen.findByRole('button', { name: /notificações de capítulos novos/i });
    await waitFor(() => expect(botao).toBeDisabled());
    expect(
      screen.getByText('Notificações bloqueadas no navegador. Para reativar, permita notificações para o Lorflux nas configurações do seu navegador ou aparelho.')
    ).toBeInTheDocument();
    expect(pushManager.getStatus).not.toHaveBeenCalled();

    fireEvent.click(botao);
    expect(pushManager.subscribeThisDevice).not.toHaveBeenCalled();
    expect(pushManager.unsubscribeThisDevice).not.toHaveBeenCalled();
  });

  it('getStatus() devolve null (indisponível): toggle desabilitado com push.unavailable, não afirma "desligado"', async () => {
    (pushManager.isSupported as any).mockReturnValue(true);
    (pushManager.getPermission as any).mockReturnValue('default');
    (pushManager.getStatus as any).mockResolvedValue(null);

    render(<PushAccountToggle />);

    const botao = await screen.findByRole('button', { name: /notificações de capítulos novos/i });
    await waitFor(() => expect(botao).toBeDisabled());
    expect(
      screen.getByText('Não foi possível verificar o status das notificações agora.')
    ).toBeInTheDocument();
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(botao);
    expect(pushManager.subscribeThisDevice).not.toHaveBeenCalled();
    expect(pushManager.unsubscribeThisDevice).not.toHaveBeenCalled();
  });
});
