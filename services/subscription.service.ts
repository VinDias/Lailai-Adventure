
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export class SubscriptionService {
  static async createCheckout(userId: string, email: string) {
    return await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'Lorflux Premium - Cinema Vertical',
            description: 'Acesso HLS 1080p, Zero Ads e Hi-Qua Webtoons.',
          },
          unit_amount: 399,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/premium`,
      customer_email: email,
      metadata: { userId },
    });
  }

  static async verifyWebhook(body: any, signature: string) {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      throw new Error(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      // ATUALIZAR DB: users set is_premium = true where id = userId
    }
  }
}
