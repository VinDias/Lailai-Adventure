/**
 * Testes: Fase 4, Bloco 3 — Super Reader (apoio direto ao autor).
 * Task 1: modelo SuperReaderContribution + services/superReaderService.js
 * (criarSessaoDeApoio, registrarContribuicao, lerMinimoCents).
 * Spec: docs/superpowers/specs/2026-08-20-super-reader-design.md
 *
 * Convenção de erro (para a Task 2 consumir nas rotas): funções do serviço
 * lançam `Error` com `.status` (400 validação, 404 não encontrado) — mesmo
 * padrão de services/progressService.js + routes/progress.js
 * (`err.status === 400 → res.status(400)`).
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let mongoose;
let Series;
let Setting;
let SuperReaderContribution;
let superReaderService;
let User;

beforeAll(async () => {
  await db.connect();
  app = require('../../server'); // dispara dotenv.config() — mesmo padrão dos demais arquivos de teste
  mongoose = require('mongoose');
  Series = require('../../models/Series');
  Setting = require('../../models/Setting');
  SuperReaderContribution = require('../../models/SuperReaderContribution');
  superReaderService = require('../../services/superReaderService');
  User = require('../../models/User');
  await auth.createUsers(app);

  // require('../../server') carrega ~20 models; a construção dos índices
  // declarados (autoIndex) roda em background e NÃO está garantida pronta
  // quando os testes começam. Model.init() espera essa construção terminar
  // — sem isso, o teste de unicidade de stripeSessionId é uma corrida: às
  // vezes passa (índice já pronto), às vezes falha (índice ainda não existe
  // e o segundo create() simplesmente resolve). Achado da revisão.
  await SuperReaderContribution.init();
});

afterAll(() => db.closeDatabase());

afterEach(() => {
  superReaderService.__setStripeForTests(null);
});

async function criarSerie({ isPublished = true, channelId = new mongoose.Types.ObjectId(), title = 'Obra Super Reader' } = {}) {
  const dados = { title, genre: 'Teste', content_type: 'hiqua', isPublished };
  if (channelId !== null) dados.channelId = channelId;
  return Series.create(dados);
}

describe('modelo SuperReaderContribution', () => {
  function docValido(overrides = {}) {
    return {
      seriesId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      amountCents: 500,
      currency: 'brl',
      authorShareCents: 400,
      platformShareCents: 100,
      stripeSessionId: `cs_test_${new mongoose.Types.ObjectId()}`,
      period: '2026-08',
      ...overrides,
    };
  }

  it('exige seriesId', async () => {
    const { seriesId, ...semSeriesId } = docValido();
    await expect(SuperReaderContribution.create(semSeriesId)).rejects.toThrow();
  });

  it('exige channelId', async () => {
    const { channelId, ...semChannelId } = docValido();
    await expect(SuperReaderContribution.create(semChannelId)).rejects.toThrow();
  });

  it('exige amountCents', async () => {
    const { amountCents, ...semAmount } = docValido();
    await expect(SuperReaderContribution.create(semAmount)).rejects.toThrow();
  });

  it('exige authorShareCents', async () => {
    const { authorShareCents, ...semAuthorShare } = docValido();
    await expect(SuperReaderContribution.create(semAuthorShare)).rejects.toThrow();
  });

  it('exige platformShareCents', async () => {
    const { platformShareCents, ...semPlatformShare } = docValido();
    await expect(SuperReaderContribution.create(semPlatformShare)).rejects.toThrow();
  });

  it('exige stripeSessionId', async () => {
    const { stripeSessionId, ...semStripeSessionId } = docValido();
    await expect(SuperReaderContribution.create(semStripeSessionId)).rejects.toThrow();
  });

  it('grava com todos os campos obrigatórios presentes', async () => {
    const doc = await SuperReaderContribution.create(docValido());
    expect(doc.amountCents).toBe(500);
    expect(doc.authorShareCents).toBe(400);
    expect(doc.platformShareCents).toBe(100);
    expect(doc.userId).toBeNull(); // default — não anonimizado ainda
  });

  it('recusa dois documentos com o mesmo stripeSessionId (E11000)', async () => {
    const stripeSessionId = `cs_test_duplicado_${new mongoose.Types.ObjectId()}`;
    await SuperReaderContribution.create(docValido({ stripeSessionId }));

    await expect(
      SuperReaderContribution.create(docValido({ stripeSessionId })),
    ).rejects.toThrow();
  });
});

describe('lerMinimoCents', () => {
  it('sem Setting cadastrado, retorna o default 500', async () => {
    await Setting.deleteOne({ key: 'superReaderMinCents' });
    const minimo = await superReaderService.lerMinimoCents();
    expect(minimo).toBe(500);
  });

  it('lê o valor do Setting quando presente e válido', async () => {
    await Setting.findOneAndUpdate(
      { key: 'superReaderMinCents' },
      { value: '1000' },
      { upsert: true },
    );
    const minimo = await superReaderService.lerMinimoCents();
    expect(minimo).toBe(1000);
  });

  it('valor lixo ("abc") cai no default 500', async () => {
    await Setting.findOneAndUpdate(
      { key: 'superReaderMinCents' },
      { value: 'abc' },
      { upsert: true },
    );
    const minimo = await superReaderService.lerMinimoCents();
    expect(minimo).toBe(500);
  });

  it('valor negativo ("-10") cai no default 500', async () => {
    await Setting.findOneAndUpdate(
      { key: 'superReaderMinCents' },
      { value: '-10' },
      { upsert: true },
    );
    const minimo = await superReaderService.lerMinimoCents();
    expect(minimo).toBe(500);
  });

  it('valor não-inteiro ("500.5") cai no default 500', async () => {
    await Setting.findOneAndUpdate(
      { key: 'superReaderMinCents' },
      { value: '500.5' },
      { upsert: true },
    );
    const minimo = await superReaderService.lerMinimoCents();
    expect(minimo).toBe(500);
  });
});

describe('criarSessaoDeApoio', () => {
  beforeEach(async () => {
    // Volta o mínimo ao default entre testes — alguns testes de lerMinimoCents
    // acima deixam Setting sujo.
    await Setting.deleteOne({ key: 'superReaderMinCents' });
  });

  function fakeStripe(sessaoRetornada = { id: 'cs_test_fake_1', url: 'https://checkout.stripe.com/fake-session' }) {
    const capturados = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params) => {
            capturados.push(params);
            return sessaoRetornada;
          },
        },
      },
    };
    return { stripe, capturados };
  }

  it('valor abaixo do mínimo é rejeitado (erro com .status)', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie();

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 100, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('amountCents não-inteiro (500.5) é rejeitado', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie();

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 500.5, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('moeda inválida é rejeitada', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie();

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 500, currency: 'jpy',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('série inexistente é rejeitada (404)', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: new mongoose.Types.ObjectId(), amountCents: 500, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('série despublicada é rejeitada', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie({ isPublished: false });

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 500, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('série sem channelId é rejeitada', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie({ channelId: null });

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 500, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('caso feliz: cria a sessão com metadata completo, valor e moeda corretos, e devolve a url do fake', async () => {
    const { stripe, capturados } = fakeStripe({ id: 'cs_test_feliz', url: 'https://checkout.stripe.com/feliz' });
    superReaderService.__setStripeForTests(stripe);

    const userId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    const serie = await criarSerie({ channelId });

    const resultado = await superReaderService.criarSessaoDeApoio({
      userId, seriesId: serie._id, amountCents: 750, currency: 'brl',
    });

    expect(resultado).toEqual({ url: 'https://checkout.stripe.com/feliz' });
    expect(capturados).toHaveLength(1);

    const params = capturados[0];
    expect(params.mode).toBe('payment');
    expect(params.payment_method_types).toEqual(['card']);
    expect(params.metadata).toEqual({
      tipo: 'super_reader',
      userId: String(userId),
      seriesId: String(serie._id),
      channelId: String(channelId),
    });
    expect(params.success_url).toBe(`${process.env.FRONTEND_URL}/?superreader=success`);
    expect(params.cancel_url).toBe(`${process.env.FRONTEND_URL}/?superreader=cancelled`);

    // Valor e moeda do apoio devem estar no line item (formato price_data,
    // já que não há um Price pré-cadastrado no Stripe para valor livre).
    expect(params.line_items).toHaveLength(1);
    const lineItem = params.line_items[0];
    expect(lineItem.quantity).toBe(1);
    expect(lineItem.price_data.currency).toBe('brl');
    expect(lineItem.price_data.unit_amount).toBe(750);
  });

  it('moeda usd é rejeitada (Super Reader trancado em BRL até existir política cambial)', async () => {
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie();

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 750, currency: 'usd',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('respeita um mínimo customizado via Setting (não só o default 500)', async () => {
    await Setting.findOneAndUpdate(
      { key: 'superReaderMinCents' },
      { value: '2000' },
      { upsert: true },
    );
    const { stripe } = fakeStripe();
    superReaderService.__setStripeForTests(stripe);
    const serie = await criarSerie();

    await expect(
      superReaderService.criarSessaoDeApoio({
        userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 1500, currency: 'brl',
      }),
    ).rejects.toMatchObject({ status: 400 });

    // 2000 (igual ao mínimo customizado) passa.
    const resultado = await superReaderService.criarSessaoDeApoio({
      userId: new mongoose.Types.ObjectId(), seriesId: serie._id, amountCents: 2000, currency: 'brl',
    });
    expect(resultado.url).toBeTruthy();

    await Setting.deleteOne({ key: 'superReaderMinCents' });
  });
});

describe('registrarContribuicao', () => {
  function montarSessao(overrides = {}) {
    return {
      id: `cs_test_webhook_${new mongoose.Types.ObjectId()}`,
      amount_total: 500,
      currency: 'brl',
      metadata: {
        tipo: 'super_reader',
        userId: String(new mongoose.Types.ObjectId()),
        seriesId: String(new mongoose.Types.ObjectId()),
        channelId: String(new mongoose.Types.ObjectId()),
      },
      ...overrides,
    };
  }

  it('grava com a divisão 80/20 correta (500 → 400/100)', async () => {
    const sessao = montarSessao({ amount_total: 500 });
    const doc = await superReaderService.registrarContribuicao(sessao);

    expect(doc.amountCents).toBe(500);
    expect(doc.authorShareCents).toBe(400);
    expect(doc.platformShareCents).toBe(100);
  });

  it('grava com a divisão 80/20 correta (999 → 799/200 — Math.round(999*0.8)=799)', async () => {
    const sessao = montarSessao({ amount_total: 999 });
    const doc = await superReaderService.registrarContribuicao(sessao);

    expect(doc.authorShareCents).toBe(799);
    expect(doc.platformShareCents).toBe(200);
    expect(doc.authorShareCents + doc.platformShareCents).toBe(999);
  });

  it('o valor vem de amount_total mesmo se o metadata trouxer outro número (P2)', async () => {
    const sessao = montarSessao({
      amount_total: 500,
      metadata: {
        tipo: 'super_reader',
        userId: String(new mongoose.Types.ObjectId()),
        seriesId: String(new mongoose.Types.ObjectId()),
        channelId: String(new mongoose.Types.ObjectId()),
        // Um metadata "forjado"/desatualizado nunca é a fonte do valor.
        amountCents: '999999',
      },
    });
    const doc = await superReaderService.registrarContribuicao(sessao);

    expect(doc.amountCents).toBe(500);
    expect(doc.authorShareCents).toBe(400);
  });

  it('retry do Stripe (mesma session.id duas vezes) mantém UM único doc com os valores da primeira gravação', async () => {
    const sessionId = `cs_test_retry_${new mongoose.Types.ObjectId()}`;
    const primeiraSessao = montarSessao({ id: sessionId, amount_total: 500 });
    const doc1 = await superReaderService.registrarContribuicao(primeiraSessao);

    // Reenvio do Stripe: mesmo id, mas com valores diferentes no payload
    // (simulação — na prática o Stripe reenviaria o mesmo evento, mas o
    // upsert precisa ser robusto mesmo que não fosse idêntico).
    const segundaSessao = montarSessao({ id: sessionId, amount_total: 5000 });
    const doc2 = await superReaderService.registrarContribuicao(segundaSessao);

    expect(String(doc2._id)).toBe(String(doc1._id));
    expect(doc2.amountCents).toBe(500); // valores da PRIMEIRA gravação, não sobrescritos
    expect(doc2.authorShareCents).toBe(400);

    const todos = await SuperReaderContribution.find({ stripeSessionId: sessionId });
    expect(todos).toHaveLength(1);
  });

  it('period no formato YYYY-MM (mês do webhook, não do metadata)', async () => {
    const sessao = montarSessao();
    const doc = await superReaderService.registrarContribuicao(sessao);

    expect(doc.period).toMatch(/^\d{4}-\d{2}$/);
    const agora = new Date();
    const periodoEsperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    expect(doc.period).toBe(periodoEsperado);
  });

  it('preenche userId/seriesId/channelId a partir do metadata', async () => {
    const userId = new mongoose.Types.ObjectId();
    const seriesId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    const sessao = montarSessao({ metadata: { tipo: 'super_reader', userId: String(userId), seriesId: String(seriesId), channelId: String(channelId) } });

    const doc = await superReaderService.registrarContribuicao(sessao);

    expect(String(doc.userId)).toBe(String(userId));
    expect(String(doc.seriesId)).toBe(String(seriesId));
    expect(String(doc.channelId)).toBe(String(channelId));
    expect(doc.currency).toBe('brl');
    expect(doc.stripeSessionId).toBe(sessao.id);
  });

  it('rejeita (lança) se a sessão não tiver metadata.tipo === "super_reader" — defesa contra chamada errada', async () => {
    const sessao = montarSessao({ metadata: { tipo: 'premium' } });
    await expect(superReaderService.registrarContribuicao(sessao)).rejects.toThrow();
  });

  it('corrida real (Promise.all): duas chamadas concorrentes para a MESMA sessão gravam exatamente 1 doc, com valores consistentes, e nenhuma das duas lança', async () => {
    const sessao = montarSessao({ amount_total: 700 });

    // Duas gravações concorrentes do MESMO stripeSessionId disputam o
    // upsert; o findOneAndUpdate não é atômico entre processos concorrentes
    // no nível do índice único — uma delas pode receber E11000 na tentativa
    // de insert. O serviço trata isso devolvendo o doc do vencedor em vez de
    // deixar o erro vazar (o webhook do Stripe pode reenviar quase em
    // paralelo se dois workers processarem o mesmo evento).
    const [doc1, doc2] = await Promise.all([
      superReaderService.registrarContribuicao(sessao),
      superReaderService.registrarContribuicao(sessao),
    ]);

    expect(String(doc1._id)).toBe(String(doc2._id));
    expect(doc1.amountCents).toBe(700);
    expect(doc2.amountCents).toBe(700);
    expect(doc1.authorShareCents).toBe(doc2.authorShareCents);
    expect(doc1.platformShareCents).toBe(doc2.platformShareCents);

    const todos = await SuperReaderContribution.find({ stripeSessionId: sessao.id });
    expect(todos).toHaveLength(1);
  });

  // Duas promises no mesmo processo contra um mongod único não colidem de
  // verdade no índice (o mongod serializa o upsert) — o teste acima prova o
  // resultado, mas não percorre o branch do E11000. Aqui a corrida é FORÇADA
  // com o mock rejeitando, como o perdedor real veria entre processos
  // (PM2 cluster / dois workers com o mesmo evento do Stripe) — mesmo padrão
  // de progress.test.js para a corrida do upsert de progresso.
  it('perdedor da corrida (E11000 forçado): re-busca e devolve o doc do vencedor', async () => {
    const sessao = montarSessao({ amount_total: 900 });
    const vencedor = await superReaderService.registrarContribuicao(sessao);

    const spy = vi.spyOn(SuperReaderContribution, 'findOneAndUpdate').mockImplementationOnce(async () => {
      const err = new Error('E11000 duplicate key error collection');
      err.code = 11000;
      throw err;
    });
    try {
      const doc = await superReaderService.registrarContribuicao(sessao);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(doc._id)).toBe(String(vencedor._id));
      expect(doc.amountCents).toBe(900);
      expect(doc.authorShareCents).toBe(vencedor.authorShareCents);
    } finally {
      spy.mockRestore();
    }
  });

  it('E11000 com re-busca vazia relança o erro original (não mascara com null)', async () => {
    const sessao = montarSessao();
    const spyUpsert = vi.spyOn(SuperReaderContribution, 'findOneAndUpdate').mockImplementationOnce(async () => {
      const err = new Error('E11000 duplicate key error collection');
      err.code = 11000;
      throw err;
    });
    const spyFindOne = vi.spyOn(SuperReaderContribution, 'findOne').mockResolvedValueOnce(null);
    try {
      await expect(superReaderService.registrarContribuicao(sessao)).rejects.toThrow(/E11000/);
    } finally {
      spyUpsert.mockRestore();
      spyFindOne.mockRestore();
    }
  });
});

describe('__setStripeForTests', () => {
  it('lança fora de NODE_ENV=test', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => superReaderService.__setStripeForTests({})).toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

/**
 * Task 2: routes/superReader.js — rotas finas por cima do serviço da T1.
 * Convenção de erro consumida das rotas: err.status do serviço vira o mesmo
 * status HTTP com { error: mensagem }; sem .status vira 500 genérico (mesmo
 * padrão de routes/progress.js).
 */
