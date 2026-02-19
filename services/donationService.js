
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createDonationSession(amount) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: {
            name: "Doação Voluntária - LaiLai",
            description: "Apoio voluntário à plataforma - sem benefícios digitais inclusos"
          },
          unit_amount: Math.round(amount * 100) // Converte para centavos
        },
        quantity: 1
      }
    ],
    success_url: `${process.env.DOMAIN || 'http://localhost:5173'}/donation-success`,
    cancel_url: `${process.env.DOMAIN || 'http://localhost:5173'}/donation-cancel`
  });

  return session.url;
}

module.exports = { createDonationSession };
