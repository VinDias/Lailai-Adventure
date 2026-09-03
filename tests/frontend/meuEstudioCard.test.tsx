/**
 * Testes — MeuEstudioCard (Fase 5 Bloco 1, Task 9): cartão "Meu Estúdio" na
 * Conta, visível SÓ para donos de canal. Consulta GET /portal/meu-estudio
 * (api.getMeuEstudio) ao montar — 200 renderiza com badges de pendências/
 * mensagens não lidas; 403 (ou qualquer outra falha) não renderiza nada
 * (mesmo padrão de components/SuperReaderBadge.tsx: falha = null).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { getMeuEstudio: vi.fn() },
}));

import { api } from '../../services/api';
import MeuEstudioCard from '../../components/MeuEstudioCard';

beforeEach(() => vi.clearAllMocks());

describe('MeuEstudioCard', () => {
  it('não é dono (403/erro) — não renderiza nada', async () => {
    vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('Você não é dono de nenhum canal ativo.'));
    const { container } = render(<MeuEstudioCard onOpen={vi.fn()} />);
    await waitFor(() => expect(api.getMeuEstudio).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('é dono sem pendências — renderiza o cartão sem badges', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({
      canais: [{ channelId: 'c1', name: 'Canal 1', avatar: null, obras: 2, pendentes: 0, mensagensNaoLidas: 0 }],
    } as any);
    render(<MeuEstudioCard onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('meu-estudio-card')).toBeInTheDocument());
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument();
  });

  it('é dono com pendências e mensagens não lidas — mostra os totais somados por canal', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({
      canais: [
        { channelId: 'c1', name: 'Canal 1', avatar: null, obras: 2, pendentes: 1, mensagensNaoLidas: 2 },
        { channelId: 'c2', name: 'Canal 2', avatar: null, obras: 1, pendentes: 3, mensagensNaoLidas: 0 },
      ],
    } as any);
    render(<MeuEstudioCard onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('meu-estudio-card')).toBeInTheDocument());
    expect(screen.getByText(/4/)).toBeInTheDocument(); // 1 + 3 pendentes
    expect(screen.getByText(/2/)).toBeInTheDocument(); // mensagensNaoLidas
  });

  it('clique chama onOpen', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({
      canais: [{ channelId: 'c1', name: 'Canal 1', avatar: null, obras: 0, pendentes: 0, mensagensNaoLidas: 0 }],
    } as any);
    const onOpen = vi.fn();
    render(<MeuEstudioCard onOpen={onOpen} />);
    await waitFor(() => screen.getByTestId('meu-estudio-card'));
    fireEvent.click(screen.getByTestId('meu-estudio-card'));
    expect(onOpen).toHaveBeenCalled();
  });
});
