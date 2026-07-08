/**
 * Testes de leitura — WebtoonReader
 * Cobre: anúncio interstitial antes do capítulo (free vê, premium não),
 *        reexibição do anúncio ao navegar de capítulo, renderização dos painéis
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Webtoon, User } from '../../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/AdComponent', () => ({
  default: ({ onFinish }: { onFinish: () => void }) => (
    <div data-testid="ad-component">
      <button onClick={onFinish}>Fechar Anúncio</button>
    </div>
  ),
}));
vi.mock('../../services/api', () => ({
  api: {
    getEpisode: vi.fn(),
    getMyVote: vi.fn().mockResolvedValue(null),
    vote: vi.fn().mockResolvedValue({ type: 'like' }),
    removeVote: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';
import WebtoonReader from '../../components/WebtoonReader';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeWebtoon = (overrides: Partial<Webtoon> = {}): Webtoon => ({
  id: 'wt-1',
  episodeId: 'ep-1',
  titulo: 'Webtoon Teste',
  categoria: 'Ação',
  descricao: 'Descrição do webtoon de teste',
  numeroPaineis: 2,
  isPremium: false,
  thumbnailUrl: '',
  criadoEm: '',
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'user@test.com',
  nome: 'Usuário',
  role: 'user',
  isPremium: false,
  avatar: '',
  provider: 'local',
  criadoEm: '',
  premiumExpiresAt: undefined,
  followingChannelIds: [],
  ...overrides,
});

const makeEpisode = (overrides: Record<string, any> = {}) => ({
  _id: 'ep-1',
  panels: [
    { _id: 'p1', image_url: 'https://cdn.example.com/p1.jpg', order: 0, translationLayers: [] },
    { _id: 'p2', image_url: 'https://cdn.example.com/p2.jpg', order: 1, translationLayers: [] },
  ],
  webtoonLanguageLabels: {},
  ...overrides,
});

beforeEach(() => {
  vi.mocked(api.getEpisode).mockClear();
  vi.mocked(api.getMyVote).mockResolvedValue(null);
  vi.mocked(api.getEpisode).mockResolvedValue(makeEpisode() as any);
  localStorage.clear();
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANÚNCIO INTERSTITIAL (regra nova: free lê tudo, mas vê anúncio antes do capítulo)
// ═══════════════════════════════════════════════════════════════════════════════

describe('WebtoonReader — Anúncio', () => {
  it('exibe anúncio para usuário free antes dos painéis', () => {
    const user = makeUser({ isPremium: false });
    render(<WebtoonReader webtoon={makeWebtoon()} user={user} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument();
  });

  it('exibe anúncio para usuário anônimo (null) antes dos painéis', () => {
    render(<WebtoonReader webtoon={makeWebtoon()} user={null} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
  });

  it('exibe painéis após fechar o anúncio', async () => {
    const user = makeUser({ isPremium: false });
    render(<WebtoonReader webtoon={makeWebtoon()} user={user} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
    expect(screen.getByAltText('Página 2')).toBeInTheDocument();
  });

  it('usuário free lê conteúdo premium após o anúncio (sem parede premium)', async () => {
    const user = makeUser({ isPremium: false });
    render(<WebtoonReader webtoon={makeWebtoon({ isPremium: true })} user={user} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo premium/i)).not.toBeInTheDocument();
  });

  it('não exibe anúncio para assinante premium', async () => {
    const user = makeUser({ isPremium: true });
    render(<WebtoonReader webtoon={makeWebtoon({ isPremium: true })} user={user} onClose={vi.fn()} />);
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
  });

  it('reexibe anúncio para usuário free ao navegar para outro capítulo', async () => {
    const user = makeUser({ isPremium: false });
    const { rerender } = render(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
    // onNavigate troca o webtoon sem desmontar o componente
    rerender(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-2', episodeId: 'ep-2' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByTestId('ad-component')).toBeInTheDocument());
  });

  it('não reexibe anúncio para premium ao navegar para outro capítulo', async () => {
    const user = makeUser({ isPremium: true });
    const { rerender } = render(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
    rerender(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-2', episodeId: 'ep-2' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

describe('WebtoonReader — Renderização', () => {
  it('exibe "Nenhum painel disponível" quando episódio não tem painéis', async () => {
    vi.mocked(api.getEpisode).mockResolvedValue(makeEpisode({ panels: [] }) as any);
    const user = makeUser({ isPremium: true });
    render(<WebtoonReader webtoon={makeWebtoon()} user={user} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Nenhum painel disponível/i)).toBeInTheDocument()
    );
  });

  it('busca o episódio pelo episodeId', async () => {
    const user = makeUser({ isPremium: true });
    render(<WebtoonReader webtoon={makeWebtoon({ id: 'wt-9', episodeId: 'ep-9' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep-9'));
  });
});
