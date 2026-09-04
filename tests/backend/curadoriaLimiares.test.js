/**
 * Fase 5 Bloco 3, Task 1 — utils/curadoriaLimiares.js. Fixtures NÃO-redondas
 * e a PROPRIEDADE da spec rev.2: limiarPara é não-decrescente em V (a rev.1
 * caía de 300 em V=999 para 100 em V=1.000 — achado ALTO do painel).
 */
const L = require('../../utils/curadoriaLimiares');

describe('curadoriaLimiares.limiarPara', () => {
  it.each([
    [0, 20], [1, 20], [47, 20], [66, 20],
    [67, 21], [90, 27], [200, 60], [333, 100],
    [334, 100], [999, 100], [9999, 100],
    [10000, 200], [49999, 200],
    [50000, 300], [99999, 300],
    [100000, 500], [250000, 500],
  ])('V=%i -> limiar %i', (V, esperado) => {
    expect(L.limiarPara(V)).toBe(esperado);
  });

  it('é NÃO-DECRESCENTE em todo V de 0 a 120.000 (propriedade da spec rev.2)', () => {
    let anterior = L.limiarPara(0);
    for (let V = 1; V <= 120000; V++) {
      const atual = L.limiarPara(V);
      if (atual < anterior) throw new Error(`limiar caiu de ${anterior} (V=${V - 1}) para ${atual} (V=${V})`);
      anterior = atual;
    }
  });

  it('30% é calculado em inteiros (sem ponto flutuante): V=10 -> 20 (piso), V=100 -> 30, V=250 -> 75', () => {
    expect(L.limiarPara(10)).toBe(20);
    expect(L.limiarPara(100)).toBe(30);
    expect(L.limiarPara(250)).toBe(75);
  });

  it('rejeita V inválido', () => {
    expect(() => L.limiarPara(-1)).toThrow(TypeError);
    expect(() => L.limiarPara(1.5)).toThrow(TypeError);
    expect(() => L.limiarPara('10')).toThrow(TypeError);
  });
});

describe('curadoriaLimiares.tipoGatilho / ehGrave / vocabulário', () => {
  it('LIMITE_PEQUENA_V é o primeiro V em que 30% alcança o teto 100 (334)', () => {
    expect(L.LIMITE_PEQUENA_V).toBe(334);
    expect(L.tipoGatilho(333)).toBe('pequena');
    expect(L.tipoGatilho(334)).toBe('normal');
    expect(L.tipoGatilho(0)).toBe('pequena');
  });

  it('vocabulário fechado de 6 motivos; graves = direitos_autorais e conteudo_proibido; outro exige descrição', () => {
    expect(L.MOTIVOS).toEqual(['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro']);
    expect(L.MOTIVOS_GRAVES).toEqual(['direitos_autorais', 'conteudo_proibido']);
    expect(L.MOTIVOS).not.toContain('violencia_excessiva');
    expect(L.MOTIVOS).not.toContain('conteudo_sexual');
    expect(L.ehGrave('direitos_autorais')).toBe(true);
    expect(L.ehGrave('outro')).toBe(false);
    expect(L.MOTIVOS_COM_DESCRICAO_OBRIGATORIA).toEqual(['outro']);
  });

  it('constantes da spec', () => {
    expect(L.GRAVE).toBe(5);
    expect(L.PISO_PEQUENA).toBe(20);
    expect(L.IDADE_MINIMA_CONTA_DIAS).toBe(3);
    expect(L.IDADE_MINIMA_CONTA_GRAVE_DIAS).toBe(7);
    expect(L.DESCRICAO_MAX).toBe(500);
  });

  it('TETO_PEQUENA vem do 1º patamar — fonte única, não um literal duplicado (fix round)', () => {
    expect(L.TETO_PEQUENA).toBe(L.PATAMARES[0].limiar);
  });
});
