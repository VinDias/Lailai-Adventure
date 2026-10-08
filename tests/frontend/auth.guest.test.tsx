/**
 * Testes — botão "Explorar sem conta" em components/Auth.tsx (Fase "acesso
 * sem conta"). Só aparece no modo login, e só quando a prop onGuest é
 * passada — ver docs/superpowers/specs/2026-08-21-acesso-visitante-design.md.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../services/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    googleLogin: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

import Auth from '../../components/Auth';

const BOTAO_VISITANTE = 'Explorar sem conta';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Auth — botão "Explorar sem conta"', () => {
  it('aparece no modo login quando onGuest é passado', () => {
    render(<Auth onLogin={vi.fn()} onGuest={vi.fn()} />);
    expect(screen.getByText(BOTAO_VISITANTE)).toBeInTheDocument();
  });

  it('chama onGuest ao clicar', () => {
    const onGuest = vi.fn();
    render(<Auth onLogin={vi.fn()} onGuest={onGuest} />);
    fireEvent.click(screen.getByText(BOTAO_VISITANTE));
    expect(onGuest).toHaveBeenCalledTimes(1);
  });

  it('não aparece sem a prop onGuest', () => {
    render(<Auth onLogin={vi.fn()} />);
    expect(screen.queryByText(BOTAO_VISITANTE)).not.toBeInTheDocument();
  });

  it('não aparece no modo cadastro', () => {
    render(<Auth onLogin={vi.fn()} onGuest={vi.fn()} />);
    fireEvent.click(screen.getByText(/não tem conta\? criar agora/i));
    expect(screen.queryByText(BOTAO_VISITANTE)).not.toBeInTheDocument();
  });

  it('não aparece no modo recuperação de senha', () => {
    render(<Auth onLogin={vi.fn()} onGuest={vi.fn()} />);
    fireEvent.click(screen.getByText(/esqueci minha senha/i));
    expect(screen.queryByText(BOTAO_VISITANTE)).not.toBeInTheDocument();
  });
});

/**
 * Fase 6, T7: a tela de bloqueio promete "Criar minha conta". Antes desta
 * prop, o convite abria o formulário de LOGIN, com o cadastro atrás de um
 * link — um clique a mais logo depois de a pessoa já ter dito que queria
 * criar conta. Achado no E2E no app real.
 */
describe('Auth — modo inicial', () => {
  it('abre no login por padrão (todo o resto do app depende disso)', () => {
    render(<Auth onLogin={vi.fn()} onGuest={vi.fn()} />);
    expect(screen.getByText(BOTAO_VISITANTE)).toBeInTheDocument(); // só existe no modo login
    expect(screen.queryByText(/já tenho uma conta/i)).not.toBeInTheDocument();
  });

  it('abre direto no cadastro quando modoInicial="register"', () => {
    render(<Auth onLogin={vi.fn()} onGuest={vi.fn()} modoInicial="register" />);
    expect(screen.getByText(/já tenho uma conta/i)).toBeInTheDocument();
    // "Explorar sem conta" é exclusivo do modo login — sua ausência confirma
    // que a tela abriu no cadastro, não no login.
    expect(screen.queryByText(BOTAO_VISITANTE)).not.toBeInTheDocument();
  });
});
