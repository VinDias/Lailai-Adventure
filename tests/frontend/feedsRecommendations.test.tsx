/**
 * Testes de feed — HQCine, VFilm e HiQua consomem api.getRecommendations
 * (Fase 4 Bloco 4, Task 7).
 *
 * Cobre: a grade renderiza NA ORDEM devolvida pela recomendação (não
 * re-ordena no cliente); erro OU array vazio de getRecommendations cai no
 * fallback api.getSeries() com o filtro por content_type de hoje (spec,
 * "Feeds": recomendação NUNCA derruba o feed). Carrossel "Continuar" e o
 * resto ficam intactos — não são o alvo destes testes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../config/api', () => ({ default: 'http://localhost:3000' }));
vi.mock('../../components/Ads', () => ({ default: () => null }));
vi.mock('../../services/api', () => ({
  api: {
    getSeries: vi.fn(),
    getRecommendations: vi.fn(),
    getSeriesContent: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getContinueList: vi.fn().mockResolvedValue([]),
    getRandomAd: vi.fn().mockResolvedValue(null),
    getFavorites: vi.fn().mockResolvedValue([]),
    addFavorite: vi.fn().mockResolvedValue({ favorited: true }),
    removeFavorite: vi.fn().mockResolvedValue({ favorited: false }),
    getSeriesVote: vi.fn().mockResolvedValue({ myVote: null, likes: 0 }),
    voteSeries: vi.fn().mockResolvedValue({ success: true, type: 'like' }),
    removeSeriesVote: vi.fn().mockResolvedValue({ success: true }),
    getPublicSettings: vi.fn().mockResolvedValue({}),
    getSuperReaderMin: vi.fn().mockResolvedValue({ minCents: 500 }),
    createSuperReaderSession: vi.fn(),
    // Fase 5 Bloco 3: o SinalizarButton vive no MESMO modal de detalhe dos 3
    // feeds. Hoje todos os renders daqui usam user={null} (o botão nem
    // consulta), mas o primeiro caso logado que alguém acrescentar derrubaria
    // o render inteiro com um TypeError síncrono que o `.catch` do efeito não
    // intercepta — o mock é a rede de segurança.
    getMinhaSinalizacao: vi.fn().mockResolvedValue({ jaSinalizada: false, motivo: null }),
    sinalizarSerie: vi.fn().mockResolvedValue({ jaSinalizada: false }),
  },
}));

import { api } from '../../services/api';
import HQCine from '../../components/HQCine';
import VFilm from '../../components/VFilm';
import HiQua from '../../components/HiQua';

beforeEach(() => vi.clearAllMocks());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeSeries = (overrides: any = {}) => ({
  _id: 'series-1', title: 'Série Teste', genre: 'Ação', description: 'Desc',
  cover_image: '', content_type: 'hqcine', isPremium: false, isPublished: true, ...overrides,
});

// Ordem "fora do alfabeto e fora de order_index" — se o componente resolver
// reordenar (alfabético ou por order_index), o teste de ordem pega.
const ordemRecomendada = (tipo: string) => [
  makeSeries({ _id: 'r-zeta', title: 'Zeta', content_type: tipo, order_index: 3 }),
  makeSeries({ _id: 'r-alpha', title: 'Alpha', content_type: tipo, order_index: 1 }),
  makeSeries({ _id: 'r-mike', title: 'Mike', content_type: tipo, order_index: 2 }),
];

// Lista "manual" devolvida pelo fallback getSeries — inclui série de outro
// tipo de propósito, pro filtro local (comportamento de hoje) continuar valendo.
const listaManual = (tipo: string) => [
  makeSeries({ _id: 'm-1', title: 'Manual Um', content_type: tipo }),
  makeSeries({ _id: 'm-2', title: 'Manual Dois', content_type: tipo }),
  makeSeries({ _id: 'm-outro-tipo', title: 'De Outro Tipo', content_type: 'outro' }),
];

// Lê os títulos <h3> da grade principal, na ordem em que aparecem no DOM —
// não usa screen.getAllByText (não garante ordem visual/estrutural).
const titulosDaGrade = (container: HTMLElement) => {
  const grade = container.querySelector('.grid.grid-cols-2');
  if (!grade) return [];
  return Array.from(grade.querySelectorAll('h3')).map(el => el.textContent);
};

// ═══════════════════════════════════════════════════════════════════════════════
// HQCINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('HQCine — feed consome getRecommendations', () => {
  it('renderiza a grade na ordem devolvida pela recomendação (nao reordena)', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(ordemRecomendada('hqcine') as any);
    const { container } = render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Zeta', 'Alpha', 'Mike']));
    expect(api.getRecommendations).toHaveBeenCalledWith('hqcine');
    expect(api.getSeries).not.toHaveBeenCalled();
  });

  it('getRecommendations rejeita: cai no fallback getSeries e renderiza sem crash', async () => {
    vi.mocked(api.getRecommendations).mockRejectedValue(new Error('falhou'));
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('hqcine') as any);
    const { container } = render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
    expect(screen.getByText('CINECOMICS')).toBeInTheDocument();
  });

  it('getRecommendations devolve array vazio: cai no fallback getSeries', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue([]);
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('hqcine') as any);
    const { container } = render(<HQCine user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VFILM
// ═══════════════════════════════════════════════════════════════════════════════

describe('VFilm — feed consome getRecommendations', () => {
  it('renderiza a grade na ordem devolvida pela recomendação (nao reordena)', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(ordemRecomendada('vcine') as any);
    const { container } = render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Zeta', 'Alpha', 'Mike']));
    expect(api.getRecommendations).toHaveBeenCalledWith('vcine');
    expect(api.getSeries).not.toHaveBeenCalled();
  });

  it('getRecommendations rejeita: cai no fallback getSeries e renderiza sem crash', async () => {
    vi.mocked(api.getRecommendations).mockRejectedValue(new Error('falhou'));
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('vcine') as any);
    const { container } = render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
  });

  it('getRecommendations devolve array vazio: cai no fallback getSeries', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue([]);
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('vcine') as any);
    const { container } = render(<VFilm user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HI-QUA
// ═══════════════════════════════════════════════════════════════════════════════

describe('HiQua — feed consome getRecommendations', () => {
  it('renderiza a grade na ordem devolvida pela recomendação (nao reordena)', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(ordemRecomendada('hiqua') as any);
    const { container } = render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Zeta', 'Alpha', 'Mike']));
    expect(api.getRecommendations).toHaveBeenCalledWith('hiqua');
    expect(api.getSeries).not.toHaveBeenCalled();
  });

  it('getRecommendations rejeita: cai no fallback getSeries e renderiza sem crash', async () => {
    vi.mocked(api.getRecommendations).mockRejectedValue(new Error('falhou'));
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('hiqua') as any);
    const { container } = render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
  });

  it('getRecommendations devolve array vazio: cai no fallback getSeries', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue([]);
    vi.mocked(api.getSeries).mockResolvedValue(listaManual('hiqua') as any);
    const { container } = render(<HiQua user={null} onOpen={vi.fn()} />);
    await waitFor(() => expect(titulosDaGrade(container)).toEqual(['Manual Um', 'Manual Dois']));
  });
});
