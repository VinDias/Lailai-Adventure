/**
 * Testes de favoritos e curtida por obra
 * Cobre: toggle de favorito nos modais de série, like da série, badge PREMIUM
 * em episódios e a tela Meus Favoritos.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/Ads', () => ({ default: () => null }));
vi.mock('../../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getSeriesContent: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getRandomAd: vi.fn().mockResolvedValue(null),
    getFavorites: vi.fn().mockResolvedValue([]),
    addFavorite: vi.fn().mockResolvedValue({ favorited: true }),
    removeFavorite: vi.fn().mockResolvedValue({ favorited: false }),
    getSeriesVote: vi.fn().mockResolvedValue({ myVote: null, likes: 0 }),
    voteSeries: vi.fn().mockResolvedValue({ success: true, type: 'like' }),
    removeSeriesVote: vi.fn().mockResolvedValue({ success: true }),
    getPublicSettings: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';
import HQCine from '../../components/HQCine';
import MyFavorites from '../../components/MyFavorites';

// Limpa o histórico de chamadas entre testes (mantém as implementações mockadas)
beforeEach(() => vi.clearAllMocks());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeUser = (overrides = {}) => ({
  id: 'u1', email: 'user@test.com', nome: 'User', role: 'user',
  isPremium: false, avatar: '', provider: 'local' as const, criadoEm: '',
  premiumExpiresAt: undefined, followingChannelIds: [], ...overrides,
});

const makeSeries = (overrides = {}) => ({
  _id: 'hq-1', title: 'HQCine Alpha', genre: 'Ação', description: 'Desc',
  cover_image: '', content_type: 'hqcine', isPremium: false, isPublished: true, ...overrides,
});

const makeEpisode = (overrides = {}) => ({
  _id: 'ep-1', id: 1, episode_number: 1, title: 'HQ Cap 1',
  description: '', thumbnail: '', video_url: '', duration: 0, isPremium: false, ...overrides,
});

const openSeriesDetail = async () => {
  render(<HQCine user={makeUser() as any} onOpen={vi.fn()} />);
  await waitFor(() => screen.getByText('HQCine Alpha'));
  fireEvent.click(screen.getByText('HQCine Alpha'));
  await waitFor(() => expect(screen.getByText('HQ Cap 1')).toBeInTheDocument());
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOGGLE DE FAVORITO (modal de detalhe da série)
// ═══════════════════════════════════════════════════════════════════════════════

describe('HQCine — toggle de favorito', () => {
  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue([makeSeries()] as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([makeEpisode()] as any);
    vi.mocked(api.getFavorites).mockResolvedValue([]);
    vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: null, likes: 0 });
    vi.mocked(api.addFavorite).mockResolvedValue({ favorited: true });
    vi.mocked(api.removeFavorite).mockResolvedValue({ favorited: false });
  });

  it('mostra "ADICIONAR À LISTA" quando a série não está nos favoritos', async () => {
    await openSeriesDetail();
    await waitFor(() => expect(screen.getByText('ADICIONAR À LISTA')).toBeInTheDocument());
  });

  it('mostra "NA MINHA LISTA" quando a série já está nos favoritos', async () => {
    vi.mocked(api.getFavorites).mockResolvedValue([
      { seriesId: 'hq-1', series: makeSeries() },
    ] as any);
    await openSeriesDetail();
    await waitFor(() => expect(screen.getByText('NA MINHA LISTA')).toBeInTheDocument());
  });

  it('clique chama addFavorite e muda para "NA MINHA LISTA"', async () => {
    await openSeriesDetail();
    await waitFor(() => screen.getByText('ADICIONAR À LISTA'));
    fireEvent.click(screen.getByText('ADICIONAR À LISTA'));
    await waitFor(() => expect(api.addFavorite).toHaveBeenCalledWith('hq-1'));
    await waitFor(() => expect(screen.getByText('NA MINHA LISTA')).toBeInTheDocument());
  });

  it('clique quando favoritado chama removeFavorite e volta para "ADICIONAR À LISTA"', async () => {
    vi.mocked(api.getFavorites).mockResolvedValue([
      { seriesId: 'hq-1', series: makeSeries() },
    ] as any);
    await openSeriesDetail();
    await waitFor(() => screen.getByText('NA MINHA LISTA'));
    fireEvent.click(screen.getByText('NA MINHA LISTA'));
    await waitFor(() => expect(api.removeFavorite).toHaveBeenCalledWith('hq-1'));
    await waitFor(() => expect(screen.getByText('ADICIONAR À LISTA')).toBeInTheDocument());
  });

  it('mantém "ADICIONAR À LISTA" se addFavorite falhar', async () => {
    vi.mocked(api.addFavorite).mockRejectedValue(new Error('fail'));
    await openSeriesDetail();
    await waitFor(() => screen.getByText('ADICIONAR À LISTA'));
    fireEvent.click(screen.getByText('ADICIONAR À LISTA'));
    await waitFor(() => expect(api.addFavorite).toHaveBeenCalled());
    expect(screen.getByText('ADICIONAR À LISTA')).toBeInTheDocument();
  });

  it('usuário anônimo vê botão desabilitado e não chama addFavorite', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    fireEvent.click(screen.getByText('HQCine Alpha'));
    await waitFor(() => screen.getByText('ADICIONAR À LISTA'));
    expect(screen.getByText('ADICIONAR À LISTA').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('ADICIONAR À LISTA'));
    expect(api.addFavorite).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CURTIDA NA OBRA
// ═══════════════════════════════════════════════════════════════════════════════

describe('HQCine — curtida na série', () => {
  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue([makeSeries()] as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([makeEpisode()] as any);
    vi.mocked(api.getFavorites).mockResolvedValue([]);
    vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: null, likes: 5 });
    vi.mocked(api.voteSeries).mockResolvedValue({ success: true, type: 'like' });
    vi.mocked(api.removeSeriesVote).mockResolvedValue({ success: true });
  });

  it('exibe contador de likes carregado via getSeriesVote', async () => {
    await openSeriesDetail();
    await waitFor(() => expect(api.getSeriesVote).toHaveBeenCalledWith('hq-1'));
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });

  it('clique chama voteSeries e incrementa contador otimisticamente', async () => {
    await openSeriesDetail();
    await waitFor(() => screen.getByText('5'));
    fireEvent.click(screen.getByLabelText('Curtir série'));
    await waitFor(() => expect(api.voteSeries).toHaveBeenCalledWith('hq-1', 'like'));
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('clique quando já curtido chama removeSeriesVote e decrementa contador', async () => {
    vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: 'like', likes: 5 });
    await openSeriesDetail();
    await waitFor(() => screen.getByText('5'));
    fireEvent.click(screen.getByLabelText('Curtir série'));
    await waitFor(() => expect(api.removeSeriesVote).toHaveBeenCalledWith('hq-1'));
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('reverte contador se voteSeries falhar', async () => {
    vi.mocked(api.voteSeries).mockRejectedValue(new Error('fail'));
    await openSeriesDetail();
    await waitFor(() => screen.getByText('5'));
    fireEvent.click(screen.getByLabelText('Curtir série'));
    await waitFor(() => expect(api.voteSeries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BADGE PREMIUM EM EPISÓDIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('HQCine — badge PREMIUM em episódios', () => {
  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue([makeSeries()] as any);
    vi.mocked(api.getFavorites).mockResolvedValue([]);
    vi.mocked(api.getSeriesVote).mockResolvedValue({ myVote: null, likes: 0 });
  });

  it('exibe badge PREMIUM apenas nos episódios premium', async () => {
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([
      makeEpisode({ _id: 'ep-1', title: 'HQ Cap 1', isPremium: false }),
      makeEpisode({ _id: 'ep-2', episode_number: 2, title: 'HQ Cap 2', isPremium: true }),
    ] as any);
    await openSeriesDetail();
    await waitFor(() => expect(screen.getByText('HQ Cap 2')).toBeInTheDocument());
    expect(screen.getAllByText('PREMIUM')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TELA MEUS FAVORITOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyFavorites', () => {
  const favUser = makeUser();

  beforeEach(() => {
    vi.mocked(api.getFavorites).mockResolvedValue([
      { seriesId: 'hq-1', series: makeSeries({ _id: 'hq-1', title: 'HQCine Alpha', content_type: 'hqcine' }) },
      { seriesId: 'wt-1', series: makeSeries({ _id: 'wt-1', title: 'Webtoon Beta', content_type: 'hiqua' }) },
    ] as any);
    vi.mocked(api.removeFavorite).mockResolvedValue({ favorited: false });
  });

  it('exibe grid com as séries favoritadas', async () => {
    render(<MyFavorites user={favUser as any} onOpenSeries={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('HQCine Alpha')).toBeInTheDocument();
      expect(screen.getByText('Webtoon Beta')).toBeInTheDocument();
    });
  });

  it('exibe estado vazio quando não há favoritos', async () => {
    vi.mocked(api.getFavorites).mockResolvedValue([]);
    render(<MyFavorites user={favUser as any} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/você ainda não adicionou nada à lista/i)).toBeInTheDocument());
  });

  it('clicar no card chama onOpenSeries com id e content_type', async () => {
    const onOpenSeries = vi.fn();
    render(<MyFavorites user={favUser as any} onOpenSeries={onOpenSeries} />);
    await waitFor(() => screen.getByText('Webtoon Beta'));
    fireEvent.click(screen.getByText('Webtoon Beta'));
    expect(onOpenSeries).toHaveBeenCalledWith('wt-1', 'hiqua');
  });

  it('botão de remover chama removeFavorite e tira o card da lista', async () => {
    render(<MyFavorites user={favUser as any} onOpenSeries={vi.fn()} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    const removeButtons = screen.getAllByLabelText('Remover dos favoritos');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => expect(api.removeFavorite).toHaveBeenCalledWith('hq-1'));
    await waitFor(() => expect(screen.queryByText('HQCine Alpha')).not.toBeInTheDocument());
    expect(screen.getByText('Webtoon Beta')).toBeInTheDocument();
  });

  it('remover não dispara onOpenSeries (stopPropagation)', async () => {
    const onOpenSeries = vi.fn();
    render(<MyFavorites user={favUser as any} onOpenSeries={onOpenSeries} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    fireEvent.click(screen.getAllByLabelText('Remover dos favoritos')[0]);
    await waitFor(() => expect(api.removeFavorite).toHaveBeenCalled());
    expect(onOpenSeries).not.toHaveBeenCalled();
  });

  it('usuário anônimo vê estado vazio sem chamar getFavorites', async () => {
    render(<MyFavorites user={null} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/você ainda não adicionou nada à lista/i)).toBeInTheDocument());
    expect(api.getFavorites).not.toHaveBeenCalled();
  });
});
