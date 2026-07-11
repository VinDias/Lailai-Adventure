/**
 * Testes: Login com Google (POST /api/auth/google)
 * Contrato: GIS ID token verificado via utils/googleTokenVerifier (seam de teste),
 * vínculo por e-mail verificado, dormente sem GOOGLE_CLIENT_ID.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');

let app;
let googleVerifier;

const PAYLOAD = {
  sub: 'google-sub-123',
  email: 'gtest@gmail.com',
  email_verified: true,
  name: 'Google User',
  picture: 'https://lh3.googleusercontent.com/foto.jpg',
};

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  googleVerifier = require('../../utils/googleTokenVerifier');
});

afterAll(() => db.closeDatabase());

afterEach(async () => {
  await db.clearDatabase();
  googleVerifier.__setVerifierForTests(null);
  delete process.env.GOOGLE_CLIENT_ID;
});

describe('POST /api/auth/google', () => {
  it('retorna 503 quando GOOGLE_CLIENT_ID não está configurado', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app).post('/api/auth/google').send({ credential: 'abc' });
    expect(res.status).toBe(503);
  });

  it('retorna 400 sem credential', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('retorna 401 quando o token é inválido (verificador lança)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    googleVerifier.__setVerifierForTests(async () => { throw new Error('invalid token'); });
    const res = await request(app).post('/api/auth/google').send({ credential: 'token-invalido' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 quando o e-mail do Google não é verificado', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    googleVerifier.__setVerifierForTests(async () => ({ ...PAYLOAD, email_verified: false }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    expect(res.status).toBe(401);
  });

  it('cria conta nova via Google com consentimento LGPD e sessão completa', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    googleVerifier.__setVerifierForTests(async () => ({ ...PAYLOAD }));

    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(PAYLOAD.email);
    expect(res.body.user.nome).toBe(PAYLOAD.name);
    expect(res.body.user.avatar).toBe(PAYLOAD.picture);
    expect(res.body.user).toHaveProperty('premiumExpiresAt');
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const User = require('../../models/User');
    const created = await User.findOne({ email: PAYLOAD.email }).lean();
    expect(created.provider).toBe('google');
    expect(created.providerId).toBe(PAYLOAD.sub);
    expect(created.consent.termsAcceptedAt).toBeTruthy();
    expect(created.consent.privacyAcceptedAt).toBeTruthy();
  });

  it('vincula conta local existente pelo e-mail verificado e loga', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    const User = require('../../models/User');
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    await User.create({
      email: PAYLOAD.email, passwordHash, nome: 'Local User',
      provider: 'local', isActive: true,
    });

    googleVerifier.__setVerifierForTests(async () => ({ ...PAYLOAD }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    expect(res.status).toBe(200);
    expect(res.body.user.nome).toBe('Local User'); // não sobrescreve o nome

    const linked = await User.findOne({ email: PAYLOAD.email }).lean();
    expect(linked.providerId).toBe(PAYLOAD.sub);
    expect(linked.passwordHash).toBeTruthy(); // login por senha continua possível

    // Não cria conta duplicada
    const count = await User.countDocuments({ email: PAYLOAD.email });
    expect(count).toBe(1);
  });

  it('retorna 403 para conta desativada', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    const User = require('../../models/User');
    await User.create({
      email: PAYLOAD.email, nome: 'Banido', provider: 'google',
      providerId: PAYLOAD.sub, isActive: false,
    });

    googleVerifier.__setVerifierForTests(async () => ({ ...PAYLOAD }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    expect(res.status).toBe(403);
  });

  it('sessão criada via Google funciona no /auth/me', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-teste';
    googleVerifier.__setVerifierForTests(async () => ({ ...PAYLOAD }));

    const login = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(PAYLOAD.email);
    expect(me.body.user.provider).toBe('google');
  });
});
