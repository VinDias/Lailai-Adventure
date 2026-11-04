/**
 * Regressão: timer antigo do painel do admin fechando modal aberto de novo.
 *
 * O CASO REAL (achado na verificação de 04/11/2026): depois de criar uma
 * série, o AdminDashboard agendava `setTimeout(() => { setCreateMsg('');
 * setShowCreateModal(false) }, 1500)` e nunca cancelava. Se o admin fechasse o
 * modal na mão e abrisse "Nova Série" de novo dentro de 1,5 s, o timer da
 * criação anterior fechava o modal novo, com o que ele já tivesse digitado.
 * O mesmo padrão existia em mais cinco lugares (edição de série e de
 * episódio, novo episódio, anúncio, configurações).
 *
 * Segundo efeito, na suíte: o timer sobrevivia ao fim do teste. Com a máquina
 * carregada ele disparava depois que o jsdom já tinha sido desmontado,
 * estourava `ReferenceError: window is not defined`, e o Vitest saía com
 * código 1 com todos os testes passando (primeira rodada de 04/11, origem em
 * adminDashboardAprovacoesBadge.test.tsx). Ver
 * docs/verificacao-de-bugs-2026-11-04.md, item 6.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminContent: vi.fn(),
    getAdminStats: vi.fn(),
    listChannels: vi.fn(),
    getAdminAprovacoes: vi.fn(),
    createSeries: vi.fn(),
    updateSeries: vi.fn(),
    getAdminCuradoria: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const noop = () => {};

function fieldFor(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`Input não encontrado para o label "${labelText}"`);
  return input as HTMLInputElement;
}

const tituloDoModal = () => screen.queryByRole('heading', { name: 'Nova Série' });

function fecharModal() {
  const botao = tituloDoModal()?.parentElement?.querySelector('button');
  if (!botao) throw new Error('Botão de fechar do modal Nova Série não encontrado');
  fireEvent.click(botao);
}

const esperar = (ms: number) => act(() => new Promise<void>(r => setTimeout(r, ms)));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.getAdminStats).mockResolvedValue({} as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
  vi.mocked(api.createSeries).mockResolvedValue({ _id: 'serie-timer', title: 'Obra do Timer' } as any);
});

async function criarSerie() {
  fireEvent.click(screen.getByRole('button', { name: 'Nova Série' }));
  fireEvent.change(fieldFor('Título'), { target: { value: 'Obra do Timer' } });
  fireEvent.change(fieldFor('Gênero'), { target: { value: 'Drama' } });
  fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));
  expect(await screen.findByText('Série criada com sucesso!')).toBeInTheDocument();
}

describe('AdminDashboard: timer da criação anterior não mexe no modal reaberto', () => {
  it('fechar na mão e reabrir "Nova Série" dentro de 1,5 s: o modal novo continua aberto', async () => {
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());

    await criarSerie();
    fecharModal();
    expect(tituloDoModal()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nova Série' }));
    expect(tituloDoModal()).toBeInTheDocument();

    await esperar(1700);
    expect(tituloDoModal()).toBeInTheDocument();
  });

  it('o modal reaberto não herda a mensagem de sucesso da criação anterior', async () => {
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());

    await criarSerie();
    fecharModal();
    fireEvent.click(screen.getByRole('button', { name: 'Nova Série' }));

    expect(screen.queryByText('Série criada com sucesso!')).not.toBeInTheDocument();
  });

  it('sem reabrir, o modal ainda fecha sozinho depois do sucesso (comportamento mantido)', async () => {
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());

    await criarSerie();
    await esperar(1700);
    expect(tituloDoModal()).not.toBeInTheDocument();
  });

  it('desmontar o painel cancela os timers pendentes', async () => {
    const limpar = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());

    await criarSerie();
    const antes = limpar.mock.calls.length;
    unmount();
    expect(limpar.mock.calls.length).toBeGreaterThan(antes);
    limpar.mockRestore();
  });
});
