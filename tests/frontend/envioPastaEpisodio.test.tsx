/**
 * Frente A, item 2 (tela de conferência) e item 4 (pasta ou arquivos, envio
 * em partes), pela tela: components/EnvioEpisodio/.
 *
 * Critérios do plano:
 *  - item 2: "uma pasta com cada erro mostra o aviso certo no arquivo certo;
 *    nenhuma chamada à API antes do clique em confirmar";
 *  - item 4: "API falsa falhando no arquivo 7 uma vez: a tela tenta de novo
 *    só ele e conclui; contagem do progresso".
 * E os limites aparecendo na conferência (100 painéis sempre; MB só quando o
 * admin liga: desde 26/11 o padrão é sem limite de megabytes),
 * com a estrutura real do The Near Ones EP6 que ele mandou.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import EnvioPastaEpisodio from '../../components/EnvioEpisodio/EnvioPastaEpisodio';
import { organizarPasta } from '../../shared/organizacaoEpisodio.mjs';
import type { Preparador } from '../../utils/envioPasta';
import { arquivoDeImagem, arquivoQualquer } from './helpers/arquivosDeImagem';
import pastasVin from '../fixtures/pastasVin-2026-11-25.json';

const MB = 1024 * 1024;
const CONFIG = { limitePaineis: 100, limiteBytes: 20 * MB, alturaMaxima: 1280, tamanhoMaximoParte: 8 * MB, arquivosPorParte: 4 };

function servidorFalso(config = CONFIG) {
  const partes: string[][] = [];
  const recebidas = new Set<string>();
  let falharNa: ((chaves: string[], n: number) => any) | null = null;
  const api = {
    getEnvioEpisodioConfig: vi.fn(async () => config),
    iniciarEnvioEpisodio: vi.fn(async (_ep: string, lidos: any[]) => {
      const org: any = organizarPasta(lidos, { limitePaineis: config.limitePaineis, limiteBytes: config.limiteBytes });
      const arquivos: any[] = [];
      for (const p of org.paineis) {
        arquivos.push({ chave: String(p.ordem), indice: p.pagina.indice, tipo: 'pagina', y: p.y, altura: p.altura, largura: p.largura });
        for (const [idioma, b] of Object.entries<any>(p.baloes)) arquivos.push({ chave: `${p.ordem}-${idioma}`, indice: b.indice, tipo: 'balao', idioma, y: p.y, altura: p.altura, largura: p.largura });
      }
      api.__total = arquivos.length;
      return { envioId: 'env1', arquivos, totalPaineis: org.totalPaineis, totalPaginas: org.totalPaginas, totalBytes: org.totalBytes, limiteBytes: config.limiteBytes, limitePaineis: config.limitePaineis };
    }),
    enviarParteEpisodio: vi.fn(async (_id: string, itens: Array<{ chave: string }>) => {
      const chaves = itens.map(i => i.chave);
      partes.push(chaves);
      const e = falharNa?.(chaves, partes.length);
      if (e) {
        if (Array.isArray(e.falhas)) chaves.filter(c => !e.falhas.includes(c)).forEach(c => recebidas.add(c));
        throw e;
      }
      chaves.forEach(c => recebidas.add(c));
      return { recebidos: recebidas.size, total: api.__total };
    }),
    concluirEnvioEpisodio: vi.fn(async () => {
      if (recebidas.size !== api.__total) throw Object.assign(new Error('Faltam arquivos'), { status: 409 });
      return { episode: { _id: 'ep1', panels: new Array(api.iniciarEnvioEpisodio.mock.results.length ? 10 : 0) }, totalPaineis: [...recebidas].filter(c => !c.includes('-')).length };
    }),
    cancelarEnvioEpisodio: vi.fn(async () => ({ cancelado: true })),
    __total: 0,
  };
  return { api, partes, falhar: (f: typeof falharNa) => { falharNa = f; } };
}

const preparador: Preparador = { preparar: async () => new Blob([new Uint8Array(1000)]), liberar: () => {} };
const semEspera = async () => {};

function abrir(s = servidorFalso(), props: Partial<React.ComponentProps<typeof EnvioPastaEpisodio>> = {}) {
  const onConcluido = vi.fn();
  const onFechar = vi.fn();
  render(<EnvioPastaEpisodio episode={{ _id: 'ep1', title: 'EP6', panels: [] }} api={s.api as any} preparador={preparador} esperar={semEspera} onConcluido={onConcluido} onFechar={onFechar} {...props} />);
  return { ...s, onConcluido, onFechar };
}

async function escolher(arquivos: File[], qual: 'pasta' | 'arquivos' = 'pasta') {
  await waitFor(() => expect(screen.getByTestId(qual === 'pasta' ? 'envio-input-pasta' : 'envio-input-arquivos')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId(qual === 'pasta' ? 'envio-input-pasta' : 'envio-input-arquivos'), { target: { files: arquivos } });
  await screen.findByTestId('conferencia-envio');
}

const dezPaginas = () => Array.from({ length: 10 }, (_, i) => arquivoDeImagem(`EP/Pagina ${String(i + 1).padStart(3, '0')}.jpg`, 800, 1280));

const problemaDo = (nome: string) => screen.getAllByTestId('problema').filter(li => li.textContent?.startsWith(`${nome}:`)).map(li => li.getAttribute('data-codigo'));

beforeEach(() => vi.clearAllMocks());

describe('conferência (item 2)', () => {
  it('cada erro aparece no arquivo certo, separado entre o que impede e o que fica de fora; nada chega à API', async () => {
    const s = abrir();
    await escolher([
      arquivoDeImagem('EP/Pagina 001.jpg', 800, 1280),
      arquivoDeImagem('EP/Pagina 001_ENG.png', 800, 1280),
      arquivoDeImagem('EP/Pagina 002.jpg', 800, 1280),
      arquivoDeImagem('EP/Pagina 2.jpeg', 800, 1280), // repetida
      arquivoDeImagem('EP/Pagina 002_ESP.png', 800, 1000), // tamanho diferente
      arquivoDeImagem('EP/Pagina 009_PORT.png', 800, 1280), // sem página
      arquivoDeImagem('EP/Pagina 003.png', 800, 1280), // png sem idioma
      arquivoDeImagem('EP/Pagina 004_ZHO.jpg', 800, 1280), // balão em jpg
      arquivoDeImagem('EP/Sem numero.jpg', 800, 1280),
      arquivoQualquer('EP/roteiro.txt'),
    ]);

    expect(problemaDo('Pagina 002.jpg')).toEqual(['pagina-repetida']);
    expect(problemaDo('Pagina 2.jpeg')).toEqual(['pagina-repetida']);
    expect(problemaDo('Pagina 002_ESP.png')).toEqual(['balao-tamanho-diferente']);
    expect(problemaDo('Pagina 009_PORT.png')).toEqual(['balao-sem-pagina']);
    expect(problemaDo('Pagina 003.png')).toEqual(['png-sem-idioma']);
    expect(problemaDo('Pagina 004_ZHO.jpg')).toEqual(['balao-em-jpg']);
    expect(problemaDo('Sem numero.jpg')).toEqual(['sem-numero']);
    expect(problemaDo('roteiro.txt')).toEqual(['tipo-invalido']);
    expect(problemaDo('Pagina 001.jpg')).toEqual([]);

    const impedem = within(screen.getByTestId('problemas-impedem'));
    expect(impedem.getAllByTestId('problema').map(li => li.getAttribute('data-codigo'))).toEqual(['pagina-repetida', 'pagina-repetida']);
    expect(screen.getByText('Pagina 009_PORT.png:').closest('[data-testid="problemas-de-fora"]')).not.toBeNull();
    expect(screen.getByText('Balão sem a página do mesmo número.')).toBeInTheDocument();

    // Problema que impede: nem a confirmação nem o Enviar ficam disponíveis.
    expect(screen.getByTestId('envio-confirmo')).toBeDisabled();
    expect(screen.getByTestId('envio-enviar')).toBeDisabled();
    expect(s.api.getEnvioEpisodioConfig).toHaveBeenCalledTimes(1);
    expect(s.api.iniciarEnvioEpisodio).not.toHaveBeenCalled();
    expect(s.api.enviarParteEpisodio).not.toHaveBeenCalled();
  });

  it('Enviar só depois de o autor confirmar; antes do clique nenhuma chamada de envio', async () => {
    const s = abrir();
    await escolher(dezPaginas(), 'arquivos');
    expect(screen.getByTestId('resumo-paineis')).toHaveTextContent('10 página(s) viram 10 painel(is) depois do corte.');
    const enviar = screen.getByTestId('envio-enviar');
    expect(enviar).toBeDisabled();
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    expect(enviar).toBeEnabled();
    expect(s.api.iniciarEnvioEpisodio).not.toHaveBeenCalled();
    fireEvent.click(enviar);
    await waitFor(() => expect(s.api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1));
    // Vai com o tamanho de cada arquivo (o servidor confere o limite de MB, se ligado).
    expect(s.api.iniciarEnvioEpisodio.mock.calls[0][1][0]).toEqual({ nome: 'EP/Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 2000 });
  });

  // Regressão (26/11/2026, pedido do Vin): "mantenha a liberação para não
  // barrar o autor pela quantidade de megabytes". O servidor manda
  // limiteBytes 0 no padrão: a conferência não avisa nem bloqueia pelo peso.
  it('sem limite de MB (padrão): pasta de 21 MB não mostra aviso de megabytes e o Enviar libera', async () => {
    const s = abrir(servidorFalso({ ...CONFIG, limiteBytes: 0 }));
    await escolher([
      arquivoDeImagem('EP/Pagina 001.jpg', 800, 12800, 12 * MB),
      arquivoDeImagem('EP/Pagina 001_ENG.png', 800, 12800, 9 * MB),
    ]);
    expect(screen.getByTestId('resumo-tamanho')).toHaveTextContent('Tamanho: 21 MB.');
    expect(screen.getByTestId('resumo-tamanho').textContent).toBe('Tamanho: 21 MB.');
    expect(screen.queryByText(/o limite é/)).toBeNull();
    expect(screen.queryByText(/que é o limite/)).toBeNull();
    expect(screen.queryByTestId('problema')).toBeNull();
    expect(screen.getByText('Limite: 100 painéis por episódio.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    expect(screen.getByTestId('envio-enviar')).toBeEnabled();
    fireEvent.click(screen.getByTestId('envio-enviar'));
    await waitFor(() => expect(s.api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1));
  });

  it('limite de MB ligado no admin (aqui 20): 21 MB somados nos originais impedem, com o tamanho em MB', async () => {
    abrir();
    await escolher([
      arquivoDeImagem('EP/Pagina 001.jpg', 800, 12800, 12 * MB),
      arquivoDeImagem('EP/Pagina 001_ENG.png', 800, 12800, 9 * MB),
    ]);
    expect(screen.getByTestId('resumo-tamanho')).toHaveTextContent('Tamanho: 21 MB de 20 MB.');
    expect(screen.getByText('Os arquivos do episódio somam 21 MB; o limite é 20 MB.')).toBeInTheDocument();
    expect(screen.getByTestId('envio-enviar')).toBeDisabled();
  });

  it('101 painéis depois do corte: aviso com os números e envio bloqueado', async () => {
    abrir();
    // JPEG guarda a altura em 16 bits (até 65.535 px): duas páginas, 50 + 51 painéis.
    await escolher([arquivoDeImagem('EP/Pagina 001.jpg', 800, 64000, 1000), arquivoDeImagem('EP/Pagina 002.jpg', 800, 64001, 1000)]);
    expect(screen.getByText('O episódio fica com 101 painéis depois do corte; o limite é 100.')).toBeInTheDocument();
    expect(screen.getByTestId('envio-enviar')).toBeDisabled();
  });

  it('The Near Ones EP6 real (subpastas art/ e dialog_xx/): 23 painéis, selos de idioma só nos painéis com balão', async () => {
    abrir();
    const arquivos = (pastasVin as any).nearOnesEp6.map((a: any) => arquivoDeImagem(`The Near Ones - T1 - EP6/${a.nome}`, a.largura, a.altura, 300));
    await escolher(arquivos);
    expect(screen.getByTestId('resumo-paineis')).toHaveTextContent('23 página(s) viram 23 painel(is)');
    expect(screen.queryByTestId('problema')).toBeNull();
    const paineis = screen.getAllByTestId('painel');
    expect(paineis).toHaveLength(23);
    const comEN = paineis.filter(p => within(p).getByTestId('selo-en').getAttribute('data-tem') === 'sim').map(p => Number(p.getAttribute('data-ordem')));
    expect(comEN).toEqual([8, 9, 10, 11, 13, 15, 16, 17]); // panel 000 é o painel #1
    expect(within(paineis[8]).getByTestId('selo-zh')).toHaveAttribute('data-tem', 'sim');
    expect(within(paineis[12]).getByTestId('selo-pt')).toHaveAttribute('data-tem', 'nao');
  });

  it('HáQa Stone EP3 real: páginas de 12.500 px aparecem cortadas em 10 fatias cada', async () => {
    abrir();
    const arquivos = (pastasVin as any).haqaStoneEp3.map((a: any) => arquivoDeImagem(a.nome, a.largura, a.altura, a.tamanho));
    await escolher(arquivos);
    expect(screen.getByTestId('resumo-paineis')).toHaveTextContent('4 página(s) viram 31 painel(is) depois do corte.');
    expect(screen.getByText('3 página(s) alta(s) cortada(s) em fatias de até 1280 px.')).toBeInTheDocument();
    expect(screen.getByTestId('resumo-tamanho')).toHaveTextContent('Tamanho: 4,7 MB de 20 MB.');
    expect(screen.getAllByText(/fatia 10 de 10/)).toHaveLength(3);
  });
});

describe('envio em partes pela tela (item 4)', () => {
  it('API falhando no arquivo 7 uma vez: tenta de novo só ele, conclui e avisa quem abriu', async () => {
    const s = servidorFalso();
    let falhou = false;
    s.falhar((chaves) => {
      if (chaves.includes('6') && !falhou) { falhou = true; return Object.assign(new Error('Bunny'), { status: 502, falhas: ['6'] }); }
      return null;
    });
    const { onConcluido } = abrir(s);
    await escolher(dezPaginas());
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));

    expect(await screen.findByRole('status')).toHaveTextContent('Episódio enviado: 10 painéis.');
    expect(s.partes).toEqual([['0', '1', '2', '3'], ['4', '5', '6', '7'], ['6'], ['8', '9']]);
    expect(s.api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1);
    expect(onConcluido).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ep1' }));
  });

  it('a conexão cai de vez: mostra o erro e "Tentar de novo", que continua sem recomeçar', async () => {
    const s = servidorFalso();
    let quedas = 0;
    s.falhar((_c, n) => (n >= 2 && quedas++ < 3 ? new TypeError('Failed to fetch') : null));
    abrir(s);
    await escolher(dezPaginas());
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));

    expect(await screen.findByRole('alert')).toHaveTextContent('O envio parou (Failed to fetch).');
    expect(screen.getByTestId('envio-progresso')).toHaveTextContent('Enviando 4 de 10 arquivos...');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Episódio enviado: 10 painéis.');
    expect(s.api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1);
    expect(s.partes.slice(-2)).toEqual([['4', '5', '6', '7'], ['8', '9']]);
  });

  it('aparelho que não abre a página alta: pede para usar o computador', async () => {
    const s = servidorFalso();
    const { ErroEnvio } = await import('../../utils/envioPasta');
    const quebrado: Preparador = {
      preparar: async () => { throw new ErroEnvio('decodificar', 'Este aparelho não conseguiu abrir Pagina 001.jpg (800 x 28160).'); },
      liberar: () => {},
    };
    abrir(s, { preparador: quebrado });
    await escolher([arquivoDeImagem('EP/Pagina 001.jpg', 800, 28160, 1000)]);
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este aparelho não conseguiu abrir Pagina 001.jpg (800 x 28160). Envie este episódio por um computador.');
  });

  it('Cancelar envio depois de parar apaga o envio aberto no servidor e fecha', async () => {
    const s = servidorFalso();
    s.falhar(() => new TypeError('Failed to fetch'));
    const { onFechar } = abrir(s);
    await escolher(dezPaginas());
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(s.api.cancelarEnvioEpisodio).toHaveBeenCalledWith('env1');
  });

  it('envio parado no meio (o pedido não responde): "Cancelar envio" funciona DURANTE o envio, aborta o pedido, apaga o envio no servidor e fecha (27/11/2026)', async () => {
    const s = servidorFalso();
    let sinal: AbortSignal | undefined;
    s.api.enviarParteEpisodio.mockImplementation(((_id: string, _itens: any, opcoes?: { sinal?: AbortSignal }) => { sinal = opcoes?.sinal; return new Promise(() => {}); }) as any);
    const { onFechar, onConcluido } = abrir(s);
    await escolher(dezPaginas());
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));
    await waitFor(() => expect(s.api.enviarParteEpisodio).toHaveBeenCalledTimes(1));

    const cancelar = screen.getByTestId('envio-cancelar');
    expect(cancelar).toBeEnabled();
    expect(cancelar).toHaveTextContent('Cancelar envio');
    fireEvent.click(cancelar);

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
    expect(sinal?.aborted).toBe(true);
    expect(s.api.cancelarEnvioEpisodio).toHaveBeenCalledWith('env1');
    expect(onConcluido).not.toHaveBeenCalled();
    // Cancelar não é erro: nada de aviso em vermelho.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recusa no iniciar (limite mudou no admin): mostra os problemas do servidor e deixa escolher de novo', async () => {
    const s = servidorFalso();
    s.api.iniciarEnvioEpisodio.mockRejectedValueOnce(Object.assign(new Error('A pasta tem problemas que impedem o envio.'), {
      status: 400,
      problemas: [{ indice: null, nome: null, codigo: 'limite-paineis', mensagem: 'x', impede: true, valor: 10, limite: 5 }],
    }));
    abrir(s);
    await escolher(dezPaginas());
    fireEvent.click(screen.getByTestId('envio-confirmo'));
    fireEvent.click(screen.getByTestId('envio-enviar'));
    expect(await screen.findByText('O episódio fica com 10 painéis depois do corte; o limite é 5.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('O envio não foi aceito: A pasta tem problemas que impedem o envio.');
    expect(screen.getByRole('button', { name: 'Escolher de novo' })).toBeInTheDocument();
  });
});
