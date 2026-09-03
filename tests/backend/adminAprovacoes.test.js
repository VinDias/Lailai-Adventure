/**
 * Testes: Fase 5 Bloco 1, Task 7 — Fila de Aprovação (admin).
 * Cobre:
 *  - GET /api/admin/aprovacoes: lista SÓ submetidos (série submittedAt!=null
 *    && !isPublished; episódio submittedAt!=null && status!=published),
 *    draft do admin (sem submittedAt) FORA, shape de preview (série e
 *    episódio), ordem por submittedAt ASC.
 *  - POST /api/admin/aprovacoes/series/:id/aprovar: gênero final obrigatório
 *    (400 sem ele, nem no body nem já na série), aplica genre/tags do body
 *    (mesma validação de tags do schema), publica, traduz (seam do
 *    tradutor), dispara recálculo (1ª publicação da obra), AdminLog.
 *  - POST /api/admin/aprovacoes/episodes/:id/aprovar: só com série JÁ
 *    publicada (400 "aprove a série primeiro" senão), publica, dispara
 *    notifyEpisodePublished + recálculo, AdminLog.
 *  - POST /api/admin/aprovacoes/:tipo/:id/devolver: limpa submittedAt, cria
 *    MensagemPortal do editor com refTipo/refId corretos, NÃO muda
 *    isPublished/status, AdminLog; devolver série não devolve episódios em
 *    cascata.
 *  - Idempotência/estados: sem submittedAt -> 400; já publicado -> 400; id
 *    inexistente -> 404; 403 não-admin em tudo.
 *  - Integração T4: devolvida é re-editável e re-enviável; enviar série ->
 *    aprovar série -> episódio pode ser aprovado -> push disparado.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let Channel, Series, Episode, User, MensagemPortal, AdminLog;
let recommendationService, notificationService, translationService;

const fakeTranslator = async (text, targetLang) => `${targetLang.toUpperCase()}:${text}`;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  User = require('../../models/User');
  MensagemPortal = require('../../models/MensagemPortal');
  AdminLog = require('../../models/AdminLog');
  recommendationService = require('../../services/recommendationService');
  notificationService = require('../../services/notificationService');
  translationService = require('../../services/translationService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());
afterEach(() => {
  translationService.__setTranslatorForTests(null);
});

const ADMIN_HEADER = () => `Bearer ${auth.getToken('admin')}`;

let contador = 0;
async function criarDono(nome) {
  contador += 1;
  const email = `admin-aprov-${contador}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  const token = login.body.accessToken;
  const canal = await Channel.create({ ownerId: user._id, name: `Canal ${nome} ${Date.now()}` });
  return { id: user._id.toString(), token, canal };
}

/** Série submetida do portal — pronta para a Fila (sem gênero, portal nunca preenche). */
async function serieSubmetida(dono, overrides = {}) {
  return Series.create({
    title: 'Serie Submetida Padrao',
    content_type: 'hiqua',
    channelId: dono.canal._id,
    cover_image: 'https://cdn.exemplo/capa.jpg',
    submittedAt: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  });
}

