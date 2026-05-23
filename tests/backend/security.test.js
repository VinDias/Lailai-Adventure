/**
 * Testes de segurança e LGPD.
 * Cobre: NoSQL injection (reset-password / refresh-token), política de senha,
 * consentimento obrigatório no cadastro, exportação e exclusão de conta.
 */
const request = require('supertest');
const db = require('../helpers/db');

let app;
let User;
let PasswordResetToken;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  PasswordResetToken = require('../../models/PasswordResetToken');
});

afterAll(() => db.closeDatabase());
afterEach(() => db.clearDatabase());

const register = (over = {}) =>
  request(app).post('/api/auth/register').send({
    email: 'sec@test.com', password: 'Senha@123', nome: 'Sec', acceptedTerms: true, ...over,
  });

// ─── NoSQL INJECTION ──────────────────────────────────────────────────────────

describe('NoSQL injection', () => {
  it('reset-password rejeita operador no campo token (não faz account takeover)', async () => {
    await register();
    const user = await User.findOne({ email: 'sec@test.com' });
    await PasswordResetToken.create({ userId: user._id, token: 'token-real-123' });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: { $gt: '' }, password: 'NovaSenha@123' });

    expect(res.status).toBe(400);

    // A senha NÃO pode ter sido alterada pelo operador injetado.
    const login = await request(app).post('/api/auth/login').send({ email: 'sec@test.com', password: 'Senha@123' });
    expect(login.status).toBe(200);
  });

  it('refresh-token rejeita operador no campo refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: { $ne: null } });
    expect([401, 403]).toContain(res.status);
  });
});

// ─── POLÍTICA DE SENHA & CONSENTIMENTO ─────────────────────────────────────────

describe('Registro: política de senha e consentimento', () => {
  it('rejeita senha fraca', async () => {
    const res = await register({ password: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejeita cadastro sem aceite dos termos (LGPD)', async () => {
    const res = await register({ acceptedTerms: false });
    expect(res.status).toBe(400);
  });

  it('grava o registro de consentimento ao cadastrar', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'sec@test.com' });
    expect(user.consent?.termsAcceptedAt).toBeTruthy();
    expect(user.consent?.privacyAcceptedAt).toBeTruthy();
  });
});

// ─── DIREITOS DO TITULAR (LGPD) ────────────────────────────────────────────────

describe('LGPD: exportação e exclusão de conta', () => {
  async function newSession() {
    const res = await register();
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  it('exporta os dados do usuário autenticado', async () => {
    const { token } = await newSession();
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);
    expect(data.account.email).toBe('sec@test.com');
    expect(data).toHaveProperty('votes');
    expect(data).toHaveProperty('channels');
  });

  it('exige autenticação para exportar', async () => {
    const res = await request(app).get('/api/account/me/export');
    expect(res.status).toBe(401);
  });

  it('exclui a conta com a senha correta', async () => {
    const { token } = await newSession();
    const res = await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Senha@123' });
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'sec@test.com' });
    expect(user).toBeNull();
  });

  it('não exclui a conta com senha incorreta', async () => {
    const { token } = await newSession();
    const res = await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'errada' });
    expect(res.status).toBe(401);
    const user = await User.findOne({ email: 'sec@test.com' });
    expect(user).not.toBeNull();
  });
});

// ─── WEBHOOK BUNNY AUTENTICADO ─────────────────────────────────────────────────

describe('Webhook do Bunny', () => {
  it('rejeita webhook sem token quando o segredo está configurado', async () => {
    const prev = process.env.BUNNY_WEBHOOK_SECRET;
    process.env.BUNNY_WEBHOOK_SECRET = 'segredo-teste';
    const res = await request(app)
      .post('/api/bunny/webhook')
      .send({ VideoGuid: 'abc', Status: 4 });
    expect(res.status).toBe(403);
    process.env.BUNNY_WEBHOOK_SECRET = prev;
  });
});
