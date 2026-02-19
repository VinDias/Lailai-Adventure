
const express = require("express");
const router = express.Router();
const { createDonationSession } = require("../services/donationService");

router.post("/create-donation-session", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Valor de doação inválido" });
    }

    const url = await createDonationSession(amount);
    res.json({ url });
  } catch (error) {
    console.error("[Donation Route Error]", error);
    res.status(500).json({ error: "Erro ao criar sessão de doação" });
  }
});

module.exports = router;