describe('rotas', () => {
  function fakeStripe(sessaoRetornada = { id: 'cs_test_rota_1', url: 'https://checkout.stripe.com/rota' }) {
    const capturados = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params) => {
            capturados.push(params);
            return sessaoRetornada;
          },
        },
      },
    };
    return { stripe, capturados };
  }

  describe('autenticação', () => {
    it('POST /api/superreader/create-session sem token → 401', async () => {
      const res = await request(app)
        .post('/api/superreader/create-session')
        .send({ seriesId: new mongoose.Types.ObjectId().toString(), amountCents: 500, currency: 'brl' });
      expect(res.status).toBe(401);
    });

    it('GET /api/superreader/me sem token → 401', async () => {
      const res = await request(app).get('/api/superreader/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/superreader/min sem token → responde normalmente (rota pública)', async () => {
      const res = await request(app).get('/api/superreader/min');
      expect(res.status).toBe(200);
      expect(typeof res.body.minCents).toBe('number');
    });
  });

  describe('POST /create-session', () => {
    beforeEach(async () => {
      // Mesmo cuidado do describe('criarSessaoDeApoio') acima: garante o
      // mínimo no default entre testes.
      await Setting.deleteOne({ key: 'superReaderMinCents' });
    });

    it('valor abaixo do mínimo → 400 com a mensagem do serviço', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie();

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 100, currency: 'brl' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('O apoio mínimo é de 500 centavos.');
    });

    it('amountCents não-inteiro (500.5) → 400', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie();

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 500.5, currency: 'brl' });

      expect(res.status).toBe(400);
    });

    it('moeda inválida → 400', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie();

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 500, currency: 'jpy' });

      expect(res.status).toBe(400);
    });

    it('série inexistente → 404', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: new mongoose.Types.ObjectId().toString(), amountCents: 500, currency: 'brl' });

      expect(res.status).toBe(404);
    });

    it('série despublicada → 400', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie({ isPublished: false });

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 500, currency: 'brl' });

      expect(res.status).toBe(400);
    });

    it('série sem canal → 400', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie({ channelId: null });

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 500, currency: 'brl' });

      expect(res.status).toBe(400);
    });

    it('caso feliz: 200 com { url }, e o metadata da sessão traz o userId DO TOKEN — não o que vier no body', async () => {
      const { stripe, capturados } = fakeStripe({ id: 'cs_test_rota_feliz', url: 'https://checkout.stripe.com/rota-feliz' });
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie();

      // userId "forjado" no body: se a rota o usasse, o metadata traria este
      // valor. A rota deve ignorá-lo e usar sempre req.user.id (do token).
      const userIdForjado = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 750, currency: 'brl', userId: userIdForjado });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: 'https://checkout.stripe.com/rota-feliz' });

      expect(capturados).toHaveLength(1);
      expect(capturados[0].metadata.tipo).toBe('super_reader');
      expect(capturados[0].metadata.userId).toBe(auth.getId('user'));
      expect(capturados[0].metadata.userId).not.toBe(userIdForjado);
    });

    it('moeda usd → 400 (trancado em BRL até existir política cambial)', async () => {
      const { stripe } = fakeStripe();
      superReaderService.__setStripeForTests(stripe);
      const serie = await criarSerie();

      const res = await request(app)
        .post('/api/superreader/create-session')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ seriesId: serie._id.toString(), amountCents: 750, currency: 'usd' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /me', () => {
    it('usuário sem contribuições → { superReader: false, contribuicoes: [] }', async () => {
      const res = await request(app)
        .get('/api/superreader/me')
        .set('Authorization', `Bearer ${auth.getToken('premium')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ superReader: false, contribuicoes: [] });
    });

    it('com contribuições, devolve na ordem certa (mais recente primeiro), com seriesTitle resolvido, sem stripeSessionId/shares', async () => {
      const userId = auth.getId('admin');
      const serieAntiga = await criarSerie({ title: 'Obra Antiga' });
      const serieNova = await criarSerie({ title: 'Obra Nova' });

      const agora = Date.now();
      await SuperReaderContribution.create({
        userId, seriesId: serieAntiga._id, channelId: serieAntiga.channelId,
        amountCents: 500, currency: 'brl', authorShareCents: 400, platformShareCents: 100,
        stripeSessionId: `cs_test_me_antiga_${new mongoose.Types.ObjectId()}`,
        period: '2026-06', createdAt: new Date(agora - 10000),
      });
      await SuperReaderContribution.create({
        userId, seriesId: serieNova._id, channelId: serieNova.channelId,
        amountCents: 1000, currency: 'usd', authorShareCents: 800, platformShareCents: 200,
        stripeSessionId: `cs_test_me_nova_${new mongoose.Types.ObjectId()}`,
        period: '2026-08', createdAt: new Date(agora),
      });

      const res = await request(app)
        .get('/api/superreader/me')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.superReader).toBe(true);
      expect(res.body.contribuicoes).toHaveLength(2);

      expect(res.body.contribuicoes[0]).toMatchObject({ seriesTitle: 'Obra Nova', amountCents: 1000, currency: 'usd' });
      expect(res.body.contribuicoes[1]).toMatchObject({ seriesTitle: 'Obra Antiga', amountCents: 500, currency: 'brl' });

      res.body.contribuicoes.forEach((c) => {
        expect(c.stripeSessionId).toBeUndefined();
        expect(c.authorShareCents).toBeUndefined();
        expect(c.platformShareCents).toBeUndefined();
        expect(c.seriesId).toBeUndefined(); // só seriesTitle sai, não o id bruto/populado
        expect(c.channelId).toBeUndefined();
        expect(c.userId).toBeUndefined();
      });
    });

    it('contribuição de outro usuário não aparece', async () => {
      const outroUserId = new mongoose.Types.ObjectId();
      const serie = await criarSerie({ title: 'Obra De Outro Usuario' });
      await SuperReaderContribution.create({
        userId: outroUserId, seriesId: serie._id, channelId: serie.channelId,
        amountCents: 500, currency: 'brl', authorShareCents: 400, platformShareCents: 100,
        stripeSessionId: `cs_test_outro_${new mongoose.Types.ObjectId()}`,
        period: '2026-08',
      });

      const res = await request(app)
        .get('/api/superreader/me')
        .set('Authorization', `Bearer ${auth.getToken('user')}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ superReader: false, contribuicoes: [] });
    });

    it('série apagada → seriesTitle null, sem explodir', async () => {
      const serie = await criarSerie({ title: 'Obra Que Sera Apagada' });
      await SuperReaderContribution.create({
        userId: auth.getId('superadmin'), seriesId: serie._id, channelId: serie.channelId,
        amountCents: 500, currency: 'brl', authorShareCents: 400, platformShareCents: 100,
        stripeSessionId: `cs_test_apagada_${new mongoose.Types.ObjectId()}`,
        period: '2026-08',
      });
      await Series.deleteOne({ _id: serie._id });

      const res = await request(app)
        .get('/api/superreader/me')
        .set('Authorization', `Bearer ${auth.getToken('superadmin')}`);

      expect(res.status).toBe(200);
      expect(res.body.contribuicoes).toHaveLength(1);
      expect(res.body.contribuicoes[0].seriesTitle).toBeNull();
    });
  });

  describe('GET /min', () => {
    beforeEach(async () => {
      await Setting.deleteOne({ key: 'superReaderMinCents' });
    });

    it('sem Setting cadastrado, default 500', async () => {
      const res = await request(app).get('/api/superreader/min');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ minCents: 500 });
    });

    it('reflete Setting alterado', async () => {
      await Setting.findOneAndUpdate(
        { key: 'superReaderMinCents' },
        { value: '1500' },
        { upsert: true },
      );
      const res = await request(app).get('/api/superreader/min');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ minCents: 1500 });
    });
  });
});

