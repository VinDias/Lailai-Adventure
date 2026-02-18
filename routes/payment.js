
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

// Webhook seguro (deve ser chamado com o body bruto)
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    
    // Como estamos usando USERS_DB em server.js, a lógica de persistência 
    // deve refletir onde os dados estão armazenados. 
    // Em um sistema real, aqui iria: await User.findOneAndUpdate(...)
    
    console.log(`[Stripe Webhook] Pagamento aprovado para: ${session.customer_email}`);
    
    // Disparar evento de atualização (global ou DB)
    // O server.js lida com a atualização do USERS_DB mockado se necessário.
  }

  res.json({ received: true });
});

module.exports = router;
