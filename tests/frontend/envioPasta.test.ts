/**
 * Frente A, item 4: o envio em partes pelo navegador (utils/envioPasta.ts).
 *
 * Critério do plano: "frontend com a API falsa falhando no arquivo 7 uma
 * vez: a tela tenta de novo só ele e conclui; contagem do progresso". E o
 * risco de memória (pm2 reinicia acima de 500 MB; o envio em lote antigo
 * guarda tudo): nenhuma parte passa de `tamanhoMaximoParte`, e o corte abre
 * UMA imagem por vez, na ordem dos arquivos.
 *
 * A API e o preparador (canvas) são falsos: jsdom não tem canvas. O corte de
 * verdade é conferido no Chromium com as pastas do Vin (item 5).
 */
import { describe, it, expect, vi } from 'vitest';
import { organizarPasta } from '../../shared/organizacaoEpisodio.mjs';
import { EnvioEmPartes, ErroEnvio, lerPasta, lerTamanhoDaImagem, recorteEhOArquivoInteiro, tempoLimiteDaParte, TAMANHO_ALVO_DA_PARTE, type ArquivoLido, type Preparador, type Progresso } from '../../utils/envioPasta';
import type { RecorteEnvio } from '../../services/api';
import { arquivoDeImagem, arquivoQualquer } from './helpers/arquivosDeImagem';

/** O que o servidor devolve no iniciar (services/envioEpisodioService.js). */
function recortesComoOServidor(lidos: ArquivoLido[]): RecorteEnvio[] {
  const org: any = organizarPasta(lidos);
  const out: RecorteEnvio[] = [];
  for (const p of org.paineis) {
    out.push({ chave: String(p.ordem), indice: p.pagina.indice, tipo: 'pagina', y: p.y, altura: p.altura, largura: p.largura });
    for (const [idioma, b] of Object.entries<any>(p.baloes)) {
      out.push({ chave: `${p.ordem}-${idioma}`, indice: b.indice, tipo: 'balao', idioma: idioma as any, y: p.y, altura: p.altura, largura: p.largura });
    }
  }
  return out;
}

function preparadorFalso(tamanho = 1000) {
  const chamadas: Array<{ indice: number; chave: string }> = [];
  let liberacoes = 0;
  const p: Preparador & { chamadas: typeof chamadas; liberacoes: () => number } = {
    chamadas,
    liberacoes: () => liberacoes,
    async preparar(arquivo, recorte) {
      chamadas.push({ indice: recorte.indice, chave: recorte.chave });
      return new Blob([new Uint8Array(tamanho)]);
    },
    liberar() { liberacoes++; },
  };
  return p;
}

type Comportamento = (chaves: string[], n: number) => void; // lança para falhar

function apiFalsa(recortes: RecorteEnvio[], comportamento: Comportamento = () => {}) {
  const partes: string[][] = [];
  const recebidas = new Set<string>();
  const api = {
    iniciarEnvioEpisodio: vi.fn(async () => ({ envioId: 'env1', arquivos: recortes, totalPaineis: 0, totalPaginas: 0, totalBytes: 0, limiteBytes: 0, limitePaineis: 100 })),
    enviarParteEpisodio: vi.fn(async (_id: string, itens: Array<{ chave: string; blob: Blob }>) => {
      const chaves = itens.map(i => i.chave);
      partes.push(chaves);
      try {
        comportamento(chaves, partes.length);
      } catch (e: any) {
        // Como o servidor: no 502, o que não está em `falhas` chegou ao Bunny.
        if (Array.isArray(e.falhas)) chaves.filter(c => !e.falhas.includes(c)).forEach(c => recebidas.add(c));
        throw e;
      }
      chaves.forEach(c => recebidas.add(c));
      return { recebidos: recebidas.size, total: recortes.length };
    }),
    concluirEnvioEpisodio: vi.fn(async () => {
      if (recebidas.size !== recortes.length) throw Object.assign(new Error('Faltam arquivos'), { status: 409 });
      return { episode: { _id: 'ep1' }, totalPaineis: recortes.filter(r => r.tipo === 'pagina').length };
    }),
    cancelarEnvioEpisodio: vi.fn(async () => ({ cancelado: true })),
  };
  return { api, partes, recebidas };
}

const dezPaginas = () => Array.from({ length: 10 }, (_, i) => arquivoDeImagem(`EP/Pagina ${String(i + 1).padStart(3, '0')}.jpg`, 800, 1280));
const semEspera = vi.fn(async (_ms: number) => {});

