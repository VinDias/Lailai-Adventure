/**
 * Testes unitários — compra da assinatura dentro do app Android (Fase 6, T5).
 *
 * Duas coisas são pinadas aqui, e as duas são regra de loja, não detalhe:
 *
 * 1. A detecção do app tem de SOBREVIVER ao recarregamento. O
 *    `document.referrer` da TWA só aparece na primeira carga; se a detecção
 *    dependesse apenas dele, um recarregamento dentro do app mandaria a
 *    pessoa para o cartão de crédito — motivo de remoção da Play.
 * 2. Fora do app, nada de Play: oferecer uma folha de compra que não existe
 *    no navegador deixaria o usuário sem caminho nenhum de assinatura.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PREFIXO = 'android-app://com.lorflux.twa';

function definirReferrer(valor: string) {
  Object.defineProperty(document, 'referrer', { value: valor, configurable: true });
}

/** Digital Goods API + Payment Request falsas, como o Chrome do Android as expõe. */
function instalarLojaFalsa({
  detalhes = [{ itemId: 'premium_mensal', price: { value: '19.90', currency: 'BRL' } }],
  compras = [{ itemId: 'premium_mensal', purchaseToken: 'comprovante-no-aparelho' }],
  comprovanteDaCompra = 'comprovante-novo',
  servicoIndisponivel = false,
} = {}) {
  const registro: any = { completouCom: null, mostrou: 0, dadosDoPedido: null };

  (window as any).getDigitalGoodsService = vi.fn(async () => {
    if (servicoIndisponivel) throw new Error('Play Billing nao habilitado neste build');
    return {
      getDetails: vi.fn(async () => detalhes),
      listPurchases: vi.fn(async () => compras),
    };
  });

  (window as any).PaymentRequest = vi.fn(function (metodos: any[], detalhesDoPedido: any) {
    registro.dadosDoPedido = { metodos, detalhesDoPedido };
    return {
      show: vi.fn(async () => {
        registro.mostrou += 1;
        return {
          details: comprovanteDaCompra ? { token: comprovanteDaCompra } : {},
          complete: vi.fn(async (estado: string) => { registro.completouCom = estado; }),
        };
      }),
    };
  });

  return registro;
}

beforeEach(() => {
  vi.resetModules();
  definirReferrer('');
  try { sessionStorage.clear(); } catch { /* ignora */ }
  delete (window as any).getDigitalGoodsService;
  delete (window as any).PaymentRequest;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estaNoAppAndroid', () => {
  it('no navegador comum, não', async () => {
    const { estaNoAppAndroid } = await import('../../utils/appAndroid');
    expect(estaNoAppAndroid()).toBe(false);
  });

  it('reconhece o app pelo referrer da TWA', async () => {
    definirReferrer(`${PREFIXO}/`);
    const { estaNoAppAndroid } = await import('../../utils/appAndroid');
    expect(estaNoAppAndroid()).toBe(true);
  });

  it('continua reconhecendo depois de o referrer sumir (recarregou dentro do app)', async () => {
    definirReferrer(`${PREFIXO}/`);
    const mod = await import('../../utils/appAndroid');
    expect(mod.estaNoAppAndroid()).toBe(true);

    definirReferrer('');
    expect(mod.estaNoAppAndroid()).toBe(true);
  });

  it('app de outro pacote não conta', async () => {
    definirReferrer('android-app://com.outro.app/');
    const { estaNoAppAndroid } = await import('../../utils/appAndroid');
    expect(estaNoAppAndroid()).toBe(false);
  });
});

