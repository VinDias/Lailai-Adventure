
const express = require("express");
const router = express.Router();
const { verifyGooglePurchase, verifyAppleReceipt } = require("../services/mobilePaymentService");
const verifyToken = require("../middlewares/verifyToken");
const User = require("../models/User");
const logger = require("../utils/logger");

async function grantPremium(userId, expiresAt) {
  await User.findByIdAndUpdate(userId, {
    isPremium: true,
    premiumExpiresAt: expiresAt,
  });
}

router.post("/verify-google", verifyToken, async (req, res) => {
  const { purchaseToken, productId } = req.body;

  if (typeof purchaseToken !== "string" || typeof productId !== "string" || !purchaseToken || !productId) {
    return res.status(400).json({ error: "Dados da compra incompletos." });
  }

  const result = await verifyGooglePurchase(purchaseToken, productId);

  if (result.valid) {
    await grantPremium(req.user.id, result.expiresAt);
    logger.info(`[Mobile] Premium (Google) ativado para userId ${req.user.id}`);
    return res.json({ success: true, message: "Assinatura Google Play ativada.", premiumExpiresAt: result.expiresAt });
  }

  res.status(402).json({ error: "Falha na validação da compra Google." });
});

router.post("/verify-apple", verifyToken, async (req, res) => {
  const { receiptData } = req.body;

  if (typeof receiptData !== "string" || !receiptData) {
    return res.status(400).json({ error: "Recibo Apple não fornecido." });
  }

  const result = await verifyAppleReceipt(receiptData);

  if (result.valid) {
    await grantPremium(req.user.id, result.expiresAt);
    logger.info(`[Mobile] Premium (Apple) ativado para userId ${req.user.id}`);
    return res.json({ success: true, message: "Assinatura Apple IAP ativada.", premiumExpiresAt: result.expiresAt });
  }

  res.status(402).json({ error: "Falha na validação do recibo Apple." });
});

module.exports = router;
