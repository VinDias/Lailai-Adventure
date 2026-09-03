/**
 * Testes — AdminDashboard: fiação da Fila de Aprovação (Fase 5 Bloco 1,
 * Task 10). Cobre só a integração que vive no próprio AdminDashboard (não
 * duplica os testes internos de AprovacoesPanel/CanaisPanel, já cobertos em
 * tests/frontend/adminAprovacoesPanel.test.tsx e adminCanaisPanel.test.tsx):
 * badge da sidebar buscado no load do dashboard (GET /admin/aprovacoes,
 * independente da subview atual) e navegação para a aba.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminContent: vi.fn(),
    getAdminStats: vi.fn(),
    listChannels: vi.fn(),
    getAdminAprovacoes: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.getAdminStats).mockResolvedValue({} as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
});

describe('AdminDashboard — badge da Fila de Aprovação', () => {
  it('busca GET /admin/aprovacoes no load do dashboard e mostra o total no badge da sidebar', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [{ tipo: 'series', id: 's1' }, { tipo: 'episode', id: 'e1' }] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);

    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    const linkAprovacoes = await screen.findByText('Aprovações');
    await waitFor(() => expect(linkAprovacoes.closest('button')).toHaveTextContent('2'));
  });

  it('sem pendências — badge não aparece (0)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);

    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    const linkAprovacoes = await screen.findByText('Aprovações');
    expect(linkAprovacoes.closest('button')?.textContent?.trim()).toBe('Aprovações');
  });

  it('clicar em "Aprovações" na sidebar chama setSubView(ADMIN_APROVACOES)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    const setSubView = vi.fn();
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={setSubView} />);

    fireEvent.click(await screen.findByText('Aprovações'));
    expect(setSubView).toHaveBeenCalledWith(ViewMode.ADMIN_APROVACOES);
  });

  it('subview ADMIN_APROVACOES renderiza o AprovacoesPanel (busca a fila de novo, pelo próprio painel)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_APROVACOES} setSubView={noop} />);
    expect(await screen.findByText('Fila de Aprovação')).toBeInTheDocument();
  });

  it('subview ADMIN_CANAIS renderiza o CanaisPanel', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CANAIS} setSubView={noop} />);
    expect(await screen.findByRole('heading', { name: 'Canais' })).toBeInTheDocument();
  });
});
