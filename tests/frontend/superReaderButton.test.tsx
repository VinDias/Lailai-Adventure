/**
 * Testes — SuperReaderButton (Fase 4 Bloco 3): apoio direto ao autor da obra,
 * inserido no modal de detalhe de série dos 3 feeds (HQCine/VFilm/HiQua).
 * Mesma técnica de tests/frontend/pushPrompt.test.tsx: mocka o módulo de
 * serviço (aqui, services/api) para pinar o comportamento sem rede real.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getSuperReaderMin: vi.fn(),
    createSuperReaderSession: vi.fn(),
  },
}));

import { api } from '../../services/api';
import SuperReaderButton from '../../components/SuperReaderButton';

const mockUser: any = {
  id: 'u1', email: 'a@a.com', nome: 'Ana', isPremium: false,
  role: 'user', provider: 'local', criadoEm: '', followingChannelIds: [],
};

const abrirPainel = () => {
  fireEvent.click(screen.getByText('SUPER READER'));
};

beforeEach(() => {
  vi.clearAllMocks();
  // Super Reader é BRL fixo (ruling da revisão final) — ao contrário do
  // Premium, NÃO usa getLocalizedCurrency/navigator.language. Fixa um
  // locale não-BR aqui de propósito ('en-US', já o default do jsdom) para
  // provar que a moeda do botão continua 'brl'/R$ mesmo assim (ver teste
  // "moeda fixa em brl..." abaixo).
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');
  (api.getSuperReaderMin as any).mockResolvedValue({ minCents: 500 });
  // window.location.href = ... dispararia "not implemented: navigation" no
  // jsdom; troca por um objeto simples só para afirmar o valor atribuído.
  // @ts-ignore
  delete (window as any).location;
  // @ts-ignore
  window.location = { href: '' };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SuperReaderButton', () => {
  it('renderiza os valores rápidos a partir do mínimo do backend (500 -> R$5/R$10/R$20)', async () => {
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();

    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());
    expect(screen.getByText('R$10')).toBeInTheDocument();
    expect(screen.getByText('R$20')).toBeInTheDocument();
  });

  it('moeda fixa em brl/R$ mesmo com navigator.language em locale não-BR (ruling: Super Reader trancado em BRL)', async () => {
    (api.createSuperReaderSession as any).mockResolvedValue({ url: 'https://stripe.example/session-brl-fixo' });
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));

    await waitFor(() => expect(api.createSuperReaderSession).toHaveBeenCalledWith('s1', 500, 'brl'));
  });

  it('clicar num valor rápido e apoiar envia esse valor em centavos', async () => {
    (api.createSuperReaderSession as any).mockResolvedValue({ url: 'https://stripe.example/session-quick' });
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$10')).toBeInTheDocument());

    fireEvent.click(screen.getByText('R$10'));
    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));

    await waitFor(() => expect(api.createSuperReaderSession).toHaveBeenCalledWith('s1', 1000, 'brl'));
    expect((window.location as any).href).toBe('https://stripe.example/session-quick');
  });

  it('campo livre aceita vírgula ("7,50") e envia 750 centavos', async () => {
    (api.createSuperReaderSession as any).mockResolvedValue({ url: 'https://stripe.example/session-a' });
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Outro valor'), { target: { value: '7,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));

    await waitFor(() => expect(api.createSuperReaderSession).toHaveBeenCalledWith('s1', 750, 'brl'));
  });

  it('campo livre aceita ponto ("7.50") e envia 750 centavos', async () => {
    (api.createSuperReaderSession as any).mockResolvedValue({ url: 'https://stripe.example/session-b' });
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Outro valor'), { target: { value: '7.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));

    await waitFor(() => expect(api.createSuperReaderSession).toHaveBeenCalledWith('s1', 750, 'brl'));
  });

  it('valor abaixo do mínimo desabilita o botão de apoiar, sem permitir tentar', async () => {
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Outro valor'), { target: { value: '1,00' } });

    expect(screen.getByRole('button', { name: 'APOIAR' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));
    expect(api.createSuperReaderSession).not.toHaveBeenCalled();
  });

  it('clique duplo no botão de apoiar no mesmo tick chama a API uma única vez', async () => {
    (api.createSuperReaderSession as any).mockResolvedValue({ url: 'https://stripe.example/session-c' });
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    const botao = screen.getByRole('button', { name: 'APOIAR' });
    // Os dois cliques precisam ficar dentro do MESMO `act()` síncrono — mesma
    // técnica de tests/frontend/pushPrompt.test.tsx — senão o primeiro
    // `fireEvent.click` isolado já commitaria `enviando=true` antes do
    // segundo clique, mascarando a corrida em vez de reproduzi-la.
    act(() => {
      fireEvent.click(botao);
      fireEvent.click(botao);
    });

    await waitFor(() => expect(api.createSuperReaderSession).toHaveBeenCalledTimes(1));
  });

  it('visitante (user null): o botão aparece, mas ao tocar recebe o convite de login, sem request', async () => {
    render(<SuperReaderButton user={null} seriesId="s1" />);
    expect(screen.getByText('SUPER READER')).toBeInTheDocument();

    fireEvent.click(screen.getByText('SUPER READER'));

    await waitFor(() =>
      expect(screen.getByText('Entre na sua conta para apoiar esta obra.')).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'APOIAR' })).not.toBeInTheDocument();
    expect(api.createSuperReaderSession).not.toHaveBeenCalled();
  });

  it('erro do backend aparece como mensagem no componente, sem alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    (api.createSuperReaderSession as any).mockRejectedValue(new Error('Série não publicada.'));
    render(<SuperReaderButton user={mockUser} seriesId="s1" />);
    abrirPainel();
    await waitFor(() => expect(screen.getByText('R$5')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'APOIAR' }));

    await waitFor(() => expect(screen.getByText('Série não publicada.')).toBeInTheDocument());
    expect(alertSpy).not.toHaveBeenCalled();
    // Trava solta depois do erro — usuário pode tentar de novo.
    expect(screen.getByRole('button', { name: 'APOIAR' })).not.toBeDisabled();
  });
});
