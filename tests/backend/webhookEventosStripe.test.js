/**
 * Regressão: todo `event.type` tratado em routes/payment.js tem de estar
 * declarado em scripts/verificarWebhookStripe.js, que é a lista conferida
 * contra o painel do Stripe.
 *
 * O CASO REAL (descoberto em 22/10/2026): o endpoint de produção
 * https://lorflux.com/api/payment/webhook assinava só
 * `checkout.session.completed` e `customer.subscription.deleted`. O
 * `invoice.paid`, tratado em routes/payment.js:197 desde o commit 517bb54
 * (16/09/2026), nunca foi habilitado no painel, então o Stripe nunca o
 * enviou. Consequência: `premiumExpiresAt` congelava nos 30 dias gravados na
 * primeira cobrança (routes/payment.js:183), o anúncio voltava para quem
 * continuava pagando (utils/premium.ts:9) e a pessoa saía da contagem de
 * assinantes do pool de royalties (services/royaltyReportService.js:116-118).
 * Ninguém foi atingido porque não havia nenhuma assinatura ativa.
 *
 * POR QUE O TESTE QUE JÁ EXISTIA NÃO PEGOU: tests/backend/assinaturaPremium.test.js
 * faz POST do evento direto no endpoint, com assinatura válida. Ele prova que
 * o CÓDIGO trata `invoice.paid` e não tem como saber que o Stripe nunca envia.
 * A metade que faltava do conserto mora no painel do Stripe, fora do
 * repositório.
 *
 * ESTE teste é a parte que roda offline: ele falha no instante em que alguém
 * passa a tratar um `event.type` novo sem declarar na lista, que é exatamente
 * o instante de habilitar o evento no Stripe. A conferência contra o painel
 * (precisa da chave, roda na VPS) é `node scripts/verificarWebhookStripe.js`.
 */
const { EVENTOS_ESPERADOS, eventosTratadosNaRota } = require('../../scripts/verificarWebhookStripe');

describe('webhook do Stripe — eventos tratados x eventos declarados', () => {
  it('todo event.type tratado em routes/payment.js está declarado em EVENTOS_ESPERADOS', () => {
    const naoDeclarados = eventosTratadosNaRota().filter(e => !EVENTOS_ESPERADOS.includes(e));
    if (naoDeclarados.length) {
      throw new Error(
        `routes/payment.js passou a tratar ${naoDeclarados.join(', ')} sem declarar em ` +
        `EVENTOS_ESPERADOS (scripts/verificarWebhookStripe.js). Acrescente na lista E habilite o ` +
        `evento no endpoint do Stripe: sem isso o Stripe nunca envia esse evento e o handler ` +
        `fica morto em produção, como aconteceu com invoice.paid de 16/09 a 22/10/2026.`
      );
    }
  });

  it('todo evento declarado continua tendo handler em routes/payment.js', () => {
    const semHandler = EVENTOS_ESPERADOS.filter(e => !eventosTratadosNaRota().includes(e));
    if (semHandler.length) {
      throw new Error(
        `EVENTOS_ESPERADOS declara ${semHandler.join(', ')}, mas routes/payment.js não trata mais ` +
        `esse evento. Se o handler saiu de propósito, tire da lista e desabilite o evento no ` +
        `endpoint do Stripe para não receber entrega que ninguém processa.`
      );
    }
  });

  it('invoice.paid, que é a renovação mensal, está tratado e declarado', () => {
    expect(eventosTratadosNaRota()).toContain('invoice.paid');
    expect(EVENTOS_ESPERADOS).toContain('invoice.paid');
  });
});
