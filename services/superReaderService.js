/**
 * Super Reader (Fase 4, Bloco 3) — apoio direto ao autor de uma obra.
 * `criarSessaoDeApoio` monta a sessão de checkout do Stripe (mode: 'payment',
 * valor livre em centavos); a contribuição só é gravada de fato no webhook
 * (`registrarContribuicao`), quando o Stripe confirma o pagamento —
 * sessão criada != pagamento feito.
 * Stripe LAZY (require na primeira necessidade real, dentro de função) para
 * o test seam (__setStripeForTests) funcionar sem STRIPE_SECRET_KEY em
 * teste — mesmo padrão de ensureVapid em services/notificationService.js.
 */
const mongoose = require('mongoose');
const Series = require('../models/Series');
const Setting = require('../models/Setting');
const SuperReaderContribution = require('../models/SuperReaderContribution');

// Trancado em BRL até existir política cambial (ruling da revisão final,
// 20/08/2026): o relatório de repasse (routes/royalties.js) agrega
// authorShareCents por canal SEM separar por moeda — um apoio em outra
// moeda entraria somado como se fosse BRL. Reabrir usd/eur exige agrupar o
// report por {channelId, currency} primeiro — dívida registrada na spec.
const MOEDAS_VALIDAS = ['brl'];
const MINIMO_PADRAO_CENTS = 500;

let stripeInstance = null;
let testStripe = null;

/** Monta (ou reaproveita) o cliente Stripe real; erro claro se faltar a chave. */
function getStripe() {
  if (testStripe) return testStripe;
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY não configurada — não é possível criar sessão de apoio.');
  }
  stripeInstance = require('stripe')(key);
  return stripeInstance;
}

/** Lê o mínimo de apoio (em centavos) do Setting `superReaderMinCents`.
 *  Ausente ou inválido (Setting.value é String; não-inteiro ou <= 0) → default 500. */
async function lerMinimoCents() {
  const doc = await Setting.findOne({ key: 'superReaderMinCents' }).lean();
  if (!doc) return MINIMO_PADRAO_CENTS;
  const valor = Number(doc.value);
  if (!Number.isInteger(valor) || valor <= 0) return MINIMO_PADRAO_CENTS;
  return valor;
}

/**
 * Cria a sessão de checkout Stripe (`mode: 'payment'`) para o apoio a uma
 * obra. Valida valor/moeda/série antes de tocar no Stripe. Erros de
 * validação lançam `Error` com `.status` (400 ou 404) — convenção que as
 * rotas (Task 2) consomem direto, no mesmo padrão de
 * services/progressService.js.
 */
async function criarSessaoDeApoio({ userId, seriesId, amountCents, currency }) {
  if (!Number.isInteger(amountCents)) {
    const e = new Error('amountCents deve ser um número inteiro de centavos.');
    e.status = 400;
    throw e;
  }

  const minimo = await lerMinimoCents();
  if (amountCents < minimo) {
    const e = new Error(`O apoio mínimo é de ${minimo} centavos.`);
    e.status = 400;
    throw e;
  }

  if (!MOEDAS_VALIDAS.includes(currency)) {
    const e = new Error('Moeda inválida. Use brl.');
    e.status = 400;
    throw e;
  }

  if (!mongoose.Types.ObjectId.isValid(seriesId)) {
    const e = new Error('seriesId inválido.');
    e.status = 400;
    throw e;
  }

  const series = await Series.findById(seriesId);
  if (!series) {
    const e = new Error('Série não encontrada.');
    e.status = 404;
    throw e;
  }
  if (!series.isPublished) {
    const e = new Error('Série não publicada.');
    e.status = 400;
    throw e;
  }
  if (!series.channelId) {
    const e = new Error('Série sem canal vinculado.');
    e.status = 400;
    throw e;
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency,
        unit_amount: amountCents,
        product_data: { name: `Apoio Super Reader — ${series.title}` },
      },
      quantity: 1,
    }],
    metadata: {
      tipo: 'super_reader',
      userId: String(userId),
      seriesId: String(seriesId),
      channelId: String(series.channelId),
    },
    success_url: `${process.env.FRONTEND_URL}/?superreader=success`,
    cancel_url: `${process.env.FRONTEND_URL}/?superreader=cancelled`,
  });

  return { url: session.url };
}

/**
 * Registra a contribuição a partir da sessão do webhook (checkout.session.
 * completed). `tipo` já foi checado pelo chamador (routes/payment.js), mas
 * revalidamos por defesa. O valor SEMPRE vem de `session.amount_total`
 * (nunca do metadata — ruling P2 do ledger): metadata ecoa o que o cliente
 * pediu na criação, amount_total é o que foi de fato PAGO.
 * Upsert por `stripeSessionId` com `$setOnInsert`: o Stripe reenvia webhooks
 * (retry) e isso NUNCA deve duplicar nem reescrever um registro existente.
 */
async function registrarContribuicao(session) {
  if (!session || !session.metadata || session.metadata.tipo !== 'super_reader') {
    throw new Error('registrarContribuicao chamado para uma sessão que não é de Super Reader.');
  }

  const { userId, seriesId, channelId } = session.metadata;
  const amountCents = session.amount_total;
  const currency = session.currency;

  const authorShareCents = Math.round(amountCents * 0.8);
  const platformShareCents = amountCents - authorShareCents;

  const agora = new Date();
  const period = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  try {
    return await SuperReaderContribution.findOneAndUpdate(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          userId, seriesId, channelId, amountCents, currency,
          authorShareCents, platformShareCents,
          stripeSessionId: session.id, period,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Corrida real: duas gravações concorrentes do MESMO stripeSessionId
    // (dois webhooks quase simultâneos, ex. reenvio do Stripe cruzando com o
    // processamento original) disputam o upsert — o findOneAndUpdate NÃO é
    // atômico entre execuções concorrentes no nível do índice único, então
    // quem perde a corrida pode receber E11000 na tentativa de insert em vez
    // de simplesmente encontrar o doc do vencedor. Isso é esperado (não é um
    // erro de verdade): devolvemos o doc já gravado pelo vencedor — mesma
    // garantia de idempotência, sem lançar erro críptico para o chamador.
    if (err.code === 11000) {
      const existente = await SuperReaderContribution.findOne({ stripeSessionId: session.id });
      if (existente) return existente;
    }
    throw err;
  }
}

/** Injeção exclusiva de testes (mesmo padrão de notificationService). */
function __setStripeForTests(fake) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setStripeForTests só pode ser usado em NODE_ENV=test');
  }
  testStripe = fake;
}

module.exports = {
  lerMinimoCents,
  criarSessaoDeApoio,
  registrarContribuicao,
  __setStripeForTests,
};
