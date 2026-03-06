const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

router.post('/webhook', express.json(), (req, res) => {
  const { VideoGuid, Status } = req.body;
  
  logger.info(`[Bunny Webhook] Video ${VideoGuid} status: ${Status}`);
  
  if (Status === 4) { // 4 = Finished encoding
    // TODO: Atualizar no MongoDB o status do vídeo para "published"
    logger.info(`Vídeo ${VideoGuid} processado e pronto para publicação`);
  }

  res.json({ received: true });
});

module.exports = router;
