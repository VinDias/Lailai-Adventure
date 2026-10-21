/**
 * Teste de regressão: exclusão de conta — ORDEM entre o lookup do admin e o
 * cancelamento da assinatura no Stripe.
 *
 * O DEFEITO (em linguagem de negócio): na exclusão de conta (direito ao
 * esquecimento), o sistema cancelava a assinatura paga no Stripe ANTES de
 * verificar se existia algum administrador para receber os canais inativos
 * do usuário. Quando não havia administrador disponível, a exclusão abortava
 * com erro — mas a assinatura JÁ estava cancelada. Resultado para o cliente:
 * a conta continuava viva, o leitor continuava logado e sem Premium, e a
 * cobrança mensal (R$ 10,90) tinha sido encerrada sem que ele pedisse. Pior,
 * ao tentar excluir de novo o erro se repetia, e nada no sistema indicava
 * que a assinatura havia sido perdida.
 *
 * Correção: commit b77bbcd — o lookup do admin (utils/primeiroAdmin.js)
 * passou a rodar ANTES do bloco do Stripe em routes/account.js, de modo que
 * o abort de 500 nunca acontece depois de um efeito externo irreversível.
 *
 * Medido em 21/10/2026 pela triagem de regressões: a correção está intacta
 * no código de hoje, e NENHUM teste existente pegava o bug quando ele era
 * reintroduzido numa cópia (accountPortalLgpd, security, assinaturaPremium e
 * curadoriaModels passavam todos). Motivo: nenhum teste do projeto deixava o
 * bloco do Stripe rodar — sem STRIPE_SECRET_KEY no ambiente e sem
 * stripeSubscriptionId nos usuários de teste, o bloco era pulado por
 * inteiro, e a ordem era invisível para a suíte em qualquer arranjo.
 *
 * O QUE ESTE ARQUIVO GARANTE:
 *  - Com assinatura ativa, canal inativo e NENHUM admin no banco: a resposta
 *    é 500 e o Stripe NÃO é chamado (nenhum `subscriptions.cancel`).
 *  - Com assinatura ativa, canal ativo (exclusão barrada com 409): o Stripe
 *    também NÃO é chamado.
 *  - Caminho feliz (há admin): a resposta é 200, o canal inativo é
 *    transferido ao admin mais antigo e o Stripe É chamado, uma única vez,
 *    com o id da assinatura daquele usuário. Este caso é o controle: sem ele
 *    os dois primeiros testes passariam vazios, por o espião nunca ser
 *    chamado em cenário nenhum.
 *
 * O QUE ELE NÃO GARANTE:
 *  - Não fala com o Stripe de verdade: o módulo `stripe` é substituído no
 *    registro de módulos do Node por uma fábrica que só ANOTA as chamadas.
 *    Quem decide se cancela, quando cancela e com que id continua sendo o
 *    código de produção (routes/account.js) — o falso não calcula resposta
 *    nenhuma que o teste depois confira contra si mesma.
 *  - Não cobre o resto da exclusão LGPD (apagamento de votos, favoritos,
 *    progresso, mensagens do portal, export): isso é de
 *    tests/backend/accountPortalLgpd.test.js e tests/backend/security.test.js,
 *    que seguem intactos.
 *  - Não cobre falha do próprio Stripe (o cancel é best-effort e engole o
 *    erro de propósito), nem a assinatura da Play Store (playBilling).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');

// ── Falso do módulo `stripe` ────────────────────────────────────────────────
// routes/account.js faz `require('stripe')(chave)` DENTRO do handler, sem
// costura de injeção (diferente de services/superReaderService.js, que tem
// __setStripeForTests). Para não editar código de produção, trocamos os
// exports do módulo no cache do Node: a fábrica falsa devolve um cliente que
// apenas registra `subscriptions.cancel`.
const cancelamentos = [];
const caminhoStripe = require.resolve('stripe');
let exportsOriginais;
let chaveOriginal;

function fabricaFalsa(chave) {
  return {
    chaveRecebida: chave,
    subscriptions: {
      cancel: async (subscriptionId) => {
        cancelamentos.push(subscriptionId);
        return { id: subscriptionId, status: 'canceled' };
      },
    },
  };
}

let app;
let User, Channel;

beforeAll(async () => {
  require('stripe'); // garante a entrada no require.cache antes de trocar
  exportsOriginais = require.cache[caminhoStripe].exports;
  require.cache[caminhoStripe].exports = fabricaFalsa;

  chaveOriginal = process.env.STRIPE_SECRET_KEY;
  // Sem chave, routes/account.js pula o bloco do Stripe inteiro — era por
  // isso que a suíte não via a ordem. Com chave (falsa) o bloco roda.
  process.env.STRIPE_SECRET_KEY = 'sk_test_falsa_exclusao_conta';

  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Channel = require('../../models/Channel');
});

afterAll(async () => {
  await db.closeDatabase();
  require.cache[caminhoStripe].exports = exportsOriginais;
  if (chaveOriginal === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = chaveOriginal;
});

// Isolamento total: cada cenário monta seu próprio elenco de admins — a
// regra é "o admin de createdAt mais antigo", e o teste do 500 exige que
// NÃO exista nenhum admin no banco.
afterEach(async () => {
  await db.clearDatabase();
  cancelamentos.length = 0;
});

const SENHA = 'Senha@123';
let contador = 0;

async function criarUsuario({ role = 'user', createdAt, stripeSubscriptionId } = {}) {
  contador += 1;
  const email = `exclusao-stripe-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash(SENHA, 10);
  const doc = { email, passwordHash, nome: `Usuario Exclusao ${contador}`, role };
  if (createdAt) doc.createdAt = createdAt;
  if (stripeSubscriptionId) {
    doc.stripeSubscriptionId = stripeSubscriptionId;
    doc.isPremium = true;
  }
  const user = await User.create(doc);
  const login = await request(app).post('/api/auth/login').send({ email, password: SENHA });
  return { id: user._id.toString(), token: login.body.accessToken, email };
}

function excluirConta(token) {
  return request(app)
    .delete('/api/account/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: SENHA });
}

describe('DELETE /api/account/me — assinatura do Stripe vs. abort da exclusão', () => {
  it('sem NENHUM admin para receber o canal inativo: 500 e a assinatura NÃO é cancelada', async () => {
    // Assinante de R$ 10,90 com um canal inativo e nenhum admin no sistema.
    const dono = await criarUsuario({ stripeSubscriptionId: 'sub_lgpd_sem_admin' });
    const canal = await Channel.create({ ownerId: dono.id, name: 'Canal Inativo Sem Admin', isActive: false });

    const res = await excluirConta(dono.token);

    expect(res.status).toBe(500);
    // O ponto do teste: o abort não pode ter deixado a assinatura cancelada.
    expect(cancelamentos).toEqual([]);
    // E a conta segue viva, com o canal ainda no nome dela — ou seja, a
    // pessoa continua pagando o que continua tendo.
    expect(await User.findById(dono.id)).not.toBeNull();
    const canalAinda = await Channel.findById(canal._id);
    expect(canalAinda.ownerId.toString()).toBe(dono.id);
  });

  it('barrado por canal ATIVO (409): a assinatura também NÃO é cancelada', async () => {
    await criarUsuario({ role: 'admin', createdAt: new Date('2023-01-01T00:00:00.000Z') });
    const dono = await criarUsuario({ stripeSubscriptionId: 'sub_lgpd_canal_ativo' });
    await Channel.create({ ownerId: dono.id, name: 'Canal Ativo Bloqueia', isActive: true });

    const res = await excluirConta(dono.token);

    expect(res.status).toBe(409);
    expect(cancelamentos).toEqual([]);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('com admin disponível: 200, canal transferido ao admin mais antigo e assinatura cancelada uma vez', async () => {
    // Controle do espião: prova que o cliente falso É alcançado pelo código
    // de produção quando a exclusão realmente acontece. Sem este teste, os
    // dois acima passariam por vacuidade.
    const adminAntigo = await criarUsuario({ role: 'admin', createdAt: new Date('2023-01-01T00:00:00.000Z') });
    await criarUsuario({ role: 'admin', createdAt: new Date('2025-06-01T00:00:00.000Z') });
    const dono = await criarUsuario({ stripeSubscriptionId: 'sub_lgpd_caminho_feliz' });
    const canal = await Channel.create({ ownerId: dono.id, name: 'Canal Inativo Transferido', isActive: false });

    const res = await excluirConta(dono.token);

    expect(res.status).toBe(200);
    expect(await User.findById(dono.id)).toBeNull();
    const canalAinda = await Channel.findById(canal._id);
    expect(canalAinda.ownerId.toString()).toBe(adminAntigo.id);
    expect(cancelamentos).toEqual(['sub_lgpd_caminho_feliz']);
  });
});
