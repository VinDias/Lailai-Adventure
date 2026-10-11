/**
 * Testes: assinatura pela Google Play (Fase 6, T5).
 *
 * O esqueleto que existia antes desta fase (services/mobilePaymentService.js
 * + routes/mobilePayment.js) tinha quatro furos, e cada um deles tem teste
 * aqui:
 *
 * 1. O comprovante não era amarrado a ninguém, então o MESMO comprovante
 *    liberava quantas contas quisessem (replay). Ver "um comprovante, uma
 *    conta".
 * 2. A compra não era confirmada junto ao Google, que estorna
 *    automaticamente em 3 dias. Ver "confirmação da compra".
 * 3. Qualquer erro virava "compra inválida", então uma indisponibilidade do
 *    Google recusava assinante legítimo. Ver 502 x 402.
 * 4. Não havia recebimento dos avisos da Play, então renovação, cancelamento
 *    e estorno nunca chegavam ao banco. Ver "avisos da Play".
 *
 * Nenhum teste fala com o Google: a API é injetada por
 * `__setApiPlayForTests` (mesmo padrão de utils/googleTokenVerifier.js).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');
const play = require('../../services/playBillingService');

let app;
let User;
let PlayPurchase;

const DIA_MS = 24 * 60 * 60 * 1000;
const SEGREDO_RTDN = 'segredo-de-teste-dos-avisos';

/** Resposta da API v2 da Play, no formato que o Google devolve. */
function respostaDaPlay({
  estado = 'SUBSCRIPTION_STATE_ACTIVE',
  expiraEm = new Date(Date.now() + 30 * DIA_MS),
  productId = 'premium_mensal',
  confirmada = false,
  ultimoPedido = 'GPA.0001',
  tokenAnterior = null,
  semLinhas = false,
} = {}) {
  return {
    subscriptionState: estado,
    acknowledgementState: confirmada ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : 'ACKNOWLEDGEMENT_STATE_PENDING',
    latestOrderId: ultimoPedido,
    linkedPurchaseToken: tokenAnterior,
    lineItems: semLinhas ? [] : [{ productId, expiryTime: new Date(expiraEm).toISOString() }],
  };
}

/**
 * API da Play falsa. `assinatura` pode ser um objeto ou uma função do
 * comprovante, para o caso de um teste precisar de respostas diferentes por
 * token.
 */
function instalarApiFalsa({ assinatura, erroNaConsulta = false, erroNaConfirmacao = false } = {}) {
  const chamadas = { consultas: 0, confirmacoes: [] };
  play.__setApiPlayForTests({
    purchases: {
      subscriptionsv2: {
        get: async ({ token }) => {
          chamadas.consultas += 1;
          if (erroNaConsulta) throw new Error('Google indisponivel');
          const dados = typeof assinatura === 'function' ? assinatura(token) : assinatura;
          return { data: dados };
        },
      },
      subscriptions: {
        acknowledge: async ({ subscriptionId, token }) => {
          chamadas.confirmacoes.push({ subscriptionId, token });
          if (erroNaConfirmacao) throw new Error('falha ao confirmar');
        },
      },
    },
  });
  return chamadas;
}