/**
 * Task 3: routes/payment.js — POST /api/payment/webhook ganha o branch
 * `metadata.tipo === 'super_reader'` ANTES do caminho Premium.
 *
 * Desafio: o handler valida a ASSINATURA de verdade (stripe.webhooks.
 * constructEvent com STRIPE_WEBHOOK_SECRET) — não dá pra bater o endpoint
 * com um body qualquer. Opção A (a usada aqui): o próprio pacote `stripe`
 * expõe `stripe.webhooks.generateTestHeaderString({ payload, secret })`,
 * que gera uma assinatura REAL para um STRIPE_WEBHOOK_SECRET de teste. O
 * `constructEvent` do handler valida essa assinatura de verdade — nenhuma
 * verificação é afrouxada ou mockada. (Confirmado à parte: constructEvent
 * aceita tanto string quanto Buffer como payload — express.raw() entrega
 * Buffer em produção.)
 * Opção B (extrair o handler para chamar direto) foi descartada: exigiria
 * refatorar routes/payment.js só para o teste, o que a task pediu para
 * evitar.
 */
describe('webhook', () => {
  const stripeTestUtil = require('stripe')('sk_test_dummy_key_apenas_para_assinar_webhooks_em_teste');
  const TEST_WEBHOOK_SECRET = 'whsec_test_superreader_webhook';
  let segredoOriginal;

  beforeAll(() => {
    // routes/payment.js lê process.env.STRIPE_WEBHOOK_SECRET a cada
    // request (não no require do módulo) — dá pra setar aqui sem tocar em
    // vitest.backend.config.ts nem em outro arquivo de teste. Restaurado no
    // afterAll para não vazar para os demais arquivos (rodam em sequência,
    // fileParallelism: false).
    segredoOriginal = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  });

  afterAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = segredoOriginal;
  });

  function assinar(payload) {
    return stripeTestUtil.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
  }

  // express.raw({ type: 'application/json' }) em server.js só é montado para
  // /api/payment/webhook — precisa do Content-Type certo e do body cru
  // (string), não de .send(objeto) (que serializaria de novo).
  function postWebhookRaw(payload, signature) {
    const req = request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json');
    if (signature !== undefined) req.set('stripe-signature', signature);
    return req.send(payload);
  }

  function postWebhookEvent(evento) {
    const payload = JSON.stringify(evento);
    return postWebhookRaw(payload, assinar(payload));
  }

  function montarEventoSR({ sessionId, customer = null, amountTotal = 500, currency = 'brl', userId, seriesId, channelId }) {
    return {
      id: `evt_sr_${sessionId}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          customer,
          subscription: null,
          amount_total: amountTotal,
          currency,
          metadata: {
            tipo: 'super_reader',
            userId: String(userId),
            seriesId: String(seriesId),
            channelId: String(channelId),
          },
        },
      },
    };
  }

  // Sessão Premium legítima: mesmo formato que routes/payment.js já trata
  // hoje (create-checkout, mode: 'subscription') — metadata vazio, como o
  // Stripe sempre manda ({}), nunca ausente.
  function montarEventoPremium({ sessionId, customer, subscription = 'sub_test_premium_default', amountTotal = 2990, currency = 'brl' }) {
    return {
      id: `evt_premium_${sessionId}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          customer,
          subscription,
          amount_total: amountTotal,
          currency,
          metadata: {},
        },
      },
    };
  }

  it('caso 1: metadata.tipo=super_reader grava a contribuição (80/20, amount_total da sessão) e NÃO ativa Premium, mesmo com stripeCustomerId batendo com um usuário existente', async () => {
    const channelId = new mongoose.Types.ObjectId();
    const serie = await criarSerie({ channelId });
    const superReaderUserId = new mongoose.Types.ObjectId();

    // Usuário com stripeCustomerId igual ao `customer` da sessão SR — prova
    // de que o branch SR não cai no caminho Premium (que promoveria este
    // usuário se o customerId batesse).
    const usuarioComCustomerId = await User.create({
      email: `sr-nao-premium-${new mongoose.Types.ObjectId()}@lorflux.test`,
      nome: 'Usuario SR Nao Premium',
      role: 'user',
      stripeCustomerId: 'cus_test_sr_nao_promove',
      isPremium: false,
    });

    const sessionId = `cs_test_sr_${new mongoose.Types.ObjectId()}`;
    const evento = montarEventoSR({
      sessionId,
      customer: usuarioComCustomerId.stripeCustomerId,
      amountTotal: 500,
      currency: 'brl',
      userId: superReaderUserId,
      seriesId: serie._id,
      channelId,
    });

    const res = await postWebhookEvent(evento);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const doc = await SuperReaderContribution.findOne({ stripeSessionId: sessionId });
    expect(doc).not.toBeNull();
    expect(doc.amountCents).toBe(500);
    expect(doc.currency).toBe('brl');
    expect(doc.authorShareCents).toBe(400);
    expect(doc.platformShareCents).toBe(100);
    expect(String(doc.userId)).toBe(String(superReaderUserId));
    expect(String(doc.seriesId)).toBe(String(serie._id));
    expect(String(doc.channelId)).toBe(String(channelId));

    const usuarioAtualizado = await User.findById(usuarioComCustomerId._id);
    expect(usuarioAtualizado.isPremium).toBe(false);
    expect(usuarioAtualizado.stripeSubscriptionId).toBeFalsy();
    expect(usuarioAtualizado.premiumExpiresAt).toBeFalsy();
  });

  it('caso 2: o mesmo evento reenviado (retry do Stripe) responde 200 e mantém 1 único documento', async () => {
    const serie = await criarSerie();
    const sessionId = `cs_test_sr_retry_${new mongoose.Types.ObjectId()}`;
    const evento = montarEventoSR({
      sessionId,
      userId: new mongoose.Types.ObjectId(),
      seriesId: serie._id,
      channelId: serie.channelId,
      amountTotal: 700,
    });

    const res1 = await postWebhookEvent(evento);
    expect(res1.status).toBe(200);

    const res2 = await postWebhookEvent(evento); // reenvio do Stripe: mesmo session.id
    expect(res2.status).toBe(200);

    const todos = await SuperReaderContribution.find({ stripeSessionId: sessionId });
    expect(todos).toHaveLength(1);
    expect(todos[0].amountCents).toBe(700);
  });

  it('caso 3: evento SEM metadata.tipo (sessão Premium legítima com customer) segue o caminho Premium intacto — não-regressão', async () => {
    const usuarioPremium = await User.create({
      email: `premium-webhook-${new mongoose.Types.ObjectId()}@lorflux.test`,
      nome: 'Usuario Premium Webhook',
      role: 'user',
      stripeCustomerId: 'cus_test_premium_webhook_intacto',
      isPremium: false,
    });

    const sessionId = `cs_test_premium_${new mongoose.Types.ObjectId()}`;
    const evento = montarEventoPremium({
      sessionId,
      customer: usuarioPremium.stripeCustomerId,
      subscription: 'sub_test_premium_webhook_intacto',
    });

    const res = await postWebhookEvent(evento);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const usuarioAtualizado = await User.findById(usuarioPremium._id);
    expect(usuarioAtualizado.isPremium).toBe(true);
    expect(usuarioAtualizado.stripeSubscriptionId).toBe('sub_test_premium_webhook_intacto');
    expect(usuarioAtualizado.premiumExpiresAt).toBeInstanceOf(Date);

    // Nenhuma contribuição SR foi criada para essa sessão.
    const doc = await SuperReaderContribution.findOne({ stripeSessionId: sessionId });
    expect(doc).toBeNull();
  });

  it('caso 4: assinatura inválida responde 400 (comportamento atual preservado)', async () => {
    const evento = montarEventoSR({
      sessionId: `cs_test_sr_sig_invalida_${new mongoose.Types.ObjectId()}`,
      userId: new mongoose.Types.ObjectId(),
      seriesId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
    });
    const payload = JSON.stringify(evento);

    const res = await postWebhookRaw(payload, 't=1,v1=assinatura-forjada-invalida');
    expect(res.status).toBe(400);

    const doc = await SuperReaderContribution.findOne({ stripeSessionId: evento.data.object.id });
    expect(doc).toBeNull();
  });

  it('caso 5: falha na gravação do serviço (registrarContribuicao rejeitando) responde 500 — Stripe reenvia depois', async () => {
    const serie = await criarSerie();
    const sessionId = `cs_test_sr_falha_${new mongoose.Types.ObjectId()}`;
    const evento = montarEventoSR({
      sessionId,
      userId: new mongoose.Types.ObjectId(),
      seriesId: serie._id,
      channelId: serie.channelId,
    });

    const spy = vi.spyOn(superReaderService, 'registrarContribuicao')
      .mockRejectedValueOnce(new Error('falha simulada na gravação'));
    try {
      const res = await postWebhookEvent(evento);
      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    // O upsert nunca chegou a rodar de verdade — nada foi gravado.
    const doc = await SuperReaderContribution.findOne({ stripeSessionId: sessionId });
    expect(doc).toBeNull();
  });

  it('caso 6: sessão sem metadata.tipo E sem customer não promove usuário nenhum (guard contra o findOne({stripeCustomerId: null}) casar campo ausente)', async () => {
    // Achado da revisão da T3 (pré-existente): filtro { stripeCustomerId: null }
    // no Mongo casa campo null E AUSENTE — uma sessão avulsa sem customer
    // (doação genérica, "send test webhook" do painel) promovia um usuário
    // arbitrário a Premium. O guard ignora sessões sem customer.
    const inocente = await User.create({
      email: `inocente-sem-customer-${new mongoose.Types.ObjectId()}@lorflux.test`,
      nome: 'Usuario Sem Customer',
      role: 'user',
      isPremium: false,
      // sem stripeCustomerId de propósito: campo AUSENTE, o alvo do bug
    });

    // Sem o guard, o findOne devolveria o PRIMEIRO usuário sem o campo (ordem
    // natural — não necessariamente o inocente acima), então a asserção certa
    // é global: NENHUM usuário pode ganhar Premium com este evento.
    const premiumAntes = await User.countDocuments({ isPremium: true });

    const evento = montarEventoPremium({
      sessionId: `cs_test_sem_customer_${new mongoose.Types.ObjectId()}`,
      customer: null,
      subscription: null,
    });
    const res = await postWebhookEvent(evento);
    expect(res.status).toBe(200);

    expect(await User.countDocuments({ isPremium: true })).toBe(premiumAntes);
    const depois = await User.findById(inocente._id);
    expect(depois.isPremium).toBe(false);
    expect(depois.stripeSubscriptionId ?? null).toBeNull();
  });
});