/** Episódio submetido, filho de uma série JÁ publicada (cenário mais comum de teste avulso). */
async function episodioSubmetidoDeSeriePublicada(dono, overrides = {}) {
  const serie = await Series.create({
    title: 'Serie Publicada Para Episodio', genre: 'Aventura', content_type: 'hiqua',
    isPublished: true, channelId: dono.canal._id,
  });
  const episode = await Episode.create({
    seriesId: serie._id, episode_number: 1, title: 'Cap Submetido',
    status: 'draft',
    panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }],
    submittedAt: new Date('2026-08-21T10:00:00.000Z'),
    ...overrides,
  });
  return { serie, episode };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/aprovacoes
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/aprovacoes', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const semAuth = await request(app).get('/api/admin/aprovacoes');
    expect(semAuth.status).toBe(401);

    const naoAdmin = await request(app)
      .get('/api/admin/aprovacoes')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(naoAdmin.status).toBe(403);
  });

  it('lista série e episódio submetidos; draft do admin (sem submittedAt) fica FORA', async () => {
    const dono = await criarDono('Fila Basica');
    const serie = await serieSubmetida(dono, { title: 'Serie Na Fila Basica' });

    // Draft "do Vin" (fluxo admin atual: cria draft, publica depois) — NUNCA
    // teve submittedAt preenchido. Não pode aparecer na fila.
    const draftAdmin = await Series.create({
      title: 'Draft Admin Sem Submissao', content_type: 'hiqua', channelId: dono.canal._id,
    });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(200);

    const ids = res.body.itens.map(i => String(i.id));
    expect(ids).toContain(String(serie._id));
    expect(ids).not.toContain(String(draftAdmin._id));
  });

  it('série já publicada com submittedAt residual não aparece (isPublished:true exclui)', async () => {
    const dono = await criarDono('Fila Publicada Fora');
    const publicada = await Series.create({
      title: 'Publicada Nao Deve Aparecer', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id, submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    const ids = res.body.itens.map(i => String(i.id));
    expect(ids).not.toContain(String(publicada._id));
  });

  it('episódio já published com submittedAt residual não aparece; episódio draft submetido aparece', async () => {
    const dono = await criarDono('Fila Episodio');
    const { serie, episode } = await episodioSubmetidoDeSeriePublicada(dono, { title: 'Cap Na Fila' });
    const jaPublicado = await Episode.create({
      seriesId: serie._id, episode_number: 2, title: 'Cap Ja Publicado Residual', status: 'published',
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    const ids = res.body.itens.map(i => String(i.id));
    expect(ids).toContain(String(episode._id));
    expect(ids).not.toContain(String(jaPublicado._id));
  });

  it('shape do preview de série: title/description/cover_image/content_rating_sugerida/genre/tags/canal{id,name}/submittedAt', async () => {
    const dono = await criarDono('Fila Shape Serie');
    const serie = await serieSubmetida(dono, {
      title: 'Serie Shape', description: 'Descricao da serie', content_rating_sugerida: 'teen',
    });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    const item = res.body.itens.find(i => String(i.id) === String(serie._id));
    expect(item).toBeTruthy();
    expect(item.tipo).toBe('series');
    expect(item.title).toBe('Serie Shape');
    expect(item.description).toBe('Descricao da serie');
    expect(item.cover_image).toBe('https://cdn.exemplo/capa.jpg');
    expect(item.content_rating_sugerida).toBe('teen');
    expect(item.genre ?? null).toBeNull();
    expect(item.tags).toEqual([]);
    expect(String(item.canal.id)).toBe(String(dono.canal._id));
    expect(item.canal.name).toBe(dono.canal.name);
    expect(new Date(item.submittedAt).toISOString()).toBe(new Date('2026-08-20T10:00:00.000Z').toISOString());
  });

  it('shape do preview de episódio: title/description/thumbnail/panelCount/serie{id,title,isPublished}/canal/submittedAt', async () => {
    const dono = await criarDono('Fila Shape Episodio');
    const { serie, episode } = await episodioSubmetidoDeSeriePublicada(dono, {
      title: 'Cap Shape', description: 'Descricao do capitulo', thumbnail: 'https://cdn.exemplo/thumb.jpg',
    });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    const item = res.body.itens.find(i => String(i.id) === String(episode._id));
    expect(item).toBeTruthy();
    expect(item.tipo).toBe('episode');
    expect(item.title).toBe('Cap Shape');
    expect(item.description).toBe('Descricao do capitulo');
    expect(item.thumbnail).toBe('https://cdn.exemplo/thumb.jpg');
    expect(item.panelCount).toBe(1);
    expect(String(item.serie.id)).toBe(String(serie._id));
    expect(item.serie.title).toBe(serie.title);
    expect(item.serie.isPublished).toBe(true);
    expect(String(item.canal.id)).toBe(String(dono.canal._id));
  });

  it('ordena por submittedAt ASC (mais antigo primeiro)', async () => {
    const dono = await criarDono('Fila Ordem');
    const maisNovo = await serieSubmetida(dono, { title: 'Fila Ordem Mais Novo', submittedAt: new Date('2026-08-25T09:00:00.000Z') });
    const maisAntigo = await serieSubmetida(dono, { title: 'Fila Ordem Mais Antigo', submittedAt: new Date('2026-08-18T09:00:00.000Z') });

    const res = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    const idsRelevantes = res.body.itens
      .filter(i => [String(maisNovo._id), String(maisAntigo._id)].includes(String(i.id)))
      .map(i => String(i.id));
    expect(idsRelevantes).toEqual([String(maisAntigo._id), String(maisNovo._id)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/aprovacoes/series/:id/aprovar
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/aprovacoes/series/:id/aprovar', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const dono = await criarDono('Aprovar Serie Auth');
    const serie = await serieSubmetida(dono);

    const semAuth = await request(app).post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`);
    expect(semAuth.status).toBe(401);

    const naoAdmin = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(naoAdmin.status).toBe(403);
  });

  it('id inexistente -> 404', async () => {
    const res = await request(app)
      .post('/api/admin/aprovacoes/series/000000000000000000000000/aprovar')
      .set('Authorization', ADMIN_HEADER())
      .send({ genre: 'Aventura' });
    expect(res.status).toBe(404);
  });

  it('sem submittedAt (nada a aprovar) -> 400', async () => {
    const dono = await criarDono('Aprovar Serie Sem Submissao');
    const draft = await Series.create({ title: 'Draft Nunca Submetido', content_type: 'hiqua', channelId: dono.canal._id });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${draft._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({ genre: 'Aventura' });
    expect(res.status).toBe(400);

    const inalterada = await Series.findById(draft._id).lean();
    expect(inalterada.isPublished).toBe(false);
  });

  it('já publicada -> 400', async () => {
    const dono = await criarDono('Aprovar Serie Ja Publicada');
    const publicada = await Series.create({
      title: 'Ja Publicada Reaprovar', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id, submittedAt: new Date('2026-08-19T00:00:00.000Z'),
    });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${publicada._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({});
    expect(res.status).toBe(400);
  });

  it('sem gênero (nem no body, nem já na série) -> 400, não publica', async () => {
    const dono = await criarDono('Aprovar Serie Sem Genero');
    const serie = await serieSubmetida(dono, { title: 'Serie Sem Genero Para Aprovar' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/g[eê]nero/i);

    const inalterada = await Series.findById(serie._id).lean();
    expect(inalterada.isPublished).toBe(false);
    expect(inalterada.submittedAt).not.toBeNull();
  });

  it('com gênero no body -> publica + limpa submittedAt + traduz + AdminLog', async () => {
    translationService.__setTranslatorForTests(fakeTranslator);
    const dono = await criarDono('Aprovar Serie Com Genero');
    const serie = await serieSubmetida(dono, { title: 'Serie Com Genero Para Aprovar', description: 'Uma bela historia' });

    const antesLog = await AdminLog.countDocuments({ action: 'APROVAR_SERIE_PORTAL' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({ genre: 'Aventura' });
    expect(res.status).toBe(200);
    expect(res.body.isPublished).toBe(true);
    expect(res.body.genre).toBe('Aventura');
    expect(res.body.submittedAt).toBeNull();

    const salva = await Series.findById(serie._id).lean();
    expect(salva.isPublished).toBe(true);
    expect(salva.submittedAt).toBeNull();
    expect(salva.translations.en.genre).toBe('EN:Aventura');
    expect(salva.translations.es.description).toBe('ES:Uma bela historia');

    const depoisLog = await AdminLog.countDocuments({ action: 'APROVAR_SERIE_PORTAL' });
    expect(depoisLog).toBe(antesLog + 1);
    const log = await AdminLog.findOne({ action: 'APROVAR_SERIE_PORTAL', targetId: String(serie._id) }).lean();
    expect(log).toBeTruthy();
    expect(log.adminId).toBe(auth.getId('admin'));
  });

  it('gênero já presente na série (sem vir no body) + tags no body -> publica usando o gênero existente', async () => {
    const dono = await criarDono('Aprovar Serie Genero Existente');
    const serie = await serieSubmetida(dono, { title: 'Serie Genero Ja Preenchido', genre: 'Comédia' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({ tags: ['acao', 'aventura', 'heroi', 'magia', 'epico'] });
    expect(res.status).toBe(200);
    expect(res.body.genre).toBe('Comédia');
    expect(res.body.tags.sort()).toEqual(['acao', 'aventura', 'epico', 'heroi', 'magia'].sort());
  });

  it('tags inválidas no body (ex.: 3 tags, fora de 0 ou 5-15) -> 400, NÃO publica', async () => {
    const dono = await criarDono('Aprovar Serie Tags Invalidas');
    const serie = await serieSubmetida(dono, { title: 'Serie Tags Invalidas' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({ genre: 'Aventura', tags: ['a', 'b', 'c'] });
    expect(res.status).toBe(400);

    const inalterada = await Series.findById(serie._id).lean();
    expect(inalterada.isPublished).toBe(false);
    expect(inalterada.tags).toEqual([]);
    expect(inalterada.submittedAt).not.toBeNull();
  });

  it('dispara o recálculo do algoritmo (1ª publicação da obra)', async () => {
    const dono = await criarDono('Aprovar Serie Recalculo');
    const serie = await serieSubmetida(dono, { title: 'Serie Recalculo Aprovacao' });

    const spy = vi.spyOn(recommendationService, 'dispararRecalculo');
    try {
      const res = await request(app)
        .post(`/api/admin/aprovacoes/series/${serie._id}/aprovar`)
        .set('Authorization', ADMIN_HEADER())
        .send({ genre: 'Drama' });
      expect(res.status).toBe(200);

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalled();
        expect(String(spy.mock.calls[0][0])).toBe(String(serie._id));
        expect(spy.mock.calls[0][1]).toBe('capitulo_publicado');
      }, { timeout: 2000, interval: 20 });
    } finally {
      spy.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/aprovacoes/episodes/:id/aprovar
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/aprovacoes/episodes/:id/aprovar', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const dono = await criarDono('Aprovar Episodio Auth');
    const { episode } = await episodioSubmetidoDeSeriePublicada(dono);

    const semAuth = await request(app).post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`);
    expect(semAuth.status).toBe(401);

    const naoAdmin = await request(app)
      .post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(naoAdmin.status).toBe(403);
  });

  it('id inexistente -> 404', async () => {
    const res = await request(app)
      .post('/api/admin/aprovacoes/episodes/000000000000000000000000/aprovar')
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(404);
  });

  it('sem submittedAt (nada a aprovar) -> 400', async () => {
    const dono = await criarDono('Aprovar Episodio Sem Submissao');
    const serie = await Series.create({
      title: 'Serie Publicada Ep Sem Submissao', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const episode = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Draft Nunca Submetido', status: 'draft' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(400);
  });

  it('já published -> 400', async () => {
    const dono = await criarDono('Aprovar Episodio Ja Publicado');
    const serie = await Series.create({
      title: 'Serie Publicada Ep Ja Publicado', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const episode = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Ja Publicado', status: 'published',
      submittedAt: new Date('2026-08-19T00:00:00.000Z'),
    });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(400);
  });

  it('série do episódio NÃO publicada -> 400 "aprove a série primeiro", não publica o episódio', async () => {
    const dono = await criarDono('Aprovar Episodio Serie Nao Publicada');
    const serie = await Series.create({
      title: 'Serie Ainda Nao Publicada', content_type: 'hiqua', channelId: dono.canal._id,
      submittedAt: new Date('2026-08-20T00:00:00.000Z'),
    });
    const episode = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Aguardando Serie',
      status: 'draft', panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }],
      submittedAt: new Date('2026-08-21T00:00:00.000Z'),
    });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/s[eé]rie/i);

    const inalterado = await Episode.findById(episode._id).lean();
    expect(inalterado.status).toBe('draft');
    expect(inalterado.submittedAt).not.toBeNull();
  });

  it('série JÁ publicada -> publica o episódio, limpa submittedAt, dispara notifyEpisodePublished + recálculo, AdminLog', async () => {
    const dono = await criarDono('Aprovar Episodio Sucesso');
    const { serie, episode } = await episodioSubmetidoDeSeriePublicada(dono, { title: 'Cap Aprovado Com Sucesso' });

    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    const spyRecalculo = vi.spyOn(recommendationService, 'dispararRecalculo');
    const antesLog = await AdminLog.countDocuments({ action: 'APROVAR_EPISODIO_PORTAL' });

    try {
      const res = await request(app)
        .post(`/api/admin/aprovacoes/episodes/${episode._id}/aprovar`)
        .set('Authorization', ADMIN_HEADER());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');
      expect(res.body.submittedAt).toBeNull();

      const salvo = await Episode.findById(episode._id).lean();
      expect(salvo.status).toBe('published');
      expect(salvo.submittedAt).toBeNull();

      await vi.waitFor(() => {
        expect(spyPush).toHaveBeenCalled();
        expect(String(spyPush.mock.calls[0][0])).toBe(String(episode._id));
        expect(spyRecalculo).toHaveBeenCalled();
        expect(String(spyRecalculo.mock.calls[0][0])).toBe(String(serie._id));
        expect(spyRecalculo.mock.calls[0][1]).toBe('capitulo_publicado');
      }, { timeout: 2000, interval: 20 });

      const depoisLog = await AdminLog.countDocuments({ action: 'APROVAR_EPISODIO_PORTAL' });
      expect(depoisLog).toBe(antesLog + 1);
      const log = await AdminLog.findOne({ action: 'APROVAR_EPISODIO_PORTAL', targetId: String(episode._id) }).lean();
      expect(log).toBeTruthy();
    } finally {
      spyPush.mockRestore();
      spyRecalculo.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/aprovacoes/:tipo/:id/devolver
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/aprovacoes/:tipo/:id/devolver', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const dono = await criarDono('Devolver Auth');
    const serie = await serieSubmetida(dono);

    const semAuth = await request(app).post(`/api/admin/aprovacoes/series/${serie._id}/devolver`).send({ texto: 'Ajuste a capa' });
    expect(semAuth.status).toBe(401);

    const naoAdmin = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ texto: 'Ajuste a capa' });
    expect(naoAdmin.status).toBe(403);
  });

  it('texto ausente/vazio -> 400', async () => {
    const dono = await criarDono('Devolver Texto Obrigatorio');
    const serie = await serieSubmetida(dono);

    const semTexto = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({});
    expect(semTexto.status).toBe(400);

    const vazio = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: '   ' });
    expect(vazio.status).toBe(400);
  });

  it('id inexistente -> 404', async () => {
    const res = await request(app)
      .post('/api/admin/aprovacoes/series/000000000000000000000000/devolver')
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Ajuste isso' });
    expect(res.status).toBe(404);
  });

  it('item sem submittedAt -> 400 (nada a devolver)', async () => {
    const dono = await criarDono('Devolver Sem Submissao');
    const draft = await Series.create({ title: 'Draft Nunca Submetido Devolver', content_type: 'hiqua', channelId: dono.canal._id });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${draft._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Nada a devolver' });
    expect(res.status).toBe(400);
  });

  it('devolve série: submittedAt->null, isPublished intacto, MensagemPortal com refTipo/refId corretos, AdminLog', async () => {
    const dono = await criarDono('Devolver Serie Sucesso');
    const serie = await serieSubmetida(dono, { title: 'Serie Para Devolver' });
    const antesLog = await AdminLog.countDocuments({ action: 'DEVOLVER_SERIE_PORTAL' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Falta caprichar na capa, por favor.' });
    expect(res.status).toBe(200);

    const salva = await Series.findById(serie._id).lean();
    expect(salva.submittedAt).toBeNull();
    expect(salva.isPublished).toBe(false);

    const mensagem = await MensagemPortal.findOne({ canalId: dono.canal._id, refTipo: 'series', refId: serie._id }).lean();
    expect(mensagem).toBeTruthy();
    expect(mensagem.autorTipo).toBe('editor');
    expect(mensagem.texto).toBe('Falta caprichar na capa, por favor.');
    expect(String(mensagem.ownerUserId)).toBe(dono.id);

    const depoisLog = await AdminLog.countDocuments({ action: 'DEVOLVER_SERIE_PORTAL' });
    expect(depoisLog).toBe(antesLog + 1);
  });

  it('devolve episódio: submittedAt->null, status intacto, MensagemPortal com refTipo "episode"', async () => {
    const dono = await criarDono('Devolver Episodio Sucesso');
    const { episode } = await episodioSubmetidoDeSeriePublicada(dono, { title: 'Cap Para Devolver' });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/episode/${episode._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'O ultimo painel ficou cortado.' });
    expect(res.status).toBe(200);

    const salvo = await Episode.findById(episode._id).lean();
    expect(salvo.submittedAt).toBeNull();
    expect(salvo.status).toBe('draft');

    const mensagem = await MensagemPortal.findOne({ canalId: dono.canal._id, refTipo: 'episode', refId: episode._id }).lean();
    expect(mensagem).toBeTruthy();
    expect(mensagem.texto).toBe('O ultimo painel ficou cortado.');
  });

  it('devolver série NÃO devolve os episódios dela em cascata', async () => {
    const dono = await criarDono('Devolver Sem Cascata');
    const serie = await serieSubmetida(dono, { title: 'Serie Com Episodio Submetido Junto' });
    const episode = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Submetido Junto Da Serie',
      status: 'draft', panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }],
      submittedAt: new Date('2026-08-21T00:00:00.000Z'),
    });

    const res = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Devolvendo só a série' });
    expect(res.status).toBe(200);

    const episodioIntacto = await Episode.findById(episode._id).lean();
    expect(episodioIntacto.submittedAt).not.toBeNull(); // continua submetido — não foi tocado
  });

  it('devolvida é re-editável e re-enviável (integração T4)', async () => {
    const dono = await criarDono('Devolver Reeditavel');
    const serie = await serieSubmetida(dono, { title: 'Serie Reeditavel Apos Devolucao' });

    const devolvida = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie._id}/devolver`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Ajuste o título' });
    expect(devolvida.status).toBe(200);

    // Re-editável: PUT /portal/series/:id volta a funcionar (403 antes, com submittedAt preenchido).
    const editar = await request(app)
      .put(`/api/portal/series/${serie._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Titulo Corrigido' });
    expect(editar.status).toBe(200);
    expect(editar.body.title).toBe('Titulo Corrigido');

    // Re-enviável: precisa de episódio draft com painéis (já existe da criação inicial? não —
    // serieSubmetida não cria episódio; criamos um aqui para satisfazer a validação de envio).
    const ep = await request(app)
      .post(`/api/portal/series/${serie._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Para Reenvio', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/reenvio.jpg', order: 0 }] });

    const reenvio = await request(app)
      .post(`/api/portal/series/${serie._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(reenvio.status).toBe(200);
    expect(reenvio.body.submittedAt).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integração: enviar série -> aprovar série -> episódio pode ser aprovado -> push
// ═══════════════════════════════════════════════════════════════════════════

describe('Integração: fluxo completo série -> episódio pela Fila de Aprovação', () => {
  it('enviar série, aprovar série, então aprovar o episódio dela (agora liberado) dispara o push', async () => {
    contador += 1;
    const email = `admin-aprov-fluxo-${contador}-${Date.now()}@lorflux.test`;
    const senha = 'Senha@123';
    const passwordHash = await bcrypt.hash(senha, 10);
    const user = await User.create({ email, passwordHash, nome: 'Fluxo Completo', role: 'user' });
    const login = await request(app).post('/api/auth/login').send({ email, password: senha });
    const token = login.body.accessToken;
    const canal = await Channel.create({ ownerId: user._id, name: `Canal Fluxo Completo ${Date.now()}` });
    const dono = { id: user._id.toString(), token, canal };

    // Fluxo real do portal (T4): criar série -> criar episódio -> painéis -> enviar série -> enviar episódio.
    const serie = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Fluxo Completo Fila', cover_image: 'https://cdn.exemplo/capa-fluxo.jpg' });
    expect(serie.status).toBe(201);

    const ep = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap 1 Fluxo Completo', episode_number: 1 });
    expect(ep.status).toBe(201);

    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/fluxo-p1.jpg', order: 0 }] });

    const envioSerie = await request(app)
      .post(`/api/portal/series/${serie.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(envioSerie.status).toBe(200);

    const envioEp = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(envioEp.status).toBe(200);

    // Antes da série aprovada: episódio não pode ser aprovado ainda.
    const aprovarEpAntes = await request(app)
      .post(`/api/admin/aprovacoes/episodes/${ep.body._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER());
    expect(aprovarEpAntes.status).toBe(400);

    const aprovarSerie = await request(app)
      .post(`/api/admin/aprovacoes/series/${serie.body._id}/aprovar`)
      .set('Authorization', ADMIN_HEADER())
      .send({ genre: 'Fantasia' });
    expect(aprovarSerie.status).toBe(200);
    expect(aprovarSerie.body.isPublished).toBe(true);

    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    try {
      const aprovarEp = await request(app)
        .post(`/api/admin/aprovacoes/episodes/${ep.body._id}/aprovar`)
        .set('Authorization', ADMIN_HEADER());
      expect(aprovarEp.status).toBe(200);
      expect(aprovarEp.body.status).toBe('published');

      await vi.waitFor(() => {
        expect(spyPush).toHaveBeenCalled();
        expect(String(spyPush.mock.calls[0][0])).toBe(String(ep.body._id));
      }, { timeout: 2000, interval: 20 });
    } finally {
      spyPush.mockRestore();
    }
  });
});
