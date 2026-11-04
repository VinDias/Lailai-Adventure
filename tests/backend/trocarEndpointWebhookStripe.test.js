/**
 * O script que move o endpoint do webhook do Stripe para o www roda contra a
 * conta de produção. Errar aqui é perder evento de pagamento em silêncio, então
 * a decisão de O QUE trocar é pura e testada sem Stripe.
 */
const { planejarTroca, ALVO_PADRAO } = require('../../scripts/trocarEndpointWebhookStripe');

const APEX = 'https://lorflux.com/api/payment/webhook';

describe('planejarTroca: mover o webhook do Stripe para o www', () => {
  it('troca o endpoint único do domínio sem www pelo do www', () => {
    expect(planejarTroca([{ id: 'we_1', url: APEX }])).toEqual({
      acao: 'trocar', id: 'we_1', de: APEX, para: ALVO_PADRAO,
    });
  });

  it('não faz nada quando já está no www', () => {
    expect(planejarTroca([{ id: 'we_1', url: ALVO_PADRAO }]).acao).toBe('nada');
  });

  it('ignora endpoints de outros sistemas na mesma conta', () => {
    const plano = planejarTroca([
      { id: 'we_outro', url: 'https://outro.exemplo/hook' },
      { id: 'we_1', url: APEX },
    ]);
    expect(plano).toMatchObject({ acao: 'trocar', id: 'we_1' });
  });

  it('recusa quando não há endpoint nosso', () => {
    expect(planejarTroca([{ id: 'we_outro', url: 'https://outro.exemplo/hook' }]).acao).toBe('recusar');
  });

  it('recusa quando há dois endpoints nossos, em vez de escolher um', () => {
    const plano = planejarTroca([
      { id: 'we_1', url: APEX },
      { id: 'we_2', url: 'https://staging.lorflux.com/api/payment/webhook' },
    ]);
    expect(plano.acao).toBe('recusar');
  });

  it('recusa quando o www já existe E o antigo continua, porque o evento chegaria duas vezes', () => {
    const plano = planejarTroca([
      { id: 'we_1', url: APEX },
      { id: 'we_2', url: ALVO_PADRAO },
    ]);
    expect(plano.acao).toBe('recusar');
  });
});
