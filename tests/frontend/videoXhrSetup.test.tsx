/**
 * Regressão — o vídeo do VCine/HQCine tocava "mudo" e sem faixas de áudio
 * ==========================================================================
 *
 * O DEFEITO (em linguagem de negócio)
 * O servidor entrega ao player uma URL assinada do Bunny (token + prazo de
 * validade). O player abre essa URL, mas o tocador de HLS continua pedindo
 * SOZINHO outros arquivos do mesmo vídeo: a playlist de cada qualidade
 * (480p, 720p...), a playlist de cada faixa de áudio (dublagem) e cada
 * pedacinho .ts do filme. Essas sub-requisições saíam SEM token: o Bunny
 * respondia 403, o player não enxergava as faixas de áudio (o seletor de
 * idioma ficava vazio) e o vídeo travava ou nem começava. Depois que a
 * assinatura passou a valer para o DIRETÓRIO do vídeo (e não para o arquivo
 * playlist.m3u8), faltava ainda levar o `token_path` nessas sub-requisições,
 * senão o Bunny recalculava o token contra o arquivo errado e barrava tudo
 * de novo. Há ainda o caso do vídeo que cai no meio: erro fatal de rede ou
 * de mídia precisa de nova tentativa, senão a tela fica parada para sempre.
 *
 * MEDIDO EM: 21/10/2026, pela triagem de regressões (grupo video-frontend).
 * COMMITS DA CORREÇÃO: 43e7694 (metade frontend: token/expires/token_path no
 * xhrSetup) e 935a565 (pacote do player, inclusive a recuperação de erro
 * fatal do HLS). Primeira ocorrência: nada no REGRESSOES.md nem no git log
 * indica que esse bug já tenha voltado.
 *
 * POR QUE PRECISOU DE ARQUIVO NOVO
 * tests/frontend/video.test.tsx fecha 28/28 verde mesmo com o xhrSetup
 * inteiro removido do componente: ele só confere que `hls.loadSource` recebeu
 * a mesma string que o próprio mock devolveu — valida o falso contra o falso
 * e nunca olha o PRIMEIRO argumento do construtor do Hls, que é onde vive o
 * xhrSetup. Aqui a URL assinada é ENTRADA (literal, como o backend manda) e
 * quem calcula a resposta é o código de produção: o teste captura a config
 * real passada ao construtor, chama o xhrSetup de verdade com sub-requisições
 * de verdade e inspeciona a URL que o componente mandou para `xhr.open`.
 *
 * O QUE ESTE TESTE GARANTE
 * - que o componente configura um `xhrSetup` quando a URL assinada traz token
 *   e expires;
 * - que playlist de variante, playlist de áudio e segmento .ts recebem
 *   token, expires e token_path (este percent-encoded), sem que o caminho do
 *   arquivo pedido seja trocado;
 * - que o separador certo é usado quando a sub-requisição já tem query string;
 * - que uma sub-requisição que já carrega token não é reaberta (idempotência);
 * - que, sem token_path na URL assinada, o player propaga token e expires e
 *   não inventa um token_path vazio;
 * - que erro FATAL de rede chama startLoad e erro FATAL de mídia chama
 *   recoverMediaError, enquanto erro não-fatal não mexe no player.
 *
 * O QUE ESTE TESTE NÃO GARANTE
 * - não valida a metade de BACKEND do 43e7694 (assinar o diretório e mandar
 *   token_path na URL): isso é teste de rota, em tests/backend;
 * - não fala com o Bunny nem verifica se o token é aceito de verdade;
 * - não cobre as outras fatias do 935a565 (faixas de áudio nativas do Safari,
 *   fallback do changeAudioTrack, timer de auto-hide dos controles, auto-hide
 *   do header do WebtoonReader) — o hls.js aqui é um dublê, então o que se
 *   mede é o contrato que o componente entrega a ele.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Video, User } from '../../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { MockHls, mockHlsInstance } = vi.hoisted(() => {
  const instance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    currentLevel: -1,
    audioTrack: -1,
    levels: [{ height: 720 }, { height: 1080 }],
  };
  // function regular (não arrow) para poder ser usada com `new`
  const Ctor = vi.fn(function HlsMock() { return instance; }) as any;
  Ctor.isSupported = vi.fn(() => true);
  Ctor.Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
    AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched',
    ERROR: 'hlsError',
  };
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
    getContinueList: vi.fn().mockResolvedValue([]),
    getProgressForEpisode: vi.fn().mockResolvedValue(null),
    saveProgress: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';
import VerticalPlayer from '../../components/VerticalPlayer';

// ─── Entrada: exatamente o que o backend devolve hoje ─────────────────────────
// Valores literais, escritos à mão. Nada aqui é recalculado pelo teste: as
// asserções conferem estas mesmas constantes na saída do código de produção.
const VIDEO_ID = 'abc123xyz';
const TOKEN = 'tok-abc';
const EXPIRES = '1700000000';
const DIRETORIO = '/abc123xyz/';
const DIRETORIO_ENCODED = '%2Fabc123xyz%2F';
const URL_ASSINADA =
  'https://vz-fbaa1d24-d2c.b-cdn.net/abc123xyz/playlist.m3u8'
  + '?token=tok-abc&expires=1700000000&token_path=%2Fabc123xyz%2F';

// Sub-requisições que o hls.js dispara por conta própria, sem token.
const SUB_VARIANTE = 'https://vz-fbaa1d24-d2c.b-cdn.net/abc123xyz/480p/video.m3u8';
const SUB_AUDIO = 'https://vz-fbaa1d24-d2c.b-cdn.net/abc123xyz/audio_pt/playlist.m3u8';
const SUB_SEGMENTO = 'https://vz-fbaa1d24-d2c.b-cdn.net/abc123xyz/480p/video_0.ts';

// ─── Fixtures (mesma forma de tests/frontend/video.test.tsx) ──────────────────

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'vid-1',
  titulo: 'Vídeo Teste',
  categoria: 'Ação',
  descricao: 'Descrição do vídeo de teste',
  duracao: 120,
  arquivoUrl: 'https://cdn.example.com/video.mp4',
  bunnyVideoId: VIDEO_ID,
  thumbnailUrl: '',
  isPremium: false,
  criadoEm: '',
  type: 'vcine',
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'user@test.com',
  nome: 'Usuário',
  role: 'user',
  isPremium: true, // premium pula o anúncio: o player monta direto
  avatar: '',
  provider: 'local',
  criadoEm: '',
  premiumExpiresAt: undefined,
  followingChannelIds: [],
  ...overrides,
});

/** Monta o player e devolve a CONFIG REAL que o componente passou ao hls.js. */
const montarEPegarConfigDoHls = async (urlAssinada = URL_ASSINADA) => {
  vi.mocked(api.getSignedVideoUrl).mockResolvedValue(urlAssinada);
  render(<VerticalPlayer video={makeVideo()} user={makeUser()} onClose={vi.fn()} />);
  await waitFor(() => expect(MockHls).toHaveBeenCalled());
  return MockHls.mock.calls[0][0] as Record<string, any>;
};

