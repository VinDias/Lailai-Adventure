
const express = require("express");
const router = express.Router();
const { stripe, createCheckoutSession } = require("../services/stripeService");
const verifyToken = require("../middlewares/verifyToken");

// Rota para iniciar o checkout
router.post("/create-checkout-session", verifyToken, async (req, res) => {
  try {
    const session = await createCheckoutSession(req.user);
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * WEBHOOK STRIPE
 * Deve usar express.raw ANTES do express.json() global no server.js
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET não configurado.");
    return res.status(500).send("Erro de configuração interna.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log(`[Stripe Webhook] Pagamento aprovado para: ${session.customer_email}`);
    
    // Lógica de ativação premium integrada com DB real no futuro
    // Aqui atualizaríamos o campo isPremium e premiumExpiresAt
  }

  res.json({ received: true });
});

module.exports = router;
