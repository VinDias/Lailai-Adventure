
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env");

if (!fs.existsSync(envPath) && process.env.NODE_ENV === "production") {
  console.error("❌ ERRO: Arquivo .env não encontrado em ambiente de produção.");
  process.exit(1);
}

require("dotenv").config();

const requiredVars = [
  "JWT_SECRET",
  "REFRESH_SECRET",
  "MEDIA_TOKEN_SECRET",
  "MONGO_URI",
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "FRONTEND_URL"
];

let missing = [];

requiredVars.forEach(v => {
  if (!process.env[v]) {
    missing.push(v);
  }
});

if (missing.length) {
  console.error("❌ ERRO: Variáveis de ambiente obrigatórias ausentes:");
  missing.forEach(m => console.error(`   - ${m}`));
  process.exit(1);
}

console.log("✅ Variáveis de ambiente validadas com sucesso.");
