/**
 * Testes de componentes React
 * Cobre: HiQua, HQCine, VFilm, Auth
 * Tipos de usuário: null (anônimo), user, premium, admin
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/Ads', () => ({ default: () => null }));
vi.mock('../../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getSeriesContent: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getRandomAd: vi.fn().mockResolvedValue(null),
    login: vi.fn(),
    register: vi.fn(),
    setStatusCallback: vi.fn(),
    setAuthExpiredCallback: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    vote: vi.fn(),
    removeVote: vi.fn(),
  },
}));

import { api } from '../../services/api';
import HiQua from '../../components/HiQua';
import HQCine from '../../components/HQCine';
import VFilm from '../../components/VFilm';
import Auth from '../../components/Auth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeUser = (overrides = {}) => ({
  id: 'u1', email: 'user@test.com', nome: 'User', role: 'user',
  isPremium: false, avatar: '', provider: 'local' as const, criadoEm: '',
  premiumExpiresAt: undefined, followingChannelIds: [], ...overrides,
});

const makeSeries = (overrides = {}) => ({
  _id: 'series-1', title: 'Série Teste', genre: 'Ação', description: 'Desc',
  cover_image: '', content_type: 'hiqua', isPremium: false, isPublished: true, ...overrides,
});

const makeEpisode = (overrides = {}) => ({
  _id: 'ep-1', id: 1, episode_number: 1, title: 'Capítulo 1',
  description: '', thumbnail: '', video_url: '', duration: 0, isPremium: false, ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auth — Login', () => {
  const onLogin = vi.fn();

  beforeEach(() => {
    vi.mocked(api.login).mockResolvedValue(
      makeUser({ accessToken: 'tok', refreshToken: 'ref' }) as any
    );
  });

  it('renderiza formulário de login', () => {
    render(<Auth onLogin={onLogin} />);
    expect(screen.getByPlaceholderText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/senha/i)).toBeInTheDocument();
  });

  it('chama api.login com credenciais corretas', async () => {
    render(<Auth onLogin={onLogin} />);
    fireEvent.change(screen.getByPlaceholderText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/senha/i), { target: { value: '123' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: 'a@b.com', password: '123' }));
  });

  it('chama onLogin após login bem-sucedido', async () => {
    render(<Auth onLogin={onLogin} />);
    fireEvent.change(screen.getByPlaceholderText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/senha/i), { target: { value: '123' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(onLogin).toHaveBeenCalled());
  });

  it('exibe mensagem de erro ao falhar login', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('E-mail ou senha incorretos.'));
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e-mail/i), { target: { value: 'x@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/senha/i), { target: { value: 'errado' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/e-mail ou senha/i)).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HI-QUA
// ═══════════════════════════════════════════════════════════════════════════════

describe('HiQua — usuário anônimo', () => {
  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue([
      makeSeries({ _id: 's1', title: 'Webtoon A', content_type: 'hiqua' }),
      makeSeries({ _id: 's2', title: 'Webtoon B', content_type: 'hiqua' }),
    ] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({
      seasons: [],
      episodes: [
        makeEpisode({ _id: 'ep-1', episode_number: 1, title: 'Capítulo 1', isPremium: false }),
        makeEpisode({ _id: 'ep-2', episode_number: 2, title: 'Capítulo 2', isPremium: false }),
      ],
    } as any);
  });

  it('exibe header HI-QUA', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HI-QUA')).toBeInTheDocument());
  });

  it('exibe lista de séries', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Webtoon A')).toBeInTheDocument();
      expect(screen.getByText('Webtoon B')).toBeInTheDocument();
    });
  });

  it('exibe "Nenhum webtoon" quando lista vazia', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([]);
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nenhum webtoon/i)).toBeInTheDocument());
  });

  it('chama getSeriesContent ao clicar na série', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('Webtoon A'));
    fireEvent.click(screen.getByText('Webtoon A'));
    await waitFor(() => expect(api.getSeriesContent).toHaveBeenCalledWith('s1'));
  });

  it('exibe episódios após abrir série', async () => {
    render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('Webtoon A'));
    await act(async () => { fireEvent.click(screen.getByText('Webtoon A')); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('Episódios')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getAllByText(/Capítulo 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Capítulo 2/i).length).toBeGreaterThan(0);
  });

  it('chama onOpen com episódio correto ao clicar', async () => {
    const onOpen = vi.fn();
    render(<HiQua user={null} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Webtoon A'));
    await act(async () => { fireEvent.click(screen.getByText('Webtoon A')); await Promise.resolve(); });
    await waitFor(() => screen.getAllByText(/Capítulo 1/i).length > 0, { timeout: 3000 });
    const items = screen.getAllByText('Capítulo 1');
    fireEvent.click(items[0]);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'ep-1' }),
      expect.objectContaining({ _id: 's1' }),
      expect.any(Array)
    ));
  });
});

describe('HiQua — usuário premium', () => {
  const premiumUser = makeUser({ isPremium: true });

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue([makeSeries({ content_type: 'hiqua' })] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({
      seasons: [],
      episodes: [makeEpisode({ isPremium: true, title: 'Capítulo Premium' })],
    } as any);
  });

  it('usuário premium vê episódios premium', async () => {
    render(<HiQua user={premiumUser as any} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('Série Teste'));
    await act(async () => { fireEvent.click(screen.getByText('Série Teste')); await Promise.resolve(); });
    await waitFor(() => screen.getAllByText(/Capítulo Premium/i).length > 0, { timeout: 3000 });
    expect(screen.getAllByText(/Capítulo Premium/i).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HQCINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('HQCine — usuário anônimo', () => {
  const hqSeries = [makeSeries({ _id: 'hq-1', title: 'HQCine Alpha', content_type: 'hqcine' })];
  const hqEpisodes = [
    makeEpisode({ _id: 'hq-ep-1', title: 'HQ Cap 1', isPremium: false }),
    makeEpisode({ _id: 'hq-ep-2', episode_number: 2, title: 'HQ Cap 2', isPremium: true }),
  ];

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(hqSeries as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue(hqEpisodes as any);
  });

  it('exibe header HQCINE', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HQCINE')).toBeInTheDocument());
  });

  it('exibe séries HQCine', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HQCine Alpha')).toBeInTheDocument());
  });

  it('exibe episódios ao selecionar série', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    fireEvent.click(screen.getByText('HQCine Alpha'));
    await waitFor(() => expect(screen.getByText('HQ Cap 1')).toBeInTheDocument());
  });

  it('chama onOpen ao clicar em episódio', async () => {
    const onOpen = vi.fn();
    render(<HQCine user={null} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    fireEvent.click(screen.getByText('HQCine Alpha'));
    await waitFor(() => screen.getByText('HQ Cap 1'));
    fireEvent.click(screen.getByText('HQ Cap 1'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'hq-ep-1' }),
      expect.objectContaining({ _id: 'hq-1' })
    );
  });

  it('getEpisodesBySeries é chamado com o _id da série', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('HQCine Alpha'));
    fireEvent.click(screen.getByText('HQCine Alpha'));
    await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('hq-1'));
  });
});

describe('HQCine — sem séries', () => {
  it('não renderiza nada de especial (grid vazio)', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([]);
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('HQCINE')).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VFILM
// ═══════════════════════════════════════════════════════════════════════════════

describe('VFilm — usuário anônimo', () => {
  const vSeries = [makeSeries({ _id: 'v-1', title: 'VFilm Zeta', content_type: 'vcine' })];
  const vEpisodes = [makeEpisode({ _id: 'v-ep-1', title: 'Curta 1' })];

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(vSeries as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: vEpisodes } as any);
  });

  it('exibe header V-FILM', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('V-FILM')).toBeInTheDocument());
  });

  it('exibe séries VFilm', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('VFilm Zeta')).toBeInTheDocument());
  });

  it('exibe "Nenhum curta" quando vazio', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([]);
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nenhum curta/i)).toBeInTheDocument());
  });

  it('exibe episódios ao selecionar série', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('VFilm Zeta'));
    fireEvent.click(screen.getByText('VFilm Zeta'));
    await waitFor(() => expect(screen.getByText('Curta 1')).toBeInTheDocument());
  });

  it('chama onOpen ao clicar em episódio', async () => {
    const onOpen = vi.fn();
    render(<VFilm user={null} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('VFilm Zeta'));
    fireEvent.click(screen.getByText('VFilm Zeta'));
    await waitFor(() => screen.getByText('Curta 1'));
    fireEvent.click(screen.getByText('Curta 1'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'v-ep-1' }),
      expect.objectContaining({ _id: 'v-1' })
    );
  });

  it('getSeriesContent é chamado com o _id da série', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText('VFilm Zeta'));
    fireEvent.click(screen.getByText('VFilm Zeta'));
    await waitFor(() => expect(api.getSeriesContent).toHaveBeenCalledWith('v-1'));
  });
});

describe('VFilm — usuário premium', () => {
  it('usuário premium vê série premium normalmente', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([
      makeSeries({ _id: 'v-p', title: 'VFilm Premium', content_type: 'vcine', isPremium: true }),
    ] as any);
    vi.mocked(api.getSeriesContent).mockResolvedValue({ seasons: [], episodes: [] } as any);
    const premium = makeUser({ isPremium: true });
    render(<VFilm user={premium as any} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('VFilm Premium')).toBeInTheDocument());
  });
});
