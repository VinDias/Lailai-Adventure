const { Queue } = require("bullmq");
const Redis = require("ioredis");
const logger = require("../utils/logger");

if (!process.env.REDIS_URL) {
  logger.error("CRITICAL: REDIS_URL not defined in environment variables.");
  throw new Error("REDIS_URL not defined");
}

const redisUrl = process.env.REDIS_URL;
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