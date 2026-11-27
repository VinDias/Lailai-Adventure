/**
 * Frente A, item 9: V-Show e Anicom no Meu Estúdio (components/PortalEstudio
 * e components/EnvioEpisodio/EnvioVideoEpisodio).
 *
 * O QUE ESTES TESTES GARANTEM:
 * - "Nova obra" deixa escolher o tipo (Hi-Qua, V-Show, Anicom); Hi-Qua é o
 *   padrão e não manda tipo nenhum (como antes); V-Show e Anicom mandam
 *   `content_type` certo; o aviso antigo de "em breve" saiu;
 * - obra de vídeo mostra o tipo, e o capítulo dela mostra o estado do vídeo
 *   e o botão de enviar vídeo, SEM os botões de painéis; obra de quadrinhos
 *   continua como era, sem nada de vídeo;
 * - o modal: recusa arquivo que não é vídeo sem chamar o servidor; pede a
 *   autorização com tamanho e tipo; envia pelo cliente TUS (falso) com a
 *   autorização recebida; mostra o progresso; avisa que está processando e,
 *   quando o servidor diz pronto, avisa VÍDEO PRONTO e a lista acompanha;
 * - a renovação pedida pelo envio chama a rota com `renovar`;
 * - recusa do servidor e queda de rede aparecem com a mensagem certa.
 *
 * O QUE NÃO GARANTEM: o envio ao Bunny em si
 * (tests/frontend/envioVideoTus.test.ts) e as guardas do servidor
 * (tests/backend/videoAutor.test.js).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getMeuEstudio: vi.fn(),
    getPortalResumo: vi.fn(),
    getPortalSeries: vi.fn(),
    getPortalMensagens: vi.fn(),
    getEpisodesBySeries: vi.fn(),
    getPortalRevisoes: vi.fn(),
    createPortalSeries: vi.fn(),
    autorizarEnvioVideo: vi.fn(),
    getEstadoVideoEpisodio: vi.fn(),
  },
}));

// O envio de verdade fala com o Bunny: aqui é sempre um falso.
vi.mock('../../utils/envioVideoTus', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/envioVideoTus')>();
  return { ...real, enviarVideoTus: vi.fn() };
});

import { api } from '../../services/api';
import PortalEstudio from '../../components/PortalEstudio';
import EnvioVideoEpisodio, { tipoDoVideo } from '../../components/EnvioEpisodio/EnvioVideoEpisodio';
import { ErroEnvioVideo, enviarVideoTus } from '../../utils/envioVideoTus';

const AUTORIZACAO = { videoId: 'vid-1', libraryId: '4242', endpoint: 'https://video.bunny.falso/tusupload', assinatura: 'abc', expira: 1900000000, validadeSegundos: 7200, tamanhoMaximo: 800 * 1024 * 1024 };
const obraVideo = { _id: 'sv', title: 'Novela Vertical', description: '', cover_image: '', content_type: 'vcine', isPublished: false, submittedAt: null, channelId: 'c1' };
const obraQuadrinhos = { _id: 'sq', title: 'Quadrinhos Meus', description: '', cover_image: '', content_type: 'hiqua', isPublished: false, submittedAt: null, channelId: 'c1' };
const epVideo = (extra: Record<string, any> = {}) => ({ _id: 'ev1', title: 'Episódio de vídeo', episode_number: 1, status: 'draft', submittedAt: null, panels: [], ...extra });
const video = (nome = 'ep1.mp4', tipo = 'video/mp4', tamanho = 3 * 1024 * 1024) => {
  const f = new File(['x'], nome, { type: tipo });
  Object.defineProperty(f, 'size', { value: tamanho });
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMeuEstudio).mockResolvedValue({ canais: [{ channelId: 'c1', name: 'Canal Um', avatar: null, obras: 2, pendentes: 0, mensagensNaoLidas: 0 }] } as any);
  vi.mocked(api.getPortalResumo).mockResolvedValue({ period: '2026-11', status: 'aberto', canais: [], superReader: { porCanal: [] }, periodosFechadosDisponiveis: [] } as any);
  vi.mocked(api.getPortalSeries).mockResolvedValue({ series: [obraVideo, obraQuadrinhos] } as any);
  vi.mocked(api.getPortalMensagens).mockResolvedValue({ canalId: 'c1', mensagens: [] } as any);
  vi.mocked(api.getPortalRevisoes).mockResolvedValue({ revisoes: [] });
  vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epVideo()] as any);
  vi.mocked(api.autorizarEnvioVideo).mockResolvedValue(AUTORIZACAO as any);
  vi.mocked(api.getEstadoVideoEpisodio).mockResolvedValue({ estado: 'processando', videoId: 'vid-1', atualizadoEm: null, pronto: false });
});

async function abrirObras() {
  render(<PortalEstudio onClose={vi.fn()} />);
  fireEvent.click(await screen.findByText('Obras'));
  await screen.findByText('Novela Vertical');
}

describe('Meu Estúdio — criar obra de V-Show e de Anicom', () => {
  it('o formulário oferece os três tipos, com Hi-Qua marcado; o aviso de "em breve" não existe mais', async () => {
    await abrirObras();
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument();
    expect(screen.queryByText('Publicação mediante contratação de temporada')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
    const tipos = screen.getByRole('radiogroup', { name: 'Tipo da obra' });
    expect(within(tipos).getAllByRole('radio').map(b => b.textContent)).toEqual(['Hi-Qua', 'V-SHOW', 'ANICOM']);
    expect(within(tipos).getByRole('radio', { name: 'Hi-Qua' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Quadrinhos: cada capítulo recebe os painéis.')).toBeInTheDocument();
  });

  it('Hi-Qua (padrão) cria como antes, sem mandar tipo', async () => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ _id: 'nova' } as any);
    await abrirObras();
    fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Minha HQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createPortalSeries).mock.calls[0][0]).not.toHaveProperty('content_type');
  });

  it.each([['V-SHOW', 'vcine'], ['ANICOM', 'hqcine']])('%s cria a obra com content_type %s', async (rotulo, tipo) => {
    vi.mocked(api.createPortalSeries).mockResolvedValue({ _id: 'nova' } as any);
    await abrirObras();
    fireEvent.click(screen.getByRole('button', { name: 'Nova obra' }));
    fireEvent.click(screen.getByRole('radio', { name: rotulo }));
    expect(screen.getByText(/Obra de vídeo: cada episódio recebe um vídeo/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Minha obra de vídeo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(api.createPortalSeries).toHaveBeenCalledWith(expect.objectContaining({ title: 'Minha obra de vídeo', content_type: tipo })));
  });
});

describe('Meu Estúdio — capítulo de obra de vídeo', () => {
  async function abrirObraDeVideo() {
    await abrirObras();
    fireEvent.click(screen.getByText('Novela Vertical'));
    await screen.findByText('Episódio de vídeo');
    return screen.getByTestId('portal-video-ev1');
  }

  it('mostra o tipo da obra, o estado "sem vídeo" e o botão de enviar vídeo; nada de painéis', async () => {
    const linha = await abrirObraDeVideo();
    expect(screen.getByTestId('portal-obra-tipo-sv')).toHaveTextContent('V-SHOW');
    expect(screen.queryByTestId('portal-obra-tipo-sq')).not.toBeInTheDocument();
    expect(within(linha).getByText('Sem vídeo')).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: 'Enviar vídeo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar pasta do episódio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerenciar painéis' })).not.toBeInTheDocument();
  });

  it('obra de quadrinhos continua com os botões de painéis e sem nada de vídeo', async () => {
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([{ _id: 'eq1', title: 'Capítulo de HQ', episode_number: 1, status: 'draft', submittedAt: null, panels: [] }] as any);
    await abrirObras();
    fireEvent.click(screen.getByText('Quadrinhos Meus'));
    await screen.findByText('Capítulo de HQ');
    expect(screen.getByRole('button', { name: 'Enviar pasta do episódio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerenciar painéis' })).toBeInTheDocument();
    expect(screen.queryByTestId('portal-video-eq1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar vídeo' })).not.toBeInTheDocument();
  });

  it.each([
    ['processando', 'Vídeo em processamento', 'Trocar vídeo'],
    ['pronto', 'Vídeo pronto', 'Trocar vídeo'],
    ['erro', 'Erro no vídeo', 'Trocar vídeo'],
    ['enviando', 'Envio do vídeo não concluído', 'Enviar vídeo'],
  ])('vídeo %s: o capítulo mostra "%s"', async (estado, texto, botao) => {
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([epVideo({ bunnyVideoId: 'vid-1', videoEnvio: { videoId: 'vid-1', estado } })] as any);
    const linha = await abrirObraDeVideo();
    expect(within(linha).getByText(texto)).toBeInTheDocument();
    expect(within(linha).getByRole('button', { name: botao })).toBeInTheDocument();
  });

  it('capítulo em análise ou publicado mostra o estado do vídeo, sem botão de trocar', async () => {
    vi.mocked(api.getEpisodesBySeries).mockResolvedValue([
      epVideo({ submittedAt: '2026-11-27T10:00:00.000Z', bunnyVideoId: 'vid-1', videoEnvio: { videoId: 'vid-1', estado: 'pronto' } }),
      epVideo({ _id: 'ev2', title: 'No ar', status: 'published', bunnyVideoId: 'vid-2', video_url: 'https://cdn/vid-2/playlist.m3u8' }),
    ] as any);
    const linha = await abrirObraDeVideo();
    expect(within(linha).getByText('Vídeo pronto')).toBeInTheDocument();
    expect(within(linha).queryByRole('button')).not.toBeInTheDocument();
    const noAr = screen.getByTestId('portal-video-ev2');
    expect(within(noAr).getByText('Vídeo pronto')).toBeInTheDocument();
    expect(within(noAr).queryByRole('button')).not.toBeInTheDocument();
    // Capítulo de vídeo publicado não ganha o bloco de edição de painéis (item 7).
    expect(screen.queryByTestId('portal-revisao-ev2')).not.toBeInTheDocument();
  });

  it('fechar o modal sem enviar não pede nada ao servidor', async () => {
    const linha = await abrirObraDeVideo();
    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar vídeo' }));
    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Enviar o vídeo do episódio')).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    expect(api.autorizarEnvioVideo).not.toHaveBeenCalled();
    expect(enviarVideoTus).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('do botão ao capítulo: o vídeo é enviado (Bunny falso) e a linha do capítulo passa a mostrar o vídeo em processamento', async () => {
    vi.mocked(enviarVideoTus).mockResolvedValue({ videoId: 'vid-1', bytes: 1 });
    const linha = await abrirObraDeVideo();
    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar vídeo' }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByTestId('video-input'), { target: { files: [video()] } });
    fireEvent.click(screen.getByTestId('video-enviar'));

    expect(await screen.findByTestId('video-processando')).toBeInTheDocument();
    expect(api.autorizarEnvioVideo).toHaveBeenCalledWith('ev1', { tamanho: 3 * 1024 * 1024, tipo: 'video/mp4' });
    expect(vi.mocked(enviarVideoTus).mock.calls[0][0]).toMatchObject({ autorizacao: AUTORIZACAO });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
    const depois = screen.getByTestId('portal-video-ev1');
    expect(within(depois).getByText('Vídeo em processamento')).toBeInTheDocument();
    expect(within(depois).getByRole('button', { name: 'Trocar vídeo' })).toBeInTheDocument();
  });
});

describe('modal de envio do vídeo', () => {
  const montar = (props: Partial<React.ComponentProps<typeof EnvioVideoEpisodio>> = {}) => {
    const onEstado = vi.fn();
    const onFechar = vi.fn();
    const enviar = vi.fn(async (o: any) => { o.aoProgredir?.(o.arquivo.size / 2, o.arquivo.size); o.aoProgredir?.(o.arquivo.size, o.arquivo.size); return { videoId: 'vid-1' }; });
    render(<EnvioVideoEpisodio episode={epVideo()} onFechar={onFechar} onEstado={onEstado} enviar={enviar} intervaloDeConsultaMs={5} {...props} />);
    return { onEstado, onFechar, enviar };
  };
  const escolher = (f: File) => fireEvent.change(screen.getByTestId('video-input'), { target: { files: [f] } });

  it('arquivo que não é vídeo é recusado na tela, sem chamar o servidor', async () => {
    const { enviar } = montar();
    escolher(new File(['x'], 'capa.png', { type: 'image/png' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Formato não aceito');
    expect(screen.getByTestId('video-enviar')).toBeDisabled();
    expect(api.autorizarEnvioVideo).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('.mkv e .mov sem tipo informado pelo navegador são reconhecidos pela extensão', () => {
    expect(tipoDoVideo({ name: 'Ep 1.MKV', type: '' })).toBe('video/x-matroska');
    expect(tipoDoVideo({ name: 'ep.mov', type: '' })).toBe('video/quicktime');
    expect(tipoDoVideo({ name: 'ep.mp4', type: 'video/mp4' })).toBe('video/mp4');
    expect(tipoDoVideo({ name: 'ep.avi', type: 'video/x-msvideo' })).toBeNull();
    expect(tipoDoVideo({ name: 'sem-extensao', type: '' })).toBeNull();
  });

  it('pede a autorização com tamanho e tipo, envia direto com ela, avisa o processamento e depois VÍDEO PRONTO', async () => {
    const respostas = [{ estado: 'processando' }, { estado: 'processando' }, { estado: 'pronto' }];
    vi.mocked(api.getEstadoVideoEpisodio).mockImplementation(async () => ({ videoId: 'vid-1', atualizadoEm: null, pronto: false, ...(respostas.shift() ?? { estado: 'pronto' }) }) as any);
    const { onEstado, enviar } = montar();
    const arquivo = video('Episódio 1.mp4', 'video/mp4', 5 * 1024 * 1024);
    escolher(arquivo);
    expect(screen.getByTestId('video-arquivo')).toHaveTextContent('Episódio 1.mp4 · 5.0 MB');
    // Nada vai ao servidor antes do clique.
    expect(api.autorizarEnvioVideo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('video-enviar'));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(api.autorizarEnvioVideo).toHaveBeenCalledWith('ev1', { tamanho: 5 * 1024 * 1024, tipo: 'video/mp4' });
    const opcoes = enviar.mock.calls[0][0];
    expect(opcoes).toMatchObject({ arquivo, nome: 'Episódio 1.mp4', tipo: 'video/mp4', autorizacao: AUTORIZACAO });

    expect(await screen.findByTestId('video-processando')).toHaveTextContent('Vídeo enviado');
    expect(onEstado).toHaveBeenCalledWith('enviando');
    expect(onEstado).toHaveBeenCalledWith('processando');

    expect(await screen.findByTestId('video-pronto')).toHaveTextContent('Vídeo pronto. O episódio continua em rascunho');
    expect(onEstado).toHaveBeenLastCalledWith('pronto');
    expect(vi.mocked(api.getEstadoVideoEpisodio).mock.calls.length).toBeGreaterThanOrEqual(3);

    // A renovação que o envio pode pedir é a mesma rota, com `renovar`.
    await opcoes.renovar();
    expect(api.autorizarEnvioVideo).toHaveBeenLastCalledWith('ev1', { renovar: true });
  });

  it('mostra o progresso do envio', async () => {
    let soltar: () => void = () => {};
    const enviar = vi.fn((o: any) => new Promise((resolve) => { o.aoProgredir?.(1024 * 1024, 4 * 1024 * 1024); soltar = () => resolve({}); }));
    montar({ enviar: enviar as any });
    escolher(video('ep.mp4', 'video/mp4', 4 * 1024 * 1024));
    fireEvent.click(screen.getByTestId('video-enviar'));
    expect(await screen.findByTestId('video-progresso')).toHaveTextContent('Enviando: 25% (1.0 de 4.0 MB)');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await act(async () => { soltar(); });
    expect(await screen.findByTestId('video-processando')).toBeInTheDocument();
  });

  it('o servidor recusa a autorização (ex.: vídeo grande demais): a mensagem dele aparece e nada é enviado', async () => {
    vi.mocked(api.autorizarEnvioVideo).mockRejectedValue(new Error('O vídeo passa do tamanho máximo de 800 MB.'));
    const { enviar, onEstado } = montar();
    escolher(video());
    fireEvent.click(screen.getByTestId('video-enviar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('O envio não foi aceito: O vídeo passa do tamanho máximo de 800 MB.');
    expect(enviar).not.toHaveBeenCalled();
    expect(onEstado).not.toHaveBeenCalled();
  });

  it('queda de rede no envio: avisa e oferece tentar de novo, que pede outra autorização', async () => {
    const enviar = vi.fn()
      .mockRejectedValueOnce(new ErroEnvioVideo('rede', 'falha de rede'))
      .mockResolvedValueOnce({});
    montar({ enviar: enviar as any });
    escolher(video());
    fireEvent.click(screen.getByTestId('video-enviar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('O envio parou (falha de rede)');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('video-processando')).toBeInTheDocument();
    expect(api.autorizarEnvioVideo).toHaveBeenCalledTimes(2);
  });

  it('erro no processamento do vídeo aparece na tela', async () => {
    vi.mocked(api.getEstadoVideoEpisodio).mockResolvedValue({ estado: 'erro', videoId: 'vid-1', atualizadoEm: null, pronto: false });
    const { onEstado } = montar();
    escolher(video());
    fireEvent.click(screen.getByTestId('video-enviar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('O vídeo não pôde ser processado');
    expect(onEstado).toHaveBeenLastCalledWith('erro');
  });

  it('episódio com vídeo ainda processando: o modal já abre acompanhando, sem pedir arquivo', async () => {
    vi.mocked(api.getEstadoVideoEpisodio).mockResolvedValue({ estado: 'pronto', videoId: 'vid-1', atualizadoEm: null, pronto: true });
    render(<EnvioVideoEpisodio episode={epVideo({ videoEnvio: { estado: 'processando' } })} onFechar={vi.fn()} intervaloDeConsultaMs={5} />);
    expect(screen.getByTestId('video-processando')).toBeInTheDocument();
    expect(screen.queryByTestId('video-input')).not.toBeInTheDocument();
    expect(await screen.findByTestId('video-pronto')).toBeInTheDocument();
  });
});
