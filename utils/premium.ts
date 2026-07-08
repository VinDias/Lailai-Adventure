import { User } from '../types';

// Premium só vale se não estiver expirado. O banco pode demorar a desligar
// isPremium (depende do webhook de pagamento), então o cliente também confere
// premiumExpiresAt antes de esconder anúncios.
export function isPremiumActive(user: User | null | undefined): boolean {
  if (!user?.isPremium) return false;
  if (!user.premiumExpiresAt) return true;
  return new Date(user.premiumExpiresAt) > new Date();
}
