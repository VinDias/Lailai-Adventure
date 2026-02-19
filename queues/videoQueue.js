const { Queue } = require("bullmq");
const Redis = require("ioredis");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});

connection.on("error", (err) => {
  logger.error("[Redis Connection Error]", err);
});

const videoQueue = new Queue("video-processing", { 
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