const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { transcodeToHLS } = require("../services/transcodeService");
const logger = require("../utils/logger");
const fs = require("fs");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});

const worker = new Worker("video-processing", async job => {
  const { inputPath, outputPath } = job.data;
  
  logger.info(`[Worker] Iniciando processamento do job ${job.id}: ${inputPath}`);
  
  try {
    const success = await transcodeToHLS(inputPath, outputPath);
    
    if (success) {
      logger.info(`[Worker] Job ${job.id} concluído com sucesso.`);
      // Limpeza de arquivo temporário
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    } else {
      throw new Error(`Falha na transcodificação do vídeo ${job.id}`);
    }
  } catch (err) {
    logger.error(`[Worker] Erro no job ${job.id}:`, err);
    throw err;
  }
}, { 
  connection,
  concurrency: 1 // Limita a 1 transcode por vez para poupar CPU da VPS
});

worker.on("failed", (job, err) => {
  logger.error(`[Worker] Job ${job.id} falhou definitivamente: ${err.message}`);
});

logger.info("🚀 Video Worker iniciado e aguardando jobs...");

module.exports = worker;