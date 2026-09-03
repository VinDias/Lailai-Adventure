/**
 * Testes — CanalPublico (Fase 5 Bloco 1, Task 10): tela pública do canal,
 * alcançada pelo clique no nome do canal no modal de detalhe da obra dos 3
 * feeds. Cobre: render (avatar/banner/nome/descrição/contagem de
 * seguidores), obras publicadas do canal (filtradas client-side de
 * GET /content/series pelo channelId — GET /channels/:id não devolve
 * obras), clique na obra fecha e abre a série (onOpenSeries), Seguir/
 * Seguindo com atualização otimista + rollback em erro, e visitante (sem
 * conta) com o botão Seguir desabilitado — mesmo padrão de
 * components/HQCine.tsx (favoritar: `disabled={... || !user}`, sem prompt).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getChannel: vi.fn(),
    getSeries: vi.fn(),
    followChannel: vi.fn(),
    unfollowChannel: vi.fn(),
  },
}));

import { api } from '../../services/api';
import CanalPublico from '../../components/CanalPublico';

const canal = {
  _id: 'c1', name: 'Canal do Vin', description: 'Quadrinhos autorais.',
  avatar: 'https://cdn/avatar.jpg', banner: 'https://cdn/banner.jpg',
  isActive: true, followersCount: 5, isFollowing: false,
};

const makeUser = (overrides = {}) => ({
  id: 'u1', email: 'user@test.com', nome: 'User', role: 'user' as const,
  isPremium: false, avatar: '', provider: 'local' as const, criadoEm: '',
  premiumExpiresAt: undefined, followingChannelIds: [], ...overrides,
});

const seriesDoCanal = { _id: 's1', title: 'Obra do Canal', content_type: 'hiqua', channelId: 'c1', cover_image: 'https://cdn/capa.jpg' };
const seriesDeOutroCanal = { _id: 's2', title: 'Obra de Outro Canal', content_type: 'hiqua', channelId: 'c2', cover_image: '' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getChannel).mockResolvedValue(canal as any);
  vi.mocked(api.getSeries).mockResolvedValue([seriesDoCanal, seriesDeOutroCanal] as any);
});

describe('CanalPublico — render', () => {
  it('mostra nome, descrição, avatar/banner e contagem de seguidores', async () => {
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);

    await waitFor(() => expect(api.getChannel).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Canal do Vin')).toBeInTheDocument();
    expect(screen.getByText('Quadrinhos autorais.')).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByAltText('Canal do Vin')).toHaveAttribute('src', 'https://cdn/avatar.jpg');
  });

  it('lista só as obras do canal (filtra por channelId, obra de outro canal fora)', async () => {
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(api.getSeries).toHaveBeenCalled());
    expect(await screen.findByText('Obra do Canal')).toBeInTheDocument();
    expect(screen.queryByText('Obra de Outro Canal')).not.toBeInTheDocument();
  });

  it('sem obras publicadas — mostra estado vazio', async () => {
    vi.mocked(api.getSeries).mockResolvedValue([seriesDeOutroCanal] as any);
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(api.getSeries).toHaveBeenCalled());
    expect(await screen.findByText(/ainda não publicou/i)).toBeInTheDocument();
  });

  it('clique na obra fecha o canal e chama onOpenSeries com id + content_type', async () => {
    const onClose = vi.fn();
    const onOpenSeries = vi.fn();
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={onClose} onOpenSeries={onOpenSeries} />);

    const card = await screen.findByText('Obra do Canal');
    fireEvent.click(card);

    expect(onClose).toHaveBeenCalled();
    expect(onOpenSeries).toHaveBeenCalledWith('s1', 'hiqua');
  });

  it('canal não encontrado — não quebra, mostra mensagem', async () => {
    vi.mocked(api.getChannel).mockRejectedValue(new Error('Canal não encontrado.'));
    render(<CanalPublico channelId="c-inexistente" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());
    expect(await screen.findByText(/não encontrado/i)).toBeInTheDocument();
  });
});

describe('CanalPublico — Seguir/Seguindo', () => {
  it('usuário logado, ainda não segue: clique otimista + chama followChannel + reconcilia contagem com a resposta', async () => {
    vi.mocked(api.followChannel).mockResolvedValue({ success: true, followers: 6 });
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);

    const botao = await screen.findByTestId('canal-follow-button');
    expect(botao).toHaveTextContent(/seguir/i);
    expect(botao).not.toHaveTextContent(/seguindo/i);

    fireEvent.click(botao);
    // Atualização otimista imediata (antes da promise resolver).
    expect(botao).toHaveTextContent(/seguindo/i);

    await waitFor(() => expect(api.followChannel).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.getByText(/6/)).toBeInTheDocument());
  });

  it('usuário logado, já segue: clique chama unfollowChannel e reconcilia contagem', async () => {
    vi.mocked(api.getChannel).mockResolvedValue({ ...canal, isFollowing: true, followersCount: 5 } as any);
    vi.mocked(api.unfollowChannel).mockResolvedValue({ success: true, followers: 4 });
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);

    const botao = await screen.findByTestId('canal-follow-button');
    expect(botao).toHaveTextContent(/seguindo/i);

    fireEvent.click(botao);
    expect(botao).toHaveTextContent(/^seguir/i);

    await waitFor(() => expect(api.unfollowChannel).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.getByText(/4/)).toBeInTheDocument());
  });

  it('erro na chamada: reverte a atualização otimista (rollback)', async () => {
    vi.mocked(api.followChannel).mockRejectedValue(new Error('Falha de rede'));
    render(<CanalPublico channelId="c1" user={makeUser()} onClose={vi.fn()} onOpenSeries={vi.fn()} />);

    const botao = await screen.findByTestId('canal-follow-button');
    fireEvent.click(botao);
    expect(botao).toHaveTextContent(/seguindo/i);

    await waitFor(() => expect(api.followChannel).toHaveBeenCalled());
    await waitFor(() => expect(botao).not.toHaveTextContent(/seguindo/i));
    expect(screen.getByText(/5/)).toBeInTheDocument(); // contagem original restaurada
  });

  it('visitante (sem conta): botão Seguir fica desabilitado, sem chamar a API', async () => {
    render(<CanalPublico channelId="c1" user={null} onClose={vi.fn()} onOpenSeries={vi.fn()} />);

    const botao = await screen.findByTestId('canal-follow-button');
    expect(botao).toBeDisabled();

    fireEvent.click(botao);
    expect(api.followChannel).not.toHaveBeenCalled();
    expect(api.unfollowChannel).not.toHaveBeenCalled();
  });
});
