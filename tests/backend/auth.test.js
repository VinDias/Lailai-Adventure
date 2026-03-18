/**
 * Testes: Autenticação
 * Cobre: register, login, refresh-token, logout
 * Tipos de usuário: unauthenticated, user, admin
 */
const request = require('supertest');
const db = require('../helpers/db');

let app;

beforeAll(async () => {
  await db.connect();
  // Importa depois do DB estar pronto
  app = require('../../server');
});

afterAll(() => db.closeDatabase());
afterEach(() => db.clearDatabase());

// ─── REGISTRO ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const valid = { email: 'novo@test.com', password: 'Senha@123', nome: 'Novo User' };

  it('registra usuário com dados válidos', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(valid.email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('novo usuário tem role "user" e isPremium false por padrão', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.isPremium).toBe(false);
  });

  it('retorna 400 sem email', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: '123', nome: 'X' });
    expect(res.status).toBe(400);
  });

  it('retorna 400 sem senha', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', nome: 'X' });
    expect(res.status).toBe(400);
  });

  it('retorna 409 com email duplicado', async () => {
    await request(app).post('/api/auth/register').send(valid);
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(409);
  });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const creds = { email: 'login@test.com', password: 'Senha@123', nome: 'Login User' };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(creds);
  });

  it('retorna accessToken e refreshToken com credenciais corretas', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(creds.email);
  });

  it('não expõe passwordHash no retorno', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('retorna 401 com senha errada', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'errado' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 com email inexistente', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nao@existe.com', password: '123' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem corpo', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

describe('POST /api/auth/refresh-token', () => {
  let refreshToken;

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'r@test.com', password: 'Senha@123', nome: 'R' });
    const login = await request(app).post('/api/auth/login').send({ email: 'r@test.com', password: 'Senha@123' });
    refreshToken = login.body.refreshToken;
  });

  it('retorna novo accessToken com refresh válido', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('retorna 401 sem refreshToken', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({});
    expect(res.status).toBe(401);
  });

  it('retorna 403 com refreshToken inválido', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: 'invalido' });
    expect([401, 403]).toContain(res.status);
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let accessToken;

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'lo@test.com', password: 'Senha@123', nome: 'Lo' });
    const login = await request(app).post('/api/auth/login').send({ email: 'lo@test.com', password: 'Senha@123' });
    accessToken = login.body.accessToken;
  });

  it('desconecta com token válido', async () => {
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});
