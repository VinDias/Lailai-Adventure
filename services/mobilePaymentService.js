
const axios = require("axios");
const logger = require("../utils/logger");

// A validação da Google Play saiu daqui na Fase 6 (T5) para
// services/playBillingService.js: passou a usar a API v2, a confirmar a
// compra e a distinguir "não vale" de "não consegui perguntar". Este arquivo
// ficou só com a Apple, que segue sem app publicado.

/**
 * Valida um recibo na Apple App Store.
 * Retorna { valid, expiresAt } baseado no campo de expiração mais recente.
 */
async function verifyAppleReceipt(receiptData) {
  try {
    if (typeof receiptData !== "string" || receiptData.length === 0) {
      return { valid: false };
    }
    const isProd = process.env.NODE_ENV === "production";
    const url = isProd
      ? "https://buy.itunes.apple.com/verifyReceipt"
      : "https://sandbox.itunes.apple.com/verifyReceipt";

    const res = await axios.post(url, {
      "receipt-data": receiptData,
      "password": process.env.APPLE_SHARED_SECRET,
      "exclude-old-transactions": true,
    });

    if (res.data.status !== 0) return { valid: false };

    const latest = res.data.latest_receipt_info || [];
    const expiries = latest
      .map(i => Number(i.expires_date_ms || 0))
      .filter(Boolean);
    const maxExpiry = expiries.length ? Math.max(...expiries) : 0;

    if (maxExpiry > Date.now()) {
      return { valid: true, expiresAt: new Date(maxExpiry) };
    }
    return { valid: false };
  } catch (err) {
    logger.error("[Apple IAP Error]", err.message);
    return { valid: false };
  }
}

module.exports = { verifyAppleReceipt };