async function montar(arquivos: File[], comportamento?: Comportamento, config = { tamanhoMaximoParte: 8 * 1024 * 1024, arquivosPorParte: 4 }) {
  const lidos = await lerPasta(arquivos);
  const recortes = recortesComoOServidor(lidos);
  const falsa = apiFalsa(recortes, comportamento);
  const preparador = preparadorFalso();
  const progresso: any[] = [];
  const envio = new EnvioEmPartes({ episodeId: 'ep1', arquivos, lidos, config, api: falsa.api, preparador, esperar: semEspera, onProgresso: p => progresso.push(p) });
  return { envio, ...falsa, preparador, progresso, recortes, lidos };
}

describe('leitura da pasta (só o cabeçalho)', () => {
  it('largura x altura de JPEG e PNG, nome com a subpasta, tamanho em bytes; outro tipo fica sem dimensão', async () => {
    const lidos = await lerPasta([
      arquivoDeImagem('The Near Ones - T1 - EP6/art/panel 008.jpg', 800, 1280, 102459),
      arquivoDeImagem('The Near Ones - T1 - EP6/dialog_en/panel 008_ENG.png', 800, 1280, 93687),
      arquivoQualquer('roteiro.txt', 50),
    ]);
    expect(lidos).toEqual([
      { nome: 'The Near Ones - T1 - EP6/art/panel 008.jpg', largura: 800, altura: 1280, tamanho: 102459 },
      { nome: 'The Near Ones - T1 - EP6/dialog_en/panel 008_ENG.png', largura: 800, altura: 1280, tamanho: 93687 },
      { nome: 'roteiro.txt', tamanho: 50 },
    ]);
  });

  it('JPEG com EXIF de 300 KB antes do tamanho ainda é lido (segunda leitura maior)', async () => {
    const f = arquivoDeImagem('Pagina 001.jpg', 800, 28160, 400 * 1024, 300 * 1024);
    expect(await lerTamanhoDaImagem(f)).toEqual({ largura: 800, altura: 28160 });
  });
});

