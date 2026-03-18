/**
 * Testes de componentes React
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../components/Ads', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getSeriesContent: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getRandomAd: vi.fn().mockResolvedValue(null),
    setStatusCallback: vi.fn(),
    setAuthExpiredCallback: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
  },
}));

import { api } from '../services/api';
import HiQua from '../components/HiQua';
import HQCine from '../components/HQCine';
import VFilm from '../components/VFilm';

const mockSeries = [
  { _id: 'series-1', title: 'Webtoon A', genre: 'Ação', cover_image: '', content_type: 'hiqua', description: 'desc', isPremium: false, isPublished: true },
  { _id: 'series-2', title: 'Webtoon B', genre: 'Romance', cover_image: '', content_type: 'hiqua', description: 'desc', isPremium: false, isPublished: true },
];

const mockEpisodes = [
  { _id: 'ep-1', id: 1, episode_number: 1, title: 'Capítulo 1', description: '', thumbnail: '', video_url: '', duration: 0 },
  { _id: 'ep-2', id: 2, episode_number: 2, title: 'Capítulo 2', description: '', thumbnail: '', video_url: '', duration: 0 },
];

// ─── HiQua ───────────────────────────────────────────────────────────────────

describe('HiQua', () => {
  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(mockSeries);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: mockEpisodes });
  });

  it('exibe header HI-QUA', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HI-QUA')).toBeInTheDocument());
  });

  it('exibe lista de séries após carregamento', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Webtoon A')).toBeInTheDocument();
      expect(screen.getByText('Webtoon B')).toBeInTheDocument();
    });
  });

  it('exibe "Nenhum webtoon disponível" quando lista vazia', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([]);
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nenhum webtoon/i)).toBeInTheDocument());
  });

  it('chama getSeriesContent ao clicar na série', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('Webtoon A'));

    fireEvent.click(screen.getByText('Webtoon A'));

    await waitFor(() => {
      expect(api.getSeriesContent).toHaveBeenCalledWith('series-1');
    });
  });

  it('exibe episódios no modal após carregar conteúdo', async () => {
    // Pré-popula o content via uma implementação que resolve rápido
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: mockEpisodes });

    const { rerender } = render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('Webtoon A'));

    await act(async () => {
      fireEvent.click(screen.getByText('Webtoon A'));
      // Aguarda o mock resolver
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Episódios')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getAllByText(/Capítulo 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Capítulo 2/i).length).toBeGreaterThan(0);
  });
});

// ─── HQCine ──────────────────────────────────────────────────────────────────

describe('HQCine', () => {
  const hqSeries = [{ _id: 'hq-1', title: 'HQCine A', genre: 'Ação', cover_image: '', content_type: 'hqcine', description: '', isPremium: false, isPublished: true }];
  const hqEpisodes = [{ _id: 'ep-hq-1', id: 1, episode_number: 1, title: 'HQ Cap 1', description: '', thumbnail: '', video_url: '', duration: 0 }];

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(hqSeries);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue(hqEpisodes);
  });

  it('exibe header HQCINE', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HQCINE')).toBeInTheDocument());
  });

  it('exibe episódios ao selecionar série', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('HQCine A'));

    fireEvent.click(screen.getByText('HQCine A'));

    await waitFor(() => expect(screen.getByText('HQ Cap 1')).toBeInTheDocument());
  });
});

// ─── VFilm ───────────────────────────────────────────────────────────────────

describe('VFilm', () => {
  const vSeries = [{ _id: 'v-1', title: 'VFilm A', genre: 'Drama', cover_image: '', content_type: 'vcine', description: '', isPremium: false, isPublished: true }];
  const vEpisodes = [{ _id: 'ep-v-1', id: 1, episode_number: 1, title: 'Curta 1', description: '', thumbnail: '', video_url: '', duration: 0 }];

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(vSeries);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: vEpisodes });
  });

  it('exibe header V-FILM', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('V-FILM')).toBeInTheDocument());
  });

  it('exibe episódios ao selecionar série', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('VFilm A'));

    fireEvent.click(screen.getByText('VFilm A'));

    await waitFor(() => expect(screen.getByText('Curta 1')).toBeInTheDocument());
  });
});
