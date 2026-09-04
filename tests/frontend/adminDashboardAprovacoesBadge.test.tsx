/**
 * Testes — AdminDashboard: fiação da Fila de Aprovação (Fase 5 Bloco 1,
 * Task 10) e do badge "N não classificadas" (Fase 5 Bloco 2, Task 6). Cobre
 * só a integração que vive no próprio AdminDashboard (não duplica os testes
 * internos de AprovacoesPanel/CanaisPanel, já cobertos em
 * tests/frontend/adminAprovacoesPanel.test.tsx e adminCanaisPanel.test.tsx):
 * badges da sidebar/header buscados no load do dashboard (GET
 * /admin/aprovacoes, independente da subview atual) e navegação para a aba.
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
    createSeries: vi.fn(),
    updateSeries: vi.fn(),
    // Fase 5 Bloco 3, Task 7: o AdminDashboard passou a importar o
    // CuradoriaPanel — só o MOCK foi acrescentado aqui (nenhuma assertiva
    // existente mudou); sem ele a subview ADMIN_CURADORIA quebraria ao montar.
    getAdminCuradoria: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const noop = () => {};

// FormField (Título/Gênero) não liga label↔input por id/htmlFor — mesmo
// helper de tests/frontend/adminTags.test.tsx.
function fieldFor(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`Input não encontrado para o label "${labelText}"`);
  return input as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.getAdminStats).mockResolvedValue({} as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
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

describe('AdminDashboard — badge "N não classificadas" (Fase 5 Bloco 2, Task 6)', () => {
  it('naoClassificadas > 0: mostra o badge no cabeçalho de Gerenciar Séries', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 5 } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    expect(await screen.findByText('5 não classificadas')).toBeInTheDocument();
  });

  it('naoClassificadas = 0 (ou ausente): badge não aparece', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    expect(screen.queryByText(/não classificad/i)).not.toBeInTheDocument();
  });

  it('clicar no badge chama setSubView(ADMIN_CONTENT)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 1 } as any);
    const setSubView = vi.fn();
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={setSubView} />);
    const badge = await screen.findByText('1 não classificada');
    fireEvent.click(badge);
    expect(setSubView).toHaveBeenCalledWith(ViewMode.ADMIN_CONTENT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dívida T6 (2) — Fase 5 Bloco 2, Task 8: o badge ficava stale depois de
// salvar uma série no PRÓPRIO admin (handleSaveSeriesEdit/handleCreateSeries
// não refaziam GET /admin/aprovacoes — só "aprovar/devolver" na fila já
// refetchava, via onNaoClassificadasChange do AprovacoesPanel).
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminDashboard — badge "N não classificadas" refetch após salvar série (Dívida T6 (2))', () => {
  const existingSeries = {
    _id: 's-existing', title: 'Obra Existente Badge', genre: 'Ação', description: '',
    isPremium: false, channelId: '', releaseDay: null, tags: [], content_rating: null,
  };

  it('refetch após handleSaveSeriesEdit — badge reflete o novo total sem reabrir a tela', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [existingSeries] } as any);
    vi.mocked(api.getAdminAprovacoes)
      .mockResolvedValueOnce({ itens: [], naoClassificadas: 2 } as any)
      .mockResolvedValueOnce({ itens: [], naoClassificadas: 1 } as any);
    vi.mocked(api.updateSeries).mockResolvedValue({ ...existingSeries, content_rating: 'kids' } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Obra Existente Badge'));
    expect(await screen.findByText('2 não classificadas')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Editar título, gênero e descrição'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'SALVAR ALTERAÇÕES' }));

    await waitFor(() => expect(api.updateSeries).toHaveBeenCalled());
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('1 não classificada')).toBeInTheDocument();
  });

  it('refetch após handleCreateSeries — badge reflete o novo total sem reabrir a tela', async () => {
    vi.mocked(api.getAdminAprovacoes)
      .mockResolvedValueOnce({ itens: [], naoClassificadas: 0 } as any)
      .mockResolvedValueOnce({ itens: [], naoClassificadas: 1 } as any);
    vi.mocked(api.createSeries).mockResolvedValue({ _id: 'serie-nova-badge', title: 'Serie Nova Badge' } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/não classificad/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Nova Série'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
    fireEvent.change(fieldFor('Título'), { target: { value: 'Serie Nova Badge' } });
    fireEvent.change(fieldFor('Gênero'), { target: { value: 'Drama' } });
    fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));

    await waitFor(() => expect(api.createSeries).toHaveBeenCalled());
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('1 não classificada')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dívida T6 (2), segunda parte — chip "Sem classificação" nas séries
// PUBLICADAS sem content_rating, na própria lista de Gerenciar Séries (pra
// o Master achar QUAIS obras faltam classificar, não só QUANTAS).
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminDashboard — chip "Sem classificação" na lista de séries (Dívida T6 (2))', () => {
  it('série PUBLICADA sem content_rating (null) mostra o chip', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 1 } as any);
    vi.mocked(api.getAdminContent).mockResolvedValue({
      series: [{ _id: 's1', title: 'Serie Sem Rating', content_type: 'hqcine', isPublished: true, content_rating: null }],
    } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Serie Sem Rating'));
    expect(screen.getByText(/sem classifica/i)).toBeInTheDocument();
  });

  it('série PUBLICADA sem o campo content_rating (ausente, acervo pré-Bloco 2) também mostra o chip', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 1 } as any);
    vi.mocked(api.getAdminContent).mockResolvedValue({
      series: [{ _id: 's1', title: 'Serie Rating Ausente', content_type: 'hqcine', isPublished: true }],
    } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Serie Rating Ausente'));
    expect(screen.getByText(/sem classifica/i)).toBeInTheDocument();
  });

  it('série PUBLICADA COM content_rating não mostra o chip', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0 } as any);
    vi.mocked(api.getAdminContent).mockResolvedValue({
      series: [{ _id: 's1', title: 'Serie Classificada', content_type: 'hqcine', isPublished: true, content_rating: 'kids' }],
    } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Serie Classificada'));
    expect(screen.queryByText(/sem classifica/i)).not.toBeInTheDocument();
  });

  it('série DRAFT (não publicada) sem content_rating NÃO mostra o chip (ainda não foi ao ar)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0 } as any);
    vi.mocked(api.getAdminContent).mockResolvedValue({
      series: [{ _id: 's1', title: 'Serie Draft Sem Rating', content_type: 'hqcine', isPublished: false, content_rating: null }],
    } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Serie Draft Sem Rating'));
    expect(screen.queryByText(/sem classifica/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fase 5 Bloco 3, Task 7 — aba e badge "Curadoria". O contador vem de
// `curadoria.abertos` da MESMA resposta de GET /admin/aprovacoes
// (routes/adminPortal.js:202-220), pelo refetchAprovacoesBadges existente:
// sem rota nova e sem polling.
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminDashboard — badge "Curadoria" (Fase 5 Bloco 3, Task 7)', () => {
  it('badge "Curadoria" vem de r.curadoria.abertos da MESMA resposta; sem o campo -> 0', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0, curadoria: { abertos: 3, graves: 1 } } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);
    const link = await screen.findByText('Curadoria');
    await waitFor(() => expect(link.closest('button')).toHaveTextContent('3'));
  });

  it('resposta SEM o campo curadoria (backend degradado) — badge não aparece', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);
    const link = await screen.findByText('Curadoria');
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    expect(link.closest('button')?.textContent?.trim()).toBe('Curadoria');
  });

  it('clicar em "Curadoria" navega para ADMIN_CURADORIA', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    const setSubView = vi.fn();
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={setSubView} />);
    fireEvent.click(await screen.findByText('Curadoria'));
    expect(setSubView).toHaveBeenCalledWith(ViewMode.ADMIN_CURADORIA);
  });

  // Fix round, item 10: `graves` vinha na mesma resposta e era descartado —
  // um caso de direitos autorais (prioridade máxima, regra 4 do Vin) ficava
  // visualmente igual a um normal na sidebar.
  it('com casos graves o badge ganha destaque e o detalhe em texto (tooltip/leitor de tela)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0, curadoria: { abertos: 4, graves: 2 } } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);
    const link = await screen.findByText('Curadoria');
    const botao = link.closest('button') as HTMLElement;
    await waitFor(() => expect(botao).toHaveTextContent('4'));
    expect(botao).toHaveAttribute('title', expect.stringContaining('2 grave'));
    expect(botao.querySelector('span[class*="ring"]')).not.toBeNull();
  });

  it('sem graves o badge não recebe o destaque', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0, curadoria: { abertos: 4, graves: 0 } } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);
    const link = await screen.findByText('Curadoria');
    const botao = link.closest('button') as HTMLElement;
    await waitFor(() => expect(botao).toHaveTextContent('4'));
    expect(botao.querySelector('span[class*="ring"]')).toBeNull();
  });

  it('subview ADMIN_CURADORIA renderiza o CuradoriaPanel (que busca a própria fila)', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], curadoria: { abertos: 0, graves: 0 } } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CURADORIA} setSubView={noop} />);
    expect(await screen.findByRole('heading', { name: 'Curadoria' })).toBeInTheDocument();
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenCalledWith('abertos'));
  });
});
