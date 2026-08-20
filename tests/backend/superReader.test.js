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

beforeAll(async () => {
  await db.connect();
  app = require('../../server'); // dispara dotenv.config() — mesmo padrão dos demais arquivos de teste
  mongoose = require('mongoose');
  Series = require('../../models/Series');
  Setting = require('../../models/Setting');
  SuperReaderContribution = require('../../models/SuperReaderContribution');
  superReaderService = require('../../services/superReaderService');
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
      userId, seriesId: serie._id, amountCents: 750, currency: 'usd',
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
    expect(lineItem.price_data.currency).toBe('usd');
    expect(lineItem.price_data.unit_amount).toBe(750);
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
        .send({ seriesId: serie._id.toString(), amountCents: 750, currency: 'usd', userId: userIdForjado });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: 'https://checkout.stripe.com/rota-feliz' });

      expect(capturados).toHaveLength(1);
      expect(capturados[0].metadata.tipo).toBe('super_reader');
      expect(capturados[0].metadata.userId).toBe(auth.getId('user'));
      expect(capturados[0].metadata.userId).not.toBe(userIdForjado);
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
