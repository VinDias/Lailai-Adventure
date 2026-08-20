/**
 * Deep link de notificação push. O servidor manda o clique da notificação para
 * `/?abrir=<seriesId>&tipo=<content_type>` (services/notificationService.js) —
 * este parser é a única função que interpreta essa query, extraída para ser
 * testável em isolamento da fiação no App.tsx (que consome o resultado no boot).
 */

export type DeepLinkTipo = 'hqcine' | 'vcine' | 'hiqua';

export interface DeepLink {
  seriesId: string;
  tipo: DeepLinkTipo | null;
}

const TIPOS_VALIDOS: readonly DeepLinkTipo[] = ['hqcine', 'vcine', 'hiqua'];

function ehTipoValido(valor: string | null): valor is DeepLinkTipo {
  return valor !== null && (TIPOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Interpreta a query string (com ou sem o "?" inicial). Sem `abrir`, não há
 * deep link — retorna null. `tipo` desconhecido é lixo e vira null (o
 * seriesId ainda é aproveitado — App.tsx só deixa de trocar de aba, mas ainda
 * foca a série).
 */
export function parseDeepLink(search: string): DeepLink | null {
  const params = new URLSearchParams(search);
  const seriesId = params.get('abrir');
  if (!seriesId) return null;

  const tipoBruto = params.get('tipo');
  const tipo = ehTipoValido(tipoBruto) ? tipoBruto : null;

  return { seriesId, tipo };
}
