/**
 * Testes — components/GuestAccountPrompt.tsx: convite de conta mostrado na
 * aba Conta para quem está no modo visitante (view === PROFILE && !user).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import GuestAccountPrompt from '../../components/GuestAccountPrompt';

describe('GuestAccountPrompt', () => {
  it('renderiza título, corpo e CTA', () => {
    render(<GuestAccountPrompt onLogin={vi.fn()} />);
    expect(screen.getByText('Crie sua conta para aproveitar tudo')).toBeInTheDocument();
    expect(screen.getByText(/favorita obras/i)).toBeInTheDocument();
    expect(screen.getByText('Entrar ou criar conta')).toBeInTheDocument();
  });

  it('chama onLogin ao clicar no CTA', () => {
    const onLogin = vi.fn();
    render(<GuestAccountPrompt onLogin={onLogin} />);
    fireEvent.click(screen.getByText('Entrar ou criar conta'));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
