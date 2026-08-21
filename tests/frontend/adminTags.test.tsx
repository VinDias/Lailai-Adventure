/**
 * Testes: Admin — chips de tags no formulário de série (Fase 4, Bloco 4, Task 1).
 * Cobre: digitar + Enter/vírgula adiciona chip, X remove, dedupe e minúsculas
 * na borda da UI, contador "n/15", aviso de mínimo quando há 1–4 tags, e o
 * envio do array certo para api.createSeries / api.updateSeries (criar E
 * editar). Tags nunca aparecem fora do admin — confirmado por grep no
 * backend, sem componente do leitor referenciando `tags`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminContent: vi.fn(),
    listChannels: vi.fn(),
    createSeries: vi.fn(),
    updateSeries: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const noop = () => {};

// FormField (Título/Gênero) não liga label↔input por id/htmlFor — o texto do
// label e o input são irmãos dentro do mesmo wrapper. Acha o input a partir
// do nó de texto do label, sem depender de ordem no DOM.
function fieldFor(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`Input não encontrado para o label "${labelText}"`);
  return input as HTMLInputElement;
}

function tagsInput(): HTMLElement {
  return screen.getByLabelText('Adicionar tag');
}

function addTag(text: string) {
  fireEvent.change(tagsInput(), { target: { value: text } });
  fireEvent.keyDown(tagsInput(), { key: 'Enter' });
}

async function openCreateModal() {
  render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
  await waitFor(() => expect(api.getAdminContent).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Nova Série'));
  await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
});

describe('AdminDashboard — chips de tags (criar série)', () => {
  it('digitar e pressionar Enter adiciona um chip', async () => {
    await openCreateModal();
    addTag('aventura');
    expect(screen.getByText('aventura')).toBeInTheDocument();
  });

  it('vírgula também adiciona o chip', async () => {
    await openCreateModal();
    fireEvent.change(tagsInput(), { target: { value: 'drama' } });
    fireEvent.keyDown(tagsInput(), { key: ',' });
    expect(screen.getByText('drama')).toBeInTheDocument();
  });

  it('normaliza para minúsculas ao adicionar', async () => {
    await openCreateModal();
    addTag('AVENTURA');
    expect(screen.getByText('aventura')).toBeInTheDocument();
    expect(screen.queryByText('AVENTURA')).not.toBeInTheDocument();
  });

  it('não duplica chip já existente, mesmo com caixa diferente', async () => {
    await openCreateModal();
    addTag('drama');
    addTag('DRAMA');
    expect(screen.getAllByText('drama')).toHaveLength(1);
  });

  it('não adiciona chip vazio (input em branco)', async () => {
    await openCreateModal();
    addTag('   ');
    expect(screen.getByText('0/15')).toBeInTheDocument();
  });

  it('botão X remove o chip', async () => {
    await openCreateModal();
    addTag('aventura');
    expect(screen.getByText('aventura')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remover tag aventura'));
    expect(screen.queryByText('aventura')).not.toBeInTheDocument();
  });

  it('mostra o contador n/15, atualizado a cada chip', async () => {
    await openCreateModal();
    expect(screen.getByText('0/15')).toBeInTheDocument();
    addTag('aventura');
    expect(screen.getByText('1/15')).toBeInTheDocument();
    addTag('drama');
    expect(screen.getByText('2/15')).toBeInTheDocument();
  });

  it('mostra aviso de mínimo 5 quando há entre 1 e 4 tags', async () => {
    await openCreateModal();
    expect(screen.queryByText(/mínimo 5/i)).not.toBeInTheDocument();
    addTag('aventura');
    expect(screen.getByText(/mínimo 5/i)).toBeInTheDocument();
  });

  it('esconde o aviso de mínimo assim que atinge 5 tags', async () => {
    await openCreateModal();
    for (const tag of ['alfa', 'beta', 'gama', 'delta', 'epsilon']) addTag(tag);
    expect(screen.getByText('5/15')).toBeInTheDocument();
    expect(screen.queryByText(/mínimo 5/i)).not.toBeInTheDocument();
  });

  it('não deixa passar de 15 chips', async () => {
    await openCreateModal();
    for (let i = 0; i < 16; i++) addTag(`tag${i}`);
    expect(screen.getByText('15/15')).toBeInTheDocument();
    expect(screen.queryByText('tag15')).not.toBeInTheDocument();
  });

  it('cria a série sem digitar nenhuma tag e envia um array vazio', async () => {
    vi.mocked(api.createSeries).mockResolvedValue({ _id: 's1', title: 'Obra Y' } as any);
    await openCreateModal();
    fireEvent.change(fieldFor('Título'), { target: { value: 'Obra Y' } });
    fireEvent.change(fieldFor('Gênero'), { target: { value: 'Drama' } });

    fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));

    await waitFor(() => expect(api.createSeries).toHaveBeenCalled());
    const payload = vi.mocked(api.createSeries).mock.calls[0][0];
    expect(payload.tags).toEqual([]);
  });

  it('cria a série enviando o array de tags digitado (minúsculas e sem duplicatas)', async () => {
    vi.mocked(api.createSeries).mockResolvedValue({ _id: 's1', title: 'Obra X' } as any);
    await openCreateModal();
    fireEvent.change(fieldFor('Título'), { target: { value: 'Obra X' } });
    fireEvent.change(fieldFor('Gênero'), { target: { value: 'Ação' } });

    addTag('Aventura');
    addTag('DRAMA');
    addTag('aventura'); // duplicata (caixa diferente) — não deve entrar de novo

    fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));

    await waitFor(() => expect(api.createSeries).toHaveBeenCalled());
    const payload = vi.mocked(api.createSeries).mock.calls[0][0];
    expect(payload.tags).toEqual(['aventura', 'drama']);
  });
});

describe('AdminDashboard — chips de tags (editar série)', () => {
  const existingSeries = {
    _id: 's-existing', title: 'Obra Existente', genre: 'Ação', description: '',
    isPremium: false, channelId: '', releaseDay: null,
    tags: ['acao', 'drama', 'comedia', 'aventura', 'romance'],
  };

  it('pré-carrega as tags existentes e envia o array atualizado ao salvar', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [existingSeries] } as any);
    vi.mocked(api.updateSeries).mockResolvedValue({ ...existingSeries, tags: [...existingSeries.tags, 'suspense'] } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Obra Existente'));

    fireEvent.click(screen.getByTitle('Editar título, gênero e descrição'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    for (const tag of existingSeries.tags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
    expect(screen.getByText('5/15')).toBeInTheDocument();

    addTag('Suspense');

    fireEvent.click(screen.getByRole('button', { name: 'SALVAR ALTERAÇÕES' }));

    await waitFor(() => expect(api.updateSeries).toHaveBeenCalled());
    const [, payload] = vi.mocked(api.updateSeries).mock.calls[0];
    expect(payload.tags).toEqual(['acao', 'drama', 'comedia', 'aventura', 'romance', 'suspense']);
  });

  it('remover uma tag existente e salvar envia o array sem ela', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [existingSeries] } as any);
    vi.mocked(api.updateSeries).mockResolvedValue({ ...existingSeries } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Obra Existente'));

    fireEvent.click(screen.getByTitle('Editar título, gênero e descrição'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Remover tag drama'));
    fireEvent.click(screen.getByRole('button', { name: 'SALVAR ALTERAÇÕES' }));

    await waitFor(() => expect(api.updateSeries).toHaveBeenCalled());
    const [, payload] = vi.mocked(api.updateSeries).mock.calls[0];
    expect(payload.tags).toEqual(['acao', 'comedia', 'aventura', 'romance']);
  });
});
