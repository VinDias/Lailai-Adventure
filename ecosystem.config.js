
module.exports = {
  apps: [
    {
      name: "loreflux-app",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "500M",
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
      name: "loreflux-video-worker",
      script: "workers/videoWorker.js",
      instances: "max", 
      exec_mode: "cluster",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
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
