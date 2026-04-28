const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const verifyToken = require('../middlewares/verifyToken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Mapeamento locale → moeda → priceId
const LOCALE_CURRENCY = {
  'pt-br': 'brl', 'pt': 'brl',
  'en-us': 'usd', 'en-gb': 'usd', 'en': 'usd',
  'es': 'usd', 'es-mx': 'usd', 'es-ar': 'usd',
  'fr': 'eur', 'de': 'eur', 'it': 'eur', 'nl': 'eur',
  'ja': 'usd', 'ko': 'usd', 'zh': 'usd',
};

function getPriceIdForLocale(locale) {
  const lang = (locale || '').toLowerCase();
  const currency = LOCALE_CURRENCY[lang] || LOCALE_CURRENCY[lang.split('-')[0]] || 'brl';
  const map = {
    brl: process.env.STRIPE_PRICE_ID_BRL || process.env.STRIPE_PRICE_ID,
    usd: process.env.STRIPE_PRICE_ID_USD || process.env.STRIPE_PRICE_ID,
    eur: process.env.STRIPE_PRICE_ID_EUR || process.env.STRIPE_PRICE_ID,
  };
  return { priceId: map[currency] || process.env.STRIPE_PRICE_ID, currency };
}

// Criar sessão de checkout (aceita locale para multi-currency)
router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email: user.email, name: user.nome });
        customerId = customer.id;
      }
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const { locale } = req.body || {};
    const { priceId } = getPriceIdForLocale(locale);

    const sessionParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?payment=cancelled`,
    };

    // Stripe locale para traduzir a página de checkout
    const stripeLocale = (locale || '').split('-')[0];
    if (stripeLocale && stripeLocale !== 'pt') {
      sessionParams.locale = stripeLocale;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url });
  } catch (err) {
    logger.error("[Stripe Checkout Error]", err);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento." });
  }
});

// Webhook do Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error("[Webhook] STRIPE_WEBHOOK_SECRET não configurado.");
    return res.status(500).send("Webhook não configurado no servidor.");
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error("[Webhook Signature Error]", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId = session.customer;

      const user = await User.findOne({ stripeCustomerId: customerId });
      if (user) {
        user.isPremium = true;
        user.stripeSubscriptionId = session.subscription;
        user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await user.save();
        logger.info(`Premium ativado para: ${user.email}`);
      } else {
        logger.warn(`[Webhook] Nenhum usuário encontrado para stripeCustomerId: ${customerId}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const user = await User.findOne({ stripeSubscriptionId: subscription.id });
      if (user) {
        user.isPremium = false;
        user.stripeSubscriptionId = null;
        await user.save();
        logger.info(`Premium cancelado para: ${user.email}`);
      } else {
        logger.warn(`[Webhook] Nenhum usuário encontrado para stripeSubscriptionId: ${subscription.id}`);
      }
    }
  } catch (err) {
    logger.error("[Webhook Processing Error]", err);
    return res.status(500).json({ error: "Erro ao processar evento do webhook." });
  }

  res.json({ received: true });
});

// Status da assinatura
router.get('/status', verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({
    isPremium: user?.isPremium || false,
    premiumExpiresAt: user?.premiumExpiresAt || null
  });
});

module.exports = router;