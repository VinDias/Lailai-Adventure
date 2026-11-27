/**
 * Envio da pasta de um episódio pelo navegador (Fase 7, frente A, item 4).
 *
 * O servidor (routes/envioEpisodio.js) recebe em três passos; aqui está o lado
 * do navegador:
 *  1. lerPasta: tamanho em bytes e largura x altura de cada arquivo, lidos do
 *     CABEÇALHO (sem decodificar a imagem). É o que a tela de conferência e o
 *     `iniciar` usam.
 *  2. EnvioEmPartes.executar: corta as páginas altas em canvas, UMA imagem
 *     decodificada por vez, junta os arquivos em partes de até
 *     `tamanhoMaximoParte` e manda. Parte que falha tenta de novo sozinha;
 *     se o servidor disser quais arquivos não chegaram ao Bunny (502
 *     `falhas`), só eles vão de novo. Se ainda assim parar, chamar
 *     `executar()` outra vez continua de onde parou (o que já chegou não sobe
 *     de novo).
 *  3. concluir, só com tudo recebido (o servidor troca os painéis de uma vez).
 *
 * Memória: página de 800 x 28.160 decodificada ocupa ~90 MB; por isso o
 * corte segue a ordem dos ARQUIVOS (todas as fatias de uma imagem, depois a
 * próxima) e a imagem é liberada antes de abrir a seguinte. Arquivo que não
 * precisa de corte vai como veio, sem regravar.
 *
 * Tudo que toca o navegador de verdade (canvas, createImageBitmap) fica em
 * `preparadorDoNavegador`; o resto recebe o preparador e a API por
 * parâmetro, para ser testado sem canvas (jsdom não tem).
 */
import { tamanhoPeloCabecalho } from '../shared/organizacaoEpisodio.mjs';
import type { EnvioConfig, EnvioIniciado, RecorteEnvio } from '../services/api';

export interface ArquivoLido {
  nome: string;
  largura?: number;
  altura?: number;
  tamanho: number;
}

/** Nome com a subpasta quando veio de uma pasta (webkitdirectory). */
export function nomeDoArquivo(f: File): string {
  const rel = (f as any).webkitRelativePath;
  return typeof rel === 'string' && rel ? rel : f.name;
}

async function lerBytes(blob: Blob, ate: number): Promise<Uint8Array> {
  const pedaco = blob.slice(0, Math.min(ate, blob.size));
  const buf = typeof (pedaco as any).arrayBuffer === 'function'
    ? await pedaco.arrayBuffer()
    : await new Response(pedaco).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Largura x altura pelo cabeçalho. O SOF do JPEG vem depois dos blocos de
 * EXIF e perfil de cor, que podem passar de 64 KB: tenta 256 KB e, se não
 * achar, 4 MB.
 */
export async function lerTamanhoDaImagem(f: Blob): Promise<{ largura: number; altura: number } | null> {
  for (const ate of [256 * 1024, 4 * 1024 * 1024]) {
    const t = tamanhoPeloCabecalho(await lerBytes(f, ate));
    if (t) return t;
    if (f.size <= ate) break;
  }
  return null;
}

const EXTENSAO_DE_IMAGEM = /\.(jpe?g|png)$/i;

/** Lê a pasta inteira (só o cabeçalho de cada imagem). */
export async function lerPasta(arquivos: File[]): Promise<ArquivoLido[]> {
  const lidos: ArquivoLido[] = new Array(arquivos.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < arquivos.length) {
      const i = proximo++;
      const f = arquivos[i];
      const base: ArquivoLido = { nome: nomeDoArquivo(f), tamanho: f.size };
      if (EXTENSAO_DE_IMAGEM.test(f.name)) {
        const t = await lerTamanhoDaImagem(f).catch(() => null);
        if (t) Object.assign(base, t);
      }
      lidos[i] = base;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, arquivos.length) }, trabalhador));
  return lidos;
}

// ─── erros ──────────────────────────────────────────────────────────────────

export type TipoDeErro = 'decodificar' | 'recusado' | 'rede' | 'cancelado';

export class ErroEnvio extends Error {
  tipo: TipoDeErro;
  status?: number;
  nomeDoArquivo?: string;
  constructor(tipo: TipoDeErro, mensagem: string, extra: { status?: number; nomeDoArquivo?: string } = {}) {
    super(mensagem);
    this.tipo = tipo;
    Object.assign(this, extra);
  }
}

// ─── preparo (corte) ────────────────────────────────────────────────────────

/**
 * Preparador: devolve o Blob que sobe para um recorte. `abrir(indice)` é
 * chamado antes das fatias de cada arquivo e `liberar()` depois da última,
 * para a imagem decodificada não ficar na memória.
 */
export interface Preparador {
  preparar(arquivo: File, recorte: RecorteEnvio, original: ArquivoLido): Promise<Blob>;
  liberar(): void;
}

