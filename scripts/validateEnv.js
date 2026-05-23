
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

// Força mínima dos segredos: pelo menos 32 caracteres e não usar valores de exemplo.
const WEAK_VALUES = [
  "sua_chave_secreta_jwt",
  "sua_chave_secreta_refresh",
  "segredo_para_tokens_de_midia_123",
  "changeme",
  "secret",
];
const secrets = ["JWT_SECRET", "REFRESH_SECRET", "MEDIA_TOKEN_SECRET"];
const weakSecrets = [];

secrets.forEach(name => {
  const v = process.env[name] || "";
  if (v.length < 32 || WEAK_VALUES.includes(v)) {
    weakSecrets.push(name);
  }
});

// JWT_SECRET e REFRESH_SECRET devem ser diferentes entre si.
if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.REFRESH_SECRET) {
  weakSecrets.push("REFRESH_SECRET (igual ao JWT_SECRET)");
}

if (weakSecrets.length) {
  console.error("❌ ERRO: Segredos fracos ou de exemplo detectados (use >= 32 caracteres aleatórios e únicos):");
  weakSecrets.forEach(m => console.error(`   - ${m}`));
  console.error("   Gere com: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  process.exit(1);
}

if (process.env.NODE_ENV === "production" && !process.env.BUNNY_WEBHOOK_SECRET) {
  console.warn("⚠️  AVISO: BUNNY_WEBHOOK_SECRET não definido — o webhook do Bunny será rejeitado até configurá-lo.");
}

console.log("✅ Variáveis de ambiente validadas com sucesso.");
