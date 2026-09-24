/**
 * Testes: assinatura Premium (Stripe) — renovação mensal e preço exibido.
 *
 * Falhas encontradas em 16/09/2026, antes do cliente ativar a conta Stripe:
 * (1) o webhook só tratava a PRIMEIRA cobrança (checkout.session.completed,
 *     +30 dias) e o cancelamento. A renovação (`invoice.paid`) não existia,
 *     então quem continuava pagando perdia o Premium na prática: voltava a
 *     ver anúncio (utils/premium.ts) e saía da contagem de assinantes do pool
 *     de royalties (services/royaltyReportService.js).
 * (2) o valor mostrado no botão "Assinar Premium" era fixo no código, sem
 *     relação com o preço cadastrado no Stripe.
 *
 * A assinatura do webhook é validada de VERDADE (mesma abordagem de
 * tests/backend/superReader.test.js: generateTestHeaderString com um segredo
 * de teste).
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let User;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

describe('webhook — renovação mensal (invoice.paid)', () => {
  const stripeTestUtil = require('stripe')('sk_test_dummy_key_apenas_para_assinar_webhooks_em_teste');
  const TEST_WEBHOOK_SECRET = 'whsec_test_assinatura_premium';
  let segredoOriginal;

  beforeAll(() => {
    segredoOriginal = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  });

  afterAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = segredoOriginal;
  });

  function enviarEvento(evento) {
    const payload = JSON.stringify(evento);
    const assinatura = stripeTestUtil.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
    return request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', assinatura)
      .send(payload);
  }

  function eventoFaturaPaga({ subscription, customer, fimEmSegundos }) {
    return {
      id: `evt_inv_${Date.now()}`,
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_${Date.now()}`,
          customer,
          subscription,
          period_end: fimEmSegundos,
          lines: { data: [{ period: { start: fimEmSegundos - 2592000, end: fimEmSegundos } }] },
        },
      },
    };
  }

  let contador = 0;
  async function assinante(overrides = {}) {
    contador += 1;
    return User.create({
      email: `assinante-${contador}-${Date.now()}@lorflux.test`,
      passwordHash: 'x',
      nome: 'Assinante',
      isPremium: true,
      stripeCustomerId: `cus_${contador}_${Date.now()}`,
      stripeSubscriptionId: `sub_${contador}_${Date.now()}`,
      premiumExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // venceu ontem
      ...overrides,
    });
  }

  it('estende a validade até o fim do período cobrado na fatura', async () => {
    const user = await assinante();
    const fim = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const res = await enviarEvento(eventoFaturaPaga({
      subscription: user.stripeSubscriptionId,
      customer: user.stripeCustomerId,
      fimEmSegundos: fim,
    }));
    expect(res.status).toBe(200);

    const atualizado = await User.findById(user._id).lean();
    expect(atualizado.isPremium).toBe(true);
    expect(Math.floor(new Date(atualizado.premiumExpiresAt).getTime() / 1000)).toBe(fim);
    expect(new Date(atualizado.premiumExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('reenvio do MESMO evento não acumula tempo (data absoluta, não +30 dias)', async () => {
    const user = await assinante();
    const fim = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const evento = eventoFaturaPaga({
      subscription: user.stripeSubscriptionId,
      customer: user.stripeCustomerId,
      fimEmSegundos: fim,
    });

    await enviarEvento(evento);
    const primeira = (await User.findById(user._id).lean()).premiumExpiresAt;
    await enviarEvento(evento);
    const segunda = (await User.findById(user._id).lean()).premiumExpiresAt;

    expect(new Date(segunda).getTime()).toBe(new Date(primeira).getTime());
  });

  it('acha o assinante pelo cliente quando a assinatura ainda não está gravada', async () => {
    const user = await assinante({ stripeSubscriptionId: null, isPremium: false });
    const fim = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    await enviarEvento(eventoFaturaPaga({
      subscription: 'sub_nova_ainda_nao_gravada',
      customer: user.stripeCustomerId,
      fimEmSegundos: fim,
    }));

    const atualizado = await User.findById(user._id).lean();
    expect(atualizado.isPremium).toBe(true);
    expect(atualizado.stripeSubscriptionId).toBe('sub_nova_ainda_nao_gravada');
  });

  it('fatura sem usuário correspondente é ignorada sem erro (200) e sem premiar ninguém', async () => {
    const antes = await User.countDocuments({ isPremium: true });
    const res = await enviarEvento(eventoFaturaPaga({
      subscription: 'sub_fantasma',
      customer: 'cus_fantasma',
      fimEmSegundos: Math.floor(Date.now() / 1000) + 3600,
    }));

    expect(res.status).toBe(200);
    expect(await User.countDocuments({ isPremium: true })).toBe(antes);
  });
});

describe('GET /api/payment/precos', () => {
  // Sem chave válida do Stripe no ambiente de teste, cada Price falha
  // individualmente e a rota responde `precos` vazio — é justamente o
  // contrato que o app precisa: nunca derruba a tela, o valor de reserva
  // (utils/localizedPrice.ts) assume.
  it('responde 200 com o objeto precos mesmo quando o Stripe não devolve nenhum preço', async () => {
    const res = await request(app).get('/api/payment/precos');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('precos');
    expect(typeof res.body.precos).toBe('object');
  });

  it('é público: não exige login (a tela de assinatura aparece antes de qualquer ação de conta)', async () => {
    const res = await request(app).get('/api/payment/precos');
    expect(res.status).not.toBe(401);
  });
});
