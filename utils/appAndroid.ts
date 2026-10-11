// Estamos rodando dentro do app da Google Play? (Fase 6, T5)
//
// O app é o próprio site dentro de um invólucro (Trusted Web Activity), então
// o MESMO código roda no navegador e dentro do app. A diferença aparece no
// `document.referrer`: a TWA injeta `android-app://<pacote>` na primeira
// navegação da sessão.
//
// POR QUE IMPORTA: a regra da Google é que conteúdo digital comprado dentro
// do app seja cobrado pelo Play Billing. Mandar quem está no app para o
// checkout do Stripe é motivo de remoção da loja. E o contrário também
// atrapalha: oferecer a compra da Play a quem está no navegador abre uma tela
// que nunca vai funcionar.
const PREFIXO_DO_APP = 'android-app://com.lorflux.twa';

// O referrer só chega na PRIMEIRA carga. Um recarregamento dentro do app
// perderia o sinal, então ele fica guardado pela sessão.
const CHAVE = 'lorflux.noApp';

export function estaNoAppAndroid(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    if (document.referrer && document.referrer.startsWith(PREFIXO_DO_APP)) {
      try { sessionStorage.setItem(CHAVE, '1'); } catch { /* aba privada */ }
      return true;
    }
  } catch { /* ambiente sem document.referrer */ }

  try {
    return sessionStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

/**
 * A compra pela Play só é possível quando o navegador expõe a Digital Goods
 * API, o que acontece no Chrome do Android dentro de uma TWA com Play
 * Billing habilitado no build. Checar isto separado da detecção do app evita
 * o pior caso: app detectado, loja indisponível e nenhum caminho de compra.
 */
export function temComprasDaPlay(): boolean {
  return estaNoAppAndroid()
    && typeof window !== 'undefined'
    && typeof (window as any).getDigitalGoodsService === 'function'
    && typeof (window as any).PaymentRequest === 'function';
}
