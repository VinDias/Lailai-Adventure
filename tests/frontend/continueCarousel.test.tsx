import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ContinueCarousel from '../../components/ContinueCarousel';
import { api } from '../../services/api';

const item = {
  seriesId: 's1',
  episodeId: 'e1',
  contentType: 'hiqua',
  percent: 0.62,
  episode: { episode_number: 2 },
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
    expect(screen.getByText('Cap. 2 · 62%')).toBeInTheDocument();
  });

  // Achado do bloco de conformidade: o spec pede "nome do capítulo" no
  // rótulo — decidido como número (episode_number) por causa de títulos
  // inconsistentes cadastrados pelo cliente (ex.: "The Nears Ones  EP2").
  it('webtoon (hiqua) mostra "Cap. N · P%"', async () => {
    const itemWebtoon = { ...item, contentType: 'hiqua', episode: { episode_number: 2 }, percent: 0.62 };
    vi.spyOn(api, 'getContinueList').mockResolvedValue([itemWebtoon] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('Cap. 2 · 62%')).toBeInTheDocument();
  });

  it('video (hqcine/vcine) mostra "Ep. N · P%"', async () => {
    const itemVideo = {
      ...item,
      seriesId: 's2',
      episodeId: 'e2',
      contentType: 'hqcine',
      episode: { episode_number: 2 },
      percent: 0.62,
    };
    vi.spyOn(api, 'getContinueList').mockResolvedValue([itemVideo] as any);
    render(<ContinueCarousel contentType="hqcine" onOpen={() => {}} />);
    expect(await screen.findByText('Ep. 2 · 62%')).toBeInTheDocument();
  });

  // Dado órfão (episódio apagado no backend depois do progresso salvo): o
  // carrossel não pode quebrar — só omite o capítulo do rótulo.
  it('sem episode (dado orfao) mostra so o percentual, sem quebrar a renderizacao', async () => {
    const itemSemEpisodio = { ...item, episode: null };
    vi.spyOn(api, 'getContinueList').mockResolvedValue([itemSemEpisodio] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.queryByText(/Cap\./)).not.toBeInTheDocument();
  });

  it('busca a lista ja filtrada pelo tipo da aba (contentType vai na propria chamada)', async () => {
    // O backend agora filtra por contentType — o cliente não filtra mais
    // localmente (regressão: baixava tudo e descartava dois terços). O mock
    // simula exatamente isso: só devolve o item da aba pedida.
    const getContinueList = vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);

    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(getContinueList).toHaveBeenCalledWith('hiqua');
  });

  // Achado da revisão final (Important 5): as abas do catálogo (HQCine/HiQua/
  // VFilm) reaproveitam essa mesma lista para pintar a barra de progresso nos
  // cards — sem essa prop `items`, cada aba faria uma segunda busca idêntica.
  it('usa a lista recebida do pai (items) sem buscar de novo', async () => {
    const getContinueList = vi.spyOn(api, 'getContinueList');
    render(<ContinueCarousel contentType="hiqua" items={[item]} onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(getContinueList).not.toHaveBeenCalled();
  });

  it('nao renderiza nada quando o pai passa items vazio', () => {
    const { container } = render(<ContinueCarousel contentType="hiqua" items={[]} onOpen={() => {}} />);
    expect(container.firstChild).toBeNull();
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
