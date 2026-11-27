/**
 * Frente A, item 9: o cliente TUS que envia o vídeo do navegador DIRETO ao
 * Bunny Stream (utils/envioVideoTus.ts).
 *
 * O QUE ESTES TESTES GARANTEM, contra um Bunny FALSO (XMLHttpRequest de
 * mentira, nenhum pedido de rede):
 * - cria o envio com o tamanho total e manda a autorização em TODOS os
 *   pedidos (assinatura, validade, id do vídeo, id da biblioteca);
 * - o arquivo sobe em pedaços, cada um a partir de onde o anterior parou, e
 *   chega inteiro e na ordem;
 * - pedaço que falha: pergunta ao servidor até onde recebeu (HEAD) e continua
 *   dali, sem recomeçar o arquivo;
 * - autorização para vencer: pede outra (para o mesmo vídeo) e segue;
 * - recusa do servidor (403) não é tentada de novo; falha de rede que
 *   persiste vira erro de rede; cancelar interrompe.
 *
 * O QUE NÃO GARANTEM: que o Bunny de verdade aceita estes pedidos. Isso só se
 * confere com a biblioteca real, no roteiro do item 11.
 */
import { describe, it, expect } from 'vitest';
import { enviarVideoTus, ErroEnvioVideo } from '../../utils/envioVideoTus';
import type { AutorizacaoTus } from '../../utils/envioVideoTus';

interface Pedido {
  metodo: string;
  url: string;
  cabecalhos: Record<string, string>;
  bytes: Uint8Array | null;
}
type Resposta = { status: number; cabecalhos?: Record<string, string> } | 'rede';

const ENDPOINT = 'https://video.bunny.falso/tusupload';

