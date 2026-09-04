/**
 * Testes — CanaisPanel (Fase 5 Bloco 1, Task 10; Fase 5 Bloco 2, Task 8):
 * admin — form de canal com "E-mail do dono" (transferência via PUT
 * ownerEmail) + botão "Desativar canal" (POST /:id/desativar) + botão
 * "Reativar canal" para inativos (POST /:id/reativar) + aba Mensagens por
 * canal (GET/POST /admin/mensagens/:canalId). PT fixo, sem i18n.
 *
 * Fase 5 Bloco 2, Task 8 (higiene do Bloco 1): a lista passa a usar
 * `GET /channels?includeInactive=true` — o badge "Inativo" vem do `isActive`
 * do PRÓPRIO backend (não mais um estado local mantido só depois de uma
 * desativação na mesma sessão).
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
    reativarCanal: vi.fn(),
    getAdminMensagensCanal: vi.fn(),
    sendAdminMensagem: vi.fn(),
  },
}));

import { api } from '../../services/api';
import CanaisPanel from '../../components/Admin/CanaisPanel';

const canais = [
  { _id: 'c1', name: 'Canal do Vin', ownerId: 'u1', isActive: true },
  { _id: 'c2', name: 'Canal da Ana', ownerId: 'u2', isActive: true },
];

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
  it('carrega a lista de canais com includeInactive=true ao montar', async () => {
    render(<CanaisPanel />);
    await waitFor(() => expect(api.listChannels).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Canal do Vin')).toBeInTheDocument();
    expect(screen.getByText('Canal da Ana')).toBeInTheDocument();
  });

  it('clicar num canal busca o detalhe e mostra o dono atual', async () => {
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText(/Dono atual:/)).toBeInTheDocument();
  });

  it('canal inativo (isActive:false vindo do backend) mostra badge "Inativo" na lista SEM nenhuma ação prévia', async () => {
    vi.mocked(api.listChannels).mockResolvedValue([
      { _id: 'c1', name: 'Canal do Vin', ownerId: 'u1', isActive: true },
      { _id: 'c3', name: 'Canal Ja Inativo', ownerId: 'u3', isActive: false },
    ] as any);
    render(<CanaisPanel />);
    await screen.findByText('Canal Ja Inativo');
    // O badge é irmão do nome dentro do mesmo botão da lista. Match EXATO
    // ("Inativo") — o próprio título do canal de teste contém a substring
    // "Inativo" ("Canal Ja Inativo"), então um regex solto casaria os dois.
    const botaoCanal = screen.getByText('Canal Ja Inativo').closest('button')!;
    expect(within(botaoCanal).getByText('Inativo')).toBeInTheDocument();
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
  it('pede confirmação; confirmando, chama desativarCanal e o botão vira "Reativar canal"', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(api.desativarCanal).mockResolvedValue({ _id: 'c1', isActive: false } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal do Vin'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /desativar canal/i }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.desativarCanal).toHaveBeenCalledWith('c1'));
    // Fase 5 Bloco 2, Task 8: desativar deixou de ser uma via de mão única —
    // no lugar do antigo botão desabilitado "Canal desativado", aparece
    // "Reativar canal" (habilitado), que chama POST /:id/reativar.
    await waitFor(() => expect(screen.getByRole('button', { name: /reativar canal/i })).toBeInTheDocument());
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

describe('CanaisPanel — Reativar canal (Fase 5 Bloco 2, Task 8)', () => {
  const canalInativoDetalhe = {
    _id: 'c3', name: 'Canal Inativo Detalhe', description: '', avatar: null, banner: null,
    isActive: false, followersCount: 0, isFollowing: false,
    ownerId: { _id: 'u3', nome: 'Ex-Dono' },
  };

  beforeEach(() => {
    vi.mocked(api.listChannels).mockResolvedValue([
      { _id: 'c3', name: 'Canal Inativo Detalhe', ownerId: 'u3', isActive: false },
    ] as any);
    vi.mocked(api.getChannel).mockResolvedValue(canalInativoDetalhe as any);
  });

  it('canal inativo mostra o botão "Reativar canal" (não "Desativar")', async () => {
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal Inativo Detalhe'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /reativar canal/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desativar canal/i })).not.toBeInTheDocument();
  });

  it('pede confirmação; confirmando, chama reativarCanal e o botão volta a "Desativar canal"', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(api.reativarCanal).mockResolvedValue({ _id: 'c3', isActive: true } as any);
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal Inativo Detalhe'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /reativar canal/i }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.reativarCanal).toHaveBeenCalledWith('c3'));
    await waitFor(() => expect(screen.getByRole('button', { name: /desativar canal/i })).toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it('cancelando a confirmação não chama a API', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal Inativo Detalhe'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /reativar canal/i }));
    expect(api.reativarCanal).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('CanaisPanel — Mensagens de canal inativo têm porta de entrada (Fase 5 Bloco 2, Task 8)', () => {
  it('canal inativo aparece na lista e a aba Mensagens carrega a thread arquivada normalmente (sem caixa de nova mensagem)', async () => {
    vi.mocked(api.listChannels).mockResolvedValue([
      { _id: 'c3', name: 'Canal Inativo Com Historico', ownerId: 'u3', isActive: false },
    ] as any);
    vi.mocked(api.getChannel).mockResolvedValue({
      _id: 'c3', name: 'Canal Inativo Com Historico', description: '', avatar: null, banner: null,
      isActive: false, followersCount: 0, isFollowing: false, ownerId: { _id: 'u3', nome: 'Ex-Dono' },
    } as any);
    vi.mocked(api.getAdminMensagensCanal).mockResolvedValue({
      canalId: 'c3',
      threads: [{
        ownerUserId: 'u3', vigente: false, arquivadaEm: '2026-08-01T00:00:00.000Z',
        mensagens: [{ _id: 'm9', autorTipo: 'ilustrador', texto: 'Mensagem do ex-dono', refTipo: null, refId: null }],
      }],
    } as any);

    render(<CanaisPanel />);
    fireEvent.click(await screen.findByText('Canal Inativo Com Historico'));
    await waitFor(() => expect(api.getChannel).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /mensagens/i }));
    await waitFor(() => expect(api.getAdminMensagensCanal).toHaveBeenCalledWith('c3'));

    expect(await screen.findByText('Mensagem do ex-dono')).toBeInTheDocument();
    // Canal inativo não deixa enviar mensagem nova — só a leitura do histórico.
    expect(screen.queryByPlaceholderText(/mensagem/i)).not.toBeInTheDocument();
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
