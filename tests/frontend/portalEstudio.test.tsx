/**
 * Testes — PortalEstudio (Fase 5 Bloco 1, Task 9): tela "Meu Estúdio" com
 * abas Números/Obras/Mensagens + seções CINECOMICS/VERTICALSHOW bloqueadas.
 * Mocka services/api inteiro (mesma técnica de favorites.test.tsx /
 * royaltiesPanel.superReader.test.tsx) — sem bater rede real.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    createPortalSeries: vi.fn(),
    updatePortalSeries: vi.fn(),
    createPortalEpisodio: vi.fn(),
    addPortalPaineis: vi.fn(),
    enviarPortalSerie: vi.fn(),
    enviarPortalEpisodio: vi.fn(),
    getPortalMensagens: vi.fn(),
    sendPortalMensagem: vi.fn(),
    uploadPortalImage: vi.fn(),
    uploadPortalImagesBatch: vi.fn(),
    getEpisodesBySeries: vi.fn(),
  },
}));

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';

const canalUnico = { channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 };

const resumoAberto = {
  period: '2026-09',
  status: 'aberto' as const,
  canais: [{ channelId: 'c1', channelName: 'Canal Um', points: 120, share: 0.4 }],
  superReader: { porCanal: [{ channelId: 'c1', channelName: 'Canal Um', apoios: 3, autorCents: 8000 }] },
  periodosFechadosDisponiveis: ['2026-08'],
};

const resumoFechado = {
  period: '2026-08',
  status: 'fechado' as const,
  canais: [{ channelId: 'c1', channelName: 'Canal Um', points: 300, share: 0.5, amount: 250.5 }],
  superReader: { porCanal: [] },
  periodosFechadosDisponiveis: ['2026-08'],
};

const serieDraft = { _id: 's-draft', title: 'Obra Rascunho', description: 'Desc', cover_image: '', isPublished: false, submittedAt: null, content_rating_sugerida: null, channelId: 'c1' };
const serieAnalise = { _id: 's-analise', title: 'Obra Em Analise', description: 'Desc', cover_image: 'https://cdn/x.jpg', isPublished: false, submittedAt: '2026-09-01T00:00:00.000Z', content_rating_sugerida: 'kids', channelId: 'c1' };
const seriePublicada = { _id: 's-pub', title: 'Obra Publicada', description: 'Desc', cover_image: 'https://cdn/y.jpg', isPublished: true, submittedAt: null, content_rating_sugerida: 'teen', channelId: 'c1' };

function setupDefaults() {
  vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [canalUnico] } as any);
  vi.mocked(api.getPortalResumo).mockResolvedValue(resumoAberto as any);
  vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [] } as any);
  vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// Estrutura geral: abas + seções bloqueadas sempre presentes
// ═══════════════════════════════════════════════════════════════════════════

describe('PortalEstudio — estrutura', () => {
  it('renderiza as 3 abas e as seções CINECOMICS/VERTICALSHOW bloqueadas', async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    await screen.findByText('Números');
    expect(screen.getByText('Obras')).toBeInTheDocument();
    expect(screen.getByText('Mensagens')).toBeInTheDocument();
    // Rótulos de utils/contentTypeLabels.ts — nunca hardcoded.
    expect(screen.getByText('CINECOMICS')).toBeInTheDocument();
    expect(screen.getByText('VERTICALSHOW')).toBeInTheDocument();
    expect(screen.getAllByText('Em breve').length).toBeGreaterThanOrEqual(2);
  });

  it('sessão perdida (getMeuEstudio falha) — mensagem clara + botão volta pra Conta', async () => {
    vi.mocked(api.getMeuEstudio).mockRejectedValue(new Error('403'));
    const onClose = vi.fn();
    render(<PortalEstudio onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/não é mais dono deste canal/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Aba Números
// ═══════════════════════════════════════════════════════════════════════════

describe('PortalEstudio — aba Números', () => {
  it('mês corrente: mostra pontos/share, NUNCA R$ (o pool do mês, não o Super Reader — que é dinheiro real à parte)', async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    await waitFor(() => expect(api.getPortalResumo).toHaveBeenCalled());
    const poolSection = await screen.findByTestId('portal-pool-section');
    expect(within(poolSection).getByText('Canal Um')).toBeInTheDocument();
    expect(within(poolSection).getByText('120')).toBeInTheDocument(); // points
    expect(within(poolSection).getByText('40.0%')).toBeInTheDocument(); // share
    expect(within(poolSection).queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('Super Reader: mostra apoios confirmados com valor em R$ mesmo no mês corrente', async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Super Reader/)).toBeInTheDocument());
    expect(screen.getByText('R$80')).toBeInTheDocument(); // 8000 centavos
  });

  it('trocar para período fechado busca de novo e mostra R$', async () => {
    vi.mocked(api.getPortalResumo).mockImplementation((period?: string) => {
      if (period === '2026-08') return Promise.resolve(resumoFechado as any);
      return Promise.resolve(resumoAberto as any);
    });
    render(<PortalEstudio onClose={vi.fn()} />);
    await screen.findByTestId('portal-pool-section');

    const select = screen.getByLabelText('Ver período') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2026-08' } });

    await waitFor(() => expect(api.getPortalResumo).toHaveBeenCalledWith('2026-08'));
    await waitFor(() => expect(screen.getByText('R$250,50')).toBeInTheDocument());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Aba Obras
// ═══════════════════════════════════════════════════════════════════════════

describe('PortalEstudio — aba Obras', () => {
  const abrirObras = async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Obras'));
    await waitFor(() => expect(api.getPortalSeries).toHaveBeenCalled());
  };

  it('lista vazia mostra estado vazio', async () => {
    await abrirObras();
    await waitFor(() => expect(screen.getByText(/ainda não criou nenhuma obra/i)).toBeInTheDocument());
  });

  it('3 estados derivados do documento: Rascunho / Em análise / Publicada', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft, serieAnalise, seriePublicada] } as any);
    await abrirObras();
    await waitFor(() => expect(screen.getByText('Obra Rascunho')).toBeInTheDocument());
    expect(screen.getByText('Obra Em Analise')).toBeInTheDocument();
    expect(screen.getByText('Obra Publicada')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Em análise')).toBeInTheDocument();
    expect(screen.getByText('Publicada')).toBeInTheDocument();
  });

  it('criar obra: cria draft sem capa, depois sobe a capa e faz PUT com a URL', async () => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-nova' } as any);
    vi.mocked(api.uploadPortalImage).mockResolvedValue('https://cdn/nova-capa.jpg');
    vi.mocked(api.updatePortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-nova', cover_image: 'https://cdn/nova-capa.jpg' } as any);

    await abrirObras();
    fireEvent.click(screen.getByText('Nova obra'));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Obra Nova' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descricao nova' } });

    const file = new File(['capa'], 'capa.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByTestId('portal-cover-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Obra Nova', description: 'Descricao nova' })
    ));
    await waitFor(() => expect(api.uploadPortalImage).toHaveBeenCalledWith(file, 's-nova'));
    await waitFor(() => expect(api.updatePortalSeries).toHaveBeenCalledWith('s-nova', { cover_image: 'https://cdn/nova-capa.jpg' }));
  });

  it('enviar obra para aprovação: confirma e chama a rota; recarrega a lista', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    vi.mocked(api.enviarPortalSerie).mockResolvedValue({ ...serieDraft, submittedAt: '2026-09-02T00:00:00.000Z' } as any);
    vi.stubGlobal('confirm', vi.fn(() => true));

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para aprovação' }));

    await waitFor(() => expect(api.enviarPortalSerie).toHaveBeenCalledWith('s-draft'));
  });

  it('erro 400 ao enviar obra aparece inline (sem alert)', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    vi.mocked(api.enviarPortalSerie).mockRejectedValue(new Error('Não é possível enviar para aprovação: falta capa.'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para aprovação' }));

    await waitFor(() => expect(screen.getByText(/falta capa/i)).toBeInTheDocument());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('criar capítulo e subir painéis em lote: chama upload em lote com seriesId e depois addPortalPaineis em ordem', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    const epCriado = { _id: 'ep-1', title: 'Cap 1', episode_number: 1, status: 'draft', submittedAt: null, panels: [] };
    vi.mocked(api.createPortalEpisodio).mockResolvedValue(epCriado as any);
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epCriado] as any);
    vi.mocked(api.uploadPortalImagesBatch).mockResolvedValue({
      results: [
        { success: true, filename: 'p1.jpg', index: 0, url: 'https://cdn/p1.jpg' },
        { success: true, filename: 'p2.jpg', index: 1, url: 'https://cdn/p2.jpg' },
      ],
      successCount: 2, failCount: 0, total: 2,
    } as any);
    vi.mocked(api.addPortalPaineis).mockResolvedValue({
      success: true, panelCount: 2,
      episode: { ...epCriado, panels: [{ image_url: 'https://cdn/p1.jpg', order: 1 }, { image_url: 'https://cdn/p2.jpg', order: 2 }] },
    } as any);

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByText('Obra Rascunho'));
    await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s-draft'));

    fireEvent.click(screen.getByText('Novo capítulo'));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cap 1' } });
    fireEvent.change(screen.getByLabelText('Número do capítulo'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(api.createPortalEpisodio).toHaveBeenCalledWith('s-draft', expect.objectContaining({ title: 'Cap 1', episode_number: 1 })));

    fireEvent.click(screen.getByText('Gerenciar painéis'));
    const files = [new File(['a'], 'p1.jpg', { type: 'image/jpeg' }), new File(['b'], 'p2.jpg', { type: 'image/jpeg' })];
    const panelsInput = screen.getByTestId('portal-panels-input') as HTMLInputElement;
    fireEvent.change(panelsInput, { target: { files } });
    fireEvent.click(screen.getByText('Adicionar painéis'));

    await waitFor(() => expect(api.uploadPortalImagesBatch).toHaveBeenCalledWith(files, 's-draft'));
    await waitFor(() => expect(api.addPortalPaineis).toHaveBeenCalledWith('ep-1', [
      { image_url: 'https://cdn/p1.jpg', order: 1 },
      { image_url: 'https://cdn/p2.jpg', order: 2 },
    ]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Aba Mensagens
// ═══════════════════════════════════════════════════════════════════════════

describe('PortalEstudio — aba Mensagens', () => {
  const abrirMensagens = async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Mensagens'));
    await waitFor(() => expect(api.getPortalMensagens).toHaveBeenCalled());
  };

  it('lista vazia mostra estado vazio', async () => {
    await abrirMensagens();
    await waitFor(() => expect(screen.getByText(/nenhuma mensagem/i)).toBeInTheDocument());
  });

  it('thread renderiza mensagens do editor e do ilustrador com estilo distinto', async () => {
    vi.mocked(api.getPortalMensagens).mockResolvedValue({
      canalId: 'c1',
      mensagens: [
        { _id: 'm1', autorTipo: 'editor', texto: 'Ajuste a capa', refTipo: null, refId: null, lidaEm: null, createdAt: '2026-09-01T00:00:00.000Z' },
        { _id: 'm2', autorTipo: 'ilustrador', texto: 'Feito!', refTipo: null, refId: null, lidaEm: null, createdAt: '2026-09-01T01:00:00.000Z' },
      ],
    } as any);
    await abrirMensagens();
    await waitFor(() => expect(screen.getByText('Ajuste a capa')).toBeInTheDocument());
    const bolhaEditor = screen.getByText('Ajuste a capa').closest('[data-autor]');
    const bolhaIlustrador = screen.getByText('Feito!').closest('[data-autor]');
    expect(bolhaEditor?.getAttribute('data-autor')).toBe('editor');
    expect(bolhaIlustrador?.getAttribute('data-autor')).toBe('ilustrador');
  });

  it('mensagem de devolução com refTipo/refId mostra "Sobre: <título>" resolvido pela lista de obras', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    vi.mocked(api.getPortalMensagens).mockResolvedValue({
      canalId: 'c1',
      mensagens: [
        { _id: 'm1', autorTipo: 'editor', texto: 'Falta a capa', refTipo: 'series', refId: 's-draft', lidaEm: null, createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    } as any);
    render(<PortalEstudio onClose={vi.fn()} />);
    // Obras precisa ter carregado a lista (usada para resolver o título da ref) — visita a aba antes.
    fireEvent.click(await screen.findByText('Obras'));
    await waitFor(() => expect(api.getPortalSeries).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Mensagens'));
    await waitFor(() => expect(screen.getByText('Falta a capa')).toBeInTheDocument());
    expect(screen.getByText(/Sobre.*Obra Rascunho/)).toBeInTheDocument();
  });

  it('enviar mensagem chama sendPortalMensagem e limpa o campo', async () => {
    vi.mocked(api.sendPortalMensagem).mockResolvedValue({
      _id: 'm-nova', autorTipo: 'ilustrador', texto: 'Oi editor', refTipo: null, refId: null, lidaEm: null, createdAt: '2026-09-02T00:00:00.000Z',
    } as any);
    await abrirMensagens();
    const input = screen.getByPlaceholderText('Escreva sua mensagem...') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Oi editor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.sendPortalMensagem).toHaveBeenCalledWith({ texto: 'Oi editor' }));
    await waitFor(() => expect(input.value).toBe(''));
  });
});
