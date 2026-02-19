const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const verifyToken = require("../middlewares/verifyToken");
const logger = require("../utils/logger");

router.post("/create-checkout-session", verifyToken, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "pix"],
      mode: "subscription",
      customer_email: req.user.email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/payment-success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      metadata: { userId: req.user.id }
    });
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    logger.error("[Stripe Session Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// WEBHOOK SEGURO COM VERIFICAÇÃO DE ASSINATURA
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    logger.warn("[Stripe Webhook] Tentativa de acesso sem assinatura ou secret.");
    return res.status(400).send("Webhook Signature/Secret missing.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error(`[Stripe Webhook] Erro na verificação: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    logger.info(`[Stripe Webhook] Pagamento aprovado: ${session.customer_email}`);
    // Atualizar no banco de dados aqui
  }

  res.json({ received: true });
});

module.exports = router;