/**
 * Testes de vídeo — VerticalPlayer
 * Cobre: exibição de anúncio (interstitial para free, nenhum para premium),
 *        renderização do player, inicialização HLS, src direta, votos
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Video, User } from '../../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted garante que as variáveis são definidas antes do hoist do vi.mock
const { MockHls, mockHlsInstance } = vi.hoisted(() => {
  const instance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    currentLevel: -1,
    levels: [{ height: 720 }, { height: 1080 }],
  };
  // Usa function regular (não arrow) para ser utilizável como constructor com `new`
  // eslint-disable-next-line prefer-arrow-callback
  const Ctor = vi.fn(function HlsMock() { return instance; }) as any;
  Ctor.isSupported = vi.fn(() => true);
  Ctor.Events = { MANIFEST_PARSED: 'hlsManifestParsed', AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated', AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched', ERROR: 'hlsError' };
  Ctor.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  return { MockHls: Ctor, mockHlsInstance: instance };
});

vi.mock('hls.js', () => ({ default: MockHls }));
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
    getMyVote: vi.fn().mockResolvedValue(null),
    vote: vi.fn().mockResolvedValue({ type: 'like' }),
    removeVote: vi.fn().mockResolvedValue({}),
    getSignedVideoUrl: vi.fn(),
  },
}));

const signedUrlFor = (id: string) =>
  `https://vz-fbaa1d24-d2c.b-cdn.net/${id}/playlist.m3u8?token=tok&expires=9999999999&token_path=${encodeURIComponent(`/${id}/`)}`;

import { api } from '../../services/api';
import VerticalPlayer from '../../components/VerticalPlayer';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'vid-1',
  titulo: 'Vídeo Teste',
  categoria: 'Ação',
  descricao: 'Descrição do vídeo de teste',
  duracao: 120,
  arquivoUrl: 'https://cdn.example.com/video.mp4',
  bunnyVideoId: undefined,
  thumbnailUrl: '',
  isPremium: false,
  criadoEm: '',
  type: 'hqcine',
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

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  MockHls.mockClear();
  mockHlsInstance.loadSource.mockClear();
  mockHlsInstance.attachMedia.mockClear();
  mockHlsInstance.on.mockClear();
  mockHlsInstance.destroy.mockClear();
  vi.mocked(api.vote).mockClear();
  vi.mocked(api.removeVote).mockClear();
  vi.mocked(api.getMyVote).mockResolvedValue(null);
  vi.mocked(api.getSignedVideoUrl).mockImplementation((id: string) => Promise.resolve(signedUrlFor(id)));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANÚNCIO
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — Anúncio', () => {
  it('exibe anúncio para usuário não-premium antes do player', () => {
    const user = makeUser({ isPremium: false });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('pula anúncio para usuário premium e exibe player direto', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={vi.fn()} />);
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
  });

  it('exibe player após fechar anúncio', async () => {
    const user = makeUser({ isPremium: false });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
  });

  it('exibe player para usuário anônimo (null) após fechar anúncio', async () => {
    render(<VerticalPlayer video={makeVideo()} user={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACESSO A CONTEÚDO PREMIUM (regra nova: free assiste tudo, mas vê anúncio antes)
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — Acesso a conteúdo premium', () => {
  it('usuário free vê anúncio e depois assiste conteúdo premium normalmente', async () => {
    const user = makeUser({ isPremium: false });
    const video = makeVideo({ isPremium: true });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    // Primeiro vê o anúncio
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
    // Fecha anúncio → player carrega, sem parede premium
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo Premium/i)).not.toBeInTheDocument();
  });

  it('usuário anônimo vê anúncio e depois assiste conteúdo premium normalmente', async () => {
    const video = makeVideo({ isPremium: true });
    render(<VerticalPlayer video={video} user={null} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo Premium/i)).not.toBeInTheDocument();
  });

  it('usuário premium acessa conteúdo premium direto, sem anúncio', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ isPremium: true });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
    expect(screen.queryByText(/Conteúdo Premium/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERIZAÇÃO DO PLAYER
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — Renderização', () => {
  it('renderiza elemento <video> para usuário premium', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
  });

  it('exibe título e descrição do vídeo', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ titulo: 'Meu Curta', descricao: 'Uma aventura épica' });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Meu Curta')).toBeInTheDocument();
      expect(screen.getByText('Uma aventura épica')).toBeInTheDocument();
    });
  });

  it('botão fechar (X) chama onClose', async () => {
    const onClose = vi.fn();
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={onClose} />);
    await waitFor(() => document.querySelector('video'));
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('não exibe seletor de áudio quando o HLS não tem faixas alternativas', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo();
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => document.querySelector('video'));
    expect(screen.queryByText('Faixa 1')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HLS E SRC DIRETA
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — Reprodução de vídeo', () => {
  it('inicializa HLS com a URL assinada quando bunnyVideoId está presente', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ bunnyVideoId: 'abc123xyz' });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(MockHls).toHaveBeenCalled());
    expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(signedUrlFor('abc123xyz'));
    expect(mockHlsInstance.attachMedia).toHaveBeenCalled();
  });

  it('exibe erro e não inicializa HLS quando a URL assinada falha (fail-closed)', async () => {
    vi.mocked(api.getSignedVideoUrl).mockRejectedValue(new Error('no token'));
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ bunnyVideoId: 'no-token' });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Vídeo indisponível/i));
    expect(MockHls).not.toHaveBeenCalled();
  });

  it('usa URL direta (mp4) quando não há bunnyVideoId', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ arquivoUrl: 'https://cdn.example.com/direto.mp4', bunnyVideoId: undefined });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => {
      const el = document.querySelector('video') as HTMLVideoElement;
      expect(el).toBeInTheDocument();
    });
    expect(MockHls).not.toHaveBeenCalled();
    const videoEl = document.querySelector('video') as HTMLVideoElement;
    expect(videoEl.src).toContain('direto.mp4');
  });

  it('HLS é inicializado para usuário free em conteúdo premium após o anúncio', async () => {
    const user = makeUser({ isPremium: false });
    const video = makeVideo({ isPremium: true, bunnyVideoId: 'premium-livre' });
    render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    // Enquanto o anúncio está na tela, o player não inicia
    expect(MockHls).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => expect(MockHls).toHaveBeenCalled());
    expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(signedUrlFor('premium-livre'));
  });

  it('HLS é destruído ao desmontar o componente', async () => {
    const user = makeUser({ isPremium: true });
    const video = makeVideo({ bunnyVideoId: 'to-destroy' });
    const { unmount } = render(<VerticalPlayer video={video} user={user} onClose={vi.fn()} />);
    await waitFor(() => expect(MockHls).toHaveBeenCalled());
    unmount();
    expect(mockHlsInstance.destroy).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOTOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — Votos', () => {
  it('exibe botões like/dislike para usuário autenticado', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo()} user={user} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Curtir')).toBeInTheDocument();
      expect(screen.getByLabelText('Não curtir')).toBeInTheDocument();
    });
  });

  it('não exibe botões like/dislike para usuário anônimo', async () => {
    render(<VerticalPlayer video={makeVideo()} user={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fechar Anúncio'));
    await waitFor(() => document.querySelector('video'));
    expect(screen.queryByLabelText('Curtir')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Não curtir')).not.toBeInTheDocument();
  });

  it('clique em like chama api.vote com "like"', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo({ id: 'vid-42' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('Curtir'));
    fireEvent.click(screen.getByLabelText('Curtir'));
    await waitFor(() =>
      expect(api.vote).toHaveBeenCalledWith('vid-42', 'like')
    );
  });

  it('clique em dislike chama api.vote com "dislike"', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo({ id: 'vid-43' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('Não curtir'));
    fireEvent.click(screen.getByLabelText('Não curtir'));
    await waitFor(() =>
      expect(api.vote).toHaveBeenCalledWith('vid-43', 'dislike')
    );
  });

  it('clicar em like duas vezes remove o voto (toggle)', async () => {
    vi.mocked(api.vote).mockResolvedValue({ type: 'like' } as any);
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo({ id: 'vid-44' })} user={user} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('Curtir'));
    // Primeiro clique: vota like
    fireEvent.click(screen.getByLabelText('Curtir'));
    await waitFor(() => expect(api.vote).toHaveBeenCalledWith('vid-44', 'like'));
    // Segundo clique: remove voto
    fireEvent.click(screen.getByLabelText('Curtir'));
    await waitFor(() => expect(api.removeVote).toHaveBeenCalledWith('vid-44'));
  });

  it('getMyVote é chamado ao montar com usuário autenticado', async () => {
    const user = makeUser({ isPremium: true });
    render(<VerticalPlayer video={makeVideo({ id: 'vid-45' })} user={user} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(api.getMyVote).toHaveBeenCalledWith('vid-45')
    );
  });
});
