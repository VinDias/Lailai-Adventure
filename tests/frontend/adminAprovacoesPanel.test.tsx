/**
 * Testes — AprovacoesPanel (Fase 5 Bloco 1, Task 10): Fila de Aprovação no
 * admin (PT fixo, sem i18n). Pina o shape FLAT de GET /admin/aprovacoes
 * (routes/adminPortal.js): `tipo: 'series'|'episode'`, preview por item.
 * Cobre: render dos cards (preview/classificação sugerida/canal/data),
 * Aprovar bloqueado sem gênero (série), envio de genre/tags editados,
 * episódio com série não publicada (mensagem legível do 400), Devolver
 * (texto obrigatório) e refetch da fila + badge após qualquer ação.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminAprovacoes: vi.fn(),
    aprovarSerieAdmin: vi.fn(),
    aprovarEpisodioAdmin: vi.fn(),
    devolverAprovacao: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AprovacoesPanel from '../../components/Admin/AprovacoesPanel';

const itemSerie = {
  tipo: 'series', id: 's1', title: 'Obra Submetida', description: 'Uma obra nova',
  cover_image: 'https://cdn/capa.jpg', content_rating_sugerida: 'teen', genre: null, tags: [],
  canal: { id: 'c1', name: 'Canal do Vin' }, submittedAt: '2026-08-20T10:00:00.000Z',
};

const itemSerieComGenero = {
  ...itemSerie, id: 's2', title: 'Obra Com Genero Existente', genre: 'Comédia', tags: ['acao', 'aventura'],
};

const itemEpisodioSeriePublicada = {
  tipo: 'episode', id: 'e1', title: 'Cap Submetido', description: 'Descricao do cap',
  thumbnail: 'https://cdn/thumb.jpg', panelCount: 3,
  serie: { id: 's3', title: 'Serie Publicada', isPublished: true },
  canal: { id: 'c1', name: 'Canal do Vin' }, submittedAt: '2026-08-21T10:00:00.000Z',
};

const itemEpisodioSerieNaoPublicada = {
  ...itemEpisodioSeriePublicada, id: 'e2', title: 'Cap Aguardando Serie',
  serie: { id: 's4', title: 'Serie Nao Publicada', isPublished: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AprovacoesPanel — render', () => {
  it('carrega a fila ao montar e chama onCountChange com o total', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie, itemEpisodioSeriePublicada] } as any);
    const onCountChange = vi.fn();
    render(<AprovacoesPanel onCountChange={onCountChange} />);

    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Obra Submetida')).toBeInTheDocument();
    expect(screen.getByText('Cap Submetido')).toBeInTheDocument();
  });

  it('fila vazia — sem erro, mostra estado vazio', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    render(<AprovacoesPanel />);
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalled());
    expect(await screen.findByText(/nenhum item|nada pendente|fila vazia/i)).toBeInTheDocument();
  });

  it('mostra classificação sugerida e nome do canal do item', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');
    expect(screen.getByText(/teen/i)).toBeInTheDocument();
    expect(screen.getByText('Canal do Vin')).toBeInTheDocument();
  });
});

describe('AprovacoesPanel — Aprovar série', () => {
  it('sem gênero (nem preenchido, nem editado) — botão Aprovar desabilitado', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
  });

  it('série já com gênero preenchido — Aprovar habilitado sem precisar editar', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerieComGenero] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Com Genero Existente');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
  });

  it('preencher o gênero habilita Aprovar e envia genre/tags editados', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    vi.mocked(api.aprovarSerieAdmin).mockResolvedValue({ _id: 's1', isPublished: true } as any);
    render(<AprovacoesPanel onCountChange={vi.fn()} />);
    await screen.findByText('Obra Submetida');

    const inputGenero = screen.getByPlaceholderText(/g[eê]nero/i);
    fireEvent.change(inputGenero, { target: { value: 'Aventura' } });

    const inputTag = screen.getByLabelText('Adicionar tag');
    fireEvent.change(inputTag, { target: { value: 'epico' } });
    fireEvent.keyDown(inputTag, { key: 'Enter' });

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
    fireEvent.click(botaoAprovar);

    await waitFor(() => expect(api.aprovarSerieAdmin).toHaveBeenCalledWith('s1', { genre: 'Aventura', tags: ['epico'] }));
    // Refetch da fila após a ação.
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
  });
});

describe('AprovacoesPanel — Aprovar episódio', () => {
  it('série não publicada — Aprovar desabilitado e mensagem legível visível', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSerieNaoPublicada] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Cap Aguardando Serie');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).toBeDisabled();
    expect(screen.getByText(/aprove a s[eé]rie primeiro/i)).toBeInTheDocument();
  });

  it('série publicada — Aprovar habilitado e chama aprovarEpisodioAdmin', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemEpisodioSeriePublicada] } as any);
    vi.mocked(api.aprovarEpisodioAdmin).mockResolvedValue({ _id: 'e1', status: 'published' } as any);
    render(<AprovacoesPanel onCountChange={vi.fn()} />);
    await screen.findByText('Cap Submetido');

    const botaoAprovar = screen.getAllByRole('button', { name: /aprovar/i })[0];
    expect(botaoAprovar).not.toBeDisabled();
    fireEvent.click(botaoAprovar);

    await waitFor(() => expect(api.aprovarEpisodioAdmin).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
  });
});

describe('AprovacoesPanel — Devolver', () => {
  it('exige texto: sem digitar nada, confirmar não chama a API', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [itemSerie] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Obra Submetida');

    fireEvent.click(screen.getAllByRole('button', { name: /devolver/i })[0]);
    const botaoConfirmar = screen.getByRole('button', { name: /confirmar|enviar/i });
    expect(botaoConfirmar).toBeDisabled();
    expect(api.devolverAprovacao).not.toHaveBeenCalled();
  });

  it('com texto — chama devolverAprovacao(tipo, id, texto) e refetch da fila + badge', async () => {
    vi.mocked(api.getAdminAprovacoes)
      .mockResolvedValueOnce({ itens: [itemSerie] } as any) // load inicial
      .mockResolvedValueOnce({ itens: [] } as any); // refetch pós-devolução: item saiu da fila
    vi.mocked(api.devolverAprovacao).mockResolvedValue({ success: true, mensagem: {} } as any);
    const onCountChange = vi.fn();
    render(<AprovacoesPanel onCountChange={onCountChange} />);
    await screen.findByText('Obra Submetida');

    fireEvent.click(screen.getAllByRole('button', { name: /devolver/i })[0]);
    const textarea = screen.getByPlaceholderText(/motivo|mensagem|texto/i);
    fireEvent.change(textarea, { target: { value: 'Falta caprichar na capa.' } });

    const botaoConfirmar = screen.getByRole('button', { name: /confirmar|enviar/i });
    expect(botaoConfirmar).not.toBeDisabled();
    fireEvent.click(botaoConfirmar);

    await waitFor(() => expect(api.devolverAprovacao).toHaveBeenCalledWith('series', 's1', 'Falta caprichar na capa.'));
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));
  });
});