/** xhr de mentira: só anota o que recebeu. Não calcula nada. */
const xhrFalso = () => ({ open: vi.fn() } as unknown as XMLHttpRequest & { open: ReturnType<typeof vi.fn> });

/** A URL que o componente mandou para xhr.open, já parseada. */
const urlAberta = (xhr: { open: ReturnType<typeof vi.fn> }) => {
  expect(xhr.open).toHaveBeenCalledTimes(1);
  const [metodo, url, assincrono] = xhr.open.mock.calls[0];
  expect(metodo).toBe('GET');
  expect(assincrono).toBe(true);
  return { bruta: url as string, parseada: new URL(url as string) };
};

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  MockHls.mockClear();
  MockHls.isSupported.mockClear().mockReturnValue(true);
  mockHlsInstance.loadSource.mockClear();
  mockHlsInstance.attachMedia.mockClear();
  mockHlsInstance.on.mockClear();
  mockHlsInstance.destroy.mockClear();
  mockHlsInstance.startLoad.mockClear();
  mockHlsInstance.recoverMediaError.mockClear();
  vi.mocked(api.getMyVote).mockResolvedValue(null);
  vi.mocked(api.getSignedVideoUrl).mockReset().mockResolvedValue(URL_ASSINADA);
  vi.mocked(api.getContinueList).mockReset().mockResolvedValue([]);
  vi.mocked(api.getProgressForEpisode).mockReset().mockResolvedValue(null);
  vi.mocked(api.saveProgress).mockReset().mockResolvedValue({} as any);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN NAS SUB-REQUISIÇÕES DO HLS.JS (43e7694 / 935a565)
// ═══════════════════════════════════════════════════════════════════════════════

