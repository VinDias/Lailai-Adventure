/**
 * Testes de regressão: POST /api/payment/create-checkout — a rota que cobra
 * do cliente. Medido em 21/10/2026 pela triagem de regressões: nenhum teste
 * do projeto encostava nesta rota (o `grep create-checkout tests/` achava só
 * um comentário), então os três consertos abaixo estavam sem rede.
 *
 * Os defeitos, em linguagem de negócio:
 *
 * 1) 1a3adc3 — "assinante de fora pagando em real". O router de pagamento
 *    estava montado ANTES do `express.json` do server.js, então o corpo da
 *    requisição chegava vazio na rota. O app manda `{ locale }` (o idioma do
 *    aparelho, services/api.ts) para escolher a moeda; sem o corpo, o locale
 *    chegava `undefined`, a escolha caía no padrão `brl` e o cliente de fora
 *    ia para o checkout em real. Hoje a correção é a ordem do server.js:
 *    `express.raw` só em /api/payment/webhook antes do parser, e o router
 *    /api/payment montado depois do `express.json`.
 *
 * 2) 2f30192 — "erro 500 ao clicar em Assinar". O guard de autenticação lia
 *    `req.cookies.accessToken` direto. Numa rota montada antes do
 *    `cookie-parser`, o Express entrega `req.cookies` indefinido e o
 *    middleware estourava um TypeError — 500 no lugar do checkout, mesmo com
 *    o cliente mandando um Bearer válido. Hoje a correção é o `?.` em
 *    middlewares/verifyToken.js:5 (cópias irmãs em optionalAuth.js:9 e
 *    server.js:245/605).
 *
 * 3) 6615c15 (metade de pagamento) — "cliente duplicado no Stripe". Quem
 *    assinava sem `stripeCustomerId` gravado no banco (assinatura anterior,
 *    ou banco restaurado de backup) ganhava um customer NOVO no Stripe a cada
 *    tentativa: histórico de cobrança partido em vários clientes com o mesmo
 *    e-mail. Hoje a correção é o `stripe.customers.list({ email, limit: 1 })`
 *    em routes/payment.js:83, que reaproveita o customer existente.
 *
 * O QUE ESTE ARQUIVO GARANTE
 * - Que o corpo JSON chega parseado na rota (asserção sobre a moeda/preço que
 *   o código de produção manda para o Stripe), e que o webhook continua
 *   recebendo o corpo BRUTO (Buffer), que é a outra metade da mesma ordem de
 *   montagem.
 * - Que verifyToken e optionalAuth funcionam com `req` sem a chave `cookies`,
 *   e que o router de pagamento montado sem cookie-parser responde o checkout
 *   em vez de 500.
 * - Que a rota reaproveita o customer do Stripe com o mesmo e-mail, grava o id
 *   no usuário, e que ela AINDA cria o customer quando o e-mail é novo (o caso
 *   espelho impede "consertar" apagando a criação).
 *
 * O QUE ELE NÃO GARANTE
 * - Nada sobre o Stripe de verdade: o cliente Stripe é falsificado (injetado
 *   no `require.cache` antes de o server carregar). O falso só registra o que
 *   recebeu e devolve resposta fixa — quem calcula moeda, preço e reuso de
 *   customer é o código de produção.
 * - Nada sobre o resto do webhook (renovação, cancelamento, Super Reader):
 *   isso é de tests/backend/assinaturaPremium.test.js e superReader.test.js.
 * - Nada sobre o front: a tela de assinatura e o preço do botão são de
 *   tests/frontend (9471736 / d39ae92).
 */
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

const RAIZ = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Stripe falso. routes/payment.js faz `require('stripe')(chave)` no load do
// módulo e não tem costura de injeção, então a falsificação é feita no
// require.cache ANTES de o server ser carregado (o `vi.mock` não pega: o
// backend é carregado pelo require nativo do Node, não pelo vite-node).
// O falso NÃO decide nada: ele registra os parâmetros que a produção montou e
// devolve resposta fixa.
// ---------------------------------------------------------------------------
const chamadas = {
  customersList: [],
  customersCreate: [],
  sessionsCreate: [],
  webhookBodies: [],
};
let respostaCustomersList = { data: [] };

