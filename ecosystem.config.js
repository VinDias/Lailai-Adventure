
module.exports = {
  apps: [
    {
      name: "lailai-app",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/app-err.log",
      out_file: "./logs/app-out.log",
      merge_logs: true
    },
    {
      name: "lailai-video-worker",
      script: "workers/videoWorker.js",
      // Modo Cluster: Escala automaticamente conforme o número de CPUs
      instances: "max", 
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        WORKER_CONCURRENCY: 2
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/worker-err.log",
      out_file: "./logs/worker-out.log",
      merge_logs: true
    }
  ]
};
