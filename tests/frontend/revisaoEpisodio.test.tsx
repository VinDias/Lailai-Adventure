/**
 * Frente A, item 7: edição de episódio PUBLICADO com aprovação, nas telas.
 *
 * O QUE ESTES TESTES GARANTEM:
 * - Meu Estúdio: capítulo publicado ganha "Enviar pasta do episódio" e
 *   "Editar painéis"; a grade abre com os painéis que o SERVIDOR devolve (a
 *   edição, não a lista de capítulos) e avisa que nada vai ao ar antes da
 *   aprovação; depois de uma mudança o capítulo mostra a edição e os botões
 *   de enviar e descartar; edição devolvida mostra o motivo; edição na fila
 *   não tem botão de mudar;
 * - o modal de envio da pasta avisa que em capítulo publicado a pasta vira
 *   edição;
 * - falha ao ler as edições não derruba a lista de capítulos;
 * - Fila de Aprovação: o item `revisao` mostra o que é, abre o leitor pela
 *   rota da edição, e Aprovar e Devolver chamam as rotas da edição.
 *
 * O QUE NÃO GARANTEM: que o ar não muda, a guarda de dono e o aviso de
 * capítulo novo: isso é tests/backend/revisaoEpisodio.test.js.
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
    enviarRevisaoEpisodio: vi.fn(),
    descartarRevisaoEpisodio: vi.fn(),
    getPaineisEdicao: vi.fn(),
    apagarPaineisEdicao: vi.fn(),
    getEnvioEpisodioConfig: vi.fn(),
    getAdminAprovacoes: vi.fn(),
    aprovarRevisaoAdmin: vi.fn(),
    aprovarEpisodioAdmin: vi.fn(),
    aprovarSerieAdmin: vi.fn(),
    devolverAprovacao: vi.fn(),
    getLeituraRevisao: vi.fn(),
    getLeituraAprovacao: vi.fn(),
  },
}));

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';
import AprovacoesPanel from '../../components/Admin/AprovacoesPanel';

const painel = (n: number, origem = 'ar') => ({ _id: `id${n}`, image_url: `https://cdn/${origem}-p${n}.jpg`, order: n - 1, translationLayers: [] as any[] });
const noAr = [1, 2, 3, 4].map(n => painel(n));
const epPublicado = { _id: 'ep-pub', title: 'Cap no ar', episode_number: 1, status: 'published', submittedAt: null, panels: noAr };
const epRascunho = { _id: 'ep-ras', title: 'Cap rascunho', episode_number: 2, status: 'draft', submittedAt: null, panels: [painel(9)] };
const revisao = (extra: Record<string, any> = {}) => ({ episodeId: 'ep-pub', status: 'editando', submittedAt: null, totalPaineis: 3, devolucao: null, ...extra });

async function abrirObra() {
  render(<PortalEstudio onClose={vi.fn()} />);
  fireEvent.click(await screen.findByText('Obras'));
  fireEvent.click(await screen.findByText('Obra No Ar'));
  await waitFor(() => expect(api.getEpisodesBySeries).toHaveBeenCalledWith('s1'));
  await screen.findByText('Cap no ar');
  return screen.getByTestId('portal-revisao-ep-pub');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 1, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
  vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
  vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [{ _id: 's1', title: 'Obra No Ar', description: '', cover_image: '', isPublished: true, submittedAt: null, content_rating_sugerida: null, channelId: 'c1' }] } as any);
  vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epPublicado, epRascunho] as any);
  vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [] });
  vi.mocked(api.getEnvioEpisodioConfig).mockResolvedValue({ limitePaineis: 100, limiteBytes: 20 * 1024 * 1024, alturaMaxima: 1280, tamanhoMaximoParte: 8 * 1024 * 1024, arquivosPorParte: 60 });
});

describe('Meu Estúdio — capítulo publicado', () => {
  it('sem edição: oferece enviar a pasta e editar os painéis, e nada de enviar ou descartar edição', async () => {
    const linha = await abrirObra();
    expect(api.getPortalRevisoes).toHaveBeenCalledWith('s1');
    expect(within(linha).getByRole('button', { name: 'Enviar pasta do episódio' })).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Editar painéis' })).toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Enviar edição para aprovação' })).not.toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Descartar edição' })).not.toBeInTheDocument();
    // O rascunho ao lado continua com os botões de rascunho e sem bloco de edição.
    expect(screen.queryByTestId('portal-revisao-ep-ras')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar capítulo' })).toBeInTheDocument();
  });

  it('a grade abre com os painéis que o servidor devolve, avisa que nada vai ao ar, e a mudança vira edição no capítulo', async () => {
    const daEdicao = [1, 2, 3, 4].map(n => painel(n, 'edicao'));
    vi.mocked(api.getPaineisEdicao).mockResolvedValue({ modo: 'publicado', podeEditar: true, motivo: null, panels: daEdicao, revisao: null } as any);
    vi.mocked(api.apagarPaineisEdicao).mockResolvedValue({ removidos: ['id4'], totalPaineis: 3, apagadosDoBunny: 0, naoApagados: [] });
    const linha = await abrirObra();
    fireEvent.click(within(linha).getByRole('button', { name: 'Editar painéis' }));
    await waitFor(() => expect(api.getPaineisEdicao).toHaveBeenCalledWith('ep-pub'));

    const grade = await screen.findByTestId('grade-paineis');
    expect(screen.getByTestId('grade-aviso-revisao')).toHaveTextContent('só vai ao ar depois da aprovação');
    const imagens = () => within(grade).getAllByTestId('grade-painel').map(c => within(c).getByRole('img').getAttribute('src'));
    expect(imagens()).toEqual(daEdicao.map(p => p.image_url));

    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [revisao()] } as any);
    fireEvent.click(within(grade).getByRole('button', { name: 'Apagar painel #4' }));
    await waitFor(() => expect(api.apagarPaineisEdicao).toHaveBeenCalledWith('ep-pub', ['id4']));
    await waitFor(() => expect(imagens()).toHaveLength(3));

    // O capítulo passa a mostrar a edição, com enviar e descartar.
    await waitFor(() => expect(within(linha).getByText(/Edição não enviada/)).toBeInTheDocument());
    expect(within(linha).getByText(/3 painéis na edição/)).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Enviar edição para aprovação' })).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Descartar edição' })).toBeInTheDocument();
  });

  it('edição devolvida: mostra o motivo; enviar de novo leva para "em análise" e tira os botões de mudar', async () => {
    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [revisao({ devolucao: { motivo: 'O balão do painel 2 está cortado.', em: '2026-11-27T10:00:00.000Z' } })] } as any);
    vi.mocked(api.enviarRevisaoEpisodio).mockResolvedValue({ revisao: revisao({ status: 'enviada', submittedAt: '2026-11-27T12:00:00.000Z' }) } as any);
    const linha = await abrirObra();
    expect(await within(linha).findByText(/Edição devolvida/)).toBeInTheDocument();
    expect(within(linha).getByText('Motivo: O balão do painel 2 está cortado.')).toBeInTheDocument();

    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar edição para aprovação' }));
    await waitFor(() => expect(api.enviarRevisaoEpisodio).toHaveBeenCalledWith('ep-pub'));
    expect(await within(linha).findByText(/Edição em análise/)).toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Enviar edição para aprovação' })).not.toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Descartar edição' })).not.toBeInTheDocument();
    expect(within(linha).queryByRole('button', { name: 'Enviar pasta do episódio' })).not.toBeInTheDocument();
    expect(within(linha).queryByText(/Motivo:/)).not.toBeInTheDocument();
  });

  it('edição na fila: a grade abre só para ver, sem botão de mudar', async () => {
    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [revisao({ status: 'enviada' })] } as any);
    vi.mocked(api.getPaineisEdicao).mockResolvedValue({ modo: 'revisao', podeEditar: false, motivo: 'em análise', panels: noAr.slice(0, 3) } as any);
    const linha = await abrirObra();
    fireEvent.click(await within(linha).findByRole('button', { name: 'Editar painéis' }));
    const grade = await screen.findByTestId('grade-paineis');
    expect(within(grade).getAllByTestId('grade-painel')).toHaveLength(3);
    expect(within(grade).queryByRole('button', { name: /Apagar painel/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('grade-aviso-revisao')).toHaveTextContent('Edição em análise');
  });

  it('descartar: confirma, chama o servidor e a edição some do capítulo', async () => {
    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [revisao()] } as any);
    vi.mocked(api.descartarRevisaoEpisodio).mockResolvedValue({ descartada: true, apagadosDoBunny: 2 });
    const linha = await abrirObra();
    fireEvent.click(await within(linha).findByRole('button', { name: 'Descartar edição' }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.descartarRevisaoEpisodio).toHaveBeenCalledWith('ep-pub'));
    await waitFor(() => expect(within(linha).queryByText(/Edição não enviada/)).not.toBeInTheDocument());
    expect(within(linha).queryByRole('button', { name: 'Descartar edição' })).not.toBeInTheDocument();
  });

  it('o servidor recusa o envio da edição: o motivo aparece em texto', async () => {
    vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [revisao({ totalPaineis: 0 })] } as any);
    vi.mocked(api.enviarRevisaoEpisodio).mockRejectedValue(new Error('A edição ficou sem nenhum painel.'));
    const linha = await abrirObra();
    fireEvent.click(await within(linha).findByRole('button', { name: 'Enviar edição para aprovação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A edição ficou sem nenhum painel.');
  });

  it('enviar a pasta em capítulo publicado: o modal avisa que vira edição; em rascunho não avisa', async () => {
    const linha = await abrirObra();
    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar pasta do episódio' }));
    expect(await screen.findByTestId('envio-aviso-revisao')).toHaveTextContent('vira uma edição à espera de aprovação');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('envio-aviso-revisao')).not.toBeInTheDocument());

    const botoes = screen.getAllByRole('button', { name: 'Enviar pasta do episódio' });
    fireEvent.click(botoes[botoes.length - 1]); // o do rascunho
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('envio-aviso-revisao')).not.toBeInTheDocument();
  });

  it('falha ao ler as edições não derruba a lista de capítulos', async () => {
    vi.mocked(api.getPortalRevisoes).mockRejectedValue(new Error('500'));
    const linha = await abrirObra();
    expect(screen.getByText('Cap rascunho')).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Editar painéis' })).toBeInTheDocument();
  });
});

describe('Fila de Aprovação — edição de episódio publicado', () => {
  const item = {
    tipo: 'revisao', id: 'ep-pub', title: 'Cap no ar', description: null, thumbnail: 'https://cdn/thumb.jpg',
    panelCount: 3, panelCountNoAr: 4, serie: { id: 's1', title: 'Obra No Ar', isPublished: true },
    canal: { id: 'c1', name: 'Canal Um' }, submittedAt: '2026-11-27T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [item], naoClassificadas: 0 } as any);
  });

  it('mostra que é edição de publicado, os painéis da edição e os do ar, e que aprovar não avisa capítulo novo', async () => {
    const onCountChange = vi.fn();
    render(<AprovacoesPanel onCountChange={onCountChange} />);
    expect(await screen.findByText('Edição de publicado')).toBeInTheDocument();
    expect(screen.getByText('3 painéis na edição (no ar: 4)')).toBeInTheDocument();
    expect(screen.getByText(/sem novo aviso de capítulo/)).toBeInTheDocument();
    expect(onCountChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: /Aprovar/ })).toBeEnabled();
  });

  it('"Ler edição" abre o leitor pela rota da edição, não pela do capítulo novo', async () => {
    vi.mocked(api.getLeituraRevisao).mockResolvedValue({ _id: 'ep-pub', panels: [1, 2, 3].map(n => painel(n, 'edicao')) } as any);
    render(<AprovacoesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Ler edição/ }));
    await waitFor(() => expect(api.getLeituraRevisao).toHaveBeenCalledWith('ep-pub'));
    expect(api.getLeituraAprovacao).not.toHaveBeenCalled();
    expect(await screen.findByAltText('Página 1')).toHaveAttribute('src', 'https://cdn/edicao-p1.jpg');
    expect(screen.getByRole('button', { name: 'Zhon 0/3' })).toBeInTheDocument();
  });

  it('Aprovar chama a rota da edição e recarrega a fila', async () => {
    vi.mocked(api.aprovarRevisaoAdmin).mockResolvedValue({} as any);
    render(<AprovacoesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Aprovar/ }));
    await waitFor(() => expect(api.aprovarRevisaoAdmin).toHaveBeenCalledWith('ep-pub'));
    expect(api.aprovarEpisodioAdmin).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getAdminAprovacoes).toHaveBeenCalledTimes(2));
  });

  it('Devolver manda o motivo para a rota genérica com tipo "revisao"', async () => {
    vi.mocked(api.devolverAprovacao).mockResolvedValue({ success: true, mensagem: {} } as any);
    render(<AprovacoesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Devolver/ }));
    fireEvent.change(screen.getByPlaceholderText(/Motivo da devolução/), { target: { value: 'Balão cortado no painel 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(api.devolverAprovacao).toHaveBeenCalledWith('revisao', 'ep-pub', 'Balão cortado no painel 2'));
  });
});
