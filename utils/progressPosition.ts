/**
 * Converte o percentual guardado na posição de scroll da tela atual.
 *
 * Guardamos percentual, e não pixels, porque pixel depende da largura da tela:
 * quem lê no celular e continua no tablet cairia no lugar errado.
 */
export function posicaoDeVolta(percent: number, alturaTotal: number, alturaVisivel: number): number {
  const rolavel = Math.max(0, alturaTotal - alturaVisivel);
  const seguro = Math.min(1, Math.max(0, percent));
  return Math.round(rolavel * seguro);
}

/** O inverso: quanto do capítulo já foi percorrido. */
export function percentualLido(scrollTop: number, alturaTotal: number, alturaVisivel: number): number {
  const rolavel = Math.max(1, alturaTotal - alturaVisivel);
  return Math.min(1, Math.max(0, scrollTop / rolavel));
}
