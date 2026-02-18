
const express = require("express");
const router = express.Router();
const { verifyGooglePurchase, verifyAppleReceipt } = require("../services/mobilePaymentService");
const verifyToken = require("../middlewares/verifyToken");

// IMPORTANTE: Como o projeto usa USERS_DB mockado em server.js, 
// em um cenário real importaríamos o model User. 
// Para este contexto, assume-se a lógica de persistência solicitada.

router.post("/verify-google", verifyToken, async (req, res) => {
  const { purchaseToken, productId } = req.body;
  
  if (!purchaseToken || !productId) {
    return res.status(400).json({ error: "Dados da compra incompletos." });
  }

  const isValid = await verifyGooglePurchase(purchaseToken, productId);

  if (isValid) {
    // Atualização do usuário (Lógica padrão solicitada)
    // Em produção real: const user = await User.findById(req.user.id);
    const user = req.user; 
    user.isPremium = true;
    user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Simulação de persistência conforme solicitado
    // await user.save();
    
    return res.json({ success: true, message: "Assinatura Google Play ativada." });
  }

  res.status(402).json({ error: "Falha na validação da compra Google." });
});

router.post("/verify-apple", verifyToken, async (req, res) => {
  const { receiptData } = req.body;

  if (!receiptData) {
    return res.status(400).json({ error: "Recibo Apple não fornecido." });
  }

  const isValid = await verifyAppleReceipt(receiptData);

  if (isValid) {
    const user = req.user;
    user.isPremium = true;
    user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // await user.save();

    return res.json({ success: true, message: "Assinatura Apple IAP ativada." });
  }

  res.status(402).json({ error: "Falha na validação do recibo Apple." });
});

module.exports = router;