const stripeFalso = {
  customers: {
    list: async (params) => {
      chamadas.customersList.push(params);
      return respostaCustomersList;
    },
    create: async (params) => {
      chamadas.customersCreate.push(params);
      return { id: 'cus_criado_agora' };
    },
  },
  checkout: {
    sessions: {
      create: async (params) => {
        chamadas.sessionsCreate.push(params);
        return { id: 'cs_test_regressao', url: 'https://checkout.stripe.test/sessao' };
      },
    },
  },
  prices: {
    retrieve: async () => { throw new Error('Stripe falso: prices.retrieve não é usado aqui'); },
  },
  subscriptions: {
    update: async () => { throw new Error('Stripe falso: subscriptions.update não é usado aqui'); },
    cancel: async () => { throw new Error('Stripe falso: subscriptions.cancel não é usado aqui'); },
  },
  webhooks: {
    // Registra o corpo que a produção entregou e recusa a assinatura, para a
    // rota responder 400 sem precisar de segredo real.
    constructEvent: (corpo) => {
      chamadas.webhookBodies.push(corpo);
      throw new Error('Stripe falso: assinatura não conferida neste teste');
    },
  },
};

const caminhoModuloStripe = require.resolve('stripe');
const moduloStripeOriginal = require.cache[caminhoModuloStripe];
require.cache[caminhoModuloStripe] = {
  id: caminhoModuloStripe,
  filename: caminhoModuloStripe,
  loaded: true,
  children: [],
  paths: [],
  exports: () => stripeFalso,
};

const envOriginal = {};
function definirEnv(valores) {
  for (const [chave, valor] of Object.entries(valores)) {
    if (!(chave in envOriginal)) envOriginal[chave] = process.env[chave];
    process.env[chave] = valor;
  }
}

let app;
let User;
let token;
let idUsuario;
const emailUsuario = auth.USERS.user.email;

beforeAll(async () => {
  // Se o router de pagamento já estiver carregado (outro arquivo de teste no
  // mesmo processo), ele ficou com o Stripe REAL e nada aqui faria sentido.
  const caminhoRouter = require.resolve('../../routes/payment');
  if (require.cache[caminhoRouter]) {
    throw new Error('routes/payment.js já estava carregado com o Stripe real — rode este arquivo sozinho.');
  }

  definirEnv({
    STRIPE_SECRET_KEY: 'sk_test_falso_regressao',
    STRIPE_PRICE_ID_BRL: 'price_BRL_teste',
    STRIPE_PRICE_ID_USD: 'price_USD_teste',
    STRIPE_PRICE_ID_EUR: 'price_EUR_teste',
    STRIPE_PRICE_ID: 'price_PADRAO_teste',
    STRIPE_WEBHOOK_SECRET: 'whsec_teste_checkout',
    FRONTEND_URL: 'https://lorflux.test',
  });

  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  await auth.createUsers(app);
  token = auth.getToken('user');
  idUsuario = auth.getId('user');
});

