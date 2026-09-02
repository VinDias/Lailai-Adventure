/**
 * Testes: Conteúdo — Séries, Episódios, Painéis, Votos
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

// ─── Dados de teste compartilhados ────────────────────────────────────────────
let seriesId, premiumSeriesId, episodeId, premiumEpisodeId, freeEpisodeId;

beforeAll(async () => {
  const admin = getToken('admin');

  // Série gratuita
  const s1 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Série Gratuita', genre: 'Ação', content_type: 'hqcine', isPublished: true });
  seriesId = s1.body._id;

  // Série premium
  const s2 = await request(app)
    .post('/api/content/series')
    .set('Authorization', `Bearer ${admin}`)
    .send({ title: 'Série Premium', genre: 'Drama', content_type: 'hiqua', isPremium: true, isPublished: true });
  premiumSeriesId = s2.body._id;

  // Episódio gratuito — status: 'published' explícito (Fase 5 Bloco 1, Task 2:
  // rotas públicas passaram a filtrar por status; sem isso o episódio nasce
  // 'draft' por default do schema e sumiria dos testes de listagem/detalhe
  // pública abaixo, que não são sobre draft/publicado e sim sobre premium).
  const e1 = await request(app)
    .post('/api/content/episodes')
    .set('Authorization', `Bearer ${admin}`)
    .send({ seriesId, episode_number: 1, title: 'Ep 1 Grátis', isPremium: false, status: 'published' });
  episodeId = e1.body._id;
  freeEpisodeId = episodeId;

  // Episódio premium
  const e2 = await request(app)
    .post('/api/content/episodes')
    .set('Authorization', `Bearer ${admin}`)
    .send({ seriesId, episode_number: 2, title: 'Ep 2 Premium', isPremium: true, status: 'published' });
  premiumEpisodeId = e2.body._id;
});

// ═══════════════════════════════════════════════════════════════════════════════
// SÉRIES
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series — listagem pública', () => {
  it('retorna séries publicadas sem autenticação', async () => {
    const res = await request(app).get('/api/content/series');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filtra por content_type=hqcine', async () => {
    const res = await request(app).get('/api/content/series?type=hqcine');
    expect(res.status).toBe(200);
    res.body.forEach(s => expect(s.content_type).toBe('hqcine'));
  });

  it('filtra por content_type=hiqua', async () => {
    const res = await request(app).get('/api/content/series?type=hiqua');
    expect(res.status).toBe(200);
    res.body.forEach(s => expect(s.content_type).toBe('hiqua'));
  });

  it('não retorna séries não publicadas', async () => {
    const admin = getToken('admin');
    await request(app).post('/api/content/series')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: 'Não Publicada', genre: 'X', content_type: 'vcine', isPublished: false });
    const res = await request(app).get('/api/content/series');
    const nomes = res.body.map(s => s.title);
    expect(nomes).not.toContain('Não Publicada');
  });
});

describe('POST /api/content/series — criação (admin)', () => {
  it('admin cria série com sucesso', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Nova Série', genre: 'Ficção', content_type: 'vcine', isPublished: true });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
  });

  it('superadmin também pode criar série', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('superadmin')}`)
      .send({ title: 'Série Superadmin', genre: 'X', content_type: 'hqcine', isPublished: true });
    expect(res.status).toBe(201);
  });

  it('usuário comum não pode criar série (403)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(403);
  });

  it('usuário premium não pode criar série (403)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated não pode criar série (401)', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .send({ title: 'Bloqueada', genre: 'X', content_type: 'hqcine' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Sem genre' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('obrigatório');
  });

  it('retorna 400 com content_type inválido', async () => {
    const res = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'X', genre: 'X', content_type: 'invalido' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PUT /api/content/series/:id — edição (admin)', () => {
  it('admin edita série existente', async () => {
    const res = await request(app)
      .put(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Título Atualizado' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Título Atualizado');
  });

  it('usuário comum não pode editar (403)', async () => {
    const res = await request(app)
      .put(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ title: 'X' });
    expect(res.status).toBe(403);
  });
});

// Fase 5 Bloco 1 — genre virou required condicional a isPublished
// (models/Series.js), mas `required: function()` não roda no caminho de
// update (findByIdAndUpdate + runValidators não vê o documento completo).
// A rota precisa recusar o ESTADO FINAL (doc atual mesclado com o payload)
// sem gênero quando esse estado final é publicado — achado do revisor da
// Task 1 (fix round).
describe('PUT /api/content/series/:id — genre required condicional a isPublished', () => {
  const Series = require('../../models/Series');

  it('publicar draft sem genre → 400 (não publica)', async () => {
    const draft = await Series.create({ title: 'Draft Sem Genero Para Publicar', content_type: 'hiqua', isPublished: false });

    const res = await request(app)
      .put(`/api/content/series/${draft._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ isPublished: true });

    expect(res.status).toBe(400);

    const inalterada = await Series.findById(draft._id).lean();
    expect(inalterada.isPublished).toBe(false);
  });

  // Carona da Task 2 (dívida da T1): publicadoFinal usava === true estrito —
  // o Mongoose faz cast de 'true'/1/'1' para true no update, mas a comparação
  // estrita não reconhecia esses formatos e deixava passar sem gênero.
  it('isPublished: "true" (string) sem genre → 400 (cast do Mongoose não escapa do gate)', async () => {
    const draft = await Series.create({ title: 'Draft String True Sem Genero', content_type: 'hiqua', isPublished: false });

    const res = await request(app)
      .put(`/api/content/series/${draft._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ isPublished: 'true' });

    expect(res.status).toBe(400);

    const inalterada = await Series.findById(draft._id).lean();
    expect(inalterada.isPublished).toBe(false);
  });

  it('genre: "" em série publicada → 400 (sonda do revisor — regressão do required:true antigo)', async () => {
    const create = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Publicada Genero Vazio', genre: 'Aventura', content_type: 'hiqua', isPublished: true });
    expect(create.status).toBe(201);

    const res = await request(app)
      .put(`/api/content/series/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ genre: '' });

    expect(res.status).toBe(400);

    const inalterada = await Series.findById(create.body._id).lean();
    expect(inalterada.genre).toBe('Aventura');
  });

  it('genre: null em série publicada → 400', async () => {
    const create = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Publicada Genero Null', genre: 'Comédia', content_type: 'hiqua', isPublished: true });
    expect(create.status).toBe(201);

    const res = await request(app)
      .put(`/api/content/series/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ genre: null });

    expect(res.status).toBe(400);

    const inalterada = await Series.findById(create.body._id).lean();
    expect(inalterada.genre).toBe('Comédia');
  });

  it('controle: série publicada com genre válido continua editável normalmente', async () => {
    const create = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Publicada Genero Valido', genre: 'Drama', content_type: 'hiqua', isPublished: true });
    expect(create.status).toBe(201);

    const res = await request(app)
      .put(`/api/content/series/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ genre: 'Suspense' });

    expect(res.status).toBe(200);
    expect(res.body.genre).toBe('Suspense');
  });
});

describe('DELETE /api/content/series/:id — remoção (admin)', () => {
  it('admin remove série', async () => {
    const create = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'Para Deletar', genre: 'X', content_type: 'vcine' });
    const res = await request(app)
      .delete(`/api/content/series/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
  });

  it('usuário comum não pode deletar (403)', async () => {
    const res = await request(app)
      .delete(`/api/content/series/${seriesId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EPISÓDIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series/:id/episodes — listagem por tipo de usuário', () => {
  it('usuário não autenticado vê todos os episódios (inclusive premium)', async () => {
    const res = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).toContain('Ep 2 Premium');
  });

  it('usuário comum (não premium) vê todos os episódios com campo isPremium para badge', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).toContain('Ep 2 Premium');
    const premium = res.body.find(e => e.title === 'Ep 2 Premium');
    expect(premium.isPremium).toBe(true);
  });

  it('usuário premium vê todos os episódios', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 1 Grátis');
    expect(titles).toContain('Ep 2 Premium');
  });

  it('admin vê todos os episódios', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(e => e.title);
    expect(titles).toContain('Ep 2 Premium');
  });

  it('retorna [] para série inexistente', async () => {
    const fakeId = '000000000000000000000000';
    const res = await request(app).get(`/api/content/series/${fakeId}/episodes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('episódios retornados em ordem (episode_number asc)', async () => {
    const res = await request(app)
      .get(`/api/content/series/${seriesId}/episodes`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    const nums = res.body.map(e => e.episode_number);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });
});

describe('GET /api/content/episodes/:id — detalhes de episódio', () => {
  it('retorna detalhes de episódio sem autenticação', async () => {
    const res = await request(app).get(`/api/content/episodes/${episodeId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(episodeId);
    expect(res.body.title).toBe('Ep 1 Grátis');
  });

  it('retorna 404 para episódio inexistente', async () => {
    const res = await request(app).get('/api/content/episodes/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('episódio premium vem completo (panels e mídia) para usuário free', async () => {
    const admin = getToken('admin');
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        seriesId, episode_number: 13, title: 'Ep Premium Completo', isPremium: true, status: 'published',
        video_url: 'https://cdn.example.com/premium/playlist.m3u8', bunnyVideoId: 'bunny-premium-123'
      });
    await request(app)
      .post(`/api/content/episodes/${create.body._id}/panels`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ panels: [{ image_url: 'https://cdn.example.com/pp1.jpg', order: 0 }] });

    const res = await request(app)
      .get(`/api/content/episodes/${create.body._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(true);
    expect(res.body.panels.length).toBe(1);
    expect(res.body.video_url).toBe('https://cdn.example.com/premium/playlist.m3u8');
    expect(res.body.bunnyVideoId).toBe('bunny-premium-123');
    expect(res.body.locked).toBeUndefined();
  });

  it('episódio premium vem completo até sem autenticação', async () => {
    const res = await request(app).get(`/api/content/episodes/${premiumEpisodeId}`);
    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(true);
    expect(res.body.locked).toBeUndefined();
  });

  it('incrementa views a cada acesso', async () => {
    const before = (await request(app).get(`/api/content/episodes/${episodeId}`)).body.views;
    await request(app).get(`/api/content/episodes/${episodeId}`);
    const after = (await request(app).get(`/api/content/episodes/${episodeId}`)).body.views;
    expect(after).toBeGreaterThan(before);
  });
});

describe('POST /api/content/episodes — criação (admin)', () => {
  it('admin cria episódio com dados válidos', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 10, title: 'Ep 10', description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.title).toBe('Ep 10');
  });

  it('episódio criado aparece na listagem pública se gratuito', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 11, title: 'Ep Visível', isPremium: false, status: 'published' });
    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === create.body._id)).toBe(true);
  });

  it('episódio premium também aparece para usuários não-premium', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 12, title: 'Ep Pago', isPremium: true, status: 'published' });
    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === create.body._id)).toBe(true);
  });

  it('usuário comum não pode criar episódio (403)', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ seriesId, episode_number: 99, title: 'Bloqueado' });
    expect(res.status).toBe(403);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/content/episodes/:id', () => {
  it('admin remove episódio e ele some da listagem', async () => {
    const create = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId, episode_number: 50, title: 'Ep Para Deletar' });
    const id = create.body._id;

    await request(app).delete(`/api/content/episodes/${id}`).set('Authorization', `Bearer ${getToken('admin')}`);

    const list = await request(app).get(`/api/content/series/${seriesId}/episodes`);
    expect(list.body.some(e => e._id === id)).toBe(false);
  });

  it('usuário comum não pode deletar (403)', async () => {
    const res = await request(app)
      .delete(`/api/content/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAINÉIS
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/content/episodes/:id/panels — painéis (admin)', () => {
  let hiQuaSeriesId, hiQuaEpId;

  beforeAll(async () => {
    const s = await request(app).post('/api/content/series')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ title: 'HiQua Painéis', genre: 'Ação', content_type: 'hiqua', isPublished: true });
    hiQuaSeriesId = s.body._id;

    const e = await request(app).post('/api/content/episodes')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ seriesId: hiQuaSeriesId, episode_number: 1, title: 'Cap Painéis' });
    hiQuaEpId = e.body._id;
  });

  it('admin adiciona painéis a um episódio', async () => {
    const panels = [
      { image_url: 'https://cdn.example.com/p1.jpg', order: 0 },
      { image_url: 'https://cdn.example.com/p2.jpg', order: 1 },
      { image_url: 'https://cdn.example.com/p3.jpg', order: 2 },
    ];
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels });
    expect(res.status).toBe(200);
    expect(res.body.panelCount).toBe(3);
  });

  it('retorna 400 com array de painéis vazio', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels: [] });
    expect(res.status).toBe(400);
  });

  it('usuário comum não pode adicionar painéis (403)', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ panels: [{ image_url: 'x', order: 0 }] });
    expect(res.status).toBe(403);
  });

  it('admin remove painel por índice', async () => {
    // Adiciona painel
    await request(app)
      .post(`/api/content/episodes/${hiQuaEpId}/panels`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ panels: [{ image_url: 'https://x.com/a.jpg', order: 0 }] });

    // GET com token admin — hiQuaEpId é draft (Fase 5 Bloco 1, Task 2: rota
    // pública passou a exigir admin/dono pra ver rascunho; teste não é sobre
    // visibilidade e sim sobre contagem de painéis).
    const ep = await request(app)
      .get(`/api/content/episodes/${hiQuaEpId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    const countBefore = ep.body.panels.length;

    await request(app)
      .delete(`/api/content/episodes/${hiQuaEpId}/panels/0`)
      .set('Authorization', `Bearer ${getToken('admin')}`);

    const epAfter = await request(app)
      .get(`/api/content/episodes/${hiQuaEpId}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(epAfter.body.panels.length).toBe(countBefore - 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOTOS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Votos em episódios', () => {
  it('usuário autenticado pode dar like', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('like');
  });

  it('usuário autenticado pode dar dislike', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ type: 'dislike' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('dislike');
  });

  it('unauthenticated não pode votar (401)', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .send({ type: 'like' });
    expect(res.status).toBe(401);
  });

  it('tipo de voto inválido retorna 400', async () => {
    const res = await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'neutro' });
    expect(res.status).toBe(400);
  });

  it('GET retorna voto atual do usuário', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    const res = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('like');
  });

  it('DELETE remove voto do usuário', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    const del = await request(app)
      .delete(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(del.status).toBe(200);
    const get = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(get.body).toBeNull();
  });

  it('atualizar voto (like → dislike) funciona', async () => {
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'like' });
    await request(app)
      .post(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ type: 'dislike' });
    const res = await request(app)
      .get(`/api/content/episodes/${freeEpisodeId}/vote`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.body.type).toBe('dislike');
  });

  it('admin consulta métricas de um episódio', async () => {
    const res = await request(app)
      .get(`/api/admin/episodes/${freeEpisodeId}/metrics`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('likes');
    expect(res.body).toHaveProperty('dislikes');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DRAFTS INVISÍVEIS AO PÚBLICO (Fase 5 Bloco 1, Task 2)
// ═══════════════════════════════════════════════════════════════════════════════
// Admin e dono do canal da série continuam vendo os próprios rascunhos (o
// portal do ilustrador, Task 4, depende disso); qualquer outro viewer —
// anônimo ou logado sem vínculo com o canal — trata rascunho como
// inexistente (404 nas rotas de detalhe, nunca 403 — não confirma a
// existência do rascunho a quem não tem acesso).
describe('Drafts invisíveis ao público', () => {
  const Series = require('../../models/Series');
  const Episode = require('../../models/Episode');
  const Channel = require('../../models/Channel');
  const EngagementEvent = require('../../models/EngagementEvent');
  const engagementLogger = require('../../services/engagementLogger');

  function criarCanalDoDono() {
    return Channel.create({ ownerId: getId('user'), name: `Canal Dono ${Date.now()}-${Math.random()}` });
  }

  describe('GET /api/content/series/:id — série não publicada', () => {
    it('404 para anônimo', async () => {
      const canal = await criarCanalDoDono();
      const draft = await Series.create({ title: 'Serie Draft Anonimo', content_type: 'hiqua', isPublished: false, channelId: canal._id });
      const res = await request(app).get(`/api/content/series/${draft._id}`);
      expect(res.status).toBe(404);
    });

    it('404 para logado não-dono', async () => {
      const canal = await criarCanalDoDono();
      const draft = await Series.create({ title: 'Serie Draft NaoDono', content_type: 'hiqua', isPublished: false, channelId: canal._id });
      const res = await request(app)
        .get(`/api/content/series/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('premium')}`);
      expect(res.status).toBe(404);
    });

    it('200 para o dono do canal da série', async () => {
      const canal = await criarCanalDoDono();
      const draft = await Series.create({ title: 'Serie Draft Dono', content_type: 'hiqua', isPublished: false, channelId: canal._id });
      const res = await request(app)
        .get(`/api/content/series/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('user')}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Serie Draft Dono');
    });

    it('200 para admin', async () => {
      const canal = await criarCanalDoDono();
      const draft = await Series.create({ title: 'Serie Draft Admin', content_type: 'hiqua', isPublished: false, channelId: canal._id });
      const res = await request(app)
        .get(`/api/content/series/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('admin')}`);
      expect(res.status).toBe(200);
    });

    it('série sem canal vinculado: draft só admin vê (não há dono a identificar)', async () => {
      const draft = await Series.create({ title: 'Serie Draft Sem Canal', content_type: 'hiqua', isPublished: false });
      const semAuth = await request(app).get(`/api/content/series/${draft._id}`);
      expect(semAuth.status).toBe(404);
      const logado = await request(app)
        .get(`/api/content/series/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('user')}`);
      expect(logado.status).toBe(404);
      const admin = await request(app)
        .get(`/api/content/series/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('admin')}`);
      expect(admin.status).toBe(200);
    });

    it('série publicada continua 200 pra qualquer um (controle de regressão)', async () => {
      const publicada = await Series.create({ title: 'Serie Publicada Controle Draft', genre: 'Teste', content_type: 'hiqua', isPublished: true });
      const res = await request(app).get(`/api/content/series/${publicada._id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/content/series/:id/episodes — capítulo draft', () => {
    it('capítulo draft em série JÁ publicada não aparece pro público; dono e admin veem (com status)', async () => {
      const canal = await criarCanalDoDono();
      const serie = await Series.create({ title: 'Serie Publicada Com Draft', genre: 'Teste', content_type: 'hiqua', isPublished: true, channelId: canal._id });
      const publicado = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Publicado', status: 'published' });
      const draft = await Episode.create({ seriesId: serie._id, episode_number: 2, title: 'Cap Draft', status: 'draft' });

      const anon = await request(app).get(`/api/content/series/${serie._id}/episodes`);
      const idsAnon = anon.body.map(e => e._id);
      expect(idsAnon).toContain(String(publicado._id));
      expect(idsAnon).not.toContain(String(draft._id));

      const naoDono = await request(app)
        .get(`/api/content/series/${serie._id}/episodes`)
        .set('Authorization', `Bearer ${getToken('premium')}`);
      expect(naoDono.body.map(e => e._id)).not.toContain(String(draft._id));

      const dono = await request(app)
        .get(`/api/content/series/${serie._id}/episodes`)
        .set('Authorization', `Bearer ${getToken('user')}`);
      const idsDono = dono.body.map(e => e._id);
      expect(idsDono).toContain(String(publicado._id));
      expect(idsDono).toContain(String(draft._id));
      expect(dono.body.find(e => e._id === String(draft._id)).status).toBe('draft');

      const admin = await request(app)
        .get(`/api/content/series/${serie._id}/episodes`)
        .set('Authorization', `Bearer ${getToken('admin')}`);
      expect(admin.body.map(e => e._id)).toContain(String(draft._id));
    });

    it('série inteira em draft: público recebe [] (não 404); dono e admin recebem a lista', async () => {
      const canal = await criarCanalDoDono();
      const serie = await Series.create({ title: 'Serie Draft Com Episodios', content_type: 'hiqua', isPublished: false, channelId: canal._id });
      const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap De Serie Draft', status: 'published' });

      const anon = await request(app).get(`/api/content/series/${serie._id}/episodes`);
      expect(anon.status).toBe(200);
      expect(anon.body).toEqual([]);

      const dono = await request(app)
        .get(`/api/content/series/${serie._id}/episodes`)
        .set('Authorization', `Bearer ${getToken('user')}`);
      expect(dono.body.map(e => e._id)).toContain(String(episodio._id));
    });
  });

  describe('GET /api/content/episodes/:id — episódio draft', () => {
    it('404 para anônimo e para logado não-dono; sem incrementar views nem gerar EngagementEvent', async () => {
      const canal = await criarCanalDoDono();
      const serie = await Series.create({ title: 'Serie Cap Draft Detalhe', genre: 'Teste', content_type: 'hiqua', isPublished: true, channelId: canal._id });
      const draft = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Draft Detalhe', status: 'draft', views: 0 });

      const anon = await request(app).get(`/api/content/episodes/${draft._id}`);
      expect(anon.status).toBe(404);

      const naoDono = await request(app)
        .get(`/api/content/episodes/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('premium')}`);
      expect(naoDono.status).toBe(404);

      await engagementLogger.flushForTests();
      const semViews = await Episode.findById(draft._id).lean();
      expect(semViews.views).toBe(0);
      const eventos = await EngagementEvent.countDocuments({ episodeId: draft._id });
      expect(eventos).toBe(0);
    });

    it('200 para o dono do canal e para admin, sem incrementar views (draft é QA, não view real)', async () => {
      const canal = await criarCanalDoDono();
      const serie = await Series.create({ title: 'Serie Cap Draft Dono Admin', genre: 'Teste', content_type: 'hiqua', isPublished: true, channelId: canal._id });
      const draft = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Draft Dono Admin', status: 'draft', views: 0 });

      const dono = await request(app)
        .get(`/api/content/episodes/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('user')}`);
      expect(dono.status).toBe(200);

      const admin = await request(app)
        .get(`/api/content/episodes/${draft._id}`)
        .set('Authorization', `Bearer ${getToken('admin')}`);
      expect(admin.status).toBe(200);

      await engagementLogger.flushForTests();
      const semViews = await Episode.findById(draft._id).lean();
      expect(semViews.views).toBe(0);
      const eventos = await EngagementEvent.countDocuments({ episodeId: draft._id });
      expect(eventos).toBe(0);
    });

    it('episódio publicado mas em série despublicada → 404 pro público (a série também precisa estar publicada)', async () => {
      const serie = await Series.create({ title: 'Serie Despublicada Com Cap Publicado', content_type: 'hiqua', isPublished: false });
      const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Publicado Orfao', status: 'published' });

      const res = await request(app).get(`/api/content/episodes/${episodio._id}`);
      expect(res.status).toBe(404);
    });

    it('episódio publicado em série publicada continua incrementando views (controle de regressão)', async () => {
      const serie = await Series.create({ title: 'Serie Controle Views Draft', genre: 'Teste', content_type: 'hiqua', isPublished: true });
      const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Controle Views Draft', status: 'published', views: 0 });

      const before = (await request(app).get(`/api/content/episodes/${episodio._id}`)).body.views;
      await request(app).get(`/api/content/episodes/${episodio._id}`);
      const after = (await request(app).get(`/api/content/episodes/${episodio._id}`)).body.views;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('GET /api/content/search — busca não vaza rascunho', () => {
    it('série draft não aparece na busca por título', async () => {
      const termo = `TermoBuscaDraft${Date.now()}`;
      await Series.create({ title: `${termo} Serie`, content_type: 'hiqua', isPublished: false });

      const res = await request(app).get(`/api/content/search?q=${termo}`);
      expect(res.status).toBe(200);
      expect(res.body.series.some(s => s.title.includes(termo))).toBe(false);
    });

    it('capítulo draft de série publicada não aparece na busca por título do capítulo', async () => {
      const termo = `TermoBuscaCapDraft${Date.now()}`;
      const serie = await Series.create({ title: 'Serie Para Busca De Capitulo', genre: 'Teste', content_type: 'hiqua', isPublished: true });
      await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Capitulo`, status: 'draft' });

      const res = await request(app).get(`/api/content/search?q=${termo}`);
      expect(res.status).toBe(200);
      expect(res.body.episodes.some(e => e.title.includes(termo))).toBe(false);
    });

    it('capítulo PUBLICADO de série publicada aparece na busca (controle de regressão)', async () => {
      const termo = `TermoBuscaCapPub${Date.now()}`;
      const serie = await Series.create({ title: 'Serie Para Busca De Capitulo Publicado', genre: 'Teste', content_type: 'hiqua', isPublished: true });
      await Episode.create({ seriesId: serie._id, episode_number: 1, title: `${termo} Capitulo`, status: 'published' });

      const res = await request(app).get(`/api/content/search?q=${termo}`);
      expect(res.status).toBe(200);
      expect(res.body.episodes.some(e => e.title.includes(termo))).toBe(true);
    });
  });
});
