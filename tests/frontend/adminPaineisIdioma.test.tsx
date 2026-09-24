/**
 * Testes: Admin — camadas de idioma dos painéis (Hi-Qua).
 *
 * Bug do cliente (17/09/2026): subir as camadas em partes sobrescrevia as
 * anteriores. O índice do painel era a posição do arquivo DENTRO do lote
 * (`panelIndex: i`), então todo lote voltava ao painel #1. Agora o lote
 * começa no primeiro painel que ainda não tem camada naquele idioma.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminContent: vi.fn(),
    listChannels: vi.fn(),
    getEpisode: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    uploadImagesBatchToBunny: vi.fn(),
    updatePanelTranslation: vi.fn(),
    addPanels: vi.fn(),
    getAdminAprovacoes: vi.fn().mockResolvedValue({ itens: [], naoClassificadas: 0 }),
  },
}));

import { api } from '../../services/api';
import AdminDashboard from '../../components/Admin/AdminDashboard';
import { ViewMode } from '../../types';

const noop = () => {};

const serie = {
  _id: 's1', title: 'The Ha-Qa Stones', content_type: 'hiqua', isPublished: true,
  genre: 'Aventura', content_rating: 'teen', tags: [],
  episodes: [{ _id: 'ep1', title: 'T1 EP2', episode_number: 2, status: 'published' }],
};

// 4 painéis: os dois primeiros JÁ têm camada EN (lote anterior do autor).
const painel = (url: string, langs: string[] = []) => ({
  image_url: url,
  translationLayers: langs.map(language => ({ language, imageUrl: `${url}-${language}` })),
});
const painelsDoEpisodio = [
  painel('p1', ['en']), painel('p2', ['en']), painel('p3'), painel('p4'),
];

async function abrirPaineis() {
  render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
  await waitFor(() => expect(api.getAdminContent).toHaveBeenCalled());
  await screen.findByText('The Ha-Qa Stones');
  fireEvent.click(screen.getByTitle('Gerenciar episódios'));
  await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s1'));
  fireEvent.click(await screen.findByTitle('Gerenciar painéis'));
  await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep1'));
}

function selecionarArquivos(qtd: number) {
  const input = document.querySelector('input[accept="image/jpeg,image/png,image/webp"]') as HTMLInputElement;
  const files = Array.from({ length: qtd }, (_, i) => new File(['x'], `camada${i + 1}.png`, { type: 'image/png' }));
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [serie] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue(serie.episodes as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getEpisode).mockResolvedValue({ _id: 'ep1', panels: painelsDoEpisodio } as any);
  vi.mocked(api.updatePanelTranslation).mockResolvedValue({} as any);
});

describe('Camadas de idioma — índice do painel', () => {
  it('o lote continua do primeiro painel SEM a camada, em vez de voltar ao #1', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue({
      results: [
        { success: true, url: 'https://cdn/en3.png', filename: 'camada1.png', index: 0 },
        { success: true, url: 'https://cdn/en4.png', filename: 'camada2.png', index: 1 },
      ],
    } as any);

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    selecionarArquivos(2);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 2 imagens/i }));

    await waitFor(() => expect(api.updatePanelTranslation).toHaveBeenCalledTimes(2));
    const alvos = vi.mocked(api.updatePanelTranslation).mock.calls.map(c => [c[1], c[2], c[3]]);
    expect(alvos).toEqual([
      [2, 'en', 'https://cdn/en3.png'],
      [3, 'en', 'https://cdn/en4.png'],
    ]);
  });

  it('a tela diz de qual painel o lote começa', async () => {
    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(await screen.findByText(/a partir do painel #3/i)).toBeInTheDocument();
  });

  it('mais imagens do que painéis disponíveis: avisa e NÃO sobe nada', async () => {
    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    selecionarArquivos(3);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 3 imagens/i }));

    expect(api.uploadImagesBatchToBunny).not.toHaveBeenCalled();
    expect(await screen.findByText(/Cabem 2 camada/i)).toBeInTheDocument();
  });

  it('falha no lote deixa botão de tentar de novo (antes só recarregando a página)', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockRejectedValue(new Error('Erro ao fazer upload em lote: 401'));

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    selecionarArquivos(1);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 1 imagem/i }));

    expect(await screen.findByRole('button', { name: /Tentar novamente \(1\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente \(1\)/i }));
    expect(await screen.findByRole('button', { name: /Enviar 1 imagem/i })).toBeInTheDocument();
  });

  it('idioma original continua criando painéis no fim da lista', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue({
      results: [{ success: true, url: 'https://cdn/p5.png', filename: 'camada1.png', index: 0 }],
    } as any);
    vi.mocked(api.addPanels).mockResolvedValue({ episode: { panels: [...painelsDoEpisodio, painel('p5')] } } as any);

    await abrirPaineis();
    selecionarArquivos(1);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 1 imagem/i }));

    await waitFor(() => expect(api.addPanels).toHaveBeenCalledWith('ep1', [{ image_url: 'https://cdn/p5.png', order: 5 }]));
    expect(api.updatePanelTranslation).not.toHaveBeenCalled();
  });
});
