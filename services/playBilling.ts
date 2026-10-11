// Compra da assinatura dentro do app Android (Fase 6, T5).
//
// Duas APIs do navegador, nenhuma com tipos no TypeScript (são específicas do
// Chrome no Android), por isso os `any` localizados:
//
// - Digital Goods API (`getDigitalGoodsService`): consulta o catálogo e as
//   compras que a conta Google já tem.
// - Payment Request com o método `https://play.google.com/billing`: abre a
//   folha de compra da Play.
//
// Confirmar a compra é trabalho do SERVIDOR (services/playBillingService.js):
// a versão atual da Digital Goods API não confirma assinatura, e de todo jeito
// confirmar pelo cliente seria confiar em quem está comprando.
import { temComprasDaPlay } from '../utils/appAndroid';

const METODO_DE_PAGAMENTO = 'https://play.google.com/billing';

// Id do produto cadastrado no Play Console. Em branco no build, a compra pela
// Play fica indisponível e o app cai no checkout do navegador.
export const PRODUTO_ASSINATURA: string =
  (import.meta as any).env?.VITE_PLAY_PRODUCT_ID || 'premium_mensal';

async function servico(): Promise<any | null> {
  if (!temComprasDaPlay()) return null;
  try {
    return await (window as any).getDigitalGoodsService(METODO_DE_PAGAMENTO);
  } catch {
    // Play Billing não habilitado neste build do app.
    return null;
  }
}

/** Preço já formatado pela própria Play (moeda e país da conta Google). */
export async function precoDaAssinatura(): Promise<string | null> {
  const s = await servico();
  if (!s) return null;
  try {
    const itens = await s.getDetails([PRODUTO_ASSINATURA]);
    const item = Array.isArray(itens) ? itens[0] : null;
    if (!item || !item.price) return null;
    const { value, currency } = item.price;
    return new Intl.NumberFormat(navigator.language, { style: 'currency', currency }).format(Number(value));
  } catch {
    return null;
  }
}

/**
 * Abre a folha de compra da Play e devolve o comprovante, ou null se a pessoa
 * desistiu. O comprovante só vale depois de validado no servidor.
 */
export async function comprarAssinatura(): Promise<string | null> {
  const s = await servico();
  if (!s) return null;

  // O valor abaixo é exigido pela Payment Request, mas IGNORADO no método da
  // Play: quem cobra é o produto cadastrado no Play Console. Não é o preço
  // mostrado a ninguém — a folha da Play traz o preço real.
  const pedido = new (window as any).PaymentRequest(
    [{ supportedMethods: METODO_DE_PAGAMENTO, data: { sku: PRODUTO_ASSINATURA } }],
    { total: { label: 'Assinatura Lorflux', amount: { currency: 'BRL', value: '0' } } }
  );

  const resposta = await pedido.show();
  const comprovante: string | null = resposta?.details?.token ?? null;
  // `complete` fecha a folha. 'success' aqui significa só "recebi o
  // comprovante"; quem decide se a compra vale é o servidor.
  try { await resposta.complete(comprovante ? 'success' : 'fail'); } catch { /* folha já fechada */ }
  return comprovante;
}

/**
 * Comprovantes que a conta Google já tem neste aparelho.
 *
 * Serve para reconciliar: se um aviso da Play se perder, ou se a pessoa
 * reinstalar o app, abrir o app revalida o que ela já pagou em vez de
 * oferecer uma assinatura que ela já tem.
 */
export async function comprasExistentes(): Promise<string[]> {
  const s = await servico();
  if (!s) return [];
  try {
    const compras = await s.listPurchases();
    return (Array.isArray(compras) ? compras : [])
      .map((c: any) => c && c.purchaseToken)
      .filter((t: any): t is string => typeof t === 'string' && !!t);
  } catch {
    return [];
  }
}
