import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ContinueCarousel from '../../components/ContinueCarousel';
import { api } from '../../services/api';

const item = {
  seriesId: 's1',
  episodeId: 'e1',
  contentType: 'hiqua',
  percent: 0.62,
  series: { title: 'The Near Ones', cover_image: '/capa.jpg' },
};

describe('ContinueCarousel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('nao renderiza nada quando nao ha progresso', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([]);
    const { container } = render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    await waitFor(() => expect(api.getContinueList).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('mostra a obra em andamento com o percentual', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('mostra so o conteudo da aba em que esta', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([
      item,
      { ...item, seriesId: 's2', contentType: 'vcine', series: { title: 'Curta Vertical' } },
    ] as any);

    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(screen.queryByText('Curta Vertical')).not.toBeInTheDocument();
  });

  // Achado da revisão (Important 3): nenhum teste cobria o clique de fato —
  // o caminho principal da funcionalidade.
  it('chama onOpen com seriesId e episodeId ao clicar no card', async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={onOpen} />);

    const card = (await screen.findByText('The Near Ones')).closest('button')!;
    fireEvent.click(card);

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('s1', 'e1'));
  });

  // Achados da revisão (Important 1 e 2): o clique agora depende de uma busca
  // assíncrona (a aba não confia mais no array local de séries) — cobre o
  // estado de carregando enquanto essa busca está pendente.
  it('mostra indicador de carregando no card clicado enquanto onOpen esta pendente', async () => {
    let liberar: () => void = () => {};
    const onOpen = vi.fn(() => new Promise<void>(resolve => { liberar = resolve; }));
    vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={onOpen} />);

    const card = (await screen.findByText('The Near Ones')).closest('button')!;
    fireEvent.click(card);

    await waitFor(() => expect(card.querySelector('[data-testid="continue-loading"]')).toBeInTheDocument());

    await act(async () => { liberar(); });

    await waitFor(() => expect(card.querySelector('[data-testid="continue-loading"]')).not.toBeInTheDocument());
  });

  // Achado da revisão (Important 2): abrir não pode falhar em silêncio —
  // hoje `getSeriesContent`/`getEpisodesBySeries` nunca rejeitam (resolvem
  // com lista vazia), então o handler das abas lança um erro explícito
  // quando o episódio não é encontrado; o carrossel precisa mostrar isso.
  it('mostra mensagem de erro quando onOpen falha, em vez de nao fazer nada', async () => {
    const onOpen = vi.fn().mockRejectedValue(new Error('Episódio não encontrado'));
    vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={onOpen} />);

    const card = (await screen.findByText('The Near Ones')).closest('button')!;
    fireEvent.click(card);

    expect(await screen.findByText('Não foi possível abrir. Toque para tentar de novo.')).toBeInTheDocument();
  });
});
