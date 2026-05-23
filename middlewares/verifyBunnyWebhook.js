const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Autentica o webhook do Bunny.net.
 *
 * O endpoint de webhook altera dados sensíveis (status e video_url dos
 * episódios). Sem autenticação, qualquer um na internet pode forjar chamadas.
 *
 * Configure no painel do Bunny a URL do webhook com um segredo, p.ex.:
 *   https://api.lorflux.com/api/bunny/webhook?token=SEU_SEGREDO
 * e defina BUNNY_WEBHOOK_SECRET=SEU_SEGREDO no .env.
 *
 * Também aceita o segredo via header "x-webhook-token".
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = function verifyBunnyWebhook(req, res, next) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET;

  // Fail-closed: sem segredo configurado, o webhook não é confiável.
  if (!secret) {
    logger.error("[Bunny Webhook] BUNNY_WEBHOOK_SECRET não configurado — rejeitando webhook não autenticado.");
    return res.status(503).json({ error: "Webhook não configurado no servidor." });
  }

  const provided = req.get("x-webhook-token") || req.query.token || "";

  if (!provided || !timingSafeEqual(provided, secret)) {
    logger.warn(`[Bunny Webhook] Tentativa de acesso com token inválido de ${req.ip}`);
    return res.status(403).json({ error: "Assinatura de webhook inválida." });
  }

  next();
};