/** Bunny falso: guarda o que recebeu; `interferir` pode trocar a resposta de um pedido. */
function bunnyFalso(interferir?: (p: Pedido, n: number) => Resposta | undefined | void) {
  const pedidos: Pedido[] = [];
  let recebido = new Uint8Array(0);
  let total = 0;
  const responder = (p: Pedido): Resposta => {
    const fora = interferir?.(p, pedidos.length);
    if (fora) return fora;
    if (p.metodo === 'POST') {
      total = Number(p.cabecalhos['Upload-Length']);
      return { status: 201, cabecalhos: { Location: '/tusupload/envio-1' } };
    }
    if (p.metodo === 'HEAD') return { status: 200, cabecalhos: { 'Upload-Offset': String(recebido.length) } };
    if (p.metodo === 'PATCH') {
      if (Number(p.cabecalhos['Upload-Offset']) !== recebido.length) return { status: 409 };
      const junto = new Uint8Array(recebido.length + (p.bytes?.length ?? 0));
      junto.set(recebido);
      junto.set(p.bytes ?? new Uint8Array(0), recebido.length);
      recebido = junto;
      return { status: 204, cabecalhos: { 'Upload-Offset': String(recebido.length) } };
    }
    return { status: 405 };
  };

  class XhrFalso {
    metodo = '';
    url = '';
    cabecalhos: Record<string, string> = {};
    status = 0;
    upload: { onprogress: ((e: any) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private resposta: Record<string, string> = {};
    private abortado = false;
    open(metodo: string, url: string) { this.metodo = metodo; this.url = url; }
    setRequestHeader(n: string, v: string) { this.cabecalhos[n] = v; }
    getResponseHeader(n: string) { return this.resposta[n] ?? null; }
    abort() { this.abortado = true; this.onabort?.(); }
    send(corpo: Blob | null) {
      (async () => {
        const bytes = corpo ? new Uint8Array(await corpo.arrayBuffer()) : null;
        if (this.abortado) return;
        const pedido: Pedido = { metodo: this.metodo, url: this.url, cabecalhos: { ...this.cabecalhos }, bytes };
        const r = responder(pedido);
        pedidos.push(pedido);
        if (this.abortado) return;
        if (r === 'rede') { this.onerror?.(); return; }
        if (bytes) this.upload.onprogress?.({ loaded: bytes.length });
        this.status = r.status;
        this.resposta = r.cabecalhos ?? {};
        this.onload?.();
      })();
    }
  }

  return {
    pedidos,
    criarXhr: () => new XhrFalso() as unknown as XMLHttpRequest,
    recebido: () => recebido,
    total: () => total,
  };
}

function arquivo(n: number): { blob: Blob; bytes: Uint8Array } {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = (i * 7 + 3) % 251;
  return { blob: new Blob([bytes], { type: 'video/mp4' }), bytes };
}

const autorizacao = (extra: Partial<AutorizacaoTus> = {}): AutorizacaoTus => ({
  videoId: 'video-1', libraryId: '4242', endpoint: ENDPOINT, assinatura: 'assinatura-1', expira: Math.floor(Date.now() / 1000) + 7200, ...extra,
});

const base = (bunny: ReturnType<typeof bunnyFalso>, blob: Blob) => ({
  arquivo: blob, nome: 'episódio 1.mp4', tipo: 'video/mp4', autorizacao: autorizacao(),
  criarXhr: bunny.criarXhr, tamanhoDoPedaco: 1000, esperaEntreTentativasMs: 0,
});

describe('enviarVideoTus', () => {
  it('cria o envio, manda a autorização em todos os pedidos e o arquivo chega inteiro, em pedaços, na ordem', async () => {
    const bunny = bunnyFalso();
    const { blob, bytes } = arquivo(2500);
    const progresso: number[] = [];
    const r = await enviarVideoTus({ ...base(bunny, blob), aoProgredir: (e) => progresso.push(e) });

    expect(r).toEqual({ videoId: 'video-1', bytes: 2500 });
    expect(bunny.pedidos.map(p => p.metodo)).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH']);
    expect(bunny.pedidos[0].url).toBe(ENDPOINT);
    expect(bunny.pedidos[0].cabecalhos['Upload-Length']).toBe('2500');
    expect(bunny.pedidos[0].cabecalhos['Upload-Metadata']).toMatch(/^filetype [A-Za-z0-9+/=]+,title [A-Za-z0-9+/=]+$/);
    // O endereço do envio vem do Location (relativo ao endpoint).
    expect(bunny.pedidos[1].url).toBe('https://video.bunny.falso/tusupload/envio-1');
    expect(bunny.pedidos.slice(1).map(p => p.cabecalhos['Upload-Offset'])).toEqual(['0', '1000', '2000']);
    expect(bunny.pedidos.slice(1).map(p => p.bytes!.length)).toEqual([1000, 1000, 500]);
    for (const p of bunny.pedidos) {
      expect(p.cabecalhos).toMatchObject({
        'Tus-Resumable': '1.0.0', AuthorizationSignature: 'assinatura-1', VideoId: 'video-1', LibraryId: '4242',
      });
      expect(p.cabecalhos.AuthorizationExpire).toMatch(/^\d+$/);
    }
    expect(bunny.pedidos[1].cabecalhos['Content-Type']).toBe('application/offset+octet-stream');
    expect(Array.from(bunny.recebido())).toEqual(Array.from(bytes));
    expect(progresso.at(-1)).toBe(2500);
    expect([...progresso].sort((a, b) => a - b)).toEqual(progresso); // só cresce
  });

  it('pedaço que cai no meio: pergunta até onde chegou (HEAD) e continua dali, sem recomeçar', async () => {
    let caiu = false;
    const bunny = bunnyFalso((p) => {
      if (p.metodo === 'PATCH' && p.cabecalhos['Upload-Offset'] === '1000' && !caiu) { caiu = true; return 'rede'; }
    });
    const { blob, bytes } = arquivo(2500);
    await enviarVideoTus(base(bunny, blob));

    expect(bunny.pedidos.map(p => p.metodo)).toEqual(['POST', 'PATCH', 'PATCH', 'HEAD', 'PATCH', 'PATCH']);
    // O 1o pedaço não foi enviado de novo.
    expect(bunny.pedidos.filter(p => p.metodo === 'PATCH' && p.cabecalhos['Upload-Offset'] === '0')).toHaveLength(1);
    expect(Array.from(bunny.recebido())).toEqual(Array.from(bytes));
  });

  it('o servidor recebeu o pedaço mas a resposta se perdeu: o HEAD mostra, e o pedaço não é mandado duas vezes', async () => {
    const bunny = bunnyFalso();
    // Envolve o XHR: o 1o PATCH é entregue ao Bunny falso, mas quem enviou vê erro de rede.
    const original = bunny.criarXhr;
    let primeiroPatch = true;
    const criarXhr = () => {
      const x: any = original();
      const send = x.send.bind(x);
      x.send = (corpo: Blob | null) => {
        if (x.metodo === 'PATCH' && primeiroPatch) {
          primeiroPatch = false;
          const onerror = () => x.onerror?.();
          x.onload = onerror; // a resposta "se perde"
        }
        send(corpo);
      };
      return x as XMLHttpRequest;
    };
    const { blob, bytes } = arquivo(1800);
    await enviarVideoTus({ ...base(bunny, blob), criarXhr });
    expect(bunny.pedidos.map(p => `${p.metodo}:${p.cabecalhos['Upload-Offset'] ?? ''}`)).toEqual(['POST:', 'PATCH:0', 'HEAD:', 'PATCH:1000']);
    expect(Array.from(bunny.recebido())).toEqual(Array.from(bytes));
  });

  it('autorização para vencer: pede outra para o mesmo vídeo e os pedidos seguintes já vão com ela', async () => {
    const bunny = bunnyFalso();
    const { blob } = arquivo(2500);
    let relogio = 1_000_000_000_000;
    const expiraLogo = Math.floor(relogio / 1000) + 300;
    let renovacoes = 0;
    await enviarVideoTus({
      ...base(bunny, blob),
      autorizacao: autorizacao({ expira: expiraLogo }),
      agora: () => relogio,
      aoProgredir: (enviados) => { if (enviados >= 1000) relogio = (expiraLogo - 60) * 1000; }, // falta 1 minuto
      renovar: async () => { renovacoes += 1; return autorizacao({ assinatura: 'assinatura-2', expira: expiraLogo + 7200 }); },
    });
    expect(renovacoes).toBe(1);
    const assinaturas = bunny.pedidos.map(p => p.cabecalhos.AuthorizationSignature);
    expect(assinaturas[0]).toBe('assinatura-1');
    expect(assinaturas.at(-1)).toBe('assinatura-2');
    expect(bunny.pedidos.at(-1)!.cabecalhos.AuthorizationExpire).toBe(String(expiraLogo + 7200));
    expect(bunny.recebido().length).toBe(2500);
  });

  it('renovação que devolve OUTRO vídeo é ignorada (seria outro envio)', async () => {
    const bunny = bunnyFalso();
    const { blob } = arquivo(1500);
    const relogio = 1_000_000_000_000;
    await enviarVideoTus({
      ...base(bunny, blob),
      autorizacao: autorizacao({ expira: Math.floor(relogio / 1000) + 30 }),
      agora: () => relogio,
      renovar: async () => autorizacao({ videoId: 'outro-video', assinatura: 'assinatura-de-outro' }),
    });
    expect(new Set(bunny.pedidos.map(p => p.cabecalhos.VideoId))).toEqual(new Set(['video-1']));
    expect(new Set(bunny.pedidos.map(p => p.cabecalhos.AuthorizationSignature))).toEqual(new Set(['assinatura-1']));
  });

  it('servidor recusa o início (403, autorização inválida): erro "recusado", sem insistir e sem mandar o arquivo', async () => {
    const bunny = bunnyFalso((p) => (p.metodo === 'POST' ? { status: 403 } : undefined));
    const { blob } = arquivo(1500);
    const erro = await enviarVideoTus(base(bunny, blob)).catch(e => e);
    expect(erro).toBeInstanceOf(ErroEnvioVideo);
    expect(erro).toMatchObject({ tipo: 'recusado', status: 403 });
    expect(bunny.pedidos.map(p => p.metodo)).toEqual(['POST']);
  });

  it('recusa no meio (401): para na hora, sem novas tentativas', async () => {
    const bunny = bunnyFalso((p) => (p.metodo === 'PATCH' && p.cabecalhos['Upload-Offset'] === '1000' ? { status: 401 } : undefined));
    const { blob } = arquivo(2500);
    const erro = await enviarVideoTus(base(bunny, blob)).catch(e => e);
    expect(erro).toMatchObject({ tipo: 'recusado', status: 401 });
    expect(bunny.pedidos.filter(p => p.metodo === 'PATCH')).toHaveLength(2);
  });

  it('rede que não volta: desiste depois das tentativas, com erro de rede', async () => {
    const bunny = bunnyFalso((p) => (p.metodo === 'PATCH' || p.metodo === 'HEAD' ? 'rede' : undefined));
    const { blob } = arquivo(1500);
    const erro = await enviarVideoTus({ ...base(bunny, blob), tentativasPorPedaco: 3 }).catch(e => e);
    expect(erro).toBeInstanceOf(ErroEnvioVideo);
    expect(erro.tipo).toBe('rede');
    expect(bunny.pedidos.filter(p => p.metodo === 'PATCH')).toHaveLength(3);
    expect(bunny.recebido().length).toBe(0);
  });

  it('cancelar interrompe o envio', async () => {
    const bunny = bunnyFalso();
    const { blob } = arquivo(5000);
    const controle = new AbortController();
    const erro = await enviarVideoTus({
      ...base(bunny, blob),
      sinal: controle.signal,
      aoProgredir: (enviados) => { if (enviados >= 2000) controle.abort(); },
    }).catch(e => e);
    expect(erro).toMatchObject({ tipo: 'cancelado' });
    expect(bunny.recebido().length).toBeLessThan(5000);
  });

  it('arquivo vazio não gera pedido nenhum', async () => {
    const bunny = bunnyFalso();
    const erro = await enviarVideoTus(base(bunny, new Blob([]))).catch(e => e);
    expect(erro).toMatchObject({ tipo: 'recusado' });
    expect(bunny.pedidos).toEqual([]);
  });
});
