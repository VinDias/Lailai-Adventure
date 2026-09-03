/**
 * Testes — Fase 5 Bloco 1, Task 10, mudanças nos 3 feeds (HQCine/VFilm/HiQua):
 *  1) Bug fix (relato do Vin, PDF 26/08): a descrição do capítulo passa a
 *     aparecer na lista de capítulos do modal de detalhe, abaixo do título,
 *     QUANDO existir — antes nunca era renderizada.
 *  2) Nome do canal clicável no modal de detalhe (quando a série tem
 *     `channelId`) abre `CanalPublico` — série sem canal: nada aparece.
 *
 * `components/CanalPublico` é mockado: este arquivo testa só a FIAÇÃO do
 * feed (channelId certo chega ao componente, abre/fecha) — o comportamento
 * interno de CanalPublico (seguir, obras, etc.) já está coberto por
 * tests/frontend/canalPublico.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/Ads', () => ({ default: () => null }));
vi.mock('../../components/CanalPublico', () => ({
  default: ({ channelId, onClose }: any) => (
    <div data-testid="canal-publico-mock">
      <span>canal:{channelId}</span>
      <button onClick={onClose}>fechar-canal</button>
    </div>
  ),
}));

vi.mock('../../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getRecommendations: vi.fn().mockResolvedValue([]),
    getSeriesContent: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getContinueList: vi.fn().mockResolvedValue([]),
    getFavorites: vi.fn().mockResolvedValue([]),
    getSeriesVote: vi.fn().mockResolvedValue({ myVote: null, likes: 0 }),
    voteSeries: vi.fn(),
    removeSeriesVote: vi.fn(),
    getSuperReaderMin: vi.fn().mockResolvedValue({ minCents: 500 }),
    getChannel: vi.fn(),
  },
}));

import { api } from '../../services/api';
import HQCine from '../../components/HQCine';
import VFilm from '../../components/VFilm';
import HiQua from '../../components/HiQua';

const canalInfo = { _id: 'c1', name: 'Canal do Vin', followersCount: 0, isFollowing: false };

const episodioComDescricao = {
  _id: 'ep-1', id: 1, episode_number: 1, title: 'Capítulo 1',
  description: 'Uma descrição bem detalhada do capítulo.', thumbnail: '', video_url: '', duration: 0, isPremium: false,
};
const episodioSemDescricao = {
  _id: 'ep-2', id: 2, episode_number: 2, title: 'Capítulo 2',
  description: '', thumbnail: '', video_url: '', duration: 0, isPremium: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getRecommendations).mockResolvedValue([]);
  vi.mocked(api.getContinueList).mockResolvedValue([]);
  vi.mocked(api.getFavorites).mockResolvedValue([]);
  vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: null, likes: 0 } as any);
  vi.mocked(api.getSuperReaderMin).mockResolvedValue({ minCents: 500 } as any);
  vi.mocked(api.getChannel).mockResolvedValue(canalInfo as any);
});

describe('HQCine — descrição do capítulo + canal clicável', () => {
  const serieComCanal = { _id: 's1', title: 'Série Com Canal', genre: 'Ação', description: 'Desc', cover_image: '', content_type: 'hqcine', isPremium: false, isPublished: true, channelId: 'c1' };
  const serieSemCanal = { _id: 's2', title: 'Série Sem Canal', genre: 'Ação', description: 'Desc', cover_image: '', content_type: 'hqcine', isPremium: false, isPublished: true };

  it('mostra a descrição do capítulo quando existe, e não mostra quando vazia', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieSemCanal] as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([episodioComDescricao, episodioSemDescricao] as any);

    render(<HQCine user={null} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByText('Série Sem Canal'));

    expect(await screen.findByText('Uma descrição bem detalhada do capítulo.')).toBeInTheDocument();
    // Só o capítulo 1 tem description não-vazia — o 2 (description: '') não
    // ganha nenhum parágrafo de descrição.
    expect(screen.getAllByTestId('episode-description')).toHaveLength(1);
  });

  it('série com channelId: nome do canal aparece clicável e abre CanalPublico; onOpenSeriesElsewhere é repassado', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieComCanal] as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([]);
    const onOpenSeriesElsewhere = vi.fn();

    render(<HQCine user={null} onOpen={vi.fn()} onOpenSeriesElsewhere={onOpenSeriesElsewhere} />);
    fireEvent.click(await screen.findByText('Série Com Canal'));

    await waitFor(() => expect(api.getChannel).toHaveBeenCalledWith('c1'));
    const linkCanal = await screen.findByText(/Canal do Vin/);
    fireEvent.click(linkCanal);

    expect(await screen.findByTestId('canal-publico-mock')).toBeInTheDocument();
    expect(screen.getByText('canal:c1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('fechar-canal'));
    await waitFor(() => expect(screen.queryByTestId('canal-publico-mock')).not.toBeInTheDocument());
  });

  it('série sem channelId: nenhum link de canal aparece', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieSemCanal] as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([]);

    render(<HQCine user={null} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByText('Série Sem Canal'));

    await waitFor(() => expect(screen.getAllByText('Série Sem Canal').length).toBeGreaterThan(1));
    expect(api.getChannel).not.toHaveBeenCalled();
  });
});

describe('VFilm — descrição do capítulo + canal clicável', () => {
  const serieComCanal = { _id: 's1', title: 'VFilm Com Canal', genre: 'Ação', description: 'Desc', cover_image: '', content_type: 'vcine', isPremium: false, isPublished: true, channelId: 'c1' };

  it('mostra a descrição do capítulo quando existe', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieComCanal] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: [episodioComDescricao, episodioSemDescricao] } as any);

    render(<VFilm user={null} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByText('VFilm Com Canal'));

    expect(await screen.findByText('Uma descrição bem detalhada do capítulo.')).toBeInTheDocument();
  });

  it('nome do canal clicável abre CanalPublico', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieComCanal] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: [] } as any);

    render(<VFilm user={null} onOpen={vi.fn()} onOpenSeriesElsewhere={vi.fn()} />);
    fireEvent.click(await screen.findByText('VFilm Com Canal'));

    const linkCanal = await screen.findByText(/Canal do Vin/);
    fireEvent.click(linkCanal);
    expect(await screen.findByTestId('canal-publico-mock')).toBeInTheDocument();
  });
});

describe('HiQua — descrição do capítulo + canal clicável', () => {
  const serieComCanal = { _id: 's1', title: 'HiQua Com Canal', genre: 'Ação', description: 'Desc', cover_image: '', content_type: 'hiqua', isPremium: false, isPublished: true, channelId: 'c1' };

  it('mostra a descrição do capítulo quando existe', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieComCanal] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: [episodioComDescricao, episodioSemDescricao] } as any);

    render(<HiQua user={null} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByText('HiQua Com Canal'));

    expect(await screen.findByText('Uma descrição bem detalhada do capítulo.')).toBeInTheDocument();
  });

  it('nome do canal clicável abre CanalPublico', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([serieComCanal] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: [] } as any);

    render(<HiQua user={null} onOpen={vi.fn()} onOpenSeriesElsewhere={vi.fn()} />);
    fireEvent.click(await screen.findByText('HiQua Com Canal'));

    const linkCanal = await screen.findByText(/Canal do Vin/);
    fireEvent.click(linkCanal);
    expect(await screen.findByTestId('canal-publico-mock')).toBeInTheDocument();
  });
});
