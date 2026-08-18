import { describe, it, expect } from 'vitest';
import { posicaoDeVolta } from '../../utils/progressPosition';

describe('posição de volta', () => {
  it('converte percentual em pixels usando a altura atual', () => {
    expect(posicaoDeVolta(0.5, 2000, 800)).toBe(600); // (2000-800) * 0.5
  });

  it('cai no mesmo ponto relativo em telas de alturas diferentes', () => {
    const emTelaPequena = posicaoDeVolta(0.25, 4000, 600) / (4000 - 600);
    const emTelaGrande = posicaoDeVolta(0.25, 4000, 1200) / (4000 - 1200);
    expect(emTelaPequena).toBeCloseTo(emTelaGrande);
  });

  it('nao volta antes do inicio nem passa do fim', () => {
    expect(posicaoDeVolta(-1, 2000, 800)).toBe(0);
    expect(posicaoDeVolta(2, 2000, 800)).toBe(1200);
  });
});
