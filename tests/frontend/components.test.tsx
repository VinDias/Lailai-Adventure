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
    getContinueList: vi.fn().mockResolvedValue([]),
    getRandomAd: vi.fn().mockResolvedValue(null),
    login: vi.fn(),
    register: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    setStatusCallback: vi.fn(),
    setAuthExpiredCallback: vi.fn(),
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    vote: vi.fn(),
    removeVote: vi.fn(),
    getFavorites: vi.fn().mockResolvedValue([]),
    addFavorite: vi.fn().mockResolvedValue({ favorited: true }),
    removeFavorite: vi.fn().mockResolvedValue({ favorited: false }),
    getSeriesVote: vi.fn().mockResolvedValue({ myVote: null, likes: 0 }),
    voteSeries: vi.fn().mockResolvedValue({ success: true, type: 'like' }),
    removeSeriesVote: vi.fn().mockResolvedValue({ success: true }),
    getPublicSettings: vi.fn().mockResolvedValue({}),
    getAdminSettings: vi.fn().mockResolvedValue([]),
    updateSetting: vi.fn().mockResolvedValue({}),
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

  it('mantém o indicador de carregamento ativo até onLogin terminar (achado da revisão da Task 11)', async () => {
    // onLogin pode migrar o progresso do visitante antes de trocar de tela (App.tsx);
    // o spinner precisa continuar girando até essa promessa resolver, senão o botão
    // reabilita e a tela fica parada — parece travamento em vez de carregamento.
    let liberarOnLogin: () => void = () => {};
    const onLoginPendente = vi.fn(() => new Promise<void>(resolve => { liberarOnLogin = resolve; }));

    render(<Auth onLogin={onLoginPendente} />);
    fireEvent.change(screen.getByPlaceholderText(/e-mail/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/senha/i), { target: { value: '123' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(onLoginPendente).toHaveBeenCalled());
    // onLogin ainda não terminou: o botão de envio continua desabilitado (spinner visível).
    const botaoEnviar = () => document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(botaoEnviar()).toBeDisabled();

    liberarOnLogin();
    await waitFor(() => expect(botaoEnviar()).not.toBeDisabled());
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

// Achado IMPORTANT da revisão final: o spec pede barra de progresso nos
// cards do catálogo, "só em obra já iniciada" — o componente ProgressBar só
// era usado dentro do carrossel, não na grade principal das abas.
describe('HQCine — barra de progresso nos cards do catálogo', () => {
  const hqSeriesComEsemProgresso = [
    makeSeries({ _id: 'hq-progresso', title: 'HQCine Com Progresso', content_type: 'hqcine' }),
    makeSeries({ _id: 'hq-sem-progresso', title: 'HQCine Sem Progresso', content_type: 'hqcine' }),
  ];

  beforeEach(() => {
    vi.mocked(api.getSeries).mockResolvedValue(hqSeriesComEsemProgresso as any);
    // .mockReset() (não só mockResolvedValue): sem isso, a contagem de
    // chamadas acumula das outras describes deste arquivo que também
    // renderizam <HQCine>, e o teste de "uma única requisição" abaixo
    // falharia por causa de renders anteriores, não do comportamento em si.
    vi.mocked(api.getContinueList).mockReset().mockResolvedValue([
      { seriesId: 'hq-progresso', episodeId: 'hq-progresso-ep1', contentType: 'hqcine', percent: 0.35,
        series: { title: 'HQCine Com Progresso' } },
    ] as any);
  });

  // "HQCine Com Progresso" aparece duas vezes de propósito (card da grade E
  // card do carrossel "Continuar" acima dela, que também mostra o título da
  // obra) — por isso as buscas abaixo pegam especificamente o <h3> da grade.
  const getCardDaGrade = async (titulo: string) => {
    await waitFor(() => expect(screen.getAllByText(titulo).length).toBeGreaterThan(0));
    const h3 = screen.getAllByText(titulo).find(el => el.tagName === 'H3')!;
    expect(h3).toBeTruthy();
    return h3.closest('.group')!;
  };

  it('mostra a barra de progresso so no card da obra com progresso salvo', async () => {
    const { container } = render(<HQCine user={null} onOpen={vi.fn()} />);

    const cardComProgresso = await getCardDaGrade('HQCine Com Progresso');
    const cardSemProgresso = await getCardDaGrade('HQCine Sem Progresso');

    expect(cardComProgresso.querySelector('[data-testid="progress-bar"]')).toBeInTheDocument();
    expect(cardSemProgresso.querySelector('[data-testid="progress-bar"]')).not.toBeInTheDocument();
    // Só uma barra de progresso na grade do catálogo propriamente dita (o
    // carrossel "Continuar", acima da grade, também usa .group nos seus
    // cards e tem a sua própria barra — não é o que este teste cobre).
    const grade = container.querySelector('.grid.grid-cols-2')!;
    expect(grade.querySelectorAll('[data-testid="progress-bar"]')).toHaveLength(1);
  });

  it('busca a lista de progresso uma unica vez, reaproveitada pelo carrossel e pelos cards (sem 2a requisicao)', async () => {
    render(<HQCine user={null} onOpen={vi.fn()} />);
    await getCardDaGrade('HQCine Com Progresso');
    expect(api.getContinueList).toHaveBeenCalledWith('hqcine');
    expect(api.getContinueList).toHaveBeenCalledTimes(1);
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

  it('exibe header VCINE', async () => {
    render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('VCINE')).toBeInTheDocument());
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