/** Conta nova já logada — os testes de vínculo precisam de duas contas. */
async function contaLogada(email) {
  const senha = 'Conta@12345';
  await User.create({
    email,
    passwordHash: await bcrypt.hash(senha, 10),
    nome: email.split('@')[0],
    role: 'user',
    isActive: true,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { token: res.body.accessToken, id: res.body.user.id || res.body.user._id };
}

function comprar(token, purchaseToken) {
  return request(app)
    .post('/api/mobile/verify-google')
    .set('Authorization', `Bearer ${token}`)
    .send({ purchaseToken });
}

function avisar(evento, { segredo = SEGREDO_RTDN } = {}) {
  const dados = Buffer.from(JSON.stringify(evento), 'utf8').toString('base64');
  return request(app)
    .post(`/api/mobile/notificacoes?s=${encodeURIComponent(segredo)}`)
    .send({ message: { data: dados, messageId: '1' } });
}

beforeAll(async () => {
  await db.connect();
  process.env.ANDROID_PACKAGE_NAME = 'com.lorflux.twa';
  process.env.PLAY_RTDN_SECRET = SEGREDO_RTDN;
  app = require('../../server');
  User = require('../../models/User');
  PlayPurchase = require('../../models/PlayPurchase');
  // Sem isto o índice único de purchaseToken pode não existir ainda, e o
  // teste de replay passaria pelo motivo errado (lição do EnvioNovidades, T6).
  await PlayPurchase.init();
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

afterEach(() => {
  play.__setApiPlayForTests(null);
});

// ---------------------------------------------------------------------------
// 1. A regra de quem tem acesso, isolada
// ---------------------------------------------------------------------------
describe('normalizar — tradução da resposta da Play', () => {
  it('assinatura em dia dá acesso', () => {
    const r = play.normalizar(respostaDaPlay());
    expect(r.ativa).toBe(true);
    expect(r.productId).toBe('premium_mensal');
    expect(r.ultimoPedido).toBe('GPA.0001');
  });

  it('cancelada ainda no prazo DÁ acesso (o período já foi pago)', () => {
    const r = play.normalizar(respostaDaPlay({ estado: 'SUBSCRIPTION_STATE_CANCELED' }));
    expect(r.ativa).toBe(true);
  });

  it('período de tolerância dá acesso', () => {
    const r = play.normalizar(respostaDaPlay({ estado: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }));
    expect(r.ativa).toBe(true);
  });

  it.each([
    ['SUBSCRIPTION_STATE_ON_HOLD'],
    ['SUBSCRIPTION_STATE_PAUSED'],
    ['SUBSCRIPTION_STATE_EXPIRED'],
    ['SUBSCRIPTION_STATE_PENDING'],
    ['SUBSCRIPTION_STATE_UNSPECIFIED'],
  ])('%s não dá acesso', (estado) => {
    expect(play.normalizar(respostaDaPlay({ estado })).ativa).toBe(false);
  });

  it('ativa mas vencida não dá acesso', () => {
    const r = play.normalizar(respostaDaPlay({ expiraEm: new Date(Date.now() - DIA_MS) }));
    expect(r.ativa).toBe(false);
  });

  it('resposta sem data de validade não dá acesso (fecha por omissão)', () => {
    const r = play.normalizar(respostaDaPlay({ semLinhas: true }));
    expect(r.ativa).toBe(false);
    expect(r.expiraEm).toBeNull();
  });

  it('resposta vazia não dá acesso', () => {
    expect(play.normalizar(null).ativa).toBe(false);
    expect(play.normalizar({}).ativa).toBe(false);
  });

  it('com mais de uma linha, vale a data que vence por último', () => {
    const perto = new Date(Date.now() + 5 * DIA_MS);
    const longe = new Date(Date.now() + 40 * DIA_MS);
    const r = play.normalizar({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [
        { productId: 'complemento', expiryTime: perto.toISOString() },
        { productId: 'premium_mensal', expiryTime: longe.toISOString() },
      ],
    });
    expect(r.expiraEm.toISOString()).toBe(longe.toISOString());
  });

  it('data inválida é descartada, não vira acesso', () => {
    const r = play.normalizar({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'premium_mensal', expiryTime: 'nao-e-data' }],
    });
    expect(r.ativa).toBe(false);
  });

  it('lê a confirmação e a cadeia de troca de plano', () => {
    const r = play.normalizar(respostaDaPlay({ confirmada: true, tokenAnterior: 'token-velho' }));
    expect(r.confirmada).toBe(true);
    expect(r.tokenAnterior).toBe('token-velho');
  });
});

// ---------------------------------------------------------------------------
// 2. A rota de compra
// ---------------------------------------------------------------------------
describe('POST /api/mobile/verify-google', () => {
  it('exige login', async () => {
    const res = await request(app).post('/api/mobile/verify-google').send({ purchaseToken: 'x' });
    expect(res.status).toBe(401);
  });

  it('recusa corpo sem comprovante', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay() });
    const res = await comprar(auth.getToken('user'), '');
    expect(res.status).toBe(400);
  });

  it('o caminho antigo /mobile deixou de existir (agora é /api/mobile)', async () => {
    const res = await request(app)
      .post('/mobile/verify-google')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ purchaseToken: 'qualquer' });
    expect(res.status).toBe(404);
  });

  it('Google indisponível devolve 502, NÃO 402 — indisponibilidade não é compra inválida', async () => {
    instalarApiFalsa({ erroNaConsulta: true });
    const conta = await contaLogada('indisponivel@play.test');
    const res = await comprar(conta.token, 'token-sem-resposta');
    expect(res.status).toBe(502);
    const depois = await User.findById(conta.id).lean();
    expect(depois.isPremium).toBe(false);
  });

  it('assinatura inativa devolve 402 e não libera nada', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay({ estado: 'SUBSCRIPTION_STATE_EXPIRED' }) });
    const conta = await contaLogada('vencida@play.test');
    const res = await comprar(conta.token, 'token-vencido');
    expect(res.status).toBe(402);
    expect((await User.findById(conta.id).lean()).isPremium).toBe(false);
    expect(await PlayPurchase.findOne({ purchaseToken: 'token-vencido' })).toBeNull();
  });

  it('compra em dia libera o Premium com a data da Play e guarda o comprovante', async () => {
    const expiraEm = new Date(Date.now() + 30 * DIA_MS);
    const chamadas = instalarApiFalsa({ assinatura: respostaDaPlay({ expiraEm }) });
    const conta = await contaLogada('comprou@play.test');

    const res = await comprar(conta.token, 'token-bom');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const usuario = await User.findById(conta.id).lean();
    expect(usuario.isPremium).toBe(true);
    expect(new Date(usuario.premiumExpiresAt).toISOString()).toBe(expiraEm.toISOString());

    const registro = await PlayPurchase.findOne({ purchaseToken: 'token-bom' }).lean();
    expect(String(registro.userId)).toBe(String(conta.id));
    expect(registro.productId).toBe('premium_mensal');
    expect(registro.confirmada).toBe(true);
    expect(chamadas.confirmacoes).toHaveLength(1);
  });

  it('confirmação da compra usa o produto que a PLAY respondeu, não o que o app mandou', async () => {
    const chamadas = instalarApiFalsa({ assinatura: respostaDaPlay({ productId: 'produto_de_verdade' }) });
    const conta = await contaLogada('produto@play.test');

    await request(app)
      .post('/api/mobile/verify-google')
      .set('Authorization', `Bearer ${conta.token}`)
      .send({ purchaseToken: 'token-produto', productId: 'produto_mentiroso' });

    expect(chamadas.confirmacoes[0].subscriptionId).toBe('produto_de_verdade');
  });

  it('compra já confirmada não é confirmada de novo', async () => {
    const chamadas = instalarApiFalsa({ assinatura: respostaDaPlay({ confirmada: true }) });
    const conta = await contaLogada('jaconfirmada@play.test');
    const res = await comprar(conta.token, 'token-ja-confirmado');
    expect(res.status).toBe(200);
    expect(chamadas.confirmacoes).toHaveLength(0);
  });

  it('falha ao confirmar NÃO tira o acesso de quem pagou, mas fica registrada', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay(), erroNaConfirmacao: true });
    const conta = await contaLogada('semconfirmar@play.test');

    const res = await comprar(conta.token, 'token-sem-confirmar');
    expect(res.status).toBe(200);
    expect((await User.findById(conta.id).lean()).isPremium).toBe(true);
    // `false` aqui é o que faz a próxima notificação tentar confirmar de novo
    // antes do estorno automático de 3 dias.
    expect((await PlayPurchase.findOne({ purchaseToken: 'token-sem-confirmar' }).lean()).confirmada).toBe(false);
  });

  it('repetir a mesma compra na MESMA conta é idempotente', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay() });
    const conta = await contaLogada('repetiu@play.test');

    const primeira = await comprar(conta.token, 'token-repetido');
    const segunda = await comprar(conta.token, 'token-repetido');
    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await PlayPurchase.countDocuments({ purchaseToken: 'token-repetido' })).toBe(1);
  });

  it('um comprovante, uma conta: a segunda conta leva 409 e NÃO fica Premium', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay() });
    const dona = await contaLogada('dona@play.test');
    const invasora = await contaLogada('invasora@play.test');

    expect((await comprar(dona.token, 'token-disputado')).status).toBe(200);

    const res = await comprar(invasora.token, 'token-disputado');
    expect(res.status).toBe(409);
    expect((await User.findById(invasora.id).lean()).isPremium).toBe(false);
    // o vínculo original segue de pé
    const registro = await PlayPurchase.findOne({ purchaseToken: 'token-disputado' }).lean();
    expect(String(registro.userId)).toBe(String(dona.id));
  });

  it('não encurta um prazo maior já existente (conta paga também no navegador)', async () => {
    const prazoLongo = new Date(Date.now() + 90 * DIA_MS);
    instalarApiFalsa({ assinatura: respostaDaPlay({ expiraEm: new Date(Date.now() + 5 * DIA_MS) }) });
    const conta = await contaLogada('duasfontes@play.test');
    await User.findByIdAndUpdate(conta.id, { isPremium: true, premiumExpiresAt: prazoLongo });

    await comprar(conta.token, 'token-prazo-curto');

    const usuario = await User.findById(conta.id).lean();
    expect(new Date(usuario.premiumExpiresAt).toISOString()).toBe(prazoLongo.toISOString());
    expect(usuario.isPremium).toBe(true);
  });

  it('o comprovante sai com a conta na exclusão LGPD', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay() });
    const conta = await contaLogada('apagar@play.test');
    await comprar(conta.token, 'token-da-conta-apagada');

    const res = await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${conta.token}`)
      .send({ password: 'Conta@12345' });
    expect([200, 204]).toContain(res.status);
    expect(await PlayPurchase.findOne({ purchaseToken: 'token-da-conta-apagada' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Os avisos da Play (RTDN)
// ---------------------------------------------------------------------------
describe('POST /api/mobile/notificacoes — avisos da Play', () => {
  it('sem segredo configurado, recusa tudo com 503', async () => {
    const original = process.env.PLAY_RTDN_SECRET;
    delete process.env.PLAY_RTDN_SECRET;
    try {
      const res = await avisar({ testNotification: { version: '1.0' } });
      expect(res.status).toBe(503);
    } finally {
      process.env.PLAY_RTDN_SECRET = original;
    }
  });

  it('segredo errado leva 401', async () => {
    const res = await avisar({ testNotification: { version: '1.0' } }, { segredo: 'errado' });
    expect(res.status).toBe(401);
  });

  it('corpo fora do formato do Pub/Sub leva 400', async () => {
    const res = await request(app)
      .post(`/api/mobile/notificacoes?s=${SEGREDO_RTDN}`)
      .send({ qualquer: 'coisa' });
    expect(res.status).toBe(400);
  });

  it('conteúdo ilegível é confirmado e ignorado (reentregar não resolveria)', async () => {
    const res = await request(app)
      .post(`/api/mobile/notificacoes?s=${SEGREDO_RTDN}`)
      .send({ message: { data: 'nao-e-base64-de-json' } });
    expect(res.status).toBe(200);
  });

  it('aviso de teste do Play Console responde 200', async () => {
    const res = await avisar({ testNotification: { version: '1.0' } });
    expect(res.status).toBe(200);
    expect(res.body.teste).toBe(true);
  });

  it('comprovante desconhecido responde 200 (senão o Pub/Sub reentrega para sempre)', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay() });
    const res = await avisar({ subscriptionNotification: { notificationType: 2, purchaseToken: 'nunca-visto' } });
    expect(res.status).toBe(200);
    expect(res.body.resultado).toBe('desconhecido');
  });

  it('renovação estende o prazo da conta', async () => {
    const primeiroPrazo = new Date(Date.now() + 2 * DIA_MS);
    const prazoRenovado = new Date(Date.now() + 32 * DIA_MS);

    instalarApiFalsa({ assinatura: respostaDaPlay({ expiraEm: primeiroPrazo, confirmada: true }) });
    const conta = await contaLogada('renovou@play.test');
    await comprar(conta.token, 'token-renovavel');

    instalarApiFalsa({ assinatura: respostaDaPlay({ expiraEm: prazoRenovado, confirmada: true }) });
    const res = await avisar({ subscriptionNotification: { notificationType: 2, purchaseToken: 'token-renovavel' } });

    expect(res.status).toBe(200);
    expect(res.body.resultado).toBe('liberado');
    const usuario = await User.findById(conta.id).lean();
    expect(new Date(usuario.premiumExpiresAt).toISOString()).toBe(prazoRenovado.toISOString());
  });

  it('expiração encerra o Premium', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay({ confirmada: true }) });
    const conta = await contaLogada('expirou@play.test');
    await comprar(conta.token, 'token-que-expira');
    expect((await User.findById(conta.id).lean()).isPremium).toBe(true);

    instalarApiFalsa({
      assinatura: respostaDaPlay({
        estado: 'SUBSCRIPTION_STATE_EXPIRED',
        expiraEm: new Date(Date.now() - DIA_MS),
        confirmada: true,
      }),
    });
    const res = await avisar({ subscriptionNotification: { notificationType: 13, purchaseToken: 'token-que-expira' } });

    expect(res.body.resultado).toBe('encerrado');
    expect((await User.findById(conta.id).lean()).isPremium).toBe(false);
  });

  it('não encerra o Premium de quem tem prazo maior por outra fonte', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay({ confirmada: true }) });
    const conta = await contaLogada('outrafonte@play.test');
    await comprar(conta.token, 'token-com-stripe-ao-lado');

    const prazoDoStripe = new Date(Date.now() + 90 * DIA_MS);
    await User.findByIdAndUpdate(conta.id, { isPremium: true, premiumExpiresAt: prazoDoStripe });

    instalarApiFalsa({
      assinatura: respostaDaPlay({
        estado: 'SUBSCRIPTION_STATE_EXPIRED',
        expiraEm: new Date(Date.now() - DIA_MS),
        confirmada: true,
      }),
    });
    const res = await avisar({ subscriptionNotification: { notificationType: 13, purchaseToken: 'token-com-stripe-ao-lado' } });

    expect(res.body.resultado).toBe('mantido_por_outra_fonte');
    expect((await User.findById(conta.id).lean()).isPremium).toBe(true);
  });

  it('consulta ao Google indisponível devolve 503, para o Pub/Sub reentregar', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay({ confirmada: true }) });
    const conta = await contaLogada('reentrega@play.test');
    await comprar(conta.token, 'token-reentrega');

    instalarApiFalsa({ erroNaConsulta: true });
    const res = await avisar({ subscriptionNotification: { notificationType: 2, purchaseToken: 'token-reentrega' } });
    expect(res.status).toBe(503);
    // o acesso de quem pagou não é cortado por falha nossa
    expect((await User.findById(conta.id).lean()).isPremium).toBe(true);
  });

  it('estorno encerra o acesso na hora', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay({ confirmada: true }) });
    const conta = await contaLogada('estornou@play.test');
    await comprar(conta.token, 'token-estornado');

    const res = await avisar({ voidedPurchaseNotification: { purchaseToken: 'token-estornado', orderId: 'GPA.9' } });
    expect(res.status).toBe(200);
    expect((await User.findById(conta.id).lean()).isPremium).toBe(false);
    expect((await PlayPurchase.findOne({ purchaseToken: 'token-estornado' }).lean()).estado).toBe('ESTORNADA');
  });

  it('aviso tenta confirmar de novo a compra que ficou sem confirmação', async () => {
    instalarApiFalsa({ assinatura: respostaDaPlay(), erroNaConfirmacao: true });
    const conta = await contaLogada('segundatentativa@play.test');
    await comprar(conta.token, 'token-segunda-tentativa');
    expect((await PlayPurchase.findOne({ purchaseToken: 'token-segunda-tentativa' }).lean()).confirmada).toBe(false);

    const chamadas = instalarApiFalsa({ assinatura: respostaDaPlay() });
    await avisar({ subscriptionNotification: { notificationType: 4, purchaseToken: 'token-segunda-tentativa' } });

    expect(chamadas.confirmacoes).toHaveLength(1);
    expect((await PlayPurchase.findOne({ purchaseToken: 'token-segunda-tentativa' }).lean()).confirmada).toBe(true);
  });
});
