/**
 * Teste de regressao: Meu Estudio — balao do lote que NAO foi gravado sumia
 * da fila e o autor perdia o trabalho sem saber qual.
 *
 * DEFEITO (linguagem de negocio): o autor manda os dialogos de um idioma em
 * lote. O Meu Estudio gravava os baloes em paralelo com Promise.all; o
 * servidor so aceitava o primeiro (VersionError nos outros, rota 500). O
 * Promise.all rejeitava inteiro: a tela mostrava so a mensagem do erro, nao
 * marcava os que deram certo e mantinha TODOS os arquivos na fila; o reenvio
 * recalculava o painel de inicio a partir de uma lista desatualizada.
 * Medido em 23/11/2026 (sonda em docs/recorte-frenteA-sonda/). Conserto: commit
 * fix(paineis) da branch fix/balao-lote-paralelo (handleAddPanels em
 * components/PortalEstudio.tsx).
 *
 * O QUE GARANTE:
 * - os baloes gravados saem da fila; so os que falharam ficam, com a contagem
 *   certa e o numero do painel de cada falha na mensagem;
 * - o reenvio manda cada arquivo para o MESMO painel do primeiro envio.
 *
 * O QUE NAO GARANTE: o servidor (ver tests/backend/balaoLoteParalelo.test.js).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    uploadPortalImagesBatch: vi.fn(),
    addPortalPainelTraducao: vi.fn(),
    addPortalPaineis: vi.fn(),
  },
}));

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';

const serieDraft = { _id: 's-draft', title: 'Obra Rascunho', description: 'Desc', cover_image: '', isPublished: false, submittedAt: null, content_rating_sugerida: null, channelId: 'c1' };
const ep = {
  _id: 'ep-1', title: 'Cap 1', episode_number: 1, status: 'draft', submittedAt: null,
  panels: Array.from({ length: 4 }, (_, i) => ({ image_url: `https://cdn/p${i + 1}.jpg`, translationLayers: [] as any[] })),
};

let falharNoPainel: Set<number>;

const bunny = (urls: string[]) => ({
  results: urls.map((url, index) => ({ success: true, filename: `b${index}.png`, index, url })),
  successCount: urls.length, failCount: 0, total: urls.length,
});

async function abrirDialogosEN() {
  render(<PortalEstudio onClose={vi.fn()} />);
  fireEvent.click(await screen.findByText('Obras'));
  await waitFor(() => screen.getByText('Obra Rascunho'));
  fireEvent.click(screen.getByText('Obra Rascunho'));
  await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s-draft'));
  fireEvent.click(screen.getByText('Gerenciar painéis'));
  fireEvent.click(screen.getByRole('button', { name: 'EN' }));
}

const enviar = (files: File[]) => {
  fireEvent.change(screen.getByTestId('portal-panels-input'), { target: { files } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar diálogos' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  falharNoPainel = new Set();
  vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
  vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
  vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
  vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue([JSON.parse(JSON.stringify(ep))] as any);
  vi.mocked(api.addPortalPainelTraducao).mockImplementation(async (_id: string, indice: number, language: string, imageUrl: string) => {
    if (falharNoPainel.has(indice)) throw new Error('Erro ao gravar a camada de idioma.');
    return { success: true, panel: { image_url: `https://cdn/p${indice + 1}.jpg`, translationLayers: [{ language, imageUrl }] } } as any;
  });
});

describe('Meu Estudio — balao do lote que nao gravou', () => {
  it('2 de 4 falham: so os 2 ficam na fila e a mensagem diz 2/4 e os paineis #2 e #4', async () => {
    falharNoPainel = new Set([1, 3]);
    vi.mocked(api.uploadPortalImagesBatch).mockResolvedValue(
      bunny(['https://cdn/en1.png', 'https://cdn/en2.png', 'https://cdn/en3.png', 'https://cdn/en4.png']) as any);

    await abrirDialogosEN();
    enviar(Array.from({ length: 4 }, (_, i) => new File(['x'], `en${i + 1}.png`, { type: 'image/png' })));

    expect(await screen.findByText(/2\/4 .*\(#2, #4\)/)).toBeInTheDocument();
    expect(screen.getByText(/^2 /)).toBeInTheDocument(); // contador da fila: "2 imagem(ns)"
  });

  it('o reenvio manda cada arquivo para o painel do primeiro envio (#2 e #4, nao #2 e #3)', async () => {
    falharNoPainel = new Set([1, 3]);
    vi.mocked(api.uploadPortalImagesBatch).mockResolvedValueOnce(
      bunny(['https://cdn/en1.png', 'https://cdn/en2.png', 'https://cdn/en3.png', 'https://cdn/en4.png']) as any);

    await abrirDialogosEN();
    const files = Array.from({ length: 4 }, (_, i) => new File(['x'], `en${i + 1}.png`, { type: 'image/png' }));
    enviar(files);
    await screen.findByText(/2\/4/);

    falharNoPainel = new Set();
    vi.mocked(api.addPortalPainelTraducao).mockClear();
    vi.mocked(api.uploadPortalImagesBatch).mockResolvedValueOnce(
      bunny(['https://cdn/en2-de-novo.png', 'https://cdn/en4-de-novo.png']) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar diálogos' }));

    await waitFor(() => expect(api.addPortalPainelTraducao).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.uploadPortalImagesBatch).mock.calls[1][0]).toEqual([files[1], files[3]]);
    expect(vi.mocked(api.addPortalPainelTraducao).mock.calls).toEqual([
      ['ep-1', 1, 'en', 'https://cdn/en2-de-novo.png'],
      ['ep-1', 3, 'en', 'https://cdn/en4-de-novo.png'],
    ]);
    await waitFor(() => expect(screen.queryByText(/2\/4/)).not.toBeInTheDocument());
  });
});
