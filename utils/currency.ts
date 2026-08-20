/**
 * Formatação de moeda do Super Reader (Fase 4 Bloco 3). Extraído de
 * components/SuperReaderButton.tsx (T5) na Task 6 para reuso no selo da
 * Conta (SuperReaderBadge) sem duplicar o mapeamento símbolo↔moeda — mesmo
 * conjunto de moedas do backend (brl/usd/eur, spec do bloco).
 */
export const CURRENCY_SYMBOL: Record<string, string> = { brl: 'R$', usd: '$', eur: '€' };

/** "R$5" para valores redondos, "R$7,50" (ou "$7.50" fora do brl) quando não. */
export function formatarValorMonetario(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] || 'R$';
  const separadorDecimal = currency === 'brl' ? ',' : '.';
  const eRedondo = cents % 100 === 0;
  const valor = eRedondo
    ? String(Math.trunc(cents / 100))
    : (cents / 100).toFixed(2).replace('.', separadorDecimal);
  return `${symbol}${valor}`;
}