/** O recorte é o arquivo inteiro: vai como veio. */
export function recorteEhOArquivoInteiro(recorte: RecorteEnvio, original: ArquivoLido): boolean {
  if (recorte.tipo === 'capa') return true;
  return recorte.y === 0 && recorte.altura === original.altura && recorte.largura === original.largura;
}

const QUALIDADE_JPEG = 0.9; // medido em 25/11: fatias a 0,9 somam ~0,95 do original

/** Preparador real: createImageBitmap (ou <img>) e canvas do tamanho da fatia. */
export function preparadorDoNavegador(): Preparador {
  let aberto: { arquivo: File; fonte: ImageBitmap | HTMLImageElement; url?: string } | null = null;

  const liberar = () => {
    if (!aberto) return;
    if (typeof (aberto.fonte as ImageBitmap).close === 'function') (aberto.fonte as ImageBitmap).close();
    if (aberto.url) URL.revokeObjectURL(aberto.url);
    aberto = null;
  };

  const decodificar = async (arquivo: File, original: ArquivoLido) => {
    if (aberto && aberto.arquivo === arquivo) return aberto.fonte;
    liberar();
    const nome = nomeDoArquivo(arquivo);
    const falhou = () => new ErroEnvio('decodificar', `Este aparelho não conseguiu abrir ${nome} (${original.largura} x ${original.altura}).`, { nomeDoArquivo: nome });
    try {
      if (typeof createImageBitmap === 'function') {
        const fonte = await createImageBitmap(arquivo);
        aberto = { arquivo, fonte };
      } else {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.src = url;
        await img.decode();
        aberto = { arquivo, fonte: img, url };
      }
    } catch {
      throw falhou();
    }
    const w = (aberto.fonte as any).width;
    const h = (aberto.fonte as any).height;
    // Navegador que reduz imagem grande demais (alguns celulares) devolve
    // outro tamanho: cortar assim desalinharia o balão da página.
    if (w !== original.largura || h !== original.altura) {
      liberar();
      throw falhou();
    }
    return aberto.fonte;
  };

  return {
    liberar,
    async preparar(arquivo, recorte, original) {
      if (recorteEhOArquivoInteiro(recorte, original)) return arquivo;
      const fonte = await decodificar(arquivo, original);
      const canvas = document.createElement('canvas');
      canvas.width = recorte.largura as number;
      canvas.height = recorte.altura as number;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ErroEnvio('decodificar', 'Este aparelho não conseguiu cortar as páginas.');
      ctx.drawImage(fonte, 0, recorte.y as number, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const tipo = recorte.tipo === 'balao' ? 'image/png' : 'image/jpeg';
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, tipo, tipo === 'image/jpeg' ? QUALIDADE_JPEG : undefined));
      // Safari segura a memória do canvas até ele ser zerado.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new ErroEnvio('decodificar', `Este aparelho não conseguiu cortar ${nomeDoArquivo(arquivo)}.`, { nomeDoArquivo: nomeDoArquivo(arquivo) });
      return blob;
    },
  };
}

// ─── envio em partes ────────────────────────────────────────────────────────

export interface ApiDoEnvio {
  iniciarEnvioEpisodio(episodeId: string, arquivos: ArquivoLido[]): Promise<EnvioIniciado>;
  /** `sinal`: aborta o pedido (parte que passou do tempo, ou envio cancelado). */
  enviarParteEpisodio(envioId: string, itens: Array<{ chave: string; blob: Blob; nome: string }>, opcoes?: { sinal?: AbortSignal }): Promise<{ recebidos: number; total: number }>;
  concluirEnvioEpisodio(envioId: string): Promise<{ episode: any; totalPaineis: number }>;
  cancelarEnvioEpisodio(envioId: string): Promise<any>;
}

export interface Progresso {
  fase: 'iniciando' | 'enviando' | 'concluindo' | 'pronto';
  enviados: number;
  total: number;
}

