
module.exports = {
  apps: [{
    name: "lailai-production-app",
    script: "server.js",
    instances: "max", // Utiliza todos os cores da CPU
    exec_mode: "cluster",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    env_production: {
      NODE_ENV: "production"
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    merge_logs: true
  }]
};