describe('VerticalPlayer — token nas sub-requisições do hls.js', () => {
  it('passa um xhrSetup ao hls.js quando a URL assinada traz token e expires', async () => {
    const cfg = await montarEPegarConfigDoHls();
    expect(cfg).toBeTruthy();
    expect(cfg.xhrSetup).toBeTypeOf('function');
  });

  it('playlist de variante (480p) sai com token, expires e token_path', async () => {
    const cfg = await montarEPegarConfigDoHls();
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, SUB_VARIANTE);

    const { bruta, parseada } = urlAberta(xhr);
    expect(parseada.searchParams.get('token')).toBe(TOKEN);
    expect(parseada.searchParams.get('expires')).toBe(EXPIRES);
    expect(parseada.searchParams.get('token_path')).toBe(DIRETORIO);
    // O token_path tem de ir percent-encoded: a barra crua corta o valor no CDN.
    expect(bruta).toContain(`token_path=${DIRETORIO_ENCODED}`);
    // E o arquivo pedido continua sendo o da sub-requisição, não a master.
    expect(parseada.pathname).toBe('/abc123xyz/480p/video.m3u8');
  });

  it('playlist de faixa de áudio (dublagem) sai com token, expires e token_path', async () => {
    const cfg = await montarEPegarConfigDoHls();
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, SUB_AUDIO);

    const { parseada } = urlAberta(xhr);
    expect(parseada.searchParams.get('token')).toBe(TOKEN);
    expect(parseada.searchParams.get('expires')).toBe(EXPIRES);
    expect(parseada.searchParams.get('token_path')).toBe(DIRETORIO);
    expect(parseada.pathname).toBe('/abc123xyz/audio_pt/playlist.m3u8');
  });

  it('segmento .ts sai com token, expires e token_path', async () => {
    const cfg = await montarEPegarConfigDoHls();
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, SUB_SEGMENTO);

    const { parseada } = urlAberta(xhr);
    expect(parseada.searchParams.get('token')).toBe(TOKEN);
    expect(parseada.searchParams.get('expires')).toBe(EXPIRES);
    expect(parseada.searchParams.get('token_path')).toBe(DIRETORIO);
    expect(parseada.pathname).toBe('/abc123xyz/480p/video_0.ts');
  });

  it('sub-requisição que já tem query string recebe os parâmetros sem perder a dela', async () => {
    const cfg = await montarEPegarConfigDoHls();
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, `${SUB_SEGMENTO}?resolution=480`);

    const { bruta, parseada } = urlAberta(xhr);
    expect(bruta.split('?').length).toBe(2); // um único '?' na URL final
    expect(parseada.searchParams.get('resolution')).toBe('480');
    expect(parseada.searchParams.get('token')).toBe(TOKEN);
    expect(parseada.searchParams.get('expires')).toBe(EXPIRES);
    expect(parseada.searchParams.get('token_path')).toBe(DIRETORIO);
  });

  it('não reabre a sub-requisição que já carrega token (não duplica o parâmetro)', async () => {
    const cfg = await montarEPegarConfigDoHls();
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, `${SUB_VARIANTE}?token=${TOKEN}&expires=${EXPIRES}`);

    expect(xhr.open).not.toHaveBeenCalled();
  });

  it('URL assinada sem token_path propaga token e expires sem inventar token_path vazio', async () => {
    const cfg = await montarEPegarConfigDoHls(
      'https://vz-fbaa1d24-d2c.b-cdn.net/abc123xyz/playlist.m3u8?token=tok-abc&expires=1700000000',
    );
    const xhr = xhrFalso();

    cfg.xhrSetup(xhr, SUB_VARIANTE);

    const { bruta, parseada } = urlAberta(xhr);
    expect(parseada.searchParams.get('token')).toBe(TOKEN);
    expect(parseada.searchParams.get('expires')).toBe(EXPIRES);
    expect(bruta).not.toContain('token_path');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECUPERAÇÃO DE ERRO FATAL DO HLS (935a565)
// ═══════════════════════════════════════════════════════════════════════════════

/** Pega o handler que o componente registrou de verdade para o evento ERROR. */
const handlerDeErro = () => {
  const registro = mockHlsInstance.on.mock.calls.find(([evento]) => evento === MockHls.Events.ERROR);
  expect(registro, 'o componente não registrou handler para Hls.Events.ERROR').toBeTruthy();
  return registro![1] as (evento: string, dados: any) => void;
};

describe('VerticalPlayer — recuperação de erro fatal do HLS', () => {
  it('erro fatal de rede manda o player tentar carregar de novo', async () => {
    await montarEPegarConfigDoHls();
    const onError = handlerDeErro();

    onError(MockHls.Events.ERROR, { fatal: true, type: MockHls.ErrorTypes.NETWORK_ERROR });

    expect(mockHlsInstance.startLoad).toHaveBeenCalled();
    expect(mockHlsInstance.recoverMediaError).not.toHaveBeenCalled();
  });

  it('erro fatal de mídia manda o player se recuperar', async () => {
    await montarEPegarConfigDoHls();
    const onError = handlerDeErro();

    onError(MockHls.Events.ERROR, { fatal: true, type: MockHls.ErrorTypes.MEDIA_ERROR });

    expect(mockHlsInstance.recoverMediaError).toHaveBeenCalled();
    expect(mockHlsInstance.startLoad).not.toHaveBeenCalled();
  });

  it('erro não-fatal não mexe no player (o hls.js se resolve sozinho)', async () => {
    await montarEPegarConfigDoHls();
    const onError = handlerDeErro();

    onError(MockHls.Events.ERROR, { fatal: false, type: MockHls.ErrorTypes.NETWORK_ERROR });

    expect(mockHlsInstance.startLoad).not.toHaveBeenCalled();
    expect(mockHlsInstance.recoverMediaError).not.toHaveBeenCalled();
  });
});