describe('temComprasDaPlay', () => {
  it('falso no navegador, mesmo que as APIs existam', async () => {
    instalarLojaFalsa();
    const { temComprasDaPlay } = await import('../../utils/appAndroid');
    expect(temComprasDaPlay()).toBe(false);
  });

  it('falso dentro do app quando o build não tem Play Billing', async () => {
    definirReferrer(`${PREFIXO}/`);
    const { temComprasDaPlay } = await import('../../utils/appAndroid');
    expect(temComprasDaPlay()).toBe(false);
  });

  it('verdadeiro dentro do app com as duas APIs presentes', async () => {
    definirReferrer(`${PREFIXO}/`);
    instalarLojaFalsa();
    const { temComprasDaPlay } = await import('../../utils/appAndroid');
    expect(temComprasDaPlay()).toBe(true);
  });
});

describe('preço vindo da Play', () => {
  it('formata o preço que a própria Play informou', async () => {
    definirReferrer(`${PREFIXO}/`);
    instalarLojaFalsa();
    const { precoDaAssinatura } = await import('../../services/playBilling');
    const preco = await precoDaAssinatura();
    expect(preco).toBeTruthy();
    expect(preco).toMatch(/19[.,]90/);
  });

  it('sem loja disponível, devolve null (quem chama cai no preço do Stripe)', async () => {
    const { precoDaAssinatura } = await import('../../services/playBilling');
    expect(await precoDaAssinatura()).toBeNull();
  });

  it('serviço que lança não quebra a tela', async () => {
    definirReferrer(`${PREFIXO}/`);
    instalarLojaFalsa({ servicoIndisponivel: true });
    const { precoDaAssinatura } = await import('../../services/playBilling');
    expect(await precoDaAssinatura()).toBeNull();
  });
});

describe('comprarAssinatura', () => {
  it('devolve o comprovante e fecha a folha da Play', async () => {
    definirReferrer(`${PREFIXO}/`);
    const registro = instalarLojaFalsa();
    const { comprarAssinatura } = await import('../../services/playBilling');

    expect(await comprarAssinatura()).toBe('comprovante-novo');
    expect(registro.mostrou).toBe(1);
    expect(registro.completouCom).toBe('success');
  });

  it('pede a compra pelo método da Play, com o produto como sku', async () => {
    definirReferrer(`${PREFIXO}/`);
    const registro = instalarLojaFalsa();
    const { comprarAssinatura, PRODUTO_ASSINATURA } = await import('../../services/playBilling');
    await comprarAssinatura();

    expect(registro.dadosDoPedido.metodos[0].supportedMethods).toBe('https://play.google.com/billing');
    expect(registro.dadosDoPedido.metodos[0].data.sku).toBe(PRODUTO_ASSINATURA);
  });

  it('desistência devolve null, sem comprovante inventado', async () => {
    definirReferrer(`${PREFIXO}/`);
    const registro = instalarLojaFalsa({ comprovanteDaCompra: '' });
    const { comprarAssinatura } = await import('../../services/playBilling');

    expect(await comprarAssinatura()).toBeNull();
    expect(registro.completouCom).toBe('fail');
  });

  it('fora do app não abre folha nenhuma', async () => {
    const registro = instalarLojaFalsa();
    const { comprarAssinatura } = await import('../../services/playBilling');
    expect(await comprarAssinatura()).toBeNull();
    expect(registro.mostrou).toBe(0);
  });
});

describe('comprasExistentes', () => {
  it('lista os comprovantes que a conta já tem no aparelho', async () => {
    definirReferrer(`${PREFIXO}/`);
    instalarLojaFalsa();
    const { comprasExistentes } = await import('../../services/playBilling');
    expect(await comprasExistentes()).toEqual(['comprovante-no-aparelho']);
  });

  it('descarta entradas sem comprovante utilizável', async () => {
    definirReferrer(`${PREFIXO}/`);
    instalarLojaFalsa({ compras: [{ itemId: 'a' }, { itemId: 'b', purchaseToken: 'ok' }, null] as any });
    const { comprasExistentes } = await import('../../services/playBilling');
    expect(await comprasExistentes()).toEqual(['ok']);
  });

  it('fora do app devolve lista vazia', async () => {
    const { comprasExistentes } = await import('../../services/playBilling');
    expect(await comprasExistentes()).toEqual([]);
  });
});