/**
 * Task 4: routes/royalties.js — seção Super Reader no relatório admin e no
 * CSV de royalties. Período do report/export.csv vem de req.query.period
 * (validado no formato YYYY-MM por parsePeriod); a seção SR soma
 * SuperReaderContribution do MESMO período por igualdade de string (o campo
 * period do modelo já é 'YYYY-MM', igual ao que o report recebe). POST
 * /close e RoyaltyPeriod continuam intocados — SR fica fora do pool por
 * decisão da spec (seção "Relatório").
 *
 * Períodos usados aqui são exclusivos desta describe (2031-xx) para não
 * colidir com dados de outras describes deste arquivo (que usam 2026-06/08
 * para os testes de webhook e /me) nem exigir limpeza entre os `it`s.
 */
describe('relatório de royalties — seção Super Reader', () => {
  const Channel = require('../../models/Channel');
  const RoyaltyPeriod = require('../../models/RoyaltyPeriod');

  function criarContribuicao(overrides = {}) {
    return SuperReaderContribution.create({
      userId: new mongoose.Types.ObjectId(),
      seriesId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      amountCents: 500,
      currency: 'brl',
      authorShareCents: 400,
      platformShareCents: 100,
      stripeSessionId: `cs_test_royreport_${new mongoose.Types.ObjectId()}`,
      period: '2031-01',
      ...overrides,
    });
  }

  function getReport(period) {
    return request(app)
      .get(`/api/admin/royalties/report?period=${period}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
  }

  function getCsv(period) {
    return request(app)
      .get(`/api/admin/royalties/export.csv?period=${period}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
  }

  it('agrupa por canal com somas certas e totaliza (2 canais, valores diferentes)', async () => {
    const period = '2031-01';
    const chA = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR A' });
    const chB = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR B' });

    // Canal A: 2 apoios (400+800 autor / 100+200 plataforma)
    await criarContribuicao({ channelId: chA._id, period, amountCents: 500, authorShareCents: 400, platformShareCents: 100 });
    await criarContribuicao({ channelId: chA._id, period, amountCents: 1000, authorShareCents: 800, platformShareCents: 200 });
    // Canal B: 1 apoio, valor bem diferente — prova que a soma não mistura canais
    await criarContribuicao({ channelId: chB._id, period, amountCents: 999, authorShareCents: 799, platformShareCents: 200 });

    const res = await getReport(period);
    expect(res.status).toBe(200);

    const a = res.body.superReader.porCanal.find(c => String(c.channelId) === String(chA._id));
    const b = res.body.superReader.porCanal.find(c => String(c.channelId) === String(chB._id));

    expect(a.channelName).toBe('Canal SR A');
    expect(a.apoios).toBe(2);
    expect(a.autorCents).toBe(1200);

    expect(b.channelName).toBe('Canal SR B');
    expect(b.apoios).toBe(1);
    expect(b.autorCents).toBe(799);

    expect(res.body.superReader.totalApoios).toBe(3);
    expect(res.body.superReader.totalAutorCents).toBe(1999);
    expect(res.body.superReader.totalPlataformaCents).toBe(500);
  });

  it('contribuição de outro período fica fora da soma', async () => {
    const period = '2031-02';
    const outroPeriodo = '2031-03';
    const ch = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR Periodo' });

    await criarContribuicao({ channelId: ch._id, period, amountCents: 500, authorShareCents: 400, platformShareCents: 100 });
    await criarContribuicao({ channelId: ch._id, period: outroPeriodo, amountCents: 5000, authorShareCents: 4000, platformShareCents: 1000 });

    const res = await getReport(period);
    expect(res.status).toBe(200);
    expect(res.body.superReader.totalApoios).toBe(1);
    expect(res.body.superReader.totalAutorCents).toBe(400);
    const c = res.body.superReader.porCanal.find(x => String(x.channelId) === String(ch._id));
    expect(c.apoios).toBe(1);
    expect(c.autorCents).toBe(400);
  });

  it('poolSuggested e os demais campos do pool são idênticos com e sem contribuições SR', async () => {
    const period = '2031-04';
    const antes = await getReport(period);
    expect(antes.status).toBe(200);
    const poolAntes = {
      channels: antes.body.channels,
      totalPoints: antes.body.totalPoints,
      adImpressions: antes.body.adImpressions,
      premiumUsers: antes.body.premiumUsers,
      grossRevenue: antes.body.grossRevenue,
      authorShare: antes.body.authorShare,
      poolSuggested: antes.body.poolSuggested,
    };

    const ch = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR Nao Vaza' });
    await criarContribuicao({ channelId: ch._id, period, amountCents: 100000, authorShareCents: 80000, platformShareCents: 20000 });

    const depois = await getReport(period);
    expect(depois.status).toBe(200);
    const poolDepois = {
      channels: depois.body.channels,
      totalPoints: depois.body.totalPoints,
      adImpressions: depois.body.adImpressions,
      premiumUsers: depois.body.premiumUsers,
      grossRevenue: depois.body.grossRevenue,
      authorShare: depois.body.authorShare,
      poolSuggested: depois.body.poolSuggested,
    };

    expect(poolDepois).toEqual(poolAntes);
    // e a seção SR de fato mudou — prova que a contribuição foi processada e só não vazou pro pool
    expect(depois.body.superReader.totalApoios).toBe(1);
  });

  it('POST /close com SR presente: o RoyaltyPeriod gravado não contém nada de SR', async () => {
    const period = '2031-05';
    const ch = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR Fechamento' });
    await criarContribuicao({ channelId: ch._id, period, amountCents: 100000, authorShareCents: 80000, platformShareCents: 20000 });

    const res = await request(app)
      .post('/api/admin/royalties/close')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ period, poolFinal: 10 });

    expect(res.status).toBe(201);
    expect(res.body.superReader).toBeUndefined();
    for (const item of res.body.breakdown) {
      expect(item.autorCents).toBeUndefined();
      expect(item.apoios).toBeUndefined();
    }

    const doc = await RoyaltyPeriod.findOne({ period }).lean();
    expect(doc.superReader).toBeUndefined();
    expect(JSON.stringify(doc)).not.toContain('autorCents');
    expect(JSON.stringify(doc)).not.toContain('apoios');
  });

  it('canal apagado → channelName null, 200', async () => {
    const period = '2031-06';
    const ch = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR Sera Apagado' });
    await criarContribuicao({ channelId: ch._id, period });
    await Channel.deleteOne({ _id: ch._id });

    const res = await getReport(period);
    expect(res.status).toBe(200);
    const c = res.body.superReader.porCanal.find(x => String(x.channelId) === String(ch._id));
    expect(c).toBeTruthy();
    expect(c.channelName).toBeNull();
  });

  it('export.csv traz o bloco SR sem alterar as linhas existentes', async () => {
    const period = '2031-07';
    const antes = await getCsv(period);
    expect(antes.status).toBe(200);
    const prefixoAntes = antes.text.split('Super Reader (direto ao autor)')[0];

    const ch = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal SR CSV' });
    await criarContribuicao({ channelId: ch._id, period, amountCents: 500, authorShareCents: 400, platformShareCents: 100 });

    const depois = await getCsv(period);
    expect(depois.status).toBe(200);
    const prefixoDepois = depois.text.split('Super Reader (direto ao autor)')[0];

    // As linhas do bloco existente (canal;pontos;share;valor;status + TOTAL) não mudam
    expect(prefixoDepois).toBe(prefixoAntes);
    expect(depois.text).toContain('Super Reader (direto ao autor)');
    expect(depois.text).toContain('Canal SR CSV');
    expect(depois.text).toContain('4.00'); // 400 centavos de autor formatado como o CSV já formata valores
    expect(depois.text).toContain('1.00'); // 100 centavos de plataforma
  });

  it('sem contribuições: superReader presente com zeros e arrays vazios (shape estável)', async () => {
    const period = '2031-08';
    const res = await getReport(period);
    expect(res.status).toBe(200);
    expect(res.body.superReader).toEqual({
      porCanal: [],
      totalAutorCents: 0,
      totalPlataformaCents: 0,
      totalApoios: 0,
    });
  });
});

