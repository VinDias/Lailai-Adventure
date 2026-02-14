
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export class SubscriptionService {
  static async createCheckoutSession(userId: string, userEmail: string) {
    return await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Adicionar 'pix' via dashboard Stripe Brasil
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: 'LaiLai Premium',
            description: 'Acesso total sem anúncios, 1080p 60fps e conteúdos exclusivos.',
          },
          unit_amount: 399, // R$ 3,99
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription`,
      metadata: { userId },
    });
  }

  static async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'customer.subscription.deleted':
        // Lógica de cancelamento no DB
        break;
      case 'invoice.payment_succeeded':
        // Lógica de renovação/ativação no DB
        break;
    }
  }
}
