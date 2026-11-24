/**
 * Teste de regressao: Admin (Gerenciar Conteudo) — balao do lote que NAO foi
 * gravado aparecia como concluido.
 *
 * DEFEITO (linguagem de negocio): no envio em lote de camadas de idioma, o
 * arquivo virava "concluido" (check verde) assim que a imagem subia no Bunny,
 * antes de o balao ser gravado no painel. Os baloes eram gravados em paralelo
 * com Promise.all; quando a gravacao de um painel falhava (VersionError no
 * servidor, rota 500), o erro nao aparecia em lugar nenhum, a grade nem
 * recarregava, e o Master achava que o capitulo estava completo.
 * Medido em 23/11/2026 (sonda em docs/recorte-frenteA-sonda/: 9 de 10 pedidos
 * com 500 pela rota do admin). Conserto: commit fix(paineis) da branch
 * fix/balao-lote-paralelo (handleBatchUpload em components/Admin/AdminDashboard.tsx).
 *
 * O QUE GARANTE:
 * - so fica "ok" o arquivo cujo balao foi gravado; o que falhou fica em erro,
 *   com mensagem na tela dizendo o painel;
 * - a grade e recarregada do servidor depois do lote, mesmo com falha;
 * - "Tentar novamente" manda cada arquivo para o MESMO painel do primeiro
 *   envio (falhas salteadas nao deslocam o balao para o painel vizinho);
 * - no idioma original, falha ao gravar os paineis tambem aparece como erro.
 *
 * O QUE NAO GARANTE: o servidor (ver tests/backend/balaoLoteParalelo.test.js).
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

// "Servidor" falso: guarda o que foi gravado e devolve no getEpisode, para o
// teste conferir o que a grade mostra depois do lote. Ele nao calcula nada do
// componente: so registra o indice e a URL recebidos.
let servidor: Array<{ image_url: string; translationLayers: Array<{ language: string; imageUrl: string }> }>;
let falharNoPainel: Set<number>;

const respostaBunny = (urls: string[]) => ({
  results: urls.map((url, index) => ({ success: true, url, filename: `b${index + 1}.png`, index })),
  successCount: urls.length, failCount: 0, total: urls.length,
});

async function abrirPaineis() {
  render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_CONTENT} setSubView={noop} />);
  await screen.findByText('The Ha-Qa Stones');
  fireEvent.click(screen.getByTitle('Gerenciar episódios'));
  fireEvent.click(await screen.findByTitle('Gerenciar painéis'));
  await waitFor(() => expect(api.getEpisode).toHaveBeenCalledWith('ep1'));
}

function selecionarArquivos(qtd: number) {
  const input = document.querySelector('input[accept="image/jpeg,image/png,image/webp"]') as HTMLInputElement;
  const files = Array.from({ length: qtd }, (_, i) => new File(['x'], `b${i + 1}.png`, { type: 'image/png' }));
  fireEvent.change(input, { target: { files } });
}

const alvos = () => vi.mocked(api.updatePanelTranslation).mock.calls.map(c => [c[1], c[3]]);

beforeEach(() => {
  vi.clearAllMocks();
  servidor = Array.from({ length: 4 }, (_, i) => ({ image_url: `p${i + 1}`, translationLayers: [] }));
  falharNoPainel = new Set();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [serie] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue(serie.episodes as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getEpisode).mockImplementation(async () => ({ _id: 'ep1', panels: JSON.parse(JSON.stringify(servidor)) }) as any);
  vi.mocked(api.updatePanelTranslation).mockImplementation(async (_ep: string, idx: number, language: string, imageUrl: string) => {
    if (falharNoPainel.has(idx)) throw new Error('Erro ao atualizar camada de tradução.');
    servidor[idx].translationLayers = [...servidor[idx].translationLayers.filter(l => l.language !== language), { language, imageUrl }];
    return { success: true } as any;
  });
});

describe('Admin — balao do lote que nao gravou nao fica como concluido', () => {
  it('2 de 4 baloes falham ao gravar: tela mostra 2 ok, 2 erros e o painel de cada falha', async () => {
    falharNoPainel = new Set([1, 3]);
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      respostaBunny(['https://cdn/es1.png', 'https://cdn/es2.png', 'https://cdn/es3.png', 'https://cdn/es4.png']) as any);

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    selecionarArquivos(4);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 4 imagens/i }));

    expect(await screen.findByText(/2 ok/)).toBeInTheDocument();
    expect(screen.getByText(/2 erros/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Balão ES não gravado no painel #2');
    // A grade foi recarregada do servidor mesmo com falha no lote.
    await waitFor(() => expect(vi.mocked(api.getEpisode).mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('"Tentar novamente" manda cada balao para o painel do primeiro envio (#2 e #4, nao #2 e #3)', async () => {
    falharNoPainel = new Set([1, 3]);
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValueOnce(
      respostaBunny(['https://cdn/es1.png', 'https://cdn/es2.png', 'https://cdn/es3.png', 'https://cdn/es4.png']) as any);

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    selecionarArquivos(4);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 4 imagens/i }));
    await screen.findByText(/2 erros/);

    falharNoPainel = new Set();
    vi.mocked(api.updatePanelTranslation).mockClear();
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValueOnce(
      respostaBunny(['https://cdn/es2-de-novo.png', 'https://cdn/es4-de-novo.png']) as any);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente \(2\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 2 imagens/i }));

    await waitFor(() => expect(api.updatePanelTranslation).toHaveBeenCalledTimes(2));
    expect(alvos()).toEqual([[1, 'https://cdn/es2-de-novo.png'], [3, 'https://cdn/es4-de-novo.png']]);
    expect(await screen.findByText(/4 ok/)).toBeInTheDocument();
    // O balao bom do painel #3 continua o do primeiro envio.
    expect(servidor[2].translationLayers).toEqual([{ language: 'es', imageUrl: 'https://cdn/es3.png' }]);
  });

  it('tudo gravado: 4 ok, nenhum alerta', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      respostaBunny(['https://cdn/en1.png', 'https://cdn/en2.png', 'https://cdn/en3.png', 'https://cdn/en4.png']) as any);

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    selecionarArquivos(4);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 4 imagens/i }));

    expect(await screen.findByText(/4 ok/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(alvos()).toEqual([[0, 'https://cdn/en1.png'], [1, 'https://cdn/en2.png'], [2, 'https://cdn/en3.png'], [3, 'https://cdn/en4.png']]);
  });

  it('idioma original: falha ao gravar os paineis aparece como erro, nao como concluido', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      respostaBunny(['https://cdn/novo1.png', 'https://cdn/novo2.png']) as any);
    vi.mocked(api.addPanels).mockRejectedValue(new Error('Erro ao adicionar painéis.'));

    await abrirPaineis();
    selecionarArquivos(2);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 2 imagens/i }));

    expect(await screen.findByText(/2 erros/)).toBeInTheDocument();
    expect(screen.getByText(/0 ok/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Painel não gravado no capítulo');
  });
});
