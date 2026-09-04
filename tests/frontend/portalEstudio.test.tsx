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

  it('erro ao carregar NÃO trava num spinner eterno — mostra mensagem + botão "Tentar de novo" que recupera (BAIXO 4)', async () => {
    vi.mocked(api.getPortalResumo).mockRejectedValueOnce(new Error('Falha de rede ao buscar o resumo.'));
    render(<PortalEstudio onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Falha de rede ao buscar o resumo.')).toBeInTheDocument());
    const retryButton = screen.getByRole('button', { name: 'Tentar de novo' });

    vi.mocked(api.getPortalResumo).mockResolvedValue(resumoAberto as any);
    fireEvent.click(retryButton);

    const poolSection = await screen.findByTestId('portal-pool-section');
    expect(within(poolSection).getByText('Canal Um')).toBeInTheDocument();
    expect(screen.queryByText('Falha de rede ao buscar o resumo.')).not.toBeInTheDocument();
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

  it('Task 6 — seletor de tags i18n no criar obra: chips do vocabulário, até 8, envia os slugs selecionados', async () => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-tags' } as any);

    await abrirObras();
    fireEvent.click(screen.getByText('Nova obra'));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Obra Com Tags' } });
    // Rótulo PT (default do i18n em teste) — mesmo vocabulário do admin.
    fireEvent.click(screen.getByRole('button', { name: 'Aventura' }));
    fireEvent.click(screen.getByRole('button', { name: 'Drama' }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Obra Com Tags', tags: expect.arrayContaining(['aventura', 'drama']) })
    ));
  });

  it('Task 6 — criar obra sem selecionar tags envia array vazio', async () => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-sem-tags' } as any);

    await abrirObras();
    fireEvent.click(screen.getByText('Nova obra'));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Obra Sem Tags' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [] })
    ));
  });

  it('Task 6 — editar obra: mostra as tags atuais selecionadas e envia o array atualizado', async () => {
    const serieComTags = { ...serieDraft, tags: ['romance', 'comedia'] };
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieComTags] } as any);
    vi.mocked(api.updatePortalSeries).mockResolvedValue({ ...serieComTags } as any);

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByRole('button', { name: 'Romance' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Comédia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ação' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Ação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.updatePortalSeries).toHaveBeenCalledWith('s-draft', expect.objectContaining({
      tags: expect.arrayContaining(['romance', 'comedia', 'acao']),
    })));
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

  it('MEDIO 1a — editar obra: trocar a capa pina PUT com cover_image (mostra a capa atual quando houver)', async () => {
    // Só draft tem o botão Editar — usa uma variante da série-draft com capa.
    const serieComCapa = { ...serieDraft, cover_image: 'https://cdn/capa-atual.jpg' };
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieComCapa] } as any);
    vi.mocked(api.uploadPortalImage).mockResolvedValue('https://cdn/capa-editada.jpg');
    vi.mocked(api.updatePortalSeries).mockResolvedValue({ ...serieComCapa, cover_image: 'https://cdn/capa-editada.jpg' } as any);

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    // Capa atual visível no modal.
    expect(screen.getByTestId('portal-edit-cover-preview')).toHaveAttribute('src', 'https://cdn/capa-atual.jpg');

    const file = new File(['capa'], 'nova.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('portal-edit-cover-input'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.uploadPortalImage).toHaveBeenCalledWith(file, 's-draft'));
    await waitFor(() => expect(api.updatePortalSeries).toHaveBeenCalledWith('s-draft', expect.objectContaining({ cover_image: 'https://cdn/capa-editada.jpg' })));
  });

  it('MEDIO 1b — create OK mas upload da capa falha: fecha o modal de criação, NÃO chama createPortalSeries de novo, avisa pra completar em Editar', async () => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-nova' } as any);
    vi.mocked(api.uploadPortalImage).mockRejectedValue(new Error('Erro ao fazer upload: 502'));

    await abrirObras();
    fireEvent.click(screen.getByText('Nova obra'));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Obra Sem Capa' } });
    const file = new File(['capa'], 'capa.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('portal-cover-input'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    // A série já foi criada (POST teve sucesso) — o modal fecha na hora,
    // mesmo com o upload ainda em andamento/falhando em seguida.
    await waitFor(() => expect(screen.queryByTestId('portal-cover-input')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/adicione a capa em editar/i)).toBeInTheDocument());

    // Nenhum reenvio do formulário aconteceu — createPortalSeries só rodou 1x.
    expect(api.createPortalSeries).toHaveBeenCalledTimes(1);
  });

  it('BAIXO 3 — upload em lote parcial: NÃO fecha como sucesso, avisa "X/Y" e mantém o modal aberto com os que falharam prontos pra nova tentativa', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    const epCriado = { _id: 'ep-1', title: 'Cap 1', episode_number: 1, status: 'draft', submittedAt: null, panels: [] };
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epCriado] as any);
    vi.mocked(api.uploadPortalImagesBatch).mockResolvedValue({
      results: [
        { success: true, filename: 'p1.jpg', index: 0, url: 'https://cdn/p1.jpg' },
        { success: false, filename: 'p2.jpg', index: 1, error: 'Erro no Bunny Storage.' },
      ],
      successCount: 1, failCount: 1, total: 2,
    } as any);
    vi.mocked(api.addPortalPaineis).mockResolvedValue({
      success: true, panelCount: 1,
      episode: { ...epCriado, panels: [{ image_url: 'https://cdn/p1.jpg', order: 1 }] },
    } as any);

    await abrirObras();
    await waitFor(() => screen.getByText('Obra Rascunho'));
    fireEvent.click(screen.getByText('Obra Rascunho'));
    await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s-draft'));

    fireEvent.click(screen.getByText('Gerenciar painéis'));
    const files = [new File(['a'], 'p1.jpg', { type: 'image/jpeg' }), new File(['b'], 'p2.jpg', { type: 'image/jpeg' })];
    fireEvent.change(screen.getByTestId('portal-panels-input'), { target: { files } });
    fireEvent.click(screen.getByText('Adicionar painéis'));

    // Só o painel bem-sucedido é gravado.
    await waitFor(() => expect(api.addPortalPaineis).toHaveBeenCalledWith('ep-1', [{ image_url: 'https://cdn/p1.jpg', order: 1 }]));
    // Aviso "1/2 ..." — sucesso parcial nunca vira sucesso silencioso.
    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeInTheDocument());
    // Modal continua aberto pra tentar de novo.
    expect(screen.getByTestId('portal-panels-input')).toBeInTheDocument();
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

  it('mensagem de devolução com refTipo "series" mostra "Sobre: <título>" — resolvido mesmo SEM visitar Obras antes (BAIXO 5a: seriesList carrega no mount)', async () => {
    vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [serieDraft] } as any);
    vi.mocked(api.getPortalMensagens).mockResolvedValue({
      canalId: 'c1',
      mensagens: [
        { _id: 'm1', autorTipo: 'editor', texto: 'Falta a capa', refTipo: 'series', refId: 's-draft', lidaEm: null, createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    } as any);
    // Vai direto pra Mensagens — NUNCA clica em Obras nesta sessão.
    await abrirMensagens();
    await waitFor(() => expect(screen.getByText('Falta a capa')).toBeInTheDocument());
    expect(screen.getByText(/Sobre.*Obra Rascunho/)).toBeInTheDocument();
  });

  it('mensagem de devolução com refTipo "episode" mostra rótulo genérico "um capítulo" (sem rota nova pra buscar o capítulo — BAIXO 5b)', async () => {
    vi.mocked(api.getPortalMensagens).mockResolvedValue({
      canalId: 'c1',
      mensagens: [
        { _id: 'm1', autorTipo: 'editor', texto: 'Ajuste o painel 2', refTipo: 'episode', refId: 'ep-x', lidaEm: null, createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    } as any);
    await abrirMensagens();
    await waitFor(() => expect(screen.getByText('Ajuste o painel 2')).toBeInTheDocument());
    expect(screen.getByText(/Sobre.*um capítulo/)).toBeInTheDocument();
    // Nenhuma chamada extra pra "resolver" o capítulo — o rótulo é estático.
    expect(api.getEpisodesBySeries).not.toHaveBeenCalled();
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

// ═══════════════════════════════════════════════════════════════════════════
// MEDIO 2 — Multi-canal: seletor de canal
// ═══════════════════════════════════════════════════════════════════════════

describe('PortalEstudio — multi-canal (MEDIO 2)', () => {
  const canalDois = { channelId: 'c2', name: 'Canal Dois', avatar: null, obras: 0, pendentes: 0, mensagensNaoLidas: 0 };

  it('com 1 canal só: seletor de canal NÃO aparece', async () => {
    render(<PortalEstudio onClose={vi.fn()} />);
    await screen.findByText('Números');
    expect(screen.queryByLabelText('Canal')).not.toBeInTheDocument();
  });

  it('com 2 canais: seletor aparece; trocar o canal muda o channelId no POST de série e o canalId no GET/POST de mensagens', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [canalUnico, canalDois] } as any);
    vi.mocked(api.createPortalSeries).mockResolvedValue({ ...serieDraft, _id: 's-nova', channelId: 'c2' } as any);
    vi.mocked(api.sendPortalMensagem).mockResolvedValue({
      _id: 'm-nova', autorTipo: 'ilustrador', texto: 'Oi', refTipo: null, refId: null, lidaEm: null, createdAt: '2026-09-03T00:00:00.000Z',
    } as any);

    render(<PortalEstudio onClose={vi.fn()} />);
    const select = (await screen.findByLabelText('Canal')) as HTMLSelectElement;
    // Default é o primeiro canal (canalUnico) — troca pro segundo.
    expect(select.value).toBe('c1');
    fireEvent.change(select, { target: { value: 'c2' } });
    expect(select.value).toBe('c2');

    // Criar obra usa o canal selecionado.
    fireEvent.click(screen.getByText('Obras'));
    await waitFor(() => expect(api.getPortalSeries).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Nova obra'));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Obra Canal 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'c2' })));

    // Mensagens usa o mesmo canal selecionado, tanto pra ler quanto pra enviar.
    fireEvent.click(screen.getByText('Mensagens'));
    await waitFor(() => expect(api.getPortalMensagens).toHaveBeenCalledWith({ canalId: 'c2' }));

    fireEvent.change(screen.getByPlaceholderText('Escreva sua mensagem...'), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.sendPortalMensagem).toHaveBeenCalledWith({ texto: 'Oi', canalId: 'c2' }));
  });

  it('lista de Obras com >1 canal indica o canal de cada card', async () => {
    vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [canalUnico, canalDois] } as any);
    vi.mocked(api.getPortalSeries).mockResolvedValue({
      series: [serieDraft, { ...seriePublicada, _id: 's-c2', channelId: 'c2' }],
    } as any);

    render(<PortalEstudio onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Obras'));
    await waitFor(() => screen.getByText('Obra Rascunho'));

    // Escopado ao card (não ao <option> do seletor de canal, que também tem
    // o mesmo texto — "Canal Um"/"Canal Dois" aparecem duas vezes na tela).
    const cardUm = screen.getByTestId('portal-obra-card-s-draft');
    const cardDois = screen.getByTestId('portal-obra-card-s-c2');
    expect(within(cardUm).getByText('Canal Um')).toBeInTheDocument();
    expect(within(cardDois).getByText('Canal Dois')).toBeInTheDocument();
  });
});
