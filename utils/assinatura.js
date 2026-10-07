// Fonte ÚNICA do "assinante ativo" no SERVIDOR (Fase 6, T1).
//
// Nome `assinatura.js` de propósito: `utils/premium.ts` é do frontend, e um
// `premium.js` ao lado faria o bundler resolver o arquivo errado (o Vite
// prefere .js ao .ts) — foi o que aconteceu na primeira versão desta peça.
//
// Antes desta fase havia TRÊS leituras diferentes da mesma ideia: a flag crua
// `isPremium` (App.tsx e middlewares órfãos), flag + data no cliente
// (utils/premium.ts) e flag + data no relatório de royalties
// (services/royaltyReportService.js). Com o Premium passando a BARRAR
// conteúdo, divergência entre elas vira bug de cobrança: alguém pagando
// levaria 403, ou alguém vencido continuaria lendo.
//
// Regra: é assinante quem tem `isPremium` ligado E não está vencido.
// `premiumExpiresAt` ausente conta como "sem prazo" (assinatura antiga,
// anterior ao campo) — NÃO bloqueia.
const User = require('../models/User');

/** Predicado puro sobre um doc/objeto com isPremium e premiumExpiresAt. */
function assinaturaAtiva(doc) {
  if (!doc || doc.isPremium !== true) return false;
  if (!doc.premiumExpiresAt) return true;
  return new Date(doc.premiumExpiresAt).getTime() > Date.now();
}

/**
 * Versão que vai ao banco: o payload do token NÃO serve para decidir acesso
 * pago — ele é assinado no login e sobrevive 15 minutos a um cancelamento,
 * a um estorno ou ao fim do período. Quem autoriza conteúdo pago lê o estado
 * atual.
 */
async function assinaturaAtivaDoUsuario(userId) {
  if (!userId) return false;
  const doc = await User.findById(userId).select('isPremium premiumExpiresAt').lean();
  return assinaturaAtiva(doc);
}

module.exports = { assinaturaAtiva, assinaturaAtivaDoUsuario };
