import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
