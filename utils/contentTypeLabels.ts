/**
 * Nomes de exibição das abas/formatos — rebranding de 28/08/2026 decidido
 * pelo cliente com o time de marketing dele: HQCine → CINECOMICS (botão
 * curto ANICOM), VCine → VERTICALSHOW (botão curto V-SHOW); Hi-Qua fica.
 *
 * IMPORTANTE: os valores internos de `content_type` ('hqcine'/'vcine'/
 * 'hiqua') NÃO mudam — enum do banco, rotas, deep links e algoritmo os
 * usam; renomeá-los seria migração cara sem nenhum ganho visível. Estes
 * mapas são a ÚNICA fonte dos nomes visíveis.
 */
export const NOME_ABA: Record<string, string> = {
  hqcine: 'CINECOMICS',
  vcine: 'VERTICALSHOW',
  hiqua: 'HI-QUA',
};

/** Rótulos curtos dos botões da navegação inferior. */
export const NOME_BOTAO: Record<string, string> = {
  hqcine: 'ANICOM',
  vcine: 'V-SHOW',
  hiqua: 'Hi-Qua',
};
