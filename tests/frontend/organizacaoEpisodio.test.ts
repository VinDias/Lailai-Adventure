/**
 * Frente A, item 1: a tela importa as MESMAS regras que o servidor usa
 * (shared/organizacaoEpisodio.mjs). Os casos estão em
 * tests/backend/organizacaoEpisodio.test.js; aqui só a prova de que o Vite
 * carrega o módulo e chega ao mesmo resultado no EP4.
 */
import { it, expect } from 'vitest';
import { organizarPasta } from '../../shared/organizacaoEpisodio.mjs';

it('o Vite carrega as regras e o EP4 sai com o balão no painel do número dele', () => {
  const comBalao = [4, 5, 7, 8, 9, 11, 13, 16, 17, 19];
  const arquivos: { nome: string; largura: number; altura: number }[] = [];
  for (let n = 1; n <= 24; n++) {
    const nome = `Pagina ${String(n).padStart(3, '0')}`;
    arquivos.push({ nome: `${nome}.jpeg`, largura: 800, altura: 1280 });
    if (comBalao.includes(n)) arquivos.push({ nome: `${nome}_ENG.png`, largura: 800, altura: 1280 });
  }
  const r = organizarPasta(arquivos);
  expect(r.podeEnviar).toBe(true);
  expect(r.paineis.filter(p => p.baloes.en).map(p => p.numeroPagina)).toEqual(comBalao);
});
