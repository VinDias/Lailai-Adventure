/**
 * Retorno do checkout do Super Reader (Fase 4, Bloco 3): o Stripe volta para
 * `/?superreader=success` ou `/?superreader=cancelled` (ver success_url e
 * cancel_url em services/superReaderService.js). Parser puro, no mesmo
 * espírito de utils/deepLink.ts — testável isolado da fiação no App.tsx, que
 * consome o resultado no boot (mesmo trecho que parseia `?abrir=`).
 */

export type SuperReaderReturn = 'success' | 'cancelled';

const VALORES_VALIDOS: readonly SuperReaderReturn[] = ['success', 'cancelled'];

function ehValorValido(valor: string | null): valor is SuperReaderReturn {
  return valor !== null && (VALORES_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Interpreta a query string (com ou sem o "?" inicial). Sem `superreader`,
 * não há retorno de checkout — retorna null. Valor desconhecido (lixo) também
 * vira null: só `success`/`cancelled` são reconhecidos.
 */
export function parseSuperReaderReturn(search: string): SuperReaderReturn | null {
  const params = new URLSearchParams(search);
  const valor = params.get('superreader');
  return ehValorValido(valor) ? valor : null;
}