export interface OpcoesDoEnvio {
  episodeId: string;
  arquivos: File[];
  lidos: ArquivoLido[];
  config: Pick<EnvioConfig, 'tamanhoMaximoParte' | 'arquivosPorParte'>;
  api: ApiDoEnvio;
  preparador?: Preparador;
  onProgresso?: (p: Progresso) => void;
  /** Tentativas por parte antes de parar e devolver o erro (padrão 3). */
  tentativas?: number;
  /** Bytes por parte que a tela procura não passar (padrão TAMANHO_ALVO_DA_PARTE). */
  tamanhoAlvoDaParte?: number;
  /** Tempo máximo (ms) de UM pedido de parte, pelo tamanho dela; trocado nos testes. */
  tempoLimiteDaParte?: (bytes: number) => number;
  /** Espera entre tentativas (ms), por tentativa; trocado nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

type Item = { chave: string; blob: Blob; nome: string };

const ESPERAS = [1000, 3000, 9000];

/**
 * Retorno do cliente em 27/11/2026: "A primeira vez que tentei, travou,
 * depois não deu mais esse defeito." Dois caminhos deixavam o envio PARADO NA
 * TELA sem erro e sem saída:
 *
 * 1. O servidor aceita partes de até 8 MB e 60 arquivos, e a tela juntava
 *    tudo o que coubesse. Um episódio de 6 MB ia numa parte SÓ: a barra
 *    ficava em "0 de N" o envio inteiro (em conexão lenta, mais de um minuto)
 *    e pulava para o fim. Agora a tela fecha a parte em 2 MB: a barra anda.
 *    Um arquivo sozinho maior que isso continua indo (até o máximo do
 *    servidor).
 * 2. O pedido de uma parte não tinha tempo máximo. Conexão que para no meio
 *    (celular trocando de rede, Wi-Fi que cai sem fechar a conexão) deixava o
 *    envio esperando para sempre, com o botão de cancelar desligado. Agora
 *    cada pedido tem um prazo pelo tamanho da parte (velocidade mínima de
 *    20 KB/s, mais 1 minuto para o servidor repassar ao Bunny); passou, o
 *    pedido é abortado e conta como queda de rede: tenta de novo sozinho e,
 *    se não der, para com "Tentar de novo".
 */
export const TAMANHO_ALVO_DA_PARTE = 2 * 1024 * 1024;
const FOLGA_DO_SERVIDOR_MS = 60 * 1000;
const BYTES_POR_SEGUNDO_MINIMOS = 20 * 1000;
export function tempoLimiteDaParte(bytes: number): number {
  return FOLGA_DO_SERVIDOR_MS + Math.ceil((Math.max(0, bytes) / BYTES_POR_SEGUNDO_MINIMOS) * 1000);
}
const esperaPadrao = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Status em que tentar de novo não adianta: o servidor recusou de verdade. */
const RECUSA_DEFINITIVA = new Set([400, 403, 404, 409, 411, 413]);

function extensaoDoItem(r: RecorteEnvio, arquivo: File): string {
  if (r.tipo === 'balao') return 'png';
  if (r.tipo === 'capa') return /\.png$/i.test(arquivo.name) ? 'png' : 'jpg';
  return 'jpg';
}

export class EnvioEmPartes {
  private o: OpcoesDoEnvio;
  private preparador: Preparador;
  private tentativas: number;
  private esperar: (ms: number) => Promise<void>;
  private alvoDaParte: number;
  private tempoLimite: (bytes: number) => number;
  /** Interrompe o pedido de parte em curso (cancelar). */
  private interromper: (() => void) | null = null;
  cancelado = false;
  envioId: string | null = null;
  recortes: RecorteEnvio[] = [];
  readonly recebidas = new Set<string>();
  concluido = false;

  constructor(o: OpcoesDoEnvio) {
    this.o = o;
    this.preparador = o.preparador ?? preparadorDoNavegador();
    this.tentativas = o.tentativas ?? 3;
    this.esperar = o.esperar ?? esperaPadrao;
    this.alvoDaParte = o.tamanhoAlvoDaParte ?? TAMANHO_ALVO_DA_PARTE;
    this.tempoLimite = o.tempoLimiteDaParte ?? tempoLimiteDaParte;
  }

  private conferirCancelamento() {
    if (this.cancelado) throw new ErroEnvio('cancelado', 'Envio cancelado.');
  }

  private avisar(fase: Progresso['fase']) {
    this.o.onProgresso?.({ fase, enviados: this.recebidas.size, total: this.recortes.length });
  }

  /**
   * Faz o que falta: inicia (uma vez), manda o que não chegou e conclui.
   * Lança ErroEnvio; chamar de novo continua do ponto em que parou.
   */
  async executar(): Promise<{ episode: any; totalPaineis: number }> {
    if (!this.envioId) {
      this.avisar('iniciando');
      const r = await this.o.api.iniciarEnvioEpisodio(this.o.episodeId, this.o.lidos);
      this.envioId = r.envioId;
      this.recortes = r.arquivos;
      // Cancelado enquanto o servidor abria o envio: não deixa ele aberto lá.
      if (this.cancelado) await this.o.api.cancelarEnvioEpisodio(r.envioId).catch(() => undefined);
    }
    this.conferirCancelamento();
    this.avisar('enviando');
    try {
      await this.enviarPendentes();
    } finally {
      this.preparador.liberar();
    }
    this.conferirCancelamento();
    this.avisar('concluindo');
    const fim = await this.o.api.concluirEnvioEpisodio(this.envioId as string);
    this.concluido = true;
    this.avisar('pronto');
    return fim;
  }