describe('envio em partes', () => {
  it('API falhando no arquivo 7 uma vez: tenta de novo só ele e conclui; progresso conta até 10 de 10', async () => {
    let falhou = false;
    const { envio, partes, api, progresso } = await montar(dezPaginas(), (chaves) => {
      if (chaves.includes('6') && !falhou) { // o 7o arquivo (chave 6)
        falhou = true;
        throw Object.assign(new Error('Parte dos arquivos não chegou ao Bunny.'), { status: 502, falhas: ['6'] });
      }
    });
    const fim = await envio.executar();
    expect(fim.totalPaineis).toBe(10);
    expect(partes).toEqual([['0', '1', '2', '3'], ['4', '5', '6', '7'], ['6'], ['8', '9']]);
    expect(api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1);
    expect(api.concluirEnvioEpisodio).toHaveBeenCalledTimes(1);

    const enviados = progresso.filter(p => p.fase === 'enviando').map(p => p.enviados);
    expect(enviados).toEqual([...enviados].sort((a, b) => a - b)); // nunca anda para trás
    expect(enviados).toContain(7); // a parte com falha contou os 3 que chegaram
    expect(progresso.at(-1)).toEqual({ fase: 'pronto', enviados: 10, total: 10 });
  });

  it('queda de rede na parte: manda a parte inteira de novo, com espera crescente, e conclui', async () => {
    let quedas = 0;
    const { envio, partes } = await montar(dezPaginas(), (_c, n) => {
      if (n >= 2 && quedas < 2) { quedas++; throw new TypeError('Failed to fetch'); }
    });
    semEspera.mockClear();
    await envio.executar();
    expect(partes.slice(1, 4)).toEqual([['4', '5', '6', '7'], ['4', '5', '6', '7'], ['4', '5', '6', '7']]);
    expect(semEspera.mock.calls.map(c => c[0])).toEqual([1000, 3000]);
  });

  it('três quedas seguidas param com erro de rede; executar de novo continua sem reiniciar nem reenviar o que chegou', async () => {
    let quedas = 0;
    const { envio, partes, api } = await montar(dezPaginas(), (_c, n) => {
      if (n >= 2 && quedas < 3) { quedas++; throw new TypeError('Failed to fetch'); }
    });
    const erro = await envio.executar().catch(e => e);
    expect(erro).toBeInstanceOf(ErroEnvio);
    expect(erro.tipo).toBe('rede');
    expect(api.concluirEnvioEpisodio).not.toHaveBeenCalled();

    partes.length = 0;
    await envio.executar();
    expect(api.iniciarEnvioEpisodio).toHaveBeenCalledTimes(1);
    expect(partes).toEqual([['4', '5', '6', '7'], ['8', '9']]);
    expect(api.concluirEnvioEpisodio).toHaveBeenCalledTimes(1);
  });

  it('recusa do servidor (400) não é tentada de novo', async () => {
    const { envio, partes } = await montar(dezPaginas(), () => {
      throw Object.assign(new Error('Parte recusada: arquivos fora do esperado.'), { status: 400 });
    });
    const erro = await envio.executar().catch(e => e);
    expect(erro.tipo).toBe('recusado');
    expect(erro.message).toContain('Parte recusada');
    expect(partes).toHaveLength(1);
  });

  it('nenhuma parte passa do tamanho máximo (memória do servidor); arquivo maior que a parte para com aviso', async () => {
    const arquivos = dezPaginas();
    const { envio, partes, preparador } = await montar(arquivos, undefined, { tamanhoMaximoParte: 3500, arquivosPorParte: 60 });
    await envio.executar(); // 1000 bytes cada: 3 por parte
    expect(partes.map(p => p.length)).toEqual([3, 3, 3, 1]);
    expect(preparador.chamadas).toHaveLength(10);

    const grande = await montar(arquivos, undefined, { tamanhoMaximoParte: 500, arquivosPorParte: 60 });
    const erro = await grande.envio.executar().catch(e => e);
    expect(erro.tipo).toBe('recusado');
    expect(erro.message).toContain('Pagina 001.jpg');
  });

  it('corte na ordem dos arquivos: todas as fatias de uma imagem antes da próxima, e a imagem é liberada ao trocar', async () => {
    // Página de 3000 px (3 fatias) com balão EN: o servidor intercala página e
    // balão por painel; o navegador não pode abrir as duas imagens 3 vezes.
    const arquivos = [arquivoDeImagem('Pagina 001.jpg', 800, 3000), arquivoDeImagem('Pagina 001_ENG.png', 800, 3000)];
    const { envio, recortes, preparador } = await montar(arquivos);
    expect(recortes.map(r => r.chave)).toEqual(['0', '0-en', '1', '1-en', '2', '2-en']);
    await envio.executar();
    expect(preparador.chamadas.map(c => c.indice)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(preparador.liberacoes()).toBeGreaterThanOrEqual(2); // ao trocar e no fim
  });

  it('arquivo que não precisa de corte vai como veio (sem regravar)', () => {
    const lido = { nome: 'Pagina 001.jpg', largura: 800, altura: 1280, tamanho: 100 };
    expect(recorteEhOArquivoInteiro({ chave: '0', indice: 0, tipo: 'pagina', y: 0, altura: 1280, largura: 800 }, lido)).toBe(true);
    expect(recorteEhOArquivoInteiro({ chave: '0', indice: 0, tipo: 'pagina', y: 0, altura: 1280, largura: 800 }, { ...lido, altura: 3000 })).toBe(false);
    expect(recorteEhOArquivoInteiro({ chave: 'capa', indice: 0, tipo: 'capa', y: null, altura: null, largura: null }, lido)).toBe(true);
  });

  it('cancelar chama a API só se o envio já começou e não terminou', async () => {
    const a = await montar(dezPaginas());
    await a.envio.cancelar();
    expect(a.api.cancelarEnvioEpisodio).not.toHaveBeenCalled();

    let quedas = 0;
    const b = await montar(dezPaginas(), () => { if (quedas++ < 5) throw new TypeError('Failed to fetch'); });
    await b.envio.executar().catch(() => undefined);
    await b.envio.cancelar();
    expect(b.api.cancelarEnvioEpisodio).toHaveBeenCalledWith('env1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Retorno do cliente em 27/11/2026: "A primeira vez que tentei, travou, depois
// não deu mais esse defeito." Os dois caminhos em que o envio ficava PARADO na
// tela sem erro e sem saída (ver o comentário em utils/envioPasta.ts).
// ═══════════════════════════════════════════════════════════════════════════
describe('o envio não fica parado na tela', () => {
  const KB = 1024;
  const MB = 1024 * KB;

  async function montarCom(opcoes: { tamanhoDoArquivo?: number; api?: (falsa: ReturnType<typeof apiFalsa>) => void; extra?: Record<string, unknown> } = {}) {
    const arquivos = dezPaginas();
    const lidos = await lerPasta(arquivos);
    const recortes = recortesComoOServidor(lidos);
    const falsa = apiFalsa(recortes);
    opcoes.api?.(falsa);
    const progresso: Progresso[] = [];
    const envio = new EnvioEmPartes({
      episodeId: 'ep1', arquivos, lidos,
      // Os limites do SERVIDOR em produção: 8 MB e 60 arquivos por parte.
      config: { tamanhoMaximoParte: 8 * MB, arquivosPorParte: 60 },
      api: falsa.api, preparador: preparadorFalso(opcoes.tamanhoDoArquivo ?? 1000), esperar: semEspera,
      onProgresso: p => progresso.push(p), ...(opcoes.extra ?? {}),
    });
    return { envio, ...falsa, progresso };
  }

  it('episódio de 6 MB (caberia numa parte só do servidor) sobe em partes de até 2 MB: a barra anda durante o envio em vez de ficar em 0 até o fim', async () => {
    const { envio, partes, progresso } = await montarCom({ tamanhoDoArquivo: 600 * KB });
    await envio.executar();
    expect(partes.map(p => p.length)).toEqual([3, 3, 3, 1]);
    const andou = progresso.filter(p => p.fase === 'enviando').map(p => p.enviados);
    expect(andou).toEqual([0, 3, 6, 9, 10]);
  });

  it('arquivo sozinho maior que 2 MB continua indo (até o máximo do servidor), numa parte só dele', async () => {
    const { envio, partes } = await montarCom({ tamanhoDoArquivo: 3 * MB });
    await envio.executar();
    expect(partes.map(p => p.length)).toEqual(new Array(10).fill(1));
  });

  it('parte que não responde (conexão parada): vence o prazo, o pedido é abortado, tenta de novo sozinho e conclui', async () => {
    const sinais: AbortSignal[] = [];
    let chamadas = 0;
    const { envio, api } = await montarCom({
      extra: { tempoLimiteDaParte: () => 25 },
      api: (falsa) => {
        const original = falsa.api.enviarParteEpisodio.getMockImplementation()!;
        falsa.api.enviarParteEpisodio.mockImplementation(async (id: string, itens: any, opcoes?: { sinal?: AbortSignal }) => {
          chamadas += 1;
          if (opcoes?.sinal) sinais.push(opcoes.sinal);
          // A 1a tentativa nunca responde, como uma conexão que parou.
          if (chamadas === 1) return new Promise(() => {}) as any;
          return (original as any)(id, itens);
        });
      },
    });
    const fim = await envio.executar();
    expect(fim.totalPaineis).toBe(10);
    expect(api.enviarParteEpisodio).toHaveBeenCalledTimes(2);
    expect(sinais[0].aborted).toBe(true);
    expect(sinais[1].aborted).toBe(false);
  });

  it('nenhuma tentativa responde: para com erro de rede (dá para tentar de novo) em vez de esperar para sempre', async () => {
    const { envio, api } = await montarCom({
      extra: { tempoLimiteDaParte: () => 15 },
      api: (falsa) => { falsa.api.enviarParteEpisodio.mockImplementation(() => new Promise(() => {}) as any); },
    });
    const erro = await envio.executar().catch(e => e);
    expect(erro).toBeInstanceOf(ErroEnvio);
    expect(erro.tipo).toBe('rede');
    expect(erro.message).toMatch(/demorou demais/);
    expect(api.enviarParteEpisodio).toHaveBeenCalledTimes(3);
    expect(api.concluirEnvioEpisodio).not.toHaveBeenCalled();
  });

  it('o prazo de uma parte acompanha o tamanho: nunca menos de 1 minuto, e uma parte de 8 MB tem minutos, não segundos', () => {
    expect(tempoLimiteDaParte(0)).toBe(60_000);
    expect(tempoLimiteDaParte(2 * MB)).toBeGreaterThan(2 * 60_000);
    expect(tempoLimiteDaParte(2 * MB)).toBeLessThan(4 * 60_000);
    expect(tempoLimiteDaParte(8 * MB)).toBeGreaterThan(6 * 60_000);
    expect(TAMANHO_ALVO_DA_PARTE).toBe(2 * MB);
  });

  it('cancelar DURANTE o envio aborta o pedido em curso, termina como cancelado e apaga o envio aberto no servidor', async () => {
    let sinal: AbortSignal | undefined;
    const { envio, api } = await montarCom({
      api: (falsa) => {
        falsa.api.enviarParteEpisodio.mockImplementation((_id: string, _itens: any, opcoes?: { sinal?: AbortSignal }) => { sinal = opcoes?.sinal; return new Promise(() => {}) as any; });
      },
    });
    const execucao = envio.executar().catch(e => e);
    await vi.waitFor(() => expect(api.enviarParteEpisodio).toHaveBeenCalledTimes(1));
    await envio.cancelar();
    const erro = await execucao;
    expect(erro).toBeInstanceOf(ErroEnvio);
    expect(erro.tipo).toBe('cancelado');
    expect(sinal?.aborted).toBe(true);
    expect(api.cancelarEnvioEpisodio).toHaveBeenCalledWith('env1');
    expect(api.enviarParteEpisodio).toHaveBeenCalledTimes(1);
    expect(api.concluirEnvioEpisodio).not.toHaveBeenCalled();
  });
});
