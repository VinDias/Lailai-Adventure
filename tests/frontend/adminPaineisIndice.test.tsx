/**
 * Testes de regressao: Admin — indice do painel no envio em lote de camadas
 * de idioma (Hi-Qua), quando parte do lote falha.
 *
 * DEFEITO (linguagem de negocio): o autor seleciona varias imagens de camada
 * de um idioma e manda o lote. Se o Bunny recusa SO ALGUMAS imagens, as que
 * subiram eram gravadas "fechando o buraco": a camada da 2a imagem ia para o
 * painel da 1a, a da 3a para o painel da 2a, e assim por diante. Resultado
 * visivel para o leitor: pagina com a fala errada, e a camada boa de um painel
 * sobrescrita pela do painel seguinte — sem nenhum aviso na tela. O conserto
 * calcula o indice do painel ANTES de descartar os arquivos que falharam
 * (map com panelIndex, depois filter), entao cada camada cai no painel da sua
 * PROPRIA posicao no lote e o painel do arquivo que falhou fica intocado.
 *
 * Medido em 21/10/2026 pela triagem de regressoes (grupo paineis-indice).
 * Commit da correcao: 4ea593f. A metade do AdminDashboard vive hoje em
 * components/Admin/AdminDashboard.tsx, no handleBatchUpload (o `.map(...)` que
 * monta `panelIndex: base + i` vem ANTES do `.filter(item => item.success...)`).
 *
 * O QUE ESTES TESTES GARANTEM:
 * - lote com falha na 1a imagem: a camada da 2a imagem grava no painel dela
 *   (base + 1), nunca no painel da imagem que falhou;
 * - lote com falha no meio: cada URL que subiu grava no painel da posicao do
 *   seu proprio arquivo, deixando o painel do arquivo falho sem camada;
 * - o idioma ORIGINAL continua anexando os painens novos em sequencia no fim
 *   da lista, sem buraco de ordem (guarda contra "consertar" o indice tambem
 *   nesse ramo, onde a posicao no lote nao e endereco de painel);
 * - o arquivo que falhou e o que aparece em erro na fila da tela.
 *
 * O QUE ELES NAO GARANTEM:
 * - nada do backend: o painel alvo e conferido pelos argumentos que o
 *   componente passa a api.updatePanelTranslation; se a rota ignorar o indice
 *   recebido, estes testes continuam passando (ver tests/backend/);
 * - a outra metade do commit 4ea593f (a guarda de BUNNY_CDN_HOSTNAME ausente
 *   em GET /api/bunny/signed-url, em routes/bunnyWebhook.js) — e backend e
 *   fica fora deste arquivo;
 * - nada sobre a ORDEM em que o servidor devolve os resultados do lote. O
 *   componente confia na posicao do array, e hoje isso casa com a rota
 *   (routes/bunnyWebhook.js usa Promise.allSettled sobre req.files.map, que
 *   preserva a ordem e devolve `index` igual a posicao). Os fixtures abaixo
 *   respeitam esse contrato; se a rota passar a devolver fora de ordem, o
 *   defeito seria outro e precisaria de teste proprio.
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

// 4 paineis: os dois primeiros JA tem camada EN (lote anterior do autor), logo
// o lote EN comeca no painel #3 (base = 2). Nenhum tem camada ES (base = 0).
const painel = (url: string, langs: string[] = []) => ({
  image_url: url,
  translationLayers: langs.map(language => ({ language, imageUrl: `${url}-${language}` })),
});
const painelsDoEpisodio = [
  painel('p1', ['en']), painel('p2', ['en']), painel('p3'), painel('p4'),
];

// Resposta do lote no formato da rota real (POST /api/bunny/upload-image-batch):
// um item por arquivo enviado, na mesma ordem, com `index` = posicao.
const resposta = (itens: Array<{ ok: boolean; url?: string }>) => ({
  results: itens.map((item, index) => item.ok
    ? { success: true, url: item.url!, filename: `camada${index + 1}.png`, index }
    : { success: false, error: 'Erro no Bunny Storage.', filename: `camada${index + 1}.png`, index }),
  successCount: itens.filter(i => i.ok).length,
  failCount: itens.filter(i => !i.ok).length,
  total: itens.length,
});

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

// Alvos gravados pelo componente: [indiceDoPainel, idioma, url].
const alvosGravados = () =>
  vi.mocked(api.updatePanelTranslation).mock.calls.map(c => [c[1], c[2], c[3]]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminContent).mockResolvedValue({ series: [serie] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue(serie.episodes as any);
  vi.mocked(api.listChannels).mockResolvedValue([] as any);
  vi.mocked(api.getEpisode).mockResolvedValue({ _id: 'ep1', panels: painelsDoEpisodio } as any);
  vi.mocked(api.updatePanelTranslation).mockResolvedValue({} as any);
});

describe('Camadas de idioma — falha parcial no lote nao desloca o painel', () => {
  it('1a imagem falha: a camada da 2a vai para o painel DELA (#4), nao para o #3', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      resposta([{ ok: false }, { ok: true, url: 'https://cdn/en4.png' }]) as any
    );

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    selecionarArquivos(2);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 2 imagens/i }));

    await waitFor(() => expect(api.updatePanelTranslation).toHaveBeenCalledTimes(1));
    // base = 2 (paineis #1 e #2 ja tem EN) e o arquivo que subiu e o 2o do
    // lote, logo o painel alvo e 2 + 1 = 3 (painel #4 na tela).
    expect(alvosGravados()).toEqual([[3, 'en', 'https://cdn/en4.png']]);
    // O painel do arquivo que falhou (#3, indice 2) nao pode ser tocado.
    expect(alvosGravados().map(a => a[0])).not.toContain(2);
  });

  it('falha no meio do lote: cada camada grava no painel do seu proprio arquivo', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      resposta([
        { ok: true, url: 'https://cdn/es1.png' },
        { ok: false },
        { ok: true, url: 'https://cdn/es3.png' },
        { ok: true, url: 'https://cdn/es4.png' },
      ]) as any
    );

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    selecionarArquivos(4);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 4 imagens/i }));

    await waitFor(() => expect(api.updatePanelTranslation).toHaveBeenCalledTimes(3));
    // base = 0 (nenhum painel tem ES). O 2o arquivo falhou, entao o painel de
    // indice 1 fica SEM camada e os outros guardam a sua propria posicao.
    expect(alvosGravados()).toEqual([
      [0, 'es', 'https://cdn/es1.png'],
      [2, 'es', 'https://cdn/es3.png'],
      [3, 'es', 'https://cdn/es4.png'],
    ]);
  });

  it('o arquivo que falhou e o que aparece em erro na fila da tela', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      resposta([
        { ok: true, url: 'https://cdn/es1.png' },
        { ok: false },
        { ok: true, url: 'https://cdn/es3.png' },
        { ok: true, url: 'https://cdn/es4.png' },
      ]) as any
    );

    await abrirPaineis();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    selecionarArquivos(4);
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 4 imagens/i }));

    // Companheiro do caso acima (nao distingue o bug do indice): prova que a
    // falha parcial realmente atravessou o componente, em vez de o lote ter
    // sido tratado como sucesso total ou como erro total.
    expect(await screen.findByText(/3 ok/)).toBeInTheDocument();
    expect(screen.getByText(/1 erro/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Erro no Bunny Storage.');
  });

  it('idioma original com falha no meio: paineis novos entram em sequencia, sem buraco de ordem', async () => {
    vi.mocked(api.uploadImagesBatchToBunny).mockResolvedValue(
      resposta([
        { ok: true, url: 'https://cdn/novo1.png' },
        { ok: false },
        { ok: true, url: 'https://cdn/novo3.png' },
      ]) as any
    );
    vi.mocked(api.addPanels).mockResolvedValue({ episode: { panels: painelsDoEpisodio } } as any);

    await abrirPaineis();
    selecionarArquivos(3); // idioma 'original' e o padrao: nenhum botao de idioma clicado
    fireEvent.click(await screen.findByRole('button', { name: /Enviar 3 imagens/i }));

    // Aqui a posicao no lote NAO e endereco de painel: o original cria painel
    // novo no fim da lista, entao o capitulo ganha os painens 5 e 6 — nunca
    // 5 e 7, que deixariam um furo na ordem por causa do arquivo falho.
    await waitFor(() => expect(api.addPanels).toHaveBeenCalledWith('ep1', [
      { image_url: 'https://cdn/novo1.png', order: 5 },
      { image_url: 'https://cdn/novo3.png', order: 6 },
    ]));
    expect(api.updatePanelTranslation).not.toHaveBeenCalled();
  });
});
