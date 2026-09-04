/**
 * Testes: Admin — seletor de tags no formulário de série (Fase 5 Bloco 2,
 * Task 6 — RE-PINADO do desenho livre do Bloco 4).
 * Cobre: 19 chips do vocabulário fechado (rótulo PT do JSON —
 * utils/tagsVocabulario.json), clique liga/desliga, máx 8 (chips extras
 * desabilitados ao atingir o teto), contador "n/8", SEM input livre e SEM o
 * aviso de "mínimo 5" (revogado — spec rev.3, "Cardinalidade × algoritmo"),
 * e o envio do array certo para api.createSeries / api.updateSeries (criar E
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
    // AdminDashboard busca a fila de aprovação uma vez no mount, para o
    // badge da sidebar (Fase 5 Bloco 1, Task 10) — precisa existir no mock
    // mesmo em testes que não exercitam essa aba.
    getAdminAprovacoes: vi.fn().mockResolvedValue({ itens: [], naoClassificadas: 0 }),
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

function tagChip(rotuloPt: string): HTMLElement {
  return screen.getByRole('button', { name: rotuloPt });
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

describe('AdminDashboard — seletor fechado de tags (criar série)', () => {
  it('renderiza os 19 chips do vocabulário com o rótulo PT', async () => {
    await openCreateModal();
    ['Romance', 'Drama', 'Comédia', 'Ação', 'Aventura', 'Fantasia', 'Dark Fantasy',
      'Ficção Científica', 'Terror', 'Thriller', 'Mistério', 'Crime', 'Histórico',
      'Sobrenatural', 'Super-heróis', 'Slice of Life', 'High School', 'Psicológico', 'LGBTQIA+',
    ].forEach(rotulo => expect(tagChip(rotulo)).toBeInTheDocument());
  });

  it('nenhum chip selecionado por padrão — contador 0/8', async () => {
    await openCreateModal();
    expect(screen.getByText('0/8')).toBeInTheDocument();
    ['Romance', 'Aventura'].forEach(r => expect(tagChip(r)).toHaveAttribute('aria-pressed', 'false'));
  });

  it('clicar num chip liga (aria-pressed=true) e atualiza o contador', async () => {
    await openCreateModal();
    fireEvent.click(tagChip('Aventura'));
    expect(tagChip('Aventura')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1/8')).toBeInTheDocument();
  });

  it('clicar de novo no mesmo chip desliga (toggle)', async () => {
    await openCreateModal();
    fireEvent.click(tagChip('Aventura'));
    fireEvent.click(tagChip('Aventura'));
    expect(tagChip('Aventura')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('0/8')).toBeInTheDocument();
  });

  it('ao atingir 8 chips, os demais ficam desabilitados; os 8 ligados continuam clicáveis (dá pra desligar)', async () => {
    await openCreateModal();
    const oito = ['Romance', 'Drama', 'Comédia', 'Ação', 'Aventura', 'Fantasia', 'Terror', 'Thriller'];
    oito.forEach(r => fireEvent.click(tagChip(r)));
    expect(screen.getByText('8/8')).toBeInTheDocument();

    expect(tagChip('Mistério')).toBeDisabled();
    expect(tagChip('Aventura')).not.toBeDisabled();

    // Chip desabilitado não liga mesmo se clicado.
    fireEvent.click(tagChip('Mistério'));
    expect(tagChip('Mistério')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('8/8')).toBeInTheDocument();

    // Desligar um dos 8 libera espaço.
    fireEvent.click(tagChip('Aventura'));
    expect(screen.getByText('7/8')).toBeInTheDocument();
    expect(tagChip('Mistério')).not.toBeDisabled();
  });

  it('SEM input livre de tag e SEM aviso de mínimo 5 (revogados na Task 6)', async () => {
    await openCreateModal();
    expect(screen.queryByLabelText('Adicionar tag')).not.toBeInTheDocument();
    fireEvent.click(tagChip('Aventura'));
    expect(screen.queryByText(/mínimo 5/i)).not.toBeInTheDocument();
  });

  it('cria a série sem selecionar nenhuma tag e envia um array vazio', async () => {
    vi.mocked(api.createSeries).mockResolvedValue({ _id: 's1', title: 'Obra Y' } as any);
    await openCreateModal();
    fireEvent.change(fieldFor('Título'), { target: { value: 'Obra Y' } });
    fireEvent.change(fieldFor('Gênero'), { target: { value: 'Drama' } });

    fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));

    await waitFor(() => expect(api.createSeries).toHaveBeenCalled());
    const payload = vi.mocked(api.createSeries).mock.calls[0][0];
    expect(payload.tags).toEqual([]);
  });

  it('cria a série enviando os slugs das tags selecionadas', async () => {
    vi.mocked(api.createSeries).mockResolvedValue({ _id: 's1', title: 'Obra X' } as any);
    await openCreateModal();
    fireEvent.change(fieldFor('Título'), { target: { value: 'Obra X' } });
    fireEvent.change(fieldFor('Gênero'), { target: { value: 'Ação' } });

    fireEvent.click(tagChip('Aventura'));
    fireEvent.click(tagChip('Drama'));

    fireEvent.click(screen.getByRole('button', { name: 'CRIAR SÉRIE' }));

    await waitFor(() => expect(api.createSeries).toHaveBeenCalled());
    const payload = vi.mocked(api.createSeries).mock.calls[0][0];
    expect(payload.tags.sort()).toEqual(['aventura', 'drama'].sort());
  });
});

describe('AdminDashboard — seletor fechado de tags (editar série)', () => {
  const existingSeries = {
    _id: 's-existing', title: 'Obra Existente', genre: 'Ação', description: '',
    isPremium: false, channelId: '', releaseDay: null,
    tags: ['acao', 'drama', 'comedia', 'aventura', 'romance'],
  };

  it('pré-carrega as tags existentes (chips ligados) e envia o array atualizado ao salvar', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [existingSeries] } as any);
    vi.mocked(api.updateSeries).mockResolvedValue({ ...existingSeries, tags: [...existingSeries.tags, 'thriller'] } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Obra Existente'));

    fireEvent.click(screen.getByTitle('Editar título, gênero e descrição'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    ['Ação', 'Drama', 'Comédia', 'Aventura', 'Romance'].forEach(r => {
      expect(tagChip(r)).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByText('5/8')).toBeInTheDocument();

    fireEvent.click(tagChip('Thriller'));

    fireEvent.click(screen.getByRole('button', { name: 'SALVAR ALTERAÇÕES' }));

    await waitFor(() => expect(api.updateSeries).toHaveBeenCalled());
    const [, payload] = vi.mocked(api.updateSeries).mock.calls[0];
    expect(payload.tags.sort()).toEqual(['acao', 'aventura', 'comedia', 'drama', 'romance', 'thriller'].sort());
  });

  it('desligar uma tag existente e salvar envia o array sem ela', async () => {
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [existingSeries] } as any);
    vi.mocked(api.updateSeries).mockResolvedValue({ ...existingSeries } as any);

    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
    await waitFor(() => screen.getByText('Obra Existente'));

    fireEvent.click(screen.getByTitle('Editar título, gênero e descrição'));
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    fireEvent.click(tagChip('Drama'));
    fireEvent.click(screen.getByRole('button', { name: 'SALVAR ALTERAÇÕES' }));

    await waitFor(() => expect(api.updateSeries).toHaveBeenCalled());
    const [, payload] = vi.mocked(api.updateSeries).mock.calls[0];
    expect(payload.tags.sort()).toEqual(['acao', 'aventura', 'comedia', 'romance'].sort());
  });
});
