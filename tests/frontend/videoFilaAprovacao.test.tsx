/**
 * Frente A, item 10: obras de V-Show e Anicom na Fila de Aprovação
 * (components/Admin/AprovacoesPanel, o modo prévia do VerticalPlayer) e o
 * "Enviar capítulo" do episódio de vídeo no Meu Estúdio.
 *
 * O QUE ESTES TESTES GARANTEM:
 * - a fila mostra o tipo da obra (V-SHOW, ANICOM) nos itens de vídeo, e nada
 *   nos de quadrinhos;
 * - o episódio de vídeo tem "Ver vídeo" (e não "Ler episódio"), que abre o
 *   MESMO player do site com o vídeo do item; o player pede a URL assinada
 *   desse vídeo; em prévia não há anúncio, nem voto, nem leitura ou gravação
 *   de progresso;
 * - episódio com o vídeo ainda não pronto não pode ser aprovado na tela;
 * - aprovar e devolver um episódio de vídeo chamam as rotas de sempre;
 * - o player do público continua mostrando o anúncio (a prévia é opcional);
 * - Meu Estúdio: com o vídeo pronto aparece "Enviar capítulo"; antes, não; a
 *   confirmação do envio sai em verde; recusa de verdade do servidor aparece como erro.
 *
 * O QUE NÃO GARANTEM: quem pode pedir a URL assinada e quando o episódio
 * entra na fila ou vai ao ar: tests/backend/videoFilaAprovacao.test.js.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

const { MockHls } = vi.hoisted(() => {
  const instance = { loadSource: vi.fn(), attachMedia: vi.fn(), on: vi.fn(), destroy: vi.fn(), currentLevel: -1, levels: [] };
  // eslint-disable-next-line prefer-arrow-callback
  const Ctor = vi.fn(function HlsMock() { return instance; }) as any;
  Ctor.isSupported = vi.fn(() => true);
  Ctor.Events = { MANIFEST_PARSED: 'hlsManifestParsed', AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated', AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched', ERROR: 'hlsError' };
  Ctor.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  return { MockHls: Ctor };
});
vi.mock('hls.js', () => ({ default: MockHls }));
vi.mock('../../components/AdComponent', () => ({
  default: () => <div data-testid="ad-component" />,
}));

vi.mock('../../services/api', () => ({
  api: {
    getAdminAprovacoes: vi.fn(),
    aprovarSerieAdmin: vi.fn(),
    aprovarEpisodioAdmin: vi.fn(),
    devolverAprovacao: vi.fn(),
    getLeituraAprovacao: vi.fn(),
    getSignedVideoUrl: vi.fn(),
    getMyVote: vi.fn(),
    getProgressForEpisode: vi.fn(),
    saveProgress: vi.fn(),
    getContinueList: vi.fn(),
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getPortalRevisoes: vi.fn(),
    enviarPortalEpisodio: vi.fn(),
    getEstadoVideoEpisodio: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AprovacoesPanel from '../../components/Admin/AprovacoesPanel';
import VerticalPlayer from '../../components/VerticalPlayer';
import PortalEstudio from '../../components/PortalEstudio';

const obraVideo = {
  tipo: 'series', id: 's-video', title: 'Novela Nova', description: 'Uma novela', cover_image: 'https://cdn/capa.jpg',
  content_type: 'vcine', content_rating_sugerida: 'teen', genre: null, tags: [],
  canal: { id: 'c1', name: 'Canal do Autor' }, submittedAt: '2026-11-27T10:00:00.000Z',
};
const epVideo = (extra: Record<string, any> = {}) => ({
  tipo: 'episode', id: 'e-video', title: 'Episódio 1 da novela', description: 'Primeiro', thumbnail: null, panelCount: 0,
  content_type: 'vcine', video: { videoId: 'bunny-123', pronto: true, estado: 'pronto' },
  serie: { id: 's-pub', title: 'Novela No Ar', isPublished: true },
  canal: { id: 'c1', name: 'Canal do Autor' }, submittedAt: '2026-11-27T10:05:00.000Z', ...extra,
});
const epQuadrinhos = {
  tipo: 'episode', id: 'e-hq', title: 'Capítulo de HQ', description: '', thumbnail: null, panelCount: 12, content_type: 'hiqua',
  serie: { id: 's-hq', title: 'HQ No Ar', isPublished: true }, canal: { id: 'c1', name: 'Canal do Autor' }, submittedAt: '2026-11-27T10:06:00.000Z',
};

const card = (titulo: string) => screen.getByText(titulo).closest('div.flex-1') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSignedVideoUrl).mockImplementation(async (id: string) => `https://cdn.teste/${id}/playlist.m3u8?token=t&expires=9999999999`);
  vi.mocked(api.getMyVote).mockResolvedValue(null as any);
  vi.mocked(api.getProgressForEpisode).mockResolvedValue(null as any);
  vi.mocked(api.saveProgress).mockResolvedValue({} as any);
  vi.mocked(api.getContinueList).mockResolvedValue([] as any);
});

describe('Fila de Aprovação — obras de vídeo', () => {
  it('mostra o tipo nos itens de vídeo, "Ver vídeo" no episódio de vídeo e "Ler episódio" só no de quadrinhos', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [obraVideo, epVideo(), { ...epVideo(), id: 'e-anicom', title: 'Episódio de animação', content_type: 'hqcine' }, epQuadrinhos] } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Novela Nova');

    expect(screen.getByTestId('aprovacao-tipo-s-video')).toHaveTextContent('V-SHOW');
    expect(screen.getByTestId('aprovacao-tipo-e-video')).toHaveTextContent('V-SHOW');
    expect(screen.getByTestId('aprovacao-tipo-e-anicom')).toHaveTextContent('ANICOM');
    expect(screen.queryByTestId('aprovacao-tipo-e-hq')).not.toBeInTheDocument();

    const video = card('Episódio 1 da novela');
    expect(within(video).getByRole('button', { name: /Ver vídeo/ })).toBeInTheDocument();
    expect(within(video).queryByRole('button', { name: /Ler episódio/ })).not.toBeInTheDocument();
    expect(within(video).getByText('Vídeo pronto')).toBeInTheDocument();
    expect(within(video).queryByText(/painéis/)).not.toBeInTheDocument();

    const hq = card('Capítulo de HQ');
    expect(within(hq).getByRole('button', { name: /Ler episódio/ })).toBeInTheDocument();
    expect(within(hq).queryByRole('button', { name: /Ver vídeo/ })).not.toBeInTheDocument();
    expect(within(hq).getByText('12 painéis')).toBeInTheDocument();
    // A obra (série) não tem vídeo próprio para ver.
    expect(within(card('Novela Nova')).queryByRole('button', { name: /Ver vídeo/ })).not.toBeInTheDocument();
  });

  it('"Ver vídeo" abre o player do site com o vídeo do item, sem anúncio, sem voto e sem progresso; fechar volta para a fila', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [epVideo()] } as any);
    const { container } = render(<AprovacoesPanel />);
    await screen.findByText('Episódio 1 da novela');
    expect(container.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver vídeo/ }));
    await waitFor(() => expect(api.getSignedVideoUrl).toHaveBeenCalledWith('bunny-123'));
    await waitFor(() => expect(MockHls).toHaveBeenCalled());
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
    expect(api.getMyVote).not.toHaveBeenCalled();
    expect(api.getProgressForEpisode).not.toHaveBeenCalled();
    // Um "timeupdate" no vídeo não grava progresso de quem só está conferindo.
    const v = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(v, 'duration', { value: 100, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 50, configurable: true });
    fireEvent.timeUpdate(v);
    expect(api.saveProgress).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('Episódio 1 da novela')).toBeInTheDocument();
  });

  it('vídeo ainda não pronto: a tela avisa e não deixa aprovar', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [epVideo({ video: { videoId: 'bunny-123', pronto: false, estado: 'processando' } })] } as any);
    render(<AprovacoesPanel />);
    const c = card((await screen.findByText('Episódio 1 da novela')).textContent as string);
    expect(within(c).getByText(/não está pronto/)).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: /Aprovar/ })).toBeDisabled();
    expect(within(c).getByRole('button', { name: /Devolver/ })).toBeEnabled();
  });

  it('aprovar e devolver um episódio de vídeo usam as rotas de episódio de sempre', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [epVideo()] } as any);
    vi.mocked(api.aprovarEpisodioAdmin).mockResolvedValue({} as any);
    vi.mocked(api.devolverAprovacao).mockResolvedValue({ success: true, mensagem: {} } as any);
    render(<AprovacoesPanel />);
    await screen.findByText('Episódio 1 da novela');

    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    await waitFor(() => expect(api.aprovarEpisodioAdmin).toHaveBeenCalledWith('e-video'));

    fireEvent.click(await screen.findByRole('button', { name: /Devolver/ }));
    fireEvent.change(screen.getByPlaceholderText(/Motivo da devolução/), { target: { value: 'O áudio está baixo.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(api.devolverAprovacao).toHaveBeenCalledWith('episode', 'e-video', 'O áudio está baixo.'));
  });

  it('a recusa do servidor ao aprovar (ex.: o vídeo mudou depois de enviado) aparece no card', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [epVideo()] } as any);
    vi.mocked(api.aprovarEpisodioAdmin).mockRejectedValue(new Error('O vídeo deste episódio mudou depois de enviado para aprovação. O episódio saiu da fila e voltou para o autor.'));
    render(<AprovacoesPanel />);
    await screen.findByText('Episódio 1 da novela');
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    expect(await screen.findByText(/mudou depois de enviado/)).toBeInTheDocument();
  });
});

describe('player do público continua igual', () => {
  const video: any = { id: 'ep1', seriesId: 's1', titulo: 'Episódio', categoria: '', descricao: '', duracao: 0, arquivoUrl: '', bunnyVideoId: 'bunny-999', thumbnailUrl: '', isPremium: false, criadoEm: '', type: 'vcine' };

  const leitor: any = { id: 'u1', email: 'leitor@lorflux.test', nome: 'Leitor', isPremium: false };
  const assinante: any = { ...leitor, isPremium: true, premiumExpiresAt: new Date(Date.now() + 86400000).toISOString() };

  it('sem a prévia, quem não é assinante vê o anúncio antes de qualquer vídeo', async () => {
    render(<VerticalPlayer video={video} user={leitor} onClose={vi.fn()} />);
    expect(screen.getByTestId('ad-component')).toBeInTheDocument();
    expect(api.getSignedVideoUrl).not.toHaveBeenCalled();
  });

  it('sem a prévia, o assinante logado tem voto e progresso, como sempre', async () => {
    render(<VerticalPlayer video={video} user={assinante} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getSignedVideoUrl).toHaveBeenCalledWith('bunny-999'));
    expect(screen.getByRole('button', { name: 'Curtir' })).toBeInTheDocument();
    expect(api.getMyVote).toHaveBeenCalledWith('ep1');
    await waitFor(() => expect(api.getProgressForEpisode).toHaveBeenCalledWith('ep1'));
  });

  it('em prévia, mesmo com um usuário logado que veria anúncio: sem anúncio, sem voto e sem progresso', async () => {
    render(<VerticalPlayer previa video={video} user={leitor} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getSignedVideoUrl).toHaveBeenCalledWith('bunny-999'));
    expect(screen.queryByTestId('ad-component')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Curtir' })).not.toBeInTheDocument();
    expect(api.getMyVote).not.toHaveBeenCalled();
    expect(api.getProgressForEpisode).not.toHaveBeenCalled();
  });
});

describe('Meu Estúdio — enviar o episódio de vídeo para aprovação', () => {
  const obra = { _id: 'sv', title: 'Novela Vertical', description: '', cover_image: '', content_type: 'vcine', isPublished: true, submittedAt: null, channelId: 'c1' };
  const ep = (estado: string | null) => ({ _id: 'ev1', title: 'Episódio de vídeo', episode_number: 1, status: 'draft', submittedAt: null, panels: [], ...(estado ? { bunnyVideoId: 'v1', videoEnvio: { videoId: 'v1', estado } } : {}) });

  async function abrir(estado: string | null) {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
    vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [obra] } as any);
    vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [] });
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([ep(estado)] as any);
    vi.mocked(api.getEstadoVideoEpisodio).mockResolvedValue({ estado: 'processando', videoId: 'v1', atualizadoEm: null, pronto: false });
    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Obras'));
    fireEvent.click(await screen.findByText('Novela Vertical'));
    await screen.findByText('Episódio de vídeo');
    return screen.getByTestId('portal-video-ev1');
  }

  it.each([[null], ['enviando'], ['processando'], ['erro']])('vídeo %s: não há "Enviar capítulo"', async (estado) => {
    const linha = await abrir(estado);
    expect(within(linha).queryByRole('button', { name: 'Enviar capítulo' })).not.toBeInTheDocument();
  });

  it('vídeo pronto: "Enviar capítulo" manda o episódio para aprovação NA HORA, a lista é recarregada e a confirmação sai em verde, não em vermelho (27/11/2026)', async () => {
    vi.mocked(api.enviarPortalEpisodio).mockResolvedValue({} as any);
    const linha = await abrir('pronto');
    const botao = within(linha).getByRole('button', { name: 'Enviar capítulo' });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    await waitFor(() => expect(api.enviarPortalEpisodio).toHaveBeenCalledWith('ev1'));
    await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledTimes(2));
    const aviso = await screen.findByTestId('portal-envio-aviso');
    expect(aviso).toHaveTextContent('Capítulo enviado. Ele já está na Fila de Aprovação.');
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso.className).not.toMatch(/rose|red/);
    expect(screen.queryByTestId('portal-envio-erro')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uma recusa de verdade do servidor continua aparecendo como erro, e sem a confirmação verde', async () => {
    vi.mocked(api.enviarPortalEpisodio).mockRejectedValue(new Error('A série deste episódio ainda não foi enviada para aprovação — envie a série primeiro.'));
    const linha = await abrir('pronto');
    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar capítulo' }));
    expect(await screen.findByTestId('portal-envio-erro')).toHaveTextContent(/envie a série primeiro/);
    expect(screen.queryByTestId('portal-envio-aviso')).not.toBeInTheDocument();
  });
});
