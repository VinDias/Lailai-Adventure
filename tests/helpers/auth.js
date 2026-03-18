/**
 * Helpers de autenticação para testes
 * Cria e retorna tokens para cada tipo de usuário
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const USERS = {
  superadmin: { email: 'superadmin@lorflux.test', password: 'SuperAdmin@123', nome: 'Super Admin', role: 'superadmin' },
  admin:      { email: 'admin@lorflux.test',      password: 'Admin@123',      nome: 'Admin User',  role: 'admin' },
  premium:    { email: 'premium@lorflux.test',    password: 'Premium@123',    nome: 'Premium User', role: 'user', isPremium: true },
  user:       { email: 'user@lorflux.test',       password: 'User@123',       nome: 'Regular User', role: 'user' },
  inactive:   { email: 'inactive@lorflux.test',   password: 'Inactive@123',   nome: 'Inactive User', role: 'user', isActive: false },
};

let tokens = {};
let ids = {};

async function createUsers(app) {
  const User = require('../../models/User');

  for (const [key, data] of Object.entries(USERS)) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const premiumExpiresAt = data.isPremium ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const user = await User.create({
      email: data.email,
      passwordHash,
      nome: data.nome,
      role: data.role,
      isPremium: data.isPremium || false,
      premiumExpiresAt,
      isActive: data.isActive !== false,
    });
    ids[key] = user._id.toString();
  }

  // Login para obter tokens (exceto inactive — não loga)
  for (const [key, data] of Object.entries(USERS)) {
    if (key === 'inactive') continue;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: data.email, password: data.password });
    if (res.status === 200) {
      tokens[key] = res.body.accessToken;
    }
  }
}

function getToken(role) { return tokens[role]; }
function getId(role)    { return ids[role]; }
function getUsers()     { return USERS; }

module.exports = { createUsers, getToken, getId, getUsers, USERS };
