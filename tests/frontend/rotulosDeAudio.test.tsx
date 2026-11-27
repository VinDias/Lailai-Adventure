/**
 * Regressão: quatro botões de idioma, todos "English", no player de vídeo
 * ==========================================================================
 *
 * O DEFEITO (retorno do cliente em 27/11/2026, print-4): "Parece que a
 * orientação de áudio quebrou também. Só aparece a língua inglesa." No vídeo
 * enviado pelo AUTOR (frente A, item 9) o player mostrava quatro botões com o
 * mesmo texto, "English".
 *
 * CAUSA: o Bunny Stream marca todas as faixas de áudio com o mesmo idioma
 * ("en") quando o arquivo não diz o idioma de cada uma. O player traduzia o
 * código faixa por faixa. Nos vídeos do admin isso ficava escondido pelos
 * nomes digitados à mão (`hlsAudioLabels`); o vídeo do autor não tem nomes.
 *
 * SEGUNDA VEZ: 136b916 (28/03/2026, "todos os botões mostrarem English")
 * consertou no player; 1073485, dez minutos depois, apagou o conserto ao
 * criar o editor de nomes. Não havia teste. Este arquivo é o teste.
 *
 * O QUE GARANTE
 * - faixas com o mesmo idioma nunca viram botões com o mesmo texto: saem na
 *   ordem combinada da plataforma (PT-BR, English, Español, 中文);
 * - o player mostra um botão por faixa do vídeo, nem mais nem menos;
 * - o nome digitado pelo admin continua valendo, e o idioma do manifesto
 *   continua valendo quando distingue as faixas.
 *
 * O QUE NÃO GARANTE: que a 1ª faixa do arquivo do autor seja mesmo a de
 * português. Isso é do arquivo; o admin corrige em "Faixas de Áudio".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Video, User } from '../../types';
import { rotulosDasFaixas } from '../../utils/rotulosDeAudio';

const { MockHls, mockHlsInstance } = vi.hoisted(() => {
  const instance = {
    loadSource: vi.fn(), attachMedia: vi.fn(), on: vi.fn(), destroy: vi.fn(),
    startLoad: vi.fn(), recoverMediaError: vi.fn(),
    currentLevel: -1, audioTrack: 0, levels: [{ height: 720 }],
  };
  const Ctor = vi.fn(function HlsMock() { return instance; }) as any;
  Ctor.isSupported = vi.fn(() => true);
  Ctor.Events = { MANIFEST_PARSED: 'hlsManifestParsed', AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated', AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched', ERROR: 'hlsError' };
  Ctor.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  return { MockHls: Ctor, mockHlsInstance: instance };
});

vi.mock('hls.js', () => ({ default: MockHls }));
vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/AdComponent', () => ({ default: () => <div data-testid="ad-component" /> }));
vi.mock('../../services/api', () => ({
  api: {
    getMyVote: vi.fn().mockResolvedValue(null),
    vote: vi.fn(), removeVote: vi.fn(),
    getSignedVideoUrl: vi.fn(),
    getContinueList: vi.fn().mockResolvedValue([]),
    getProgressForEpisode: vi.fn().mockResolvedValue(null),
    saveProgress: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from '../../services/api';
import VerticalPlayer from '../../components/VerticalPlayer';

const video = (extra: Partial<Video> = {}): Video => ({
  id: 'ep-video-autor', titulo: 'TimeLineTeste', categoria: '', descricao: '', duracao: 0,
  arquivoUrl: '', bunnyVideoId: 'guid-do-autor', thumbnailUrl: '', isPremium: false, criadoEm: '', type: 'vcine',
  ...extra,
});
const assinante: User = {
  id: 'u1', email: 'u@lorflux.test', nome: 'U', role: 'user', isPremium: true, avatar: '', provider: 'local', criadoEm: '', followingChannelIds: [],
} as User;

// Como o Bunny entregou o vídeo do print-4: quatro faixas, todas "en".
const QUATRO_FAIXAS_EN = [0, 1, 2, 3].map(id => ({ id, lang: 'en', name: 'English' }));

async function montarComFaixas(v: Video, faixas: any[]) {
  render(<VerticalPlayer video={v} user={assinante} onClose={vi.fn()} />);
  await waitFor(() => expect(mockHlsInstance.on).toHaveBeenCalled());
  const registro = mockHlsInstance.on.mock.calls.find(c => c[0] === 'hlsAudioTracksUpdated');
  expect(registro).toBeTruthy();
  act(() => { registro![1]('hlsAudioTracksUpdated', { audioTracks: faixas }); });
}

/** Os botões de idioma: os que ficam no grupo do botão com este texto. */
function botoesDeIdioma(umTexto: string): string[] {
  const grupo = screen.getByRole('button', { name: umTexto }).parentElement!;
  return Array.from(grupo.querySelectorAll('button')).map(b => b.textContent || '');
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  MockHls.mockClear();
  mockHlsInstance.on.mockClear();
  vi.mocked(api.getSignedVideoUrl).mockReset().mockResolvedValue('https://vz.b-cdn.net/guid-do-autor/playlist.m3u8?token=t&expires=1');
});

