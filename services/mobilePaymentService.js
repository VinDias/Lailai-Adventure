
const { google } = require("googleapis");
const axios = require("axios");

/**
 * Valida compra na Google Play Store
 */
async function verifyGooglePurchase(purchaseToken, productId) {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
      // As credenciais seriam carregadas via GOOGLE_APPLICATION_CREDENTIALS env
    });

    const authClient = await auth.getClient();
    const publisher = google.androidpublisher({ version: "v3", auth: authClient });

    const res = await publisher.purchases.subscriptions.get({
      packageName: process.env.ANDROID_PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    });

    // Status 0: Ativa, 1: Cancelada
    return res.data.paymentState === 0 || res.data.paymentState === 1;
  } catch (err) {
    console.error("[Google Billing Error]", err.message);
    return false;
  }
}

/**
 * Valida recibo na Apple App Store
 */
async function verifyAppleReceipt(receiptData) {
  try {
    const isProd = process.env.NODE_ENV === "production";
    const url = isProd 
      ? "https://buy.itunes.apple.com/verifyReceipt" 
      : "https://sandbox.itunes.apple.com/verifyReceipt";

    const res = await axios.post(url, {
      "receipt-data": receiptData,
      "password": process.env.APPLE_SHARED_SECRET
    });

    // Status 0 significa recibo válido
    return res.data.status === 0;
  } catch (err) {
    console.error("[Apple IAP Error]", err.message);
    return false;
  }
}

module.exports = { verifyGooglePurchase, verifyAppleReceipt };
