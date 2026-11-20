/**
 * Regressão (19/11/2026): o servidor deixou de mandar a mídia de episódio
 * pago na LISTA para quem não pode assistir (tests/backend/
 * premiumListaEpisodios.test.js). O item chega sem bunnyVideoId e sem
 * video_url, com `bloqueio`. O app tem de transformar isso no convite, e não
 * em um player preto tentando tocar uma URL vazia.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('hls.js', () => ({ default: Object.assign(vi.fn(), { isSupported: () => true, Events: {} }) }));
vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/AdComponent', () => ({
  default: ({ onFinish }: { onFinish: () => void }) => <button onClick={onFinish}>Fechar Anúncio</button>,
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
import { videoDoEpisodio } from '../../utils/videoDoEpisodio';

const obra = { _id: 's1', title: 'Novela Paga', genre: 'Drama', isPremium: true, cover_image: 'https://cdn/capa.jpg' };

// Formato exato do item que o servidor manda para quem não tem direito.
const itemBloqueado = {
  _id: 'e1', seriesId: 's1', episode_number: 1, title: 'Ep 1', thumbnail: 'https://cdn/t.jpg',
  isPremium: true, panels: [], bloqueio: 'assinatura_necessaria',
};

beforeEach(() => vi.clearAllMocks());

describe('videoDoEpisodio', () => {
  it('leva o bloqueio da lista para o Video, com a obra para a tela de convite', () => {
    const v = videoDoEpisodio(itemBloqueado, obra, 'vcine', 10);
    expect(v.bloqueio).toEqual({ motivo: 'assinatura_necessaria', obra: { title: 'Novela Paga', cover_image: 'https://cdn/capa.jpg' } });
    expect(v.bunnyVideoId).toBeUndefined();
    expect(v.arquivoUrl).toBeUndefined();
  });

  it('item liberado não ganha bloqueio e mantém a mídia', () => {
    const v = videoDoEpisodio({ ...itemBloqueado, bloqueio: undefined, bunnyVideoId: 'guid-1', video_url: 'https://cdn/x.m3u8' }, obra, 'hqcine', 15);
    expect(v.bloqueio).toBeUndefined();
    expect(v.bunnyVideoId).toBe('guid-1');
    expect(v.arquivoUrl).toBe('https://cdn/x.m3u8');
    expect(v.type).toBe('hqcine');
    expect(v.duracao).toBe(15);
  });
});

describe('VerticalPlayer com item bloqueado pela lista', () => {
  it('conta gratuita: mostra o convite para assinar na hora, sem anúncio e sem pedir URL assinada', async () => {
    render(
      <VerticalPlayer
        video={videoDoEpisodio(itemBloqueado, obra, 'vcine', 10)}
        user={{ id: 'u1', nome: 'U', email: 'u@x', isPremium: false } as any}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: /Quero assinar/i })).toBeInTheDocument();
    expect(screen.getByText('Novela Paga')).toBeInTheDocument();
    expect(screen.queryByText('Fechar Anúncio')).not.toBeInTheDocument();
    expect(screen.queryByText(/indisponível/i)).not.toBeInTheDocument();
    expect(api.getSignedVideoUrl).not.toHaveBeenCalled();
  });

  it('visitante: convida a criar conta', async () => {
    render(
      <VerticalPlayer
        video={videoDoEpisodio({ ...itemBloqueado, bloqueio: 'login_necessario' }, obra, 'hqcine', 15)}
        user={null}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: /criar minha conta/i })).toBeInTheDocument();
    expect(api.getSignedVideoUrl).not.toHaveBeenCalled();
  });
});
