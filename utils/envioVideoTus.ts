/**
 * Envio do vídeo do episódio DIRETO do navegador ao Bunny Stream, pelo
 * protocolo TUS (Fase 7, frente A, item 9). O arquivo não passa pela VPS.
 *
 * O servidor entrega uma autorização de curta duração para UM vídeo
 * (POST /api/portal/episodios/:id/video/autorizacao); aqui o arquivo sobe em
 * pedaços, com ela em cada pedido:
 *
 *   1. POST  <endpoint>            cria o envio (Upload-Length); a resposta
 *                                  traz o endereço dele em `Location`;
 *   2. PATCH <endereço> (N vezes)  um pedaço por pedido, a partir de
 *                                  `Upload-Offset`;
 *   3. se um pedaço falha: HEAD <endereço> diz até onde o Bunny recebeu, e o
 *      envio continua dali (nova tentativa só do que faltou).
 *
 * Cliente TUS próprio, pequeno, em vez de uma biblioteca: só o que este envio
 * usa (criar, enviar em pedaços, retomar), com o XMLHttpRequest injetável
 * para os testes rodarem com um Bunny falso.
 */

export interface AutorizacaoTus {
  videoId: string;
  libraryId: string;
  endpoint: string;
  assinatura: string;
  /** Instante (segundos) até o qual o Bunny aceita pedidos com esta assinatura. */
  expira: number;
  validadeSegundos?: number;
  tamanhoMaximo?: number;
}

export interface OpcoesEnvioTus {
  arquivo: Blob;
  nome: string;
  tipo: string;
  autorizacao: AutorizacaoTus;
  /** Pede outra autorização para o MESMO vídeo quando a atual está para vencer. */
  renovar?: () => Promise<AutorizacaoTus>;
  aoProgredir?: (enviados: number, total: number) => void;
  sinal?: AbortSignal;
  tamanhoDoPedaco?: number;
  tentativasPorPedaco?: number;
  esperaEntreTentativasMs?: number;
  agora?: () => number;
  criarXhr?: () => XMLHttpRequest;
}

export type TipoErroEnvioVideo = 'rede' | 'recusado' | 'cancelado';

export class ErroEnvioVideo extends Error {
  tipo: TipoErroEnvioVideo;
  status?: number;
  constructor(tipo: TipoErroEnvioVideo, mensagem: string, status?: number) {
    super(mensagem);
    this.name = 'ErroEnvioVideo';
    this.tipo = tipo;
    this.status = status;
  }
}

export const TAMANHO_DO_PEDACO_PADRAO = 8 * 1024 * 1024;
const VERSAO_TUS = '1.0.0';
// Renova a autorização quando faltar menos que isto para vencer.
const MARGEM_DE_RENOVACAO_S = 120;

interface Resposta {
  status: number;
  cabecalho: (nome: string) => string | null;
}

function base64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  bytes.forEach(b => { binario += String.fromCharCode(b); });
  return btoa(binario);
}

function pedir(
  opcoes: OpcoesEnvioTus,
  metodo: string,
  url: string,
  cabecalhos: Record<string, string>,
  corpo: Blob | null,
  aoEnviar?: (bytes: number) => void,
): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    if (opcoes.sinal?.aborted) { reject(new ErroEnvioVideo('cancelado', 'Envio cancelado.')); return; }
    const xhr = opcoes.criarXhr ? opcoes.criarXhr() : new XMLHttpRequest();
    xhr.open(metodo, url, true);
    for (const [nome, valor] of Object.entries(cabecalhos)) xhr.setRequestHeader(nome, valor);
    if (aoEnviar && xhr.upload) xhr.upload.onprogress = (e: ProgressEvent) => aoEnviar(e.loaded);
    const aoAbortar = () => xhr.abort();
    opcoes.sinal?.addEventListener('abort', aoAbortar);
    const fim = () => opcoes.sinal?.removeEventListener('abort', aoAbortar);
    xhr.onload = () => { fim(); resolve({ status: xhr.status, cabecalho: (n) => xhr.getResponseHeader(n) }); };
    xhr.onerror = () => { fim(); reject(new ErroEnvioVideo('rede', 'falha de rede')); };
    xhr.ontimeout = () => { fim(); reject(new ErroEnvioVideo('rede', 'tempo esgotado')); };
    xhr.onabort = () => { fim(); reject(new ErroEnvioVideo('cancelado', 'Envio cancelado.')); };
    xhr.send(corpo);
  });
}

function cabecalhosDaAutorizacao(a: AutorizacaoTus): Record<string, string> {
  return {
    'Tus-Resumable': VERSAO_TUS,
    AuthorizationSignature: a.assinatura,
    AuthorizationExpire: String(a.expira),
    VideoId: a.videoId,
    LibraryId: String(a.libraryId),
  };
}

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Envia o arquivo inteiro. Resolve quando o Bunny confirmou o último pedaço.
 * Rejeita com ErroEnvioVideo: `recusado` (o Bunny não aceitou: autorização
 * vencida ou inválida, arquivo recusado), `rede` (parou no meio, depois das
 * tentativas) ou `cancelado`.
 */
