require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/loreflux');
  
  const existing = await User.findOne({ email: 'vin@loreflux.com' });
  if (existing) {
    console.log('Admin já existe.');
    process.exit(0);
  }

  const hash = await bcrypt.hash('SENHA_TEMPORARIA_TROCAR', 12);
  await User.create({
    email: 'vin@loreflux.com',
    passwordHash: hash,
    nome: 'Vin Dias',
    role: 'superadmin',
    isPremium: true,
    isActive: true,
    provider: 'local'
  });

  console.log('✅ Admin criado: vin@loreflux.com');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
