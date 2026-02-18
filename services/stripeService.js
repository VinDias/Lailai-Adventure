
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createCheckoutSession(user) {
  return await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: `${process.env.DOMAIN}/payment-success`,
    cancel_url: `${process.env.DOMAIN}/payment-cancel`,
    metadata: {
      userId: user.id
    }
  });
}

module.exports = { stripe, createCheckoutSession };
