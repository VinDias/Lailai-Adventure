/**
 * Testes — CanaisPanel (Fase 5 Bloco 1, Task 10): admin — form de canal com
 * "E-mail do dono" (transferência via PUT ownerEmail) + botão "Desativar
 * canal" (POST /:id/desativar) + aba Mensagens por canal (GET/POST
 * /admin/mensagens/:canalId). PT fixo, sem i18n.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    listChannels: vi.fn(),
    getChannel: vi.fn(),
    updateChannelAdmin: vi.fn(),
    desativarCanal: vi.fn(),
    getAdminMensagensCanal: vi.fn(),
    sendAdminMensagem: vi.fn(),
  },
}));

import { api } from '../../services/api';
import CanaisPanel from '../../components/Admin/CanaisPanel';

const canais = [{ _id: 'c1', name: 'Canal do Vin', ownerId: 'u1' }, { _id: 'c2', name: 'Canal da Ana', ownerId: 'u2' }];

const canalDetalheC1 = {
  _id: 'c1', name: 'Canal do Vin', description: 'Desc', avatar: null, banner: null,
  isActive: true, followersCount: 3, isFollowing: false,
  ownerId: { _id: 'u1', nome: 'Vin' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listChannels).mockResolvedValue(canais as any);
  vi.mocked(api.getChannel).mockResolvedValue(canalDetalheC1 as any);
  vi.mocked(api.getAdminMensagensCanal).mockResolvedValue({ canalId: 'c1', threads: [] } as any);
});

describe('CanaisPanel — lista e seleção', () => {
  it('carrega a lista de canais ao montar', async () => {
    render(<CanaisPanel />);
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
    expect(await screen.findByText('Canal do Vin')).toBeInTheDocument();
    expect(screen.getByText('Canal da Ana')).toBeInTheDocument();
  });

  it('clicar num canal busca o detalhe e mostra o dono atual', async () => {
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText(/Dono atual:/)).toBeInTheDocument();
  });
});

describe('CanaisPanel — E-mail do dono (transferência)', () => {
  it('preenche e-mail e transfere — chama updateChannelAdmin com ownerEmail', async () => {
    vi.mocked(api.updateChannelAdmin).mockResolvedValue({ _id: 'c1', ownerId: 'u9' } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    const input = await screen.findByPlaceholderText(/e-mail/i);
    fireEvent.change(input, { target: { value: 'novo-dono@lorflux.test' } });
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }));

    await waitFor(() => expect(api.updateChannelAdmin).toHaveBeenCalledWith('c1', { ownerEmail: 'novo-dono@lorflux.test' }));
  });

  it('404 e-mail inexistente — mostra mensagem legível', async () => {
    vi.mocked(api.updateChannelAdmin).mockRejectedValue(new Error('Usuário com esse e-mail não encontrado.'));
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    const input = await screen.findByPlaceholderText(/e-mail/i);
    fireEvent.change(input, { target: { value: 'nada@lorflux.test' } });
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }));

    // Achado da revisão da T10: a heurística antiga (includes('rro')) pintava
    // esta mensagem de VERDE — a cor precisa sinalizar erro, não só o texto.
    const msg = await screen.findByText(/não encontrado/i);
    expect(msg).toBeInTheDocument();
    expect(msg.className).toContain('text-rose-500');
    expect(msg.className).not.toContain('text-emerald-400');
  });

  it('sucesso na transferência mostra mensagem em verde (não vermelho)', async () => {
    vi.mocked(api.updateChannelAdmin).mockResolvedValue({ _id: 'c1', ownerId: { _id: 'u9', nome: 'Novo Dono' } } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    const input = await screen.findByPlaceholderText(/e-mail/i);
    fireEvent.change(input, { target: { value: 'novo-dono@lorflux.test' } });
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }));

    const ok = await screen.findByText(/atualizado/i);
    expect(ok.className).toContain('text-emerald-400');
    expect(ok.className).not.toContain('text-rose-500');
  });

  it('botão Transferir desabilitado com o campo vazio', async () => {
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /transferir/i })).toBeDisabled();
  });
});

describe('CanaisPanel — Desativar canal', () => {
  it('pede confirmação; confirmando, chama desativarCanal e marca o canal como inativo na lista', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(api.desativarCanal).mockResolvedValue({ _id: 'c1', isActive: false } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /desativar canal/i }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.desativarCanal).toHaveBeenCalledWith('c1'));
    // Indicado na lista (achado da revisão: GET /channels filtra isActive:true
    // e não devolve mais este canal — o estado local marca "inativo" sem refetch).
    await waitFor(() => expect(screen.getByRole('button', { name: /canal desativado/i })).toBeInTheDocument());
    expect(screen.getAllByText(/inativo/i).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('cancelando a confirmação não chama a API', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /desativar canal/i }));
    expect(api.desativarCanal).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('CanaisPanel — Mensagens por canal', () => {
  it('aba Mensagens carrega as threads (vigente e arquivadas legíveis)', async () => {
    vi.mocked(api.getAdminMensagensCanal).mockResolvedValue({
      canalId: 'c1',
      threads: [
        {
          ownerUserId: 'u1', vigente: true, arquivadaEm: null,
          mensagens: [{ _id: 'm1', autorTipo: 'ilustrador', texto: 'Oi, tudo bem?', refTipo: null, refId: null }],
        },
        {
          ownerUserId: 'u0', vigente: false, arquivadaEm: '2026-08-01T00:00:00.000Z',
          mensagens: [{ _id: 'm0', autorTipo: 'editor', texto: 'Mensagem antiga', refTipo: 'series', refId: 's9' }],
        },
      ],
    } as any);

    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /mensagens/i }));
    await waitFor(() => expect(api.getAdminMensagensCanal).toHaveBeenCalledWith('c1'));

    expect(await screen.findByText('Oi, tudo bem?')).toBeInTheDocument();
    expect(screen.getByText('Mensagem antiga')).toBeInTheDocument();
    expect(screen.getByText(/arquivada/i)).toBeInTheDocument();
    expect(screen.getByText(/sobre/i)).toBeInTheDocument(); // ref "Sobre: série" na mensagem arquivada
  });

  it('enviar mensagem nova chama sendAdminMensagem e recarrega as threads', async () => {
    vi.mocked(api.sendAdminMensagem).mockResolvedValue({ _id: 'm2', autorTipo: 'editor', texto: 'Ajuste isso' } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /mensagens/i }));
    await waitFor(() => expect(api.getAdminMensagensCanal).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText(/mensagem/i);
    fireEvent.change(input, { target: { value: 'Ajuste isso' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(api.sendAdminMensagem).toHaveBeenCalledWith('c1', { texto: 'Ajuste isso' }));
    await waitFor(() => expect(api.getAdminMensagensCanal).toHaveBeenCalledTimes(2));
  });
});