afterAll(async () => {
  await db.closeDatabase();
  for (const [chave, valor] of Object.entries(envOriginal)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  if (moduloStripeOriginal) require.cache[caminhoModuloStripe] = moduloStripeOriginal;
  else delete require.cache[caminhoModuloStripe];
});

beforeEach(async () => {
  chamadas.customersList.length = 0;
  chamadas.customersCreate.length = 0;
  chamadas.sessionsCreate.length = 0;
  chamadas.webhookBodies.length = 0;
  respostaCustomersList = { data: [] };
  // Estado de verdade do caso: conta sem customer do Stripe gravado.
  await User.updateOne({ _id: idUsuario }, { $set: { stripeCustomerId: null } });
});

function pedirCheckout(corpo) {
  const req = request(app)
    .post('/api/payment/create-checkout')
    .set('Authorization', `Bearer ${token}`);
  return corpo === undefined ? req.send() : req.send(corpo);
}

describe('create-checkout — moeda vem do corpo JSON da requisição (1a3adc3)', () => {
  it('locale en-US fecha o checkout em dólar (prova que o corpo JSON chegou parseado na rota)', async () => {
    const res = await pedirCheckout({ locale: 'en-US' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.test/sessao');
    expect(chamadas.sessionsCreate).toHaveLength(1);
    const sessao = chamadas.sessionsCreate[0];
    // Com o router montado antes do express.json, req.body = {} e o preço
    // cairia no padrão em real — era o sintoma do commit.
    expect(sessao.line_items[0].price).toBe('price_USD_teste');
    expect(sessao.mode).toBe('subscription');
    // A página do Stripe também precisa abrir no idioma do cliente.
    expect(sessao.locale).toBe('en');
  });

  it('locale pt-BR fecha em real e não manda locale ao Stripe (a página já nasce em português)', async () => {
    const res = await pedirCheckout({ locale: 'pt-BR' });

    expect(res.status).toBe(200);
    expect(chamadas.sessionsCreate[0].line_items[0].price).toBe('price_BRL_teste');
    expect(chamadas.sessionsCreate[0].locale).toBeUndefined();
  });

  it('locale fr fecha em euro', async () => {
    await pedirCheckout({ locale: 'fr' });
    expect(chamadas.sessionsCreate[0].line_items[0].price).toBe('price_EUR_teste');
  });

  it('requisição sem corpo cai no real — documenta por que o bug era silencioso', async () => {
    await pedirCheckout();
    expect(chamadas.sessionsCreate[0].line_items[0].price).toBe('price_BRL_teste');
  });
});

describe('webhook continua recebendo o corpo BRUTO (a outra metade de 1a3adc3)', () => {
  it('o que chega em stripe.webhooks.constructEvent é um Buffer, não um objeto já parseado', async () => {
    const res = await request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'assinatura_qualquer')
      .send(JSON.stringify({ id: 'evt_teste', type: 'checkout.session.completed' }));

    // Assinatura recusada pelo Stripe falso → 400 (o que importa aqui é o
    // corpo que a rota entregou ao Stripe).
    expect(res.status).toBe(400);
    expect(chamadas.webhookBodies).toHaveLength(1);
    expect(Buffer.isBuffer(chamadas.webhookBodies[0])).toBe(true);
    expect(JSON.parse(chamadas.webhookBodies[0].toString('utf8')).id).toBe('evt_teste');
  });
});

describe('create-checkout — não duplica o cliente no Stripe (6615c15)', () => {
  it('reaproveita o customer que já existe com o mesmo e-mail e grava o id no usuário', async () => {
    respostaCustomersList = { data: [{ id: 'cus_ja_existia' }] };

    const res = await pedirCheckout({ locale: 'pt-BR' });

    expect(res.status).toBe(200);
    // Procurou pelo e-mail da conta...
    expect(chamadas.customersList).toHaveLength(1);
    expect(chamadas.customersList[0]).toMatchObject({ email: emailUsuario, limit: 1 });
    // ...e NÃO abriu um cliente novo.
    expect(chamadas.customersCreate).toHaveLength(0);
    // A cobrança foi para o cliente antigo, onde está o histórico.
    expect(chamadas.sessionsCreate[0].customer).toBe('cus_ja_existia');
    // E o banco guardou o id, para a próxima vez nem consultar.
    const salvo = await User.findById(idUsuario).lean();
    expect(salvo.stripeCustomerId).toBe('cus_ja_existia');
  });

  it('cria o customer quando o e-mail ainda não existe no Stripe (caso espelho)', async () => {
    respostaCustomersList = { data: [] };

    const res = await pedirCheckout({ locale: 'pt-BR' });

    expect(res.status).toBe(200);
    expect(chamadas.customersCreate).toHaveLength(1);
    expect(chamadas.customersCreate[0]).toMatchObject({
      email: emailUsuario,
      name: auth.USERS.user.nome,
    });
    expect(chamadas.sessionsCreate[0].customer).toBe('cus_criado_agora');
    const salvo = await User.findById(idUsuario).lean();
    expect(salvo.stripeCustomerId).toBe('cus_criado_agora');
  });

  it('quem já tem customer gravado não é consultado nem recriado no Stripe', async () => {
    await User.updateOne({ _id: idUsuario }, { $set: { stripeCustomerId: 'cus_do_banco' } });

    const res = await pedirCheckout({ locale: 'pt-BR' });

    expect(res.status).toBe(200);
    expect(chamadas.customersList).toHaveLength(0);
    expect(chamadas.customersCreate).toHaveLength(0);
    expect(chamadas.sessionsCreate[0].customer).toBe('cus_do_banco');
  });
});

describe('guard de autenticação sem cookie-parser (2f30192)', () => {
  // Único jeito de reproduzir `req.cookies === undefined`: chamar o
  // middleware fora do app completo (no server.js de hoje o cookieParser vem
  // antes de todos os routers, então lá `req.cookies` é no mínimo {}).
  const verifyToken = require('../../middlewares/verifyToken');
  const optionalAuth = require('../../middlewares/optionalAuth');

  function respostaFalsa() {
    const res = {
      statusCode: null,
      corpo: null,
      status(codigo) { res.statusCode = codigo; return res; },
      json(corpo) { res.corpo = corpo; return res; },
    };
    return res;
  }

  it('verifyToken aceita o Bearer quando req não tem a chave cookies', () => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = respostaFalsa();
    let seguiu = 0;

    expect(() => verifyToken(req, res, () => { seguiu += 1; })).not.toThrow();

    expect(seguiu).toBe(1);
    expect(req.user.id).toBe(idUsuario);
    expect(res.statusCode).toBeNull();
  });

  it('verifyToken responde 401 (e não estoura) quando req não tem cookies nem header', () => {
    const req = { headers: {} };
    const res = respostaFalsa();
    let seguiu = 0;

    expect(() => verifyToken(req, res, () => { seguiu += 1; })).not.toThrow();

    expect(seguiu).toBe(0);
    expect(res.statusCode).toBe(401);
  });

  it('optionalAuth (mesma cópia do guard) segue adiante com req sem cookies', () => {
    const anonimo = { headers: {} };
    let seguiuAnonimo = 0;
    expect(() => optionalAuth(anonimo, respostaFalsa(), () => { seguiuAnonimo += 1; })).not.toThrow();
    expect(seguiuAnonimo).toBe(1);
    expect(anonimo.user).toBeUndefined();

    const logado = { headers: { authorization: `Bearer ${token}` } };
    let seguiuLogado = 0;
    expect(() => optionalAuth(logado, respostaFalsa(), () => { seguiuLogado += 1; })).not.toThrow();
    expect(seguiuLogado).toBe(1);
    expect(logado.user.id).toBe(idUsuario);
  });

  it('o router de pagamento montado SEM cookie-parser devolve o checkout, não 500', async () => {
    // Reproduz o app do commit: /api/payment montado antes do cookieParser.
    // Pega as duas formas de o bug voltar — tirar o `?.` do guard ou
    // reordenar o server.js.
    const appSemCookieParser = express();
    appSemCookieParser.use(express.json());
    appSemCookieParser.use('/api/payment', require('../../routes/payment'));

    const res = await request(appSemCookieParser)
      .post('/api/payment/create-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'en-US' });

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.test/sessao');
  });
});

describe('guardas estáticos das cópias do conserto', () => {
  const fonteServer = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');

  it('no server.js o webhook pega express.raw antes do express.json, e o router /api/payment vem depois', () => {
    const raw = fonteServer.indexOf('app.use("/api/payment/webhook", express.raw(');
    const json = fonteServer.indexOf('app.use(express.json(');
    const router = fonteServer.indexOf('app.use("/api/payment", require("./routes/payment"))');

    expect(raw).toBeGreaterThan(-1);
    expect(json).toBeGreaterThan(-1);
    expect(router).toBeGreaterThan(-1);
    expect(raw).toBeLessThan(json);
    // Se o router subir para antes do express.json, o locale volta a chegar
    // vazio e o cliente de fora paga em real (1a3adc3).
    expect(json).toBeLessThan(router);
    // E o cookieParser antes do router é o que mantém req.cookies sempre
    // definido no app real (2f30192).
    expect(fonteServer.indexOf('app.use(cookieParser())')).toBeLessThan(router);
  });

  it('toda leitura de req.cookies no backend usa optional chaining', () => {
    const arquivos = ['server.js', 'middlewares/verifyToken.js', 'middlewares/optionalAuth.js'];
    const semGuard = [];
    for (const relativo of arquivos) {
      const linhas = fs.readFileSync(path.join(RAIZ, relativo), 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        if (/req\.cookies(?!\?)/.test(linha)) semGuard.push(`${relativo}:${i + 1}: ${linha.trim()}`);
      });
    }
    expect(semGuard).toEqual([]);
  });

  it('services/stripeService.js segue desligado — é cópia do checkout SEM a dedup por e-mail', () => {
    const IGNORAR = new Set([
      'node_modules', '.git', 'dist', 'frontend-dist', 'uploads', 'logs',
      'coverage', 'tests', 'public', 'play-store-assets', 'docs',
      'docsprivados', 'fase6-e2e-fotos', 'vin correcoes', '.playwright-mcp',
    ]);
    const importadores = [];
    (function varrer(dir) {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(entrada.name)) continue;
        const caminho = path.join(dir, entrada.name);
        if (entrada.isDirectory()) varrer(caminho);
        else if (/\.(js|ts|tsx)$/.test(entrada.name) && !caminho.endsWith('services/stripeService.js')) {
          if (/stripeService/.test(fs.readFileSync(caminho, 'utf8'))) {
            importadores.push(path.relative(RAIZ, caminho));
          }
        }
      }
    })(RAIZ);

    // Ela usa `customer_email` e abre um customer novo a cada sessão. Se
    // voltar a ser usada, aplique antes a dedup de 6615c15.
    expect(importadores).toEqual([]);
  });
});