describe('player de vídeo: um nome por faixa de áudio (retorno de 27/11/2026)', () => {
  it('vídeo do autor com quatro faixas "en" NÃO mostra quatro botões "English"', async () => {
    await montarComFaixas(video(), QUATRO_FAIXAS_EN);
    const textos = botoesDeIdioma('PT-BR');
    expect(textos).toEqual(['PT-BR', 'English', 'Español', '中文']);
    expect(screen.getAllByRole('button', { name: 'English' })).toHaveLength(1);
  });

  it('o mesmo vídeo na prévia do moderador (sem nomes do episódio) também sai com um nome por faixa', async () => {
    render(<VerticalPlayer previa video={video({ hlsAudioLabels: undefined })} user={null} onClose={vi.fn()} />);
    await waitFor(() => expect(mockHlsInstance.on).toHaveBeenCalled());
    const registro = mockHlsInstance.on.mock.calls.find(c => c[0] === 'hlsAudioTracksUpdated')!;
    act(() => { registro[1]('hlsAudioTracksUpdated', { audioTracks: QUATRO_FAIXAS_EN }); });
    expect(new Set(botoesDeIdioma('PT-BR')).size).toBe(4);
  });

  it('um botão por faixa que o vídeo tem: duas faixas, dois botões; uma faixa, nenhum seletor', async () => {
    await montarComFaixas(video(), QUATRO_FAIXAS_EN.slice(0, 2));
    expect(botoesDeIdioma('PT-BR')).toEqual(['PT-BR', 'English']);
    expect(screen.queryByRole('button', { name: 'Español' })).toBeNull();
  });

  it('vídeo de uma faixa só não mostra seletor de idioma', async () => {
    await montarComFaixas(video(), QUATRO_FAIXAS_EN.slice(0, 1));
    expect(screen.queryByRole('button', { name: 'English' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PT-BR' })).toBeNull();
  });

  it('os nomes vazios que o editor do admin grava (["", "", "", ""]) não apagam os botões', async () => {
    await montarComFaixas(video({ hlsAudioLabels: ['', '', '', ''] }), QUATRO_FAIXAS_EN);
    expect(botoesDeIdioma('PT-BR')).toEqual(['PT-BR', 'English', 'Español', '中文']);
  });

  it('o nome digitado pelo admin continua valendo', async () => {
    await montarComFaixas(video({ hlsAudioLabels: ['Port', 'Eng', 'Esp', 'Zhon'] }), QUATRO_FAIXAS_EN);
    expect(botoesDeIdioma('Port')).toEqual(['Port', 'Eng', 'Esp', 'Zhon']);
  });
});

describe('rotulosDasFaixas', () => {
  const faixaN = (n: number) => `Faixa ${n}`;

  it('idiomas diferentes no manifesto: vale o idioma de cada faixa, em qualquer ordem', () => {
    expect(rotulosDasFaixas([{ lang: 'es' }, { lang: 'pt-BR' }, { lang: 'en-US' }], [], faixaN)).toEqual(['Español', 'PT-BR', 'English']);
  });

  it('mesmo idioma e nomes diferentes no vídeo: vale o nome que veio do vídeo', () => {
    expect(rotulosDasFaixas([{ lang: 'en', name: 'Dublado' }, { lang: 'en', name: 'Original' }], undefined, faixaN)).toEqual(['Dublado', 'Original']);
  });

  it('nome do admin só em uma posição: as outras não repetem o texto dela', () => {
    const r = rotulosDasFaixas(QUATRO_FAIXAS_EN, ['English'], faixaN);
    expect(r[0]).toBe('English');
    expect(new Set(r).size).toBe(4);
  });

  it('mais de quatro faixas iguais: as que passam da ordem combinada viram "Faixa N"', () => {
    const seis = [0, 1, 2, 3, 4, 5].map(() => ({ lang: 'en', name: 'English' }));
    expect(rotulosDasFaixas(seis, null, faixaN)).toEqual(['PT-BR', 'English', 'Español', '中文', 'Faixa 5', 'Faixa 6']);
  });

  it('em nenhuma combinação dois botões saem com o mesmo texto', () => {
    const casos = [
      [{ lang: 'en' }, { lang: 'pt' }, { lang: 'pt' }, { lang: 'pt' }],
      [{ lang: 'pt' }, { lang: 'en' }, { lang: 'en' }, { lang: 'en' }],
      [{ lang: 'zh' }, { lang: 'zh' }, { lang: 'es' }, { lang: 'es' }],
      [{ lang: '' }, { lang: undefined }, { name: 'English' }, { name: 'English' }],
      [{ lang: 'und', name: 'a' }, { lang: 'und', name: 'A' }],
    ];
    for (const faixas of casos) {
      const r = rotulosDasFaixas(faixas, ['', 'English'], faixaN);
      expect(r).toHaveLength(faixas.length);
      expect(new Set(r.map(x => x.toLowerCase())).size).toBe(faixas.length);
      expect(r.every(x => x.trim().length > 0)).toBe(true);
    }
  });
});
