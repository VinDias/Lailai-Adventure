/**
 * Meu Estúdio: o autor exclui capítulo e obra (retorno do cliente em
 * 27/11/2026: "Deveria ter uma tecla excluir. Porque muitas vezes o autor
 * desiste e quer excluir a série ou algum capítulo").
 *
 * O QUE GARANTE
 * - toda obra e todo capítulo têm o botão de excluir, em qualquer estado
 *   (rascunho, em análise, publicado);
 * - nada é excluído no primeiro clique: abre a confirmação com o título;
 *   "Não excluir" fecha sem chamar o servidor;
 * - rascunho e em análise: confirmar chama o servidor SEM título digitado;
 * - PUBLICADO: o botão de confirmar fica travado até o autor digitar o título
 *   (maiúsculas e espaços a mais não atrapalham); o título vai ao servidor;
 * - depois de excluir, a lista é recarregada e a confirmação sai em verde;
 * - recusa do servidor aparece dentro do modal, que continua aberto.
 *
 * NÃO GARANTE: a regra em si (dono, arquivos, fila), que é do servidor e está
 * em tests/backend/exclusaoAutor.test.js.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getPortalRevisoes: vi.fn(),
    getEstadoVideoEpisodio: vi.fn(),
    excluirPortalEpisodio: vi.fn(),
    excluirPortalSerie: vi.fn(),
  },
}));

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';

const obraNoAr = { _id: 's1', title: 'Em Breve / Coming Soon', description: '', cover_image: '', content_type: 'vcine', isPublished: true, submittedAt: null, channelId: 'c1' };
const obraRascunho = { _id: 's2', title: 'Obra Desistida', description: '', cover_image: '', content_type: 'hiqua', isPublished: false, submittedAt: null, channelId: 'c1' };
const obraNaFila = { _id: 's3', title: 'Obra Enviada', description: '', cover_image: '', content_type: 'hiqua', isPublished: false, submittedAt: '2026-11-27T18:00:00.000Z', channelId: 'c1' };

const epRascunho = { _id: 'e1', title: 'TimeLineTeste', episode_number: 1, status: 'draft', submittedAt: null, panels: [], bunnyVideoId: 'v1', videoEnvio: { videoId: 'v1', estado: 'pronto' } };
const epNaFila = { _id: 'e2', title: 'Cap na fila', episode_number: 2, status: 'draft', submittedAt: '2026-11-27T18:30:00.000Z', panels: [] };
const epNoAr = { _id: 'e3', title: 'Cap No Ar', episode_number: 3, status: 'published', submittedAt: null, panels: [] };

async function abrirObras() {
  render(<PortalEstudio onClose={vi.fn()} />);
  fireEvent.click(await screen.findByText('Obras'));
  await screen.findByText('Obra Desistida');
}
async function abrirCapitulos() {
  await abrirObras();
  fireEvent.click(screen.getByText('Em Breve / Coming Soon'));
  await screen.findByText('TimeLineTeste');
}
const modal = () => screen.getByTestId('portal-exclusao');
const confirmar = () => within(modal()).getByTestId('portal-exclusao-confirmar');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 3, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
  vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
  vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [obraNoAr, obraRascunho, obraNaFila] } as any);
  vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epRascunho, epNaFila, epNoAr] as any);
  vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [] });
  vi.mocked(api.excluirPortalEpisodio).mockResolvedValue({ excluido: true, estado: 'rascunho', arquivosApagados: 0, naoApagados: [], videosApagados: 1, videosNaoApagados: [] });
  vi.mocked(api.excluirPortalSerie).mockResolvedValue({ excluido: true, estado: 'rascunho', episodios: 0, arquivosApagados: 0, naoApagados: [], videosApagados: 0, videosNaoApagados: [] });
});

describe('Meu Estúdio: a tecla excluir existe em toda obra e todo capítulo', () => {
  it('obra em rascunho, em análise e publicada: as três têm "Excluir obra"', async () => {
    await abrirObras();
    for (const id of ['s1', 's2', 's3']) {
      expect(within(screen.getByTestId(`portal-obra-card-${id}`)).getByRole('button', { name: 'Excluir obra' })).toBeInTheDocument();
    }
  });

  it('capítulo em rascunho, em análise e publicado: os três têm "Excluir capítulo"', async () => {
    await abrirCapitulos();
    for (const id of ['e1', 'e2', 'e3']) {
      expect(screen.getByTestId(`portal-excluir-ep-${id}`)).toHaveTextContent('Excluir capítulo');
    }
  });
});

describe('excluir capítulo', () => {
  it('rascunho: o clique só abre a confirmação; "Não excluir" fecha sem chamar o servidor', async () => {
    await abrirCapitulos();
    fireEvent.click(screen.getByTestId('portal-excluir-ep-e1'));
    expect(within(modal()).getByTestId('portal-exclusao-nome')).toHaveTextContent('TimeLineTeste');
    expect(within(modal()).getByText(/Não dá para desfazer/)).toBeInTheDocument();
    expect(api.excluirPortalEpisodio).not.toHaveBeenCalled();

    fireEvent.click(within(modal()).getByRole('button', { name: 'Não excluir' }));
    expect(screen.queryByTestId('portal-exclusao')).not.toBeInTheDocument();
    expect(api.excluirPortalEpisodio).not.toHaveBeenCalled();
  });

  it('rascunho: confirmar exclui sem pedir título, recarrega os capítulos e avisa em verde', async () => {
    await abrirCapitulos();
    fireEvent.click(screen.getByTestId('portal-excluir-ep-e1'));
    expect(within(modal()).queryByTestId('portal-exclusao-input')).not.toBeInTheDocument();
    expect(confirmar()).toBeEnabled();
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epNaFila, epNoAr] as any);
    fireEvent.click(confirmar());

    await waitFor(() => expect(api.excluirPortalEpisodio).toHaveBeenCalledWith('e1', undefined));
    await waitFor(() => expect(screen.queryByText('TimeLineTeste')).not.toBeInTheDocument());
    expect(screen.queryByTestId('portal-exclusao')).not.toBeInTheDocument();
    const aviso = await screen.findByTestId('portal-envio-aviso');
    expect(aviso).toHaveTextContent('Capítulo excluído.');
    expect(aviso.className).not.toMatch(/rose|red/);
  });

  it('em análise (na fila): também exclui direto, sem título', async () => {
    await abrirCapitulos();
    fireEvent.click(screen.getByTestId('portal-excluir-ep-e2'));
    expect(within(modal()).queryByTestId('portal-exclusao-publicado')).not.toBeInTheDocument();
    fireEvent.click(confirmar());
    await waitFor(() => expect(api.excluirPortalEpisodio).toHaveBeenCalledWith('e2', undefined));
  });

  it('PUBLICADO: avisa que está no ar e só libera depois de digitar o título; o título vai ao servidor', async () => {
    await abrirCapitulos();
    fireEvent.click(screen.getByTestId('portal-excluir-ep-e3'));
    expect(within(modal()).getByTestId('portal-exclusao-publicado')).toHaveTextContent(/some do catálogo/);
    const campo = within(modal()).getByTestId('portal-exclusao-input');
    expect(confirmar()).toBeDisabled();

    fireEvent.change(campo, { target: { value: 'Cap No' } });
    expect(confirmar()).toBeDisabled();
    // Enter no campo com o título errado não exclui.
    fireEvent.submit(campo.closest('form')!);
    expect(api.excluirPortalEpisodio).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: '  cap no ar ' } });
    expect(confirmar()).toBeEnabled();
    fireEvent.click(confirmar());
    await waitFor(() => expect(api.excluirPortalEpisodio).toHaveBeenCalledWith('e3', '  cap no ar '));
  });

  it('recusa do servidor: a mensagem aparece no modal, que continua aberto, e nada some da lista', async () => {
    vi.mocked(api.excluirPortalEpisodio).mockRejectedValue(new Error('Episódio não encontrado.'));
    await abrirCapitulos();
    fireEvent.click(screen.getByTestId('portal-excluir-ep-e1'));
    fireEvent.click(confirmar());
    expect(await within(modal()).findByRole('alert')).toHaveTextContent('Episódio não encontrado.');
    expect(screen.getAllByText('TimeLineTeste').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('portal-envio-aviso')).not.toBeInTheDocument();
  });
});

describe('excluir obra', () => {
  it('rascunho: confirma sem título, recarrega as obras e avisa em verde', async () => {
    await abrirObras();
    fireEvent.click(within(screen.getByTestId('portal-obra-card-s2')).getByRole('button', { name: 'Excluir obra' }));
    expect(within(modal()).getByTestId('portal-exclusao-nome')).toHaveTextContent('Obra Desistida');
    expect(within(modal()).getByText(/todos os capítulos/)).toBeInTheDocument();
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [obraNoAr, obraNaFila] } as any);
    fireEvent.click(confirmar());

    await waitFor(() => expect(api.excluirPortalSerie).toHaveBeenCalledWith('s2', undefined));
    await waitFor(() => expect(screen.queryByText('Obra Desistida')).not.toBeInTheDocument());
    expect(await screen.findByTestId('portal-envio-aviso')).toHaveTextContent('Obra excluída.');
  });

  it('em análise: exclui direto', async () => {
    await abrirObras();
    fireEvent.click(within(screen.getByTestId('portal-obra-card-s3')).getByRole('button', { name: 'Excluir obra' }));
    fireEvent.click(confirmar());
    await waitFor(() => expect(api.excluirPortalSerie).toHaveBeenCalledWith('s3', undefined));
  });

  it('PUBLICADA: travado até digitar o título da obra; excluída com os capítulos abertos, a lista de capítulos fecha', async () => {
    await abrirCapitulos();
    fireEvent.click(within(screen.getByTestId('portal-obra-card-s1')).getByRole('button', { name: 'Excluir obra' }));
    expect(confirmar()).toBeDisabled();
    fireEvent.change(within(modal()).getByTestId('portal-exclusao-input'), { target: { value: 'Obra Desistida' } });
    expect(confirmar()).toBeDisabled();
    fireEvent.change(within(modal()).getByTestId('portal-exclusao-input'), { target: { value: 'Em Breve / Coming Soon' } });
    expect(confirmar()).toBeEnabled();
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [obraRascunho, obraNaFila] } as any);
    fireEvent.click(confirmar());

    await waitFor(() => expect(api.excluirPortalSerie).toHaveBeenCalledWith('s1', 'Em Breve / Coming Soon'));
    await waitFor(() => expect(screen.queryByText('Em Breve / Coming Soon')).not.toBeInTheDocument());
    expect(screen.queryByText('TimeLineTeste')).not.toBeInTheDocument();
  });
});
