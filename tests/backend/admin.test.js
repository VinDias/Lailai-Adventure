/**
 * Testes: Painel Admin — Stats, Anúncios, Usuários, Upload
 * Tipos de usuário: unauthenticated, user, premium, admin, superadmin
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken, getId } = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/management/stats', () => {
  it('admin acessa stats', async () => {
    const res = await request(app)
      .get('/api/admin/management/stats')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('premiumUsers');
  });

  it('superadmin acessa stats', async () => {
    const res = await request(app)
      .get('/api/admin/management/stats')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    expect(res.status).toBe(200);
  });

  it('usuário comum não acessa stats (403)', async () => {
    const res = await request(app)
      .get('/api/admin/management/stats')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated não acessa stats (401)', async () => {
    const res = await request(app).get('/api/admin/management/stats');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/management/content', () => {
  it('admin lista conteúdo com paginação', async () => {
    const res = await request(app)
      .get('/api/admin/management/content?page=1')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
  });

  it('usuário não pode acessar (403)', async () => {
    const res = await request(app)
      .get('/api/admin/management/content')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANÚNCIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Anúncios — CRUD completo', () => {
  let adId;

  it('GET /api/content/ads retorna lista pública de anúncios', async () => {
    const res = await request(app).get('/api/content/ads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin cria anúncio', async () => {
    const res = await request(app)
      .post('/api/admin/ads')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Anúncio Teste', image_url: 'https://cdn.example.com/ad.jpg', advertiser: 'Marca X' });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    adId = res.body._id;
  });

  it('retorna 400 sem campos obrigatórios ao criar anúncio', async () => {
    const res = await request(app)
      .post('/api/admin/ads')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Sem imagem' });
    expect(res.status).toBe(400);
  });

  it('usuário comum não pode criar anúncio (403)', async () => {
    const res = await request(app)
      .post('/api/admin/ads')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ title: 'X', image_url: 'https://x.com/img.jpg' });
    expect(res.status).toBe(403);
  });

  it('admin lista seus anúncios', async () => {
    const res = await request(app)
      .get('/api/admin/ads')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin edita anúncio existente', async () => {
    const res = await request(app)
      .put(`/api/admin/ads/${adId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Anúncio Editado', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Anúncio Editado');
  });

  it('POST /api/admin/ads/:id/impression registra impressão sem auth', async () => {
    const res = await request(app).post(`/api/admin/ads/${adId}/impression`);
    expect(res.status).toBe(200);
  });

  it('POST /api/admin/ads/:id/click registra clique sem auth', async () => {
    const res = await request(app).post(`/api/admin/ads/${adId}/click`);
    expect(res.status).toBe(200);
  });

  it('admin deleta anúncio', async () => {
    const res = await request(app)
      .delete(`/api/admin/ads/${adId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
  });

  it('usuário comum não pode deletar anúncio (403)', async () => {
    const create = await request(app)
      .post('/api/admin/ads')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Para Deletar', image_url: 'https://x.com/x.jpg' });
    const res = await request(app)
      .delete(`/api/admin/ads/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE USUÁRIOS (superadmin)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/users — listagem de usuários', () => {
  it('superadmin lista todos os usuários', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('usuários listados não expõem passwordHash', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    res.body.users.forEach(u => expect(u).not.toHaveProperty('passwordHash'));
  });

  it('admin NÃO pode listar usuários (403 — apenas superadmin)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(403);
  });

  it('usuário comum não pode listar usuários (403)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });

  it('filtra por role', async () => {
    const res = await request(app)
      .get('/api/admin/users?role=user')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    expect(res.status).toBe(200);
    res.body.users.forEach(u => expect(u.role).toBe('user'));
  });

  it('filtra por isPremium=true', async () => {
    const res = await request(app)
      .get('/api/admin/users?isPremium=true')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    expect(res.status).toBe(200);
    res.body.users.forEach(u => expect(u.isPremium).toBe(true));
  });
});

describe('PUT /api/admin/users/:id/toggle-premium', () => {
  it('superadmin alterna premium de um usuário', async () => {
    const userId = getId('user');
    const before = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    const user = before.body.users.find(u => u._id === userId || u.id === userId);
    const wasPremium = user?.isPremium ?? false;

    const res = await request(app)
      .put(`/api/admin/users/${userId}/toggle-premium`)
      .set('Authorization', `Bearer ${getToken('superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(!wasPremium);
  });

  it('admin não pode alterar premium (403)', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${getId('user')}/toggle-premium`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/users/toggle-status/:id', () => {
  it('superadmin desativa conta de usuário', async () => {
    const res = await request(app)
      .put(`/api/admin/users/toggle-status/${getId('user')}`)
      .set('Authorization', `Bearer ${getToken('superadmin')}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
  });

  it('usuário desativado recebe 403 ao tentar acessar', async () => {
    // Já desativado no teste anterior — tenta acessar endpoint autenticado
    const User = require('../../models/User');
    const inactiveUser = await User.findById(getId('inactive'));
    // Conta inativa não consegue login
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: inactiveUser.email, password: 'Inactive@123' });
    expect([401, 403]).toContain(login.status);
  });

  it('admin não pode alterar status (403)', async () => {
    const res = await request(app)
      .put(`/api/admin/users/toggle-status/${getId('user')}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ isActive: true });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ÁUDIO DE EPISÓDIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/management/episodes/:id/audio', () => {
  let epId;

  beforeAll(async () => {
    const s = await request(app).post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Série Audio', genre: 'X', content_type: 'hqcine', isPublished: true });
    const e = await request(app).post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId: s.body._id, episode_number: 1, title: 'Ep Audio' });
    epId = e.body._id;
  });

  it('admin salva URLs de áudio', async () => {
    const res = await request(app)
      .patch(`/api/admin/management/episodes/${epId}/audio`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ audioTrack1Url: 'https://cdn.example.com/dub.mp3', audioTrack2Url: 'https://cdn.example.com/ost.mp3' });
    expect(res.status).toBe(200);
    expect(res.body.audioTrack1Url).toBe('https://cdn.example.com/dub.mp3');
    expect(res.body.audioTrack2Url).toBe('https://cdn.example.com/ost.mp3');
  });

  it('atualização parcial (só audioTrack1Url) funciona', async () => {
    const res = await request(app)
      .patch(`/api/admin/management/episodes/${epId}/audio`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ audioTrack1Url: 'https://cdn.example.com/novo-dub.mp3' });
    expect(res.status).toBe(200);
    expect(res.body.audioTrack1Url).toBe('https://cdn.example.com/novo-dub.mp3');
  });

  it('usuário comum não pode editar áudio (403)', async () => {
    const res = await request(app)
      .patch(`/api/admin/management/episodes/${epId}/audio`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ audioTrack1Url: 'https://x.com/x.mp3' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOADS — verificação de autenticação
// ═══════════════════════════════════════════════════════════════════════════════

describe('Endpoints de upload — controle de acesso', () => {
  it('POST /api/bunny/upload-image requer autenticação (401)', async () => {
    const res = await request(app).post('/api/bunny/upload-image');
    expect(res.status).toBe(401);
  });

  it('POST /api/bunny/upload-image-batch requer autenticação (401)', async () => {
    const res = await request(app).post('/api/bunny/upload-image-batch');
    expect(res.status).toBe(401);
  });

  it('POST /api/bunny/upload-audio requer autenticação (401)', async () => {
    const res = await request(app).post('/api/bunny/upload-audio');
    expect(res.status).toBe(401);
  });

  it('POST /api/bunny/upload-video requer autenticação (401)', async () => {
    const res = await request(app).post('/api/bunny/upload-video');
    expect(res.status).toBe(401);
  });

  it('POST /api/bunny/upload-image sem arquivo retorna 400 (admin)', async () => {
    const res = await request(app)
      .post('/api/bunny/upload-image')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(400);
  });

  it('POST /api/bunny/upload-image-batch sem arquivos retorna 400 (admin)', async () => {
    const res = await request(app)
      .post('/api/bunny/upload-image-batch')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(400);
  });
});
