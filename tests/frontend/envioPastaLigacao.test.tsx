/**
 * Frente A, item 2: a MESMA tela de envio da pasta abre no Meu Estúdio (autor,
 * episódio em rascunho) e no Gerenciar Conteúdo (admin). Depois do envio, a
 * lista de painéis de cada tela mostra o episódio novo.
 * O comportamento da tela em si: tests/frontend/envioPastaEpisodio.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { arquivoDeImagem } from './helpers/arquivosDeImagem';

vi.mock('../../services/api', () => ({
  api: {
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getAdminContent: vi.fn(),
    listChannels: vi.fn(),
    getEpisode: vi.fn(),
    getAdminAprovacoes: vi.fn().mockResolvedValue({ itens: [], naoClassificadas: 0 }),
    getEnvioEpisodioConfig: vi.fn(),
    iniciarEnvioEpisodio: vi.fn(),
    enviarParteEpisodio: vi.fn(),
    concluirEnvioEpisodio: vi.fn(),
    cancelarEnvioEpisodio: vi.fn(),
  },
}));

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const MB = 1024 * 1024;
const novoEpisodio = {
  _id: 'ep-1', title: 'Cap 1', status: 'draft', submittedAt: null,
  panels: [{ image_url: 'https://cdn/novo-1.jpg', translationLayers: [] }, { image_url: 'https://cdn/novo-2.jpg', translationLayers: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getEnvioEpisodioConfig).mockResolvedValue({ limitePaineis: 100, limiteBytes: 20 * MB, alturaMaxima: 1280, tamanhoMaximoParte: 8 * MB, arquivosPorParte: 60 });
  vi.mocked(api.iniciarEnvioEpisodio).mockResolvedValue({
    envioId: 'env1', totalPaineis: 2, totalPaginas: 2, totalBytes: 4000, limiteBytes: 20 * MB, limitePaineis: 100,
    arquivos: [
      { chave: '0', indice: 0, tipo: 'pagina', y: 0, altura: 1280, largura: 800 },
      { chave: '1', indice: 1, tipo: 'pagina', y: 0, altura: 1280, largura: 800 },
    ],
  } as any);
  vi.mocked(api.enviarParteEpisodio).mockResolvedValue({ recebidos: 2, total: 2 });
  vi.mocked(api.concluirEnvioEpisodio).mockResolvedValue({ episode: novoEpisodio, totalPaineis: 2, apagadosDoBunny: 0, naoApagados: [] } as any);
});

async function enviarDuasPaginas() {
  const input = await screen.findByTestId('envio-input-pasta');
  expect(input).toHaveAttribute('webkitdirectory');
  fireEvent.change(input, { target: { files: [arquivoDeImagem('Cap 1/Pagina 001.jpg', 800, 1280), arquivoDeImagem('Cap 1/Pagina 002.jpg', 800, 1280)] } });
  fireEvent.click(await screen.findByTestId('envio-confirmo'));
  fireEvent.click(screen.getByTestId('envio-enviar'));
  expect(await screen.findByRole('status')).toHaveTextContent('Episódio enviado: 2 painéis.');
}

describe('a mesma tela nas duas portas', () => {
  it('Meu Estúdio: "Enviar pasta do episódio" no rascunho abre a tela e o envio usa o episódio certo', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
    vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [{ _id: 's1', title: 'Obra Rascunho', description: '', cover_image: '', isPublished: false, submittedAt: null, channelId: 'c1' }] } as any);
    vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([{ _id: 'ep-1', title: 'Cap 1', status: 'draft', submittedAt: null, panels: [] }] as any);

    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Obras'));
    fireEvent.click(await screen.findByText('Obra Rascunho'));
    expect(screen.queryByText('Enviar capítulo')).toBeNull();
    fireEvent.click(await screen.findByText('Enviar pasta do episódio'));
    await enviarDuasPaginas();
    expect(api.iniciarEnvioEpisodio).toHaveBeenCalledWith('ep-1', expect.any(Array));

    // Antes do envio o capítulo não tinha painel, então não havia "Enviar capítulo".
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByText('Enviar capítulo')).toBeInTheDocument();
  });

  it('Gerenciar Conteúdo (admin): o botão abre a mesma tela e a grade mostra os painéis novos', async () => {
    const serie = { _id: 's1', title: 'The Ha-Qa Stones', content_type: 'hiqua', isPublished: true, genre: 'Aventura', content_rating: 'teen', tags: [], episodes: [{ _id: 'ep-1', title: 'Cap 1', episode_number: 1, status: 'published' }] };
    vi.mocked(api.getAdminContent).mockResolvedValue({ series: [serie] } as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue(serie.episodes as any);
    vi.mocked(api.listChannels).mockResolvedValue([] as any);
    vi.mocked(api.getEpisode).mockResolvedValue({ _id: 'ep-1', panels: [] } as any);

    render(<AdminDashboard onLogout={() => {}} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={() => {}} />);
    await screen.findByText('The Ha-Qa Stones');
    fireEvent.click(screen.getByTitle('Gerenciar episódios'));
    fireEvent.click(await screen.findByTitle('Gerenciar painéis'));
    await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pasta do episódio' }));
    await enviarDuasPaginas();
    expect(api.iniciarEnvioEpisodio).toHaveBeenCalledWith('ep-1', expect.any(Array));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(document.querySelectorAll('img[src="https://cdn/novo-2.jpg"]').length).toBeGreaterThan(0));
  });
});
