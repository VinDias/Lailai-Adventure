require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { validatePassword, isValidEmail } = require('../validators/authValidator');

/**
 * Cria o primeiro superadmin a partir de variáveis de ambiente.
 * NUNCA use senhas hardcoded — defina antes de rodar:
 *   SEED_ADMIN_EMAIL=...  SEED_ADMIN_PASSWORD=...  SEED_ADMIN_NAME=...
 */
async function seed() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const nome = process.env.SEED_ADMIN_NAME || 'Administrador';

  if (!isValidEmail(email)) {
    console.error('❌ Defina SEED_ADMIN_EMAIL com um e-mail válido.');
    process.exit(1);
  }
  const pwd = validatePassword(password);
  if (!pwd.valid) {
    console.error(`❌ SEED_ADMIN_PASSWORD inválida: ${pwd.message}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux');

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Admin já existe.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);
  await User.create({
    email,
    passwordHash: hash,
    nome,
    role: 'superadmin',
    isPremium: true,
    isActive: true,
    provider: 'local',
    consent: { termsAcceptedAt: new Date(), privacyAcceptedAt: new Date() }
  });

  console.log(`✅ Superadmin criado: ${email}`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
