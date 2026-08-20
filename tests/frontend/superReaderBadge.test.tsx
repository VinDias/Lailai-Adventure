/**
 * Testes — SuperReaderBadge (Fase 4 Bloco 3, Task 6): selo Super Reader +
 * lista de contribuições na aba Conta. Mesma técnica de
 * tests/frontend/superReaderButton.test.tsx: mocka services/api para pinar
 * o comportamento sem rede real. O componente só é montado dentro da Conta
 * (ViewMode.PROFILE em App.tsx), que já exige login — por isso, ao contrário
 * do SuperReaderButton, não recebe (nem precisa checar) prop de usuário.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getSuperReaderMe: vi.fn(),
  },
}));

import { api } from '../../services/api';
import SuperReaderBadge from '../../components/SuperReaderBadge';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SuperReaderBadge', () => {
  it('superReader true: mostra o selo e a lista de contribuições (título, valor e data)', async () => {
    (api.getSuperReaderMe as any).mockResolvedValue({
      superReader: true,
      contribuicoes: [
        { seriesTitle: 'Obra X', amountCents: 500, currency: 'brl', createdAt: '2026-01-15T10:00:00.000Z' },
        { seriesTitle: 'Obra Y', amountCents: 750, currency: 'usd', createdAt: '2026-02-01T00:00:00.000Z' },
      ],
    });

    render(<SuperReaderBadge />);

    await waitFor(() => expect(screen.getByText('Super Reader')).toBeInTheDocument());
    expect(screen.getByText('Obra X')).toBeInTheDocument();
    expect(screen.getByText('Obra Y')).toBeInTheDocument();
    // 500 centavos em brl é redondo -> "R$5"; 750 centavos em usd não é -> "$7.50".
    expect(screen.getByText(/R\$5/)).toBeInTheDocument();
    expect(screen.getByText(/\$7\.50/)).toBeInTheDocument();
    // Data curta no locale pt-BR (idioma padrão sem I18nProvider).
    expect(screen.getByText(/15\/01\/2026/)).toBeInTheDocument();
  });

  it('contribuição com obra removida (seriesTitle null) mostra o texto de fallback', async () => {
    (api.getSuperReaderMe as any).mockResolvedValue({
      superReader: true,
      contribuicoes: [
        { seriesTitle: null, amountCents: 1000, currency: 'brl', createdAt: '2026-03-05T00:00:00.000Z' },
      ],
    });

    render(<SuperReaderBadge />);

    await waitFor(() => expect(screen.getByText('Obra removida')).toBeInTheDocument());
  });

  it('superReader false: sem selo, mostra o convite discreto para apoiar', async () => {
    (api.getSuperReaderMe as any).mockResolvedValue({ superReader: false, contribuicoes: [] });

    render(<SuperReaderBadge />);

    await waitFor(() =>
      expect(screen.getByText('Apoie uma obra e ganhe o selo Super Reader.')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('superreader-badge')).not.toBeInTheDocument();
  });

  it('falha da api: não renderiza nada e não quebra', async () => {
    (api.getSuperReaderMe as any).mockRejectedValue(new Error('network down'));

    const { container } = render(<SuperReaderBadge />);

    await waitFor(() => expect(api.getSuperReaderMe).toHaveBeenCalledTimes(1));
    // Dá tempo para um possível (indevido) render de erro aparecer antes de afirmar ausência.
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('antes da resposta chegar, não renderiza nada (sem flash de skeleton)', () => {
    (api.getSuperReaderMe as any).mockReturnValue(new Promise(() => {})); // nunca resolve
    const { container } = render(<SuperReaderBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
