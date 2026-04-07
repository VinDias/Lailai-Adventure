const LOCALE_CURRENCY: Record<string, string> = {
  'pt-br': 'brl', 'pt': 'brl',
  'en-us': 'usd', 'en-gb': 'usd', 'en': 'usd',
  'es': 'usd', 'es-mx': 'usd', 'es-ar': 'usd',
  'fr': 'eur', 'de': 'eur', 'it': 'eur', 'nl': 'eur',
  'ja': 'usd', 'ko': 'usd', 'zh': 'usd',
};

const PRICE_DISPLAY: Record<string, string> = {
  brl: 'R$ 3,99',
  usd: '$0.99',
  eur: '€0,99',
};

export function getLocalizedPrice(): string {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR').toLowerCase();
  const currency = LOCALE_CURRENCY[lang] || LOCALE_CURRENCY[lang.split('-')[0]] || 'brl';
  return PRICE_DISPLAY[currency] || PRICE_DISPLAY.brl;
}

export function getLocalizedCurrency(): string {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR').toLowerCase();
  return LOCALE_CURRENCY[lang] || LOCALE_CURRENCY[lang.split('-')[0]] || 'brl';
}
