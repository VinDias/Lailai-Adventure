
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("../utils/logger");

if (!process.env.REDIS_URL) {
  logger.error("CRITICAL: REDIS_URL not defined in environment variables.");
  throw new Error("REDIS_URL not defined");
}

// Conexão Redis otimizada para BullMQ em produção (Horizontal Scaling)
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("error", (err) => {
  logger.error("[Redis Connection Error]", err);
});

// Nome da fila fixo e global para permitir múltiplos workers simultâneos
const videoQueue = new Queue("video-transcoding-queue", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    }
  }
});

module.exports = videoQueue;
