/**
 * Testes: AgendaView (overlay da agenda de lançamentos por dia da semana)
 * Cobre: dia de hoje selecionado por padrão (Date.getDay() mockado), troca de
 * dia refiltra a grade, dia vazio mostra aviso, clique numa obra chama
 * onOpenSeries(seriesId, contentType) e fecha o overlay, erro de rede mostra
 * aviso amigável sem quebrar a tela.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAgenda: vi.fn(),
  },
}));

import { api } from '../../services/api';
import AgendaView from '../../components/AgendaView';

// Mock leve de "hoje" — substitui apenas o construtor sem argumentos e
// Date.now(); chamadas com argumentos explícitos (usadas para gerar os nomes
// dos dias da semana a partir de uma data-âncora fixa) continuam delegando ao
// Date real. Evita vi.useFakeTimers(), que conflita com o polling assíncrono
// do waitFor() usado abaixo para aguardar a resolução de api.getAgenda().
const RealDate = Date;
function mockToday(year: number, monthIndex: number, day: number) {
  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(year, monthIndex, day, 12, 0, 0);
      } else {
        // @ts-ignore — spread de argumentos variádicos no super()
        super(...args);
      }
    }
    static now() {
      return new RealDate(year, monthIndex, day, 12, 0, 0).getTime();
    }
  }
  // @ts-ignore
  global.Date = MockDate as DateConstructor;
}
function restoreDate() {
  global.Date = RealDate;
}

const makeAgenda = (overrides: Record<string, any[]> = {}) => ({
  '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // 20/08/2026 é uma quinta-feira — Date.getDay() === 4.
  mockToday(2026, 7, 20);
});

afterEach(() => {
  restoreDate();
});

describe('AgendaView — fechado', () => {
  it('não renderiza nada e não busca a agenda quando open=false', () => {
    const { container } = render(<AgendaView open={false} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.getAgenda).not.toHaveBeenCalled();
  });
});

describe('AgendaView — dia default', () => {
  it('abre com o dia de hoje (quinta) selecionado e mostra as obras daquele dia', async () => {
    vi.mocked(api.getAgenda).mockResolvedValue(makeAgenda({
      '4': [{ _id: 's-qui', title: 'Obra de Quinta', cover_image: '', content_type: 'hqcine', releaseDay: 4 }],
    }) as any);
    render(<AgendaView open={true} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Obra de Quinta')).toBeInTheDocument());
    expect(screen.getByTestId('agenda-day-4')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('AgendaView — troca de dia', () => {
  it('clicar em outro dia refiltra a grade de capas', async () => {
    vi.mocked(api.getAgenda).mockResolvedValue(makeAgenda({
      '4': [{ _id: 's-qui', title: 'Obra de Quinta', cover_image: '', content_type: 'hqcine', releaseDay: 4 }],
      '5': [{ _id: 's-sex', title: 'Obra de Sexta', cover_image: '', content_type: 'vcine', releaseDay: 5 }],
    }) as any);
    render(<AgendaView open={true} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Obra de Quinta')).toBeInTheDocument());
    expect(screen.queryByText('Obra de Sexta')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agenda-day-5'));

    expect(screen.getByText('Obra de Sexta')).toBeInTheDocument();
    expect(screen.queryByText('Obra de Quinta')).not.toBeInTheDocument();
  });
});

describe('AgendaView — dia vazio', () => {
  it('mostra o aviso de dia vazio quando o dia selecionado não tem obras', async () => {
    vi.mocked(api.getAgenda).mockResolvedValue(makeAgenda() as any);
    render(<AgendaView open={true} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(api.getAgenda).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/nenhum lançamento/i)).toBeInTheDocument());
  });
});

describe('AgendaView — clique numa obra', () => {
  it('chama onOpenSeries(seriesId, contentType) e fecha o overlay', async () => {
    vi.mocked(api.getAgenda).mockResolvedValue(makeAgenda({
      '4': [{ _id: 's-qui', title: 'Obra de Quinta', cover_image: '', content_type: 'hqcine', releaseDay: 4 }],
    }) as any);
    const onOpenSeries = vi.fn();
    const onClose = vi.fn();
    render(<AgendaView open={true} onClose={onClose} onOpenSeries={onOpenSeries} />);
    await waitFor(() => screen.getByText('Obra de Quinta'));
    fireEvent.click(screen.getByText('Obra de Quinta'));
    expect(onOpenSeries).toHaveBeenCalledWith('s-qui', 'hqcine');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AgendaView — erro de rede', () => {
  it('mostra aviso amigável e não quebra quando a API falha', async () => {
    vi.mocked(api.getAgenda).mockRejectedValue(new Error('network fail'));
    render(<AgendaView open={true} onClose={vi.fn()} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/erro ao processar/i)).toBeInTheDocument());
  });

  it('botão fechar continua funcionando após o erro', async () => {
    vi.mocked(api.getAgenda).mockRejectedValue(new Error('network fail'));
    const onClose = vi.fn();
    render(<AgendaView open={true} onClose={onClose} onOpenSeries={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/erro ao processar/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/fechar/i));
    expect(onClose).toHaveBeenCalled();
  });
});