  async cancelar(): Promise<void> {
    this.cancelado = true;
    this.interromper?.();
    this.preparador.liberar();
    if (this.envioId && !this.concluido) await this.o.api.cancelarEnvioEpisodio(this.envioId).catch(() => undefined);
  }

  private async enviarPendentes() {
    const { tamanhoMaximoParte, arquivosPorParte } = this.o.config;
    // A parte fecha no menor dos dois: o máximo do servidor e o alvo da tela.
    const bytesPorParte = Math.min(tamanhoMaximoParte, this.alvoDaParte);
    // Ordem dos arquivos de origem (e da fatia dentro dele): uma imagem
    // decodificada por vez. O servidor não depende da ordem de chegada.
    const pendentes = this.recortes
      .filter(r => !this.recebidas.has(r.chave))
      .sort((a, b) => a.indice - b.indice || (a.y ?? 0) - (b.y ?? 0));

    let parte: Item[] = [];
    let bytes = 0;
    let indiceAberto: number | null = null;

    for (const r of pendentes) {
      if (indiceAberto !== null && indiceAberto !== r.indice) this.preparador.liberar();
      indiceAberto = r.indice;
      const arquivo = this.o.arquivos[r.indice];
      const blob = await this.preparador.preparar(arquivo, r, this.o.lidos[r.indice]);
      if (blob.size > tamanhoMaximoParte) {
        throw new ErroEnvio('recusado', `${nomeDoArquivo(arquivo)} passa do tamanho máximo de uma parte do envio.`, { nomeDoArquivo: nomeDoArquivo(arquivo) });
      }
      this.conferirCancelamento();
      if (parte.length > 0 && (bytes + blob.size > bytesPorParte || parte.length >= arquivosPorParte)) {
        await this.mandarParte(parte);
        parte = [];
        bytes = 0;
      }
      parte.push({ chave: r.chave, blob, nome: `${r.chave}.${extensaoDoItem(r, arquivo)}` });
      bytes += blob.size;
    }
    if (parte.length > 0) await this.mandarParte(parte);
  }

  /**
   * Um pedido de parte, com prazo. Rejeita com erro de rede (sem `status`) se
   * o prazo vencer, e com ErroEnvio 'cancelado' se o envio for cancelado; nos
   * dois casos o pedido é abortado.
   */
  private pedirParte(itens: Item[]): Promise<unknown> {
    const controle = typeof AbortController === 'function' ? new AbortController() : null;
    const bytes = itens.reduce((s, it) => s + it.blob.size, 0);
    return new Promise((resolve, reject) => {
      let acabou = false;
      const fim = (f: () => void) => {
        if (acabou) return;
        acabou = true;
        clearTimeout(prazo);
        this.interromper = null;
        f();
      };
      const prazo = setTimeout(() => {
        controle?.abort();
        fim(() => reject(new Error('a parte demorou demais para subir')));
      }, this.tempoLimite(bytes));
      this.interromper = () => {
        controle?.abort();
        fim(() => reject(new ErroEnvio('cancelado', 'Envio cancelado.')));
      };
      this.o.api.enviarParteEpisodio(this.envioId as string, itens, controle ? { sinal: controle.signal } : undefined)
        .then(r => fim(() => resolve(r)), e => fim(() => reject(e)));
    });
  }

  /** Manda uma parte; nas falhas, tenta de novo só o que não chegou. */
  private async mandarParte(itens: Item[]) {
    let faltam = itens;
    let ultimo: any = null;
    for (let tentativa = 0; tentativa < this.tentativas && faltam.length > 0; tentativa++) {
      if (tentativa > 0) await this.esperar(ESPERAS[Math.min(tentativa - 1, ESPERAS.length - 1)]);
      this.conferirCancelamento();
      try {
        await this.pedirParte(faltam);
        for (const it of faltam) this.recebidas.add(it.chave);
        faltam = [];
      } catch (e: any) {
        if (e instanceof ErroEnvio && e.tipo === 'cancelado') throw e;
        if (this.cancelado) throw new ErroEnvio('cancelado', 'Envio cancelado.');
        ultimo = e;
        if (e?.status && RECUSA_DEFINITIVA.has(e.status)) {
          throw new ErroEnvio('recusado', e.message || 'O servidor recusou esta parte do envio.', { status: e.status });
        }
        if (Array.isArray(e?.falhas) && e.falhas.length > 0) {
          const falhas = new Set<string>(e.falhas);
          for (const it of faltam) if (!falhas.has(it.chave)) this.recebidas.add(it.chave);
          faltam = faltam.filter(it => falhas.has(it.chave));
        }
      }
      this.avisar('enviando');
    }
    if (faltam.length > 0) {
      throw new ErroEnvio('rede', ultimo?.message || 'A conexão falhou no meio do envio.', { status: ultimo?.status });
    }
  }
}
