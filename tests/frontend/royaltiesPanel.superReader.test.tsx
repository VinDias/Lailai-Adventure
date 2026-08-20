/**
 * Testes — RoyaltiesPanel, seção Super Reader (Fase 4 Bloco 3, Task 7).
 *
 * Pina o shape REAL de GET /admin/royalties/report (routes/royalties.js):
 * além dos campos do pool, o backend sempre devolve `superReader: { porCanal:
 * [{channelId, channelName, apoios, autorCents}], totalAutorCents,
 * totalPlataformaCents, totalApoios }` (shape estável, zeros/vazio sem
 * dados). ATENÇÃO: autorCents/totalAutorCents/totalPlataformaCents vêm em
 * CENTAVOS (diferente do pool, que já vem em decimal) — o teste do valor
 * 12345 -> "R$ 123,45" existe justamente para pinar essa conversão.
 *
 * Mesma técnica de tests/frontend/superReaderBadge.test.tsx: mocka
 * services/api inteiro para não bater rede real.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getRoyaltyReport: vi.fn(),
    getRoyaltyPeriods: vi.fn(),
    closeRoyaltyPeriod: vi.fn(),
    verifyRoyaltyIntegrity: vi.fn(),
    downloadRoyaltyCsv: vi.fn(),
  },
}));

import { api } from '../../services/api';
import RoyaltiesPanel from '../../components/Admin/RoyaltiesPanel';

// Base do report (campos do pool) igual ao devolvido por buildReport() em
// routes/royalties.js — usado como esqueleto comum aos três cenários.
const basePool = {
  period: '2026-08',
  channels: [],
  totalPoints: 0,
  adImpressions: 0,
  premiumUsers: 0,
  cpm: 0,
  perSub: 0,
  grossRevenue: 0,
  authorShare: 0.6,
  poolSuggested: 0,
  closedPeriod: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (api.getRoyaltyPeriods as any).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('RoyaltiesPanel — seção Super Reader', () => {
  it('com dados: totais e linhas por canal corretos, centavos convertidos para reais (12345 -> R$ 123,45)', async () => {
    (api.getRoyaltyReport as any).mockResolvedValue({
      ...basePool,
      superReader: {
        porCanal: [
          { channelId: 'c1', channelName: 'Canal Um', apoios: 3, autorCents: 12345 },
          { channelId: 'c2', channelName: 'Canal Dois', apoios: 2, autorCents: 2000 },
        ],
        totalAutorCents: 14345,
        totalPlataformaCents: 3586,
        totalApoios: 5,
      },
    });

    render(<RoyaltiesPanel />);

    await waitFor(() => expect(screen.getByText('Super Reader — direto ao autor')).toBeInTheDocument());

    // Totais do bloco SR.
    expect(screen.getByText('R$ 143,45')).toBeInTheDocument(); // 14345 centavos
    expect(screen.getByText('R$ 35,86')).toBeInTheDocument(); // 3586 centavos
    expect(screen.getByText('5')).toBeInTheDocument(); // nº de apoios

    // Linhas por canal.
    expect(screen.getByText('Canal Um')).toBeInTheDocument();
    expect(screen.getByText('R$ 123,45')).toBeInTheDocument(); // 12345 centavos
    expect(screen.getByText('Canal Dois')).toBeInTheDocument();
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument(); // 2000 centavos
  });

  it('sem dados: totais zerados e linha discreta "sem apoios no período"', async () => {
    (api.getRoyaltyReport as any).mockResolvedValue({
      ...basePool,
      superReader: { porCanal: [], totalAutorCents: 0, totalPlataformaCents: 0, totalApoios: 0 },
    });

    render(<RoyaltiesPanel />);

    await waitFor(() => expect(screen.getByText('Super Reader — direto ao autor')).toBeInTheDocument());

    expect(screen.getAllByText('R$ 0,00').length).toBeGreaterThanOrEqual(2); // autor + plataforma
    expect(screen.getByText(/sem apoios no per.odo/i)).toBeInTheDocument();
  });

  it('canal removido (channelName null) aparece como "(canal removido)"', async () => {
    (api.getRoyaltyReport as any).mockResolvedValue({
      ...basePool,
      superReader: {
        porCanal: [{ channelId: 'c3', channelName: null, apoios: 1, autorCents: 500 }],
        totalAutorCents: 500,
        totalPlataformaCents: 125,
        totalApoios: 1,
      },
    });

    render(<RoyaltiesPanel />);

    await waitFor(() => expect(screen.getByText('(canal removido)')).toBeInTheDocument());
    // "R$ 5,00" aparece duas vezes: no card de total do autor e na linha do canal.
    expect(screen.getAllByText('R$ 5,00').length).toBe(2); // 500 centavos
  });

  it('subtítulo deixa explícito que a seção não entra no fechamento do pool', async () => {
    (api.getRoyaltyReport as any).mockResolvedValue({
      ...basePool,
      superReader: { porCanal: [], totalAutorCents: 0, totalPlataformaCents: 0, totalApoios: 0 },
    });

    render(<RoyaltiesPanel />);

    await waitFor(() => expect(screen.getByText('Super Reader — direto ao autor')).toBeInTheDocument());
    expect(screen.getByText(/n.o entra no (pool|fechamento)/i)).toBeInTheDocument();
  });
});