export async function enviarVideoTus(opcoes: OpcoesEnvioTus): Promise<{ videoId: string; bytes: number }> {
  const total = opcoes.arquivo.size;
  const pedaco = opcoes.tamanhoDoPedaco ?? TAMANHO_DO_PEDACO_PADRAO;
  const tentativas = opcoes.tentativasPorPedaco ?? 4;
  const espera = opcoes.esperaEntreTentativasMs ?? 1500;
  const agora = opcoes.agora ?? (() => Date.now());
  let autorizacao = opcoes.autorizacao;

  if (total <= 0) throw new ErroEnvioVideo('recusado', 'Arquivo vazio.');

  const autorizacaoValida = async () => {
    if (opcoes.renovar && autorizacao.expira - agora() / 1000 < MARGEM_DE_RENOVACAO_S) {
      const nova = await opcoes.renovar();
      // Outro vídeo seria outro envio: a renovação só vale para o mesmo.
      if (nova.videoId === autorizacao.videoId) autorizacao = nova;
    }
    return autorizacao;
  };

  // 1. Cria o envio.
  const metadados = [`filetype ${base64(opcoes.tipo || 'video/mp4')}`, `title ${base64(opcoes.nome || 'video')}`].join(',');
  const criado = await pedir(opcoes, 'POST', autorizacao.endpoint, {
    ...cabecalhosDaAutorizacao(await autorizacaoValida()),
    'Upload-Length': String(total),
    'Upload-Metadata': metadados,
  }, null);
  if (criado.status !== 201) {
    throw new ErroEnvioVideo('recusado', `o servidor de vídeo respondeu ${criado.status} ao iniciar`, criado.status);
  }
  const local = criado.cabecalho('Location');
  if (!local) throw new ErroEnvioVideo('recusado', 'o servidor de vídeo não devolveu o endereço do envio');
  const urlDoEnvio = new URL(local, autorizacao.endpoint).toString();

  // 2. Pedaços.
  let offset = 0;
  opcoes.aoProgredir?.(0, total);
  while (offset < total) {
    const fim = Math.min(offset + pedaco, total);
    let falhas = 0;
    for (;;) {
      if (opcoes.sinal?.aborted) throw new ErroEnvioVideo('cancelado', 'Envio cancelado.');
      const inicio = offset;
      try {
        const r = await pedir(opcoes, 'PATCH', urlDoEnvio, {
          ...cabecalhosDaAutorizacao(await autorizacaoValida()),
          'Upload-Offset': String(inicio),
          'Content-Type': 'application/offset+octet-stream',
        }, opcoes.arquivo.slice(inicio, fim), (bytes) => opcoes.aoProgredir?.(Math.min(inicio + bytes, total), total));
        if (r.status === 204 || r.status === 200) {
          const confirmado = Number.parseInt(r.cabecalho('Upload-Offset') ?? '', 10);
          offset = Number.isInteger(confirmado) && confirmado > inicio ? Math.min(confirmado, total) : fim;
          break;
        }
        // 4xx que não é desencontro de posição: não adianta insistir.
        if (r.status >= 400 && r.status < 500 && r.status !== 409 && r.status !== 423 && r.status !== 429) {
          throw new ErroEnvioVideo('recusado', `o servidor de vídeo respondeu ${r.status}`, r.status);
        }
        throw new ErroEnvioVideo('rede', `o servidor de vídeo respondeu ${r.status}`, r.status);
      } catch (e: any) {
        if (!(e instanceof ErroEnvioVideo) || e.tipo !== 'rede') throw e;
        falhas += 1;
        if (falhas >= tentativas) throw e;
        await esperar(espera);
        // 3. Pergunta até onde o Bunny recebeu e continua dali.
        try {
          const h = await pedir(opcoes, 'HEAD', urlDoEnvio, cabecalhosDaAutorizacao(await autorizacaoValida()), null);
          const recebido = Number.parseInt(h.cabecalho('Upload-Offset') ?? '', 10);
          if (h.status >= 200 && h.status < 300 && Number.isInteger(recebido) && recebido >= 0 && recebido <= total) {
            offset = recebido;
            opcoes.aoProgredir?.(offset, total);
            if (offset >= fim) break;
          }
        } catch (eh: any) {
          if (eh instanceof ErroEnvioVideo && eh.tipo === 'cancelado') throw eh;
          // Sem resposta do HEAD: tenta o mesmo pedaço de novo.
        }
      }
    }
    opcoes.aoProgredir?.(offset, total);
  }

  return { videoId: autorizacao.videoId, bytes: total };
}
