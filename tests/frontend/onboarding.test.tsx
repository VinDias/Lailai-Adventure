/**
 * Testes: Onboarding (walkthrough de primeiro uso)
 * Contrato: 4 passos, "Pular" e conclusão gravam lorflux_onboarded=1,
 * hasSeenOnboarding() controla reexibição.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import Onboarding, { hasSeenOnboarding } from '../../components/Onboarding';

beforeEach(() => {
  localStorage.clear();
});

describe('Onboarding', () => {
  it('mostra o primeiro passo (HQCine) ao abrir', () => {
    render(<Onboarding onFinish={vi.fn()} />);
    expect(screen.getByText('HQCine')).toBeInTheDocument();
  });

  it('navega pelos 4 passos até o botão de começar', () => {
    render(<Onboarding onFinish={vi.fn()} />);
    const next = () => fireEvent.click(screen.getByRole('button', { name: /próximo|next/i }));

    next(); // 2: VCine
    expect(screen.getByText('VCine')).toBeInTheDocument();
    next(); // 3: Hi-Qua
    expect(screen.getByText('Hi-Qua')).toBeInTheDocument();
    next(); // 4: último passo
    expect(screen.getByRole('button', { name: /começar|start/i })).toBeInTheDocument();
  });

  it('concluir grava a flag e chama onFinish', () => {
    const onFinish = vi.fn();
    render(<Onboarding onFinish={onFinish} />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: /próximo|next/i }));
    fireEvent.click(screen.getByRole('button', { name: /começar|start/i }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('lorflux_onboarded')).toBe('1');
  });

  it('"Pular" grava a flag e chama onFinish imediatamente', () => {
    const onFinish = vi.fn();
    render(<Onboarding onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: /pular|skip/i }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('lorflux_onboarded')).toBe('1');
  });

  it('hasSeenOnboarding reflete a flag', () => {
    expect(hasSeenOnboarding()).toBe(false);
    localStorage.setItem('lorflux_onboarded', '1');
    expect(hasSeenOnboarding()).toBe(true);
  });
});
