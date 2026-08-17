/**
 * Testes de leitura — WebtoonReader
 * Cobre: anúncio interstitial antes do capítulo (free vê, premium não),
 *        reexibição do anúncio ao navegar de capítulo, renderização dos painéis
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
    getContinueList: vi.fn().mockResolvedValue([]),
    getProgressForEpisode: vi.fn().mockResolvedValue(null),
    saveProgress: vi.fn().mockResolvedValue({}),
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
  vi.mocked(api.getContinueList).mockReset().mockResolvedValue([]);
  vi.mocked(api.getProgressForEpisode).mockReset().mockResolvedValue(null);
  vi.mocked(api.saveProgress).mockReset().mockResolvedValue({} as any);
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

// ═══════════════════════════════════════════════════════════════════════════════
// RESTAURAÇÃO DE PROGRESSO (Fase 4 — Task 9)
// ═══════════════════════════════════════════════════════════════════════════════

describe('WebtoonReader — Restauração de progresso', () => {
  // scrollHeight/clientHeight não existem em jsdom (dependem de layout real) —
  // precisam ser forjados para posicaoDeVolta ter altura pra trabalhar.
  const stubScroll = (el: HTMLElement, scrollHeight: number, clientHeight: number) => {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  };

  const getScrollContainer = () => document.querySelector('.overflow-y-auto') as HTMLDivElement;

  // Promise controlada: deixa o teste decidir exatamente quando
  // getProgressForEpisode "responde", eliminando a corrida entre o render e
  // a restauração.
  const controlledProgress = () => {
    let liberar: (v: any) => void = () => {};
    const promise = new Promise<any>(resolve => { liberar = resolve; });
    vi.mocked(api.getProgressForEpisode).mockReturnValue(promise as any);
    return (valor: any) => liberar(valor);
  };

  it('aplica a posição salva quando há progresso', async () => {
    const liberar = controlledProgress();
    const user = makeUser({ isPremium: true });
    render(<WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());

    const el = getScrollContainer();
    stubScroll(el, 2000, 800);

    liberar({ episodeId: 'ep-1', percent: 0.5 });

    await waitFor(() => expect(el.scrollTop).toBe(600)); // (2000-800) * 0.5
  });

  it('não pula por cima de quem já começou a rolar sozinho', async () => {
    const liberar = controlledProgress();
    const user = makeUser({ isPremium: true });
    render(<WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());

    const el = getScrollContainer();
    stubScroll(el, 2000, 800);
    // O usuário rola por conta própria ANTES da resposta de getProgressForEpisode chegar.
    el.scrollTop = 500;
    fireEvent.scroll(el);

    await act(async () => {
      liberar({ episodeId: 'ep-1', percent: 0.9 });
      await new Promise(r => setTimeout(r, 0));
    });

    // Continua onde o usuário deixou — não pulou para 90% ((2000-800)*0.9=1080).
    expect(el.scrollTop).toBe(500);
  });

  it('não grava progresso antes de a restauração terminar', async () => {
    const liberar = controlledProgress();
    const user = makeUser({ isPremium: true });
    const { unmount } = render(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());

    const el = getScrollContainer();
    stubScroll(el, 2000, 800);
    el.scrollTop = 100;
    fireEvent.scroll(el); // getProgressForEpisode ainda não resolveu — portão fechado

    // useProgress descarrega qualquer coisa pendente ao desmontar; se o
    // portão tivesse deixado o scroll acima chamar report(), isso apareceria
    // aqui como uma gravação de progresso quase-zero.
    unmount();
    expect(api.saveProgress).not.toHaveBeenCalled();

    liberar(null); // libera a promise pendente para não vazar entre testes
  });

  it('ignora resposta atrasada do capítulo anterior ao trocar de capítulo', async () => {
    // Capítulo 1: getProgressForEpisode fica pendente (rede lenta).
    let liberarCap1: (v: any) => void = () => {};
    const promiseCap1 = new Promise<any>(resolve => { liberarCap1 = resolve; });
    vi.mocked(api.getProgressForEpisode)
      .mockReturnValueOnce(promiseCap1 as any) // restauração do capítulo 1
      .mockResolvedValueOnce(null); // restauração do capítulo 2 (sem progresso salvo)

    const user = makeUser({ isPremium: true });
    const { rerender } = render(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-1', episodeId: 'ep-1' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByAltText('Página 1')).toBeInTheDocument());

    const el = getScrollContainer();
    stubScroll(el, 2000, 800);

    // Usuário navega para o capítulo 2 ANTES da resposta do capítulo 1 chegar —
    // onNavigate troca o webtoon sem desmontar o reader (mesmo scrollRef).
    rerender(
      <WebtoonReader webtoon={makeWebtoon({ id: 'wt-2', episodeId: 'ep-2' })} user={user} onClose={vi.fn()} />
    );
    await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep-2'));
    // Restauração do capítulo 2 já rodou e resolveu (sem progresso salvo).
    await waitFor(() => expect(api.getProgressForEpisode).toHaveBeenCalledTimes(2));

    // A resposta atrasada do capítulo 1 finalmente chega — com progresso que,
    // se aplicado por engano, pularia o scroll do capítulo 2 para 600px.
    await act(async () => {
      liberarCap1({ episodeId: 'ep-1', percent: 0.5 });
      await new Promise(r => setTimeout(r, 0));
    });

    // O scroll do capítulo 2 não foi mexido pela resposta do capítulo 1.
    expect(el.scrollTop).toBe(0);
  });
});
