/**
 * Testes: Foto de perfil (POST /api/account/me/avatar)
 * Contrato: multer memória (campo "avatar", só imagem, máx 5MB) → sharp 512x512 webp
 * → utils/bunnyStorage.uploadBufferToStorage (seam de teste) → User.avatar.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let bunnyStorage;

// PNG 1x1 válido (para o sharp processar de verdade)
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  bunnyStorage = require('../../utils/bunnyStorage');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

afterEach(() => {
  bunnyStorage.__setUploaderForTests(null);
  delete process.env.BUNNY_STORAGE_ZONE;
  delete process.env.BUNNY_STORAGE_KEY;
});

describe('POST /api/account/me/avatar', () => {
  it('retorna 401 sem autenticação', async () => {
    const res = await request(app)
      .post('/api/account/me/avatar')
      .attach('avatar', PNG_1X1, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem arquivo', async () => {
    const res = await request(app)
      .post('/api/account/me/avatar')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(res.status).toBe(400);
  });

  it('recusa arquivo que não é imagem', async () => {
    const res = await request(app)
      .post('/api/account/me/avatar')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .attach('avatar', Buffer.from('nao sou imagem'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('retorna 503 quando o storage não está configurado nem injetado', async () => {
    // O .env local pode ter Bunny configurado — o teste garante ambiente limpo.
    delete process.env.BUNNY_STORAGE_ZONE;
    delete process.env.BUNNY_STORAGE_KEY;
    const res = await request(app)
      .post('/api/account/me/avatar')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .attach('avatar', PNG_1X1, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
  });

  it('faz upload, atualiza User.avatar e retorna a URL', async () => {
    const uploaded = [];
    bunnyStorage.__setUploaderForTests(async (buffer, remotePath) => {
      uploaded.push({ size: buffer.length, remotePath });
      return `https://cdn.lorflux.com/${remotePath}`;
    });

    const res = await request(app)
      .post('/api/account/me/avatar')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .attach('avatar', PNG_1X1, { filename: 'foto.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.avatar).toMatch(/^https:\/\/cdn\.lorflux\.com\/lorflux\/avatars\//);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].remotePath).toMatch(/\.webp$/); // sharp converteu para webp
    expect(uploaded[0].size).toBeGreaterThan(0);

    const User = require('../../models/User');
    const user = await User.findById(auth.getId('user')).lean();
    expect(user.avatar).toBe(res.body.avatar);
  });

  it('avatar novo aparece no /auth/me (sessão consistente)', async () => {
    bunnyStorage.__setUploaderForTests(async (_b, remotePath) => `https://cdn.lorflux.com/${remotePath}`);

    const up = await request(app)
      .post('/api/account/me/avatar')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`)
      .attach('avatar', PNG_1X1, { filename: 'foto.png', contentType: 'image/png' });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(me.body.user.avatar).toBe(up.body.avatar);
  });
});
