
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { transcodeToHLS } = require("../services/transcodeService");
const logger = require("../utils/logger");
const fs = require("fs");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const worker = new Worker("video-transcoding-queue", async job => {
  const { inputPath, outputPath } = job.data;
  
  logger.info(`[Worker Instance] Processando job ${job.id}: ${inputPath}`);
  
  try {
    const success = await transcodeToHLS(inputPath, outputPath);
    
    if (success) {
      logger.info(`[Worker Instance] Job ${job.id} concluído.`);
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    } else {
      throw new Error(`Falha no transcode do job ${job.id}`);
    }
  } catch (err) {
    logger.error(`[Worker Instance] Erro no job ${job.id}:`, err);
    throw err;
  }
}, { 
  connection,
  // Permite escala vertical por instância via variável de ambiente
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || "2") 
});

worker.on("failed", (job, err) => {
  logger.error(`[Worker Instance] Falha definitiva no job ${job.id || 'unknown'}: ${err.message}`);
});

logger.info(`🚀 Scalable Video Worker pronto (Concorrência: ${process.env.WORKER_CONCURRENCY || 2})`);

module.exports = worker;
