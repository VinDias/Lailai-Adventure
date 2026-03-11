const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');

router.post('/create', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body; // valor em centavos (ex: 500 = R$ 5,00)
    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Valor mínimo de doação: R$ 1,00" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: 'Doação para Lorflux' },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?donation=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?donation=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error("[Donation Error]", err);
    res.status(500).json({ error: "Erro ao processar doação." });
  }
});

module.exports = router;
