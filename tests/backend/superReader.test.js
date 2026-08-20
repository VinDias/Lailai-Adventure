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
const db = require('../helpers/db');

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
