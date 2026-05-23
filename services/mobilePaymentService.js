
const { google } = require("googleapis");
const axios = require("axios");
const logger = require("../utils/logger");

/**
 * Valida uma assinatura na Google Play Store.
 * Retorna { valid, expiresAt } — só é válida se estiver paga/trial E não expirada.
 */
async function verifyGooglePurchase(purchaseToken, productId) {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
      // Credenciais via GOOGLE_APPLICATION_CREDENTIALS.
    });

    const authClient = await auth.getClient();
    const publisher = google.androidpublisher({ version: "v3", auth: authClient });

    const res = await publisher.purchases.subscriptions.get({
      packageName: process.env.ANDROID_PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    });

    const data = res.data || {};
    // paymentState: 1 = recebido, 2 = trial. (0 = pendente, ausente = cancelado)
    const paid = data.paymentState === 1 || data.paymentState === 2;
    const expiryMs = Number(data.expiryTimeMillis || 0);
    const notExpired = expiryMs > Date.now();

    if (paid && notExpired) {
      return { valid: true, expiresAt: new Date(expiryMs) };
    }
    return { valid: false };
  } catch (err) {
    logger.error("[Google Billing Error]", err.message);
    return { valid: false };
  }
}

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

module.exports = { verifyGooglePurchase, verifyAppleReceipt };