/**
 * Task 8 — LGPD do Super Reader: routes/account.js ganha a seção
 * `superReaderContributions` no export (molde: describe "LGPD das
 * inscrições de push" em tests/backend/notifications.test.js) e DELETE /me
 * ANONIMIZA (userId: null) as contribuições em vez de apagá-las — o valor
 * repassado ao autor é registro contábil do relatório de royalties (soma
 * por canal/período, não por usuário); sem o vínculo pessoal, deixa de ser
 * dado pessoal (spec, seção "LGPD").
 */
describe('LGPD das contribuições Super Reader', () => {
  it('o export do titular inclui superReaderContributions com os campos certos, sem stripeSessionId/shares; série apagada → seriesTitle null', async () => {
    const userId = auth.getId('user');
    const serieViva = await criarSerie({ title: 'Obra Export SR Viva' });
    const serieApagada = await criarSerie({ title: 'Obra Export SR Apagada' });

    await SuperReaderContribution.create({
      userId, seriesId: serieViva._id, channelId: serieViva.channelId,
      amountCents: 500, currency: 'brl', authorShareCents: 400, platformShareCents: 100,
      stripeSessionId: `cs_test_export_viva_${new mongoose.Types.ObjectId()}`,
      period: '2026-08',
    });
    await SuperReaderContribution.create({
      userId, seriesId: serieApagada._id, channelId: serieApagada.channelId,
      amountCents: 1000, currency: 'usd', authorShareCents: 800, platformShareCents: 200,
      stripeSessionId: `cs_test_export_apagada_${new mongoose.Types.ObjectId()}`,
      period: '2026-08',
    });
    await Series.deleteOne({ _id: serieApagada._id });

    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.superReaderContributions)).toBe(true);
    expect(res.body.superReaderContributions).toHaveLength(2);

    const viva = res.body.superReaderContributions.find(c => c.seriesTitle === 'Obra Export SR Viva');
    expect(viva).toMatchObject({ amountCents: 500, currency: 'brl' });
    expect(viva).toHaveProperty('createdAt');

    const apagada = res.body.superReaderContributions.find(c => c.amountCents === 1000);
    expect(apagada.seriesTitle).toBeNull();
    expect(apagada.currency).toBe('usd');

    // Detalhe contábil da plataforma, não dado informativo do titular —
    // mesma lógica das keys de push acima (não entram no export).
    res.body.superReaderContributions.forEach((c) => {
      expect(c).not.toHaveProperty('stripeSessionId');
      expect(c).not.toHaveProperty('authorShareCents');
      expect(c).not.toHaveProperty('platformShareCents');
    });
  });

  it('usuário sem contribuições → superReaderContributions presente e vazio (shape estável, mesmo padrão de pushSubscriptions)', async () => {
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.status).toBe(200);
    expect(res.body.superReaderContributions).toEqual([]);
  });

  it('excluir a conta anonimiza (userId: null) as contribuições em vez de apagá-las, com os valores intocados; contribuição de OUTRO usuário mantém o userId; e o relatório de royalties do período segue somando os mesmos valores depois', async () => {
    const bcrypt = require('bcrypt');
    const descartavel = await User.create({
      email: `sr-lgpd-exclusao-${new mongoose.Types.ObjectId()}@lorflux.test`,
      passwordHash: await bcrypt.hash('Descartavel@123', 10),
      nome: 'Conta Descartavel SR',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: descartavel.email, password: 'Descartavel@123' });
    const token = login.body.accessToken;

    const period = '2032-01';
    const channelId = new mongoose.Types.ObjectId();
    const serie1 = await criarSerie({ channelId, title: 'Obra Exclusao SR 1' });
    const serie2 = await criarSerie({ channelId, title: 'Obra Exclusao SR 2' });

    const contrib1 = await SuperReaderContribution.create({
      userId: descartavel._id, seriesId: serie1._id, channelId,
      amountCents: 500, currency: 'brl', authorShareCents: 400, platformShareCents: 100,
      stripeSessionId: `cs_test_exclusao_1_${new mongoose.Types.ObjectId()}`,
      period,
    });
    const contrib2 = await SuperReaderContribution.create({
      userId: descartavel._id, seriesId: serie2._id, channelId,
      amountCents: 1000, currency: 'usd', authorShareCents: 800, platformShareCents: 200,
      stripeSessionId: `cs_test_exclusao_2_${new mongoose.Types.ObjectId()}`,
      period,
    });

    // Contribuição de OUTRO usuário, no mesmo canal/período — prova que a
    // anonimização é escopada ao usuário excluído, não ao canal/período.
    const outroUserId = new mongoose.Types.ObjectId();
    const contribOutro = await SuperReaderContribution.create({
      userId: outroUserId, seriesId: serie1._id, channelId,
      amountCents: 700, currency: 'brl', authorShareCents: 560, platformShareCents: 140,
      stripeSessionId: `cs_test_exclusao_outro_${new mongoose.Types.ObjectId()}`,
      period,
    });

    const antesReport = await request(app)
      .get(`/api/admin/royalties/report?period=${period}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(antesReport.status).toBe(200);
    expect(antesReport.body.superReader.totalApoios).toBe(3);
    expect(antesReport.body.superReader.totalAutorCents).toBe(400 + 800 + 560);

    const del = await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Descartavel@123' });
    expect(del.status).toBe(200);
    expect(await User.findById(descartavel._id)).toBeNull();

    // Os dois docs continuam existindo — NÃO foram apagados — só o userId
    // vira null; os valores/centavos ficam intocados.
    const doc1 = await SuperReaderContribution.findById(contrib1._id);
    const doc2 = await SuperReaderContribution.findById(contrib2._id);
    expect(doc1).not.toBeNull();
    expect(doc2).not.toBeNull();
    expect(doc1.userId).toBeNull();
    expect(doc2.userId).toBeNull();
    expect(doc1.amountCents).toBe(500);
    expect(doc1.authorShareCents).toBe(400);
    expect(doc1.platformShareCents).toBe(100);
    expect(doc2.amountCents).toBe(1000);
    expect(doc2.authorShareCents).toBe(800);
    expect(doc2.platformShareCents).toBe(200);

    const docOutro = await SuperReaderContribution.findById(contribOutro._id);
    expect(String(docOutro.userId)).toBe(String(outroUserId));

    // A anonimização não muda o dinheiro do autor: o relatório soma por
    // canal/período, não por usuário — os totais do período são os mesmos
    // antes e depois da exclusão.
    const depoisReport = await request(app)
      .get(`/api/admin/royalties/report?period=${period}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(depoisReport.status).toBe(200);
    expect(depoisReport.body.superReader).toEqual(antesReport.body.superReader);
  });
});
