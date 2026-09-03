/**
 * Testes: Fase 5 Bloco 1, Task 4 — CRUD do portal do ilustrador + submissão.
 * Cobre:
 *  - POST /api/portal/series: content_type 'hiqua' PINADO (body malicioso
 *    ignorado), isPublished:false forçado, sem genre/tags, allowlist,
 *    channelId (1 canal = default, >1 canal = obrigatório).
 *  - PUT /api/portal/series/:id: só em rascunho não submetido (403 em
 *    publicada/submetida), allowlist (content_type/isPublished/genre/tags
 *    nunca editáveis por aqui).
 *  - POST /api/portal/series/:id/episodios: status 'draft' forçado, série
 *    draft OU publicada, allowlist (sem status/bunnyVideoId/vídeo).
 *  - POST /api/portal/episodios/:id/paineis: reusa services/episodePanelService
 *    (mesma função da rota admin) — translationLayers passa de graça; só em
 *    episódio draft.
 *  - POST /api/portal/series/:id/enviar e /episodios/:id/enviar: validações
 *    mínimas, idempotência negativa, regra série×episódio, fallback do
 *    thumbnail materializado no enviar do episódio.
 *  - Ownership cruzado (A não toca na obra de B) em TODAS as rotas.
 *  - Criação/edição/submissão de draft NUNCA dispara push nem recálculo
 *    (spy nos serviços, mesmo molde da Fase 4).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let Channel, Series, Episode, User;
let recommendationService, notificationService;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  User = require('../../models/User');
  recommendationService = require('../../services/recommendationService');
  notificationService = require('../../services/notificationService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Helpers ────────────────────────────────────────────────────────────────

let contadorUsuario = 0;
async function criarDono(nome) {
  contadorUsuario += 1;
  const email = `portal-crud-${contadorUsuario}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  const token = login.body.accessToken;
  const canal = await Channel.create({ ownerId: user._id, name: `Canal ${nome} ${Date.now()}` });
  return { id: user._id.toString(), token, canal };
}

async function criarUsuarioSemCanal(nome) {
  contadorUsuario += 1;
  const email = `portal-crud-semcanal-${contadorUsuario}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return login.body.accessToken;
}

async function criarSerieDraft(dono, overrides = {}) {
  const res = await request(app)
    .post('/api/portal/series')
    .set('Authorization', `Bearer ${dono.token}`)
    .send({ title: 'Serie Draft Padrao', ...overrides });
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/series
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/series', () => {
  it('sem token → 401; usuário sem canal → 403', async () => {
    const semAuth = await request(app).post('/api/portal/series').send({ title: 'X' });
    expect(semAuth.status).toBe(401);

    // Usuário isolado criado sem Channel algum — NÃO reusa o 'user' fixo de
    // helpers/auth.js: outros arquivos de teste (ex.: content.test.js,
    // "Drafts invisíveis ao público") criam canais para esse usuário fixo, e
    // os arquivos de teste rodam em sequência no MESMO banco (fileParallelism
    // false) — reusá-lo aqui daria falso-negativo dependendo da ordem.
    const tokenSemCanal = await criarUsuarioSemCanal('Sem Canal Isolado');
    const semCanal = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${tokenSemCanal}`)
      .send({ title: 'X' });
    expect(semCanal.status).toBe(403);
  });

  it('cria série DRAFT com content_type "hiqua" PINADO — body malicioso com content_type é ignorado', async () => {
    const dono = await criarDono('Content Type Pinado');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Maliciosa Content Type', content_type: 'vcine' });

    expect(res.status).toBe(201);
    expect(res.body.content_type).toBe('hiqua');

    const salva = await Series.findById(res.body._id).lean();
    expect(salva.content_type).toBe('hiqua');
  });

  it('isPublished: true no body é IGNORADO — série sempre nasce draft', async () => {
    const dono = await criarDono('IsPublished Pinado');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Maliciosa IsPublished', isPublished: true });

    expect(res.status).toBe(201);
    expect(res.body.isPublished).toBe(false);
  });

  it('genre no body é ignorado (allowlist explícita, nunca spread); tags livres/inválidas no body -> 400 (não é allowlist, é vocabulário)', async () => {
    const dono = await criarDono('Genre Tags Ignorados');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Genre Tags', genre: 'Aventura Forcada', tags: ['a', 'b', 'c', 'd', 'e'] });

    // 'a'/'b'/'c'/'d'/'e' não são slugs do vocabulário fechado — o schema
    // recusa (ValidationError -> 400), então nem chega a confirmar que
    // genre foi ignorado por essa chamada. O teste abaixo, com slugs REAIS,
    // prova a aceitação; este aqui prova que lixo não vocabular nunca entra.
    expect(res.status).toBe(400);
  });

  // INVERSÃO DELIBERADA (Fase 5 Bloco 2, Task 6 — spec rev.3, "Tags no
  // portal/admin"): no contrato do Bloco 1, PORTAL_SERIES_FIELDS não incluía
  // `tags` — o campo era sempre ignorado, igual content_type/isPublished/
  // genre. A T6 muda isso: o autor agora escolhe até 8 tags do vocabulário
  // fechado (utils/tagsVocabulario.js) que representam a obra; o Master
  // corrige na fila/admin. content_type/isPublished/genre CONTINUAM
  // ignorados — só tags mudou de lado no allowlist.
  it('tags do vocabulário (até 8) SÃO aceitas e gravadas — genre CONTINUA ignorado', async () => {
    const dono = await criarDono('Tags Vocabulario Aceitas');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Tags Vocabulario', genre: 'Aventura Forcada', tags: ['acao', 'aventura', 'fantasia'] });

    expect(res.status).toBe(201);
    expect(res.body.genre).toBeUndefined();
    expect(res.body.tags.sort()).toEqual(['acao', 'aventura', 'fantasia'].sort());

    const salva = await Series.findById(res.body._id).lean();
    expect(salva.tags.sort()).toEqual(['acao', 'aventura', 'fantasia'].sort());
  });

  it('9 tags (acima do máximo de 8) -> 400', async () => {
    const dono = await criarDono('Tags Nove Maximo');
    const nove = ['romance', 'drama', 'comedia', 'acao', 'aventura', 'fantasia', 'terror', 'thriller', 'misterio'];
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Nove Tags', tags: nove });
    expect(res.status).toBe(400);
  });

  it('slug fora do vocabulário -> 400', async () => {
    const dono = await criarDono('Tags Slug Invalido');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Slug Invalido', tags: ['romance', 'slug-que-nao-existe'] });
    expect(res.status).toBe(400);
  });

  it('0 tags (array vazio) é válido — sem mínimo', async () => {
    const dono = await criarDono('Tags Zero Ok');
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Zero Tags', tags: [] });
    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual([]);
  });

  it('draft salva SEM genre (T1 já garantiu no schema; aqui é o caminho real da rota)', async () => {
    const dono = await criarDono('Sem Genre Rota Real');
    const res = await criarSerieDraft(dono, { title: 'Obra Sem Genre' });
    expect(res.status).toBe(201);
    const salva = await Series.findById(res.body._id).lean();
    expect(salva.genre).toBeUndefined();
  });

  it('title vazio ou ausente → 400', async () => {
    const dono = await criarDono('Title Vazio');
    const semTitle = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ description: 'sem titulo' });
    expect(semTitle.status).toBe(400);

    const titleVazio = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: '   ' });
    expect(titleVazio.status).toBe(400);
  });

  it('content_rating_sugerida inválida → 400; valores válidos aceitos', async () => {
    const dono = await criarDono('Classificacao Sugerida');
    const invalida = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Classificacao Invalida', content_rating_sugerida: 'adulto' });
    expect(invalida.status).toBe(400);

    const valida = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Classificacao Kids', content_rating_sugerida: 'kids' });
    expect(valida.status).toBe(201);
    expect(valida.body.content_rating_sugerida).toBe('kids');
  });

  it('dono de UM canal: channelId no body é ignorado (usa o único canal ativo como default)', async () => {
    const dono = await criarDono('Um Canal Default');
    const outroCanalId = '000000000000000000000099';
    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Obra Canal Default', channelId: outroCanalId });

    expect(res.status).toBe(201);
    expect(String(res.body.channelId)).toBe(String(dono.canal._id));
  });

  it('dono de DOIS canais: channelId ausente → 400; channelId de canal alheio → 400; channelId válido → cria no canal certo', async () => {
    contadorUsuario += 1;
    const email = `portal-crud-doiscanais-${contadorUsuario}-${Date.now()}@lorflux.test`;
    const senha = 'Senha@123';
    const passwordHash = await bcrypt.hash(senha, 10);
    const user = await User.create({ email, passwordHash, nome: 'Dois Canais', role: 'user' });
    const login = await request(app).post('/api/auth/login').send({ email, password: senha });
    const token = login.body.accessToken;
    const canalA = await Channel.create({ ownerId: user._id, name: 'Canal Um Dois Canais' });
    const canalB = await Channel.create({ ownerId: user._id, name: 'Canal Dois Dois Canais' });

    const semChannelId = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Obra Sem ChannelId' });
    expect(semChannelId.status).toBe(400);

    const outroUsuario = await criarDono('Canal Alheio Para DoisCanais');
    const channelIdAlheio = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Obra ChannelId Alheio', channelId: String(outroUsuario.canal._id) });
    expect(channelIdAlheio.status).toBe(400);

    const valido = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Obra ChannelId Valido', channelId: String(canalB._id) });
    expect(valido.status).toBe(201);
    expect(String(valido.body.channelId)).toBe(String(canalB._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/portal/series/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/portal/series/:id', () => {
  it('edita a própria série em rascunho não submetido', async () => {
    const dono = await criarDono('Editar Draft');
    const create = await criarSerieDraft(dono, { title: 'Original', description: 'Desc Original' });

    const res = await request(app)
      .put(`/api/portal/series/${create.body._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Editado', description: 'Desc Editada', cover_image: 'https://cdn.exemplo/capa.jpg' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Editado');
    expect(res.body.description).toBe('Desc Editada');
    expect(res.body.cover_image).toBe('https://cdn.exemplo/capa.jpg');
  });

  it('content_type/isPublished/genre NUNCA editáveis por esta rota (ignorados silenciosamente); tags do vocabulário SÃO gravadas (INVERSÃO da Task 6 — spec rev.3)', async () => {
    const dono = await criarDono('Editar Campos Proibidos');
    const create = await criarSerieDraft(dono, { title: 'Campos Proibidos' });

    const res = await request(app)
      .put(`/api/portal/series/${create.body._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ content_type: 'vcine', isPublished: true, genre: 'Forcado', tags: ['acao', 'drama'] });

    expect(res.status).toBe(200);
    expect(res.body.content_type).toBe('hiqua');
    expect(res.body.isPublished).toBe(false);
    expect(res.body.genre).toBeUndefined();
    expect(res.body.tags.sort()).toEqual(['acao', 'drama'].sort());
  });

  it('PUT: 9 tags -> 400; slug fora do vocabulário -> 400 (não altera o documento)', async () => {
    const dono = await criarDono('Editar Tags Invalidas');
    const create = await criarSerieDraft(dono, { title: 'Editar Tags Invalidas Obra' });

    const nove = ['romance', 'drama', 'comedia', 'acao', 'aventura', 'fantasia', 'terror', 'thriller', 'misterio'];
    const excesso = await request(app)
      .put(`/api/portal/series/${create.body._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ tags: nove });
    expect(excesso.status).toBe(400);

    const invalido = await request(app)
      .put(`/api/portal/series/${create.body._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ tags: ['romance', 'nao-existe'] });
    expect(invalido.status).toBe(400);

    const inalterada = await Series.findById(create.body._id).lean();
    expect(inalterada.tags).toEqual([]);
  });

  it('title vazio → 400 (não altera o documento)', async () => {
    const dono = await criarDono('Editar Title Vazio');
    const create = await criarSerieDraft(dono, { title: 'Titulo Preservado' });

    const res = await request(app)
      .put(`/api/portal/series/${create.body._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: '' });
    expect(res.status).toBe(400);

    const inalterada = await Series.findById(create.body._id).lean();
    expect(inalterada.title).toBe('Titulo Preservado');
  });

  it('série PUBLICADA → 403 (portal não edita ao vivo)', async () => {
    const dono = await criarDono('Editar Publicada');
    const publicada = await Series.create({
      title: 'Ja Publicada', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });

    const res = await request(app)
      .put(`/api/portal/series/${publicada._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Tentativa De Editar Publicada' });
    expect(res.status).toBe(403);

    const inalterada = await Series.findById(publicada._id).lean();
    expect(inalterada.title).toBe('Ja Publicada');
  });

  it('série SUBMETIDA (aguardando aprovação) → 403', async () => {
    const dono = await criarDono('Editar Submetida');
    const submetida = await Series.create({
      title: 'Ja Submetida', content_type: 'hiqua', channelId: dono.canal._id,
      submittedAt: new Date('2026-08-30T10:00:00.000Z'),
    });

    const res = await request(app)
      .put(`/api/portal/series/${submetida._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Tentativa De Editar Submetida' });
    expect(res.status).toBe(403);
  });

  it('ownership cruzado: A não edita série de B → 404 (não confirma existência)', async () => {
    const donoA = await criarDono('PUT Ownership A');
    const donoB = await criarDono('PUT Ownership B');
    const serieDeB = await criarSerieDraft(donoB, { title: 'Serie De B Para PUT' });

    const res = await request(app)
      .put(`/api/portal/series/${serieDeB.body._id}`)
      .set('Authorization', `Bearer ${donoA.token}`)
      .send({ title: 'A Tentando Editar B' });
    expect(res.status).toBe(404);

    const inalterada = await Series.findById(serieDeB.body._id).lean();
    expect(inalterada.title).toBe('Serie De B Para PUT');
  });

  it('id inexistente → 404', async () => {
    const dono = await criarDono('PUT Inexistente');
    const res = await request(app)
      .put('/api/portal/series/000000000000000000000000')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'X' });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/series/:id/episodios
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/series/:id/episodios', () => {
  it('cria episódio DRAFT (status forçado mesmo com "published" malicioso no body)', async () => {
    const dono = await criarDono('Episodio Draft Forcado');
    const serie = await criarSerieDraft(dono, { title: 'Serie Para Episodio Draft' });

    const res = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap 1', episode_number: 1, status: 'published' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  it('NUNCA aceita bunnyVideoId/video_url do body (allowlist)', async () => {
    const dono = await criarDono('Episodio Sem Video');
    const serie = await criarSerieDraft(dono, { title: 'Serie Sem Video No Cap' });

    const res = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Sem Video', episode_number: 1, bunnyVideoId: 'malicioso', video_url: 'https://malicioso.test' });

    expect(res.status).toBe(201);
    expect(res.body.bunnyVideoId).toBeFalsy();
    expect(res.body.video_url).toBeFalsy();
  });

  it('aceita thumbnail como URL (upload real é T5, aqui só o campo)', async () => {
    const dono = await criarDono('Episodio Thumbnail Url');
    const serie = await criarSerieDraft(dono, { title: 'Serie Thumbnail Cap' });

    const res = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Com Thumbnail', episode_number: 1, thumbnail: 'https://cdn.exemplo/thumb.jpg' });

    expect(res.status).toBe(201);
    expect(res.body.thumbnail).toBe('https://cdn.exemplo/thumb.jpg');
  });

  it('title ausente → 400; episode_number ausente → 400', async () => {
    const dono = await criarDono('Episodio Campos Obrigatorios');
    const serie = await criarSerieDraft(dono, { title: 'Serie Campos Obrigatorios Cap' });

    const semTitle = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ episode_number: 1 });
    expect(semTitle.status).toBe(400);

    const semNumero = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Sem Numero' });
    expect(semNumero.status).toBe(400);
  });

  it('funciona tanto em série DRAFT quanto em série JÁ PUBLICADA (capítulo novo é o fluxo normal)', async () => {
    const dono = await criarDono('Episodio Serie Publicada');
    const publicada = await Series.create({
      title: 'Serie Publicada Para Cap Novo', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });

    const res = await request(app)
      .post(`/api/portal/series/${publicada._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Capitulo Novo Em Obra No Ar', episode_number: 5 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  it('ownership cruzado: A não cria episódio na série de B → 404', async () => {
    const donoA = await criarDono('Episodio Ownership A');
    const donoB = await criarDono('Episodio Ownership B');
    const serieDeB = await criarSerieDraft(donoB, { title: 'Serie De B Para Episodio' });

    const res = await request(app)
      .post(`/api/portal/series/${serieDeB.body._id}/episodios`)
      .set('Authorization', `Bearer ${donoA.token}`)
      .send({ title: 'A Tentando Criar Cap Em B', episode_number: 1 });
    expect(res.status).toBe(404);

    const total = await Episode.countDocuments({ seriesId: serieDeB.body._id });
    expect(total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/episodios/:id/paineis
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/episodios/:id/paineis', () => {
  async function criarEpisodioDraft(dono, overrides = {}) {
    const serie = await criarSerieDraft(dono, { title: `Serie Paineis ${Date.now()}-${Math.random()}` });
    const ep = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Para Paineis', episode_number: 1, ...overrides });
    return { serie, episodeId: ep.body._id };
  }

  it('grava painéis no episódio draft do dono (mesmo shape da rota admin, com translationLayers)', async () => {
    const dono = await criarDono('Paineis Sucesso');
    const { episodeId } = await criarEpisodioDraft(dono);

    const panels = [
      { image_url: 'https://cdn.exemplo/p1.jpg', order: 0 },
      {
        image_url: 'https://cdn.exemplo/p2.jpg', order: 1,
        translationLayers: [{ language: 'en', imageUrl: 'https://cdn.exemplo/p2-en.jpg' }],
      },
    ];
    const res = await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels });

    expect(res.status).toBe(200);
    expect(res.body.panelCount).toBe(2);
    expect(res.body.episode.panels[1].translationLayers[0].language).toBe('en');
    expect(res.body.episode.panels[1].translationLayers[0].imageUrl).toBe('https://cdn.exemplo/p2-en.jpg');
  });

  // Achado da revisão da T4: submetido ainda tem status 'draft' — sem o
  // check de submittedAt, o ilustrador anexava o painel N+1 enquanto o
  // Master revisa, e ele iria ao ar sem revisão na aprovação.
  it('episódio SUBMETIDO não recebe painéis (403); devolvido volta a aceitar', async () => {
    const dono = await criarDono('Paineis Submetido');
    const { serie, episodeId } = await criarEpisodioDraft(dono);

    await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/base.jpg', order: 0 }] });
    // Série precisa estar submetida para o episódio poder ser enviado
    // (regra da T4: série 100% rascunho bloqueia envio avulso).
    const Series = require('../../models/Series');
    await Series.findByIdAndUpdate(serie.body._id, { $set: { submittedAt: new Date('2026-09-02T11:23:00Z') } });
    const enviar = await request(app)
      .post(`/api/portal/episodios/${episodeId}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(enviar.status).toBe(200);

    const bloqueado = await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/n-mais-1.jpg', order: 1 }] });
    expect(bloqueado.status).toBe(403);

    const Episode = require('../../models/Episode');
    let noBanco = await Episode.findById(episodeId).lean();
    expect(noBanco.panels.length).toBe(1);

    // Devolução (T7 limpa submittedAt) reabre a edição.
    await Episode.findByIdAndUpdate(episodeId, { $set: { submittedAt: null } });
    const reaberto = await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/pos-devolucao.jpg', order: 1 }] });
    expect(reaberto.status).toBe(200);
    noBanco = await Episode.findById(episodeId).lean();
    expect(noBanco.panels.length).toBe(2);
  });

  it('array de painéis vazio → 400', async () => {
    const dono = await criarDono('Paineis Vazio');
    const { episodeId } = await criarEpisodioDraft(dono);

    const res = await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [] });
    expect(res.status).toBe(400);
  });

  it('episódio NÃO draft (ex.: já publicado) → 403', async () => {
    const dono = await criarDono('Paineis Nao Draft');
    const serie = await Series.create({
      title: 'Serie Cap Publicado Paineis', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const episodio = await Episode.create({
      seriesId: serie._id, episode_number: 1, title: 'Cap Ja Publicado', status: 'published',
    });

    const res = await request(app)
      .post(`/api/portal/episodios/${episodio._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/x.jpg', order: 0 }] });
    expect(res.status).toBe(403);
  });

  it('ownership cruzado: A não grava painéis no episódio de B → 404', async () => {
    const donoA = await criarDono('Paineis Ownership A');
    const donoB = await criarDono('Paineis Ownership B');
    const { episodeId } = await criarEpisodioDraft(donoB);

    const res = await request(app)
      .post(`/api/portal/episodios/${episodeId}/paineis`)
      .set('Authorization', `Bearer ${donoA.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/x.jpg', order: 0 }] });
    expect(res.status).toBe(404);
  });

  it('episódio inexistente → 404', async () => {
    const dono = await criarDono('Paineis Episodio Inexistente');
    const res = await request(app)
      .post('/api/portal/episodios/000000000000000000000000/paineis')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/x.jpg', order: 0 }] });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/series/:id/enviar
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/series/:id/enviar', () => {
  async function serieCompleta(dono, titulo) {
    const serie = await criarSerieDraft(dono, { title: titulo, cover_image: 'https://cdn.exemplo/capa.jpg' });
    const ep = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Para Envio', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }] });
    return { serieId: serie.body._id, episodeId: ep.body._id };
  }

  it('sem capa → 400 orientando o que falta', async () => {
    const dono = await criarDono('Enviar Sem Capa');
    const serie = await criarSerieDraft(dono, { title: 'Serie Sem Capa Para Enviar' });
    const ep = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Sem Capa', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }] });

    const res = await request(app)
      .post(`/api/portal/series/${serie.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capa/i);
  });

  it('sem episódio com painéis → 400 orientando o que falta', async () => {
    const dono = await criarDono('Enviar Sem Paineis');
    const serie = await criarSerieDraft(dono, { title: 'Serie Sem Paineis Para Enviar', cover_image: 'https://cdn.exemplo/capa.jpg' });

    const res = await request(app)
      .post(`/api/portal/series/${serie.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pain[eé]|epis[oó]dio/i);
  });

  it('capa + episódio draft com painéis → 200, submittedAt preenchido', async () => {
    const dono = await criarDono('Enviar Sucesso');
    const { serieId } = await serieCompleta(dono, 'Serie Completa Para Enviar');

    const res = await request(app)
      .post(`/api/portal/series/${serieId}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();

    const salva = await Series.findById(serieId).lean();
    expect(salva.submittedAt).toBeTruthy();
  });

  it('enviar DUAS vezes → 400 na segunda (idempotente-negativo)', async () => {
    const dono = await criarDono('Enviar Duas Vezes');
    const { serieId } = await serieCompleta(dono, 'Serie Enviada Duas Vezes');

    const primeira = await request(app)
      .post(`/api/portal/series/${serieId}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(primeira.status).toBe(200);

    const segunda = await request(app)
      .post(`/api/portal/series/${serieId}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(segunda.status).toBe(400);
  });

  it('série já PUBLICADA → 400 ao tentar enviar', async () => {
    const dono = await criarDono('Enviar Ja Publicada');
    const publicada = await Series.create({
      title: 'Ja Publicada Nao Reenvia', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id, cover_image: 'https://cdn.exemplo/capa.jpg',
    });

    const res = await request(app)
      .post(`/api/portal/series/${publicada._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
  });

  it('ownership cruzado: A não envia série de B → 404', async () => {
    const donoA = await criarDono('Enviar Ownership A');
    const donoB = await criarDono('Enviar Ownership B');
    const { serieId } = await serieCompleta(donoB, 'Serie De B Para Enviar');

    const res = await request(app)
      .post(`/api/portal/series/${serieId}/enviar`)
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(404);

    const inalterada = await Series.findById(serieId).lean();
    expect(inalterada.submittedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/episodios/:id/enviar
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/episodios/:id/enviar', () => {
  it('sem painéis → 400', async () => {
    const dono = await criarDono('Enviar Ep Sem Paineis');
    const serie = await Series.create({
      title: 'Serie Publicada Ep Sem Paineis', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const ep = await request(app)
      .post(`/api/portal/series/${serie._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Sem Paineis', episode_number: 1 });

    const res = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pain/i);
  });

  it('série ainda 100% rascunho (nunca publicada, nunca submetida) → 400 orientando enviar a série primeiro', async () => {
    const dono = await criarDono('Enviar Ep Serie Draft');
    const serie = await criarSerieDraft(dono, { title: 'Serie Draft Bloqueia Envio De Cap' });
    const ep = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Bloqueado', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }] });

    const res = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/s[eé]rie/i);

    const inalterado = await Episode.findById(ep.body._id).lean();
    expect(inalterado.submittedAt).toBeNull();
  });

  it('série já SUBMETIDA (não publicada ainda) → episódio pode ser enviado; fallback de thumbnail = 1º painel', async () => {
    const dono = await criarDono('Enviar Ep Serie Submetida');
    const serie = await criarSerieDraft(dono, { title: 'Serie Submetida Libera Cap', cover_image: 'https://cdn.exemplo/capa.jpg' });

    // Episódio A: satisfaz a exigência de "≥1 episódio com painel" pra série poder ser enviada.
    const epA = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap A Satisfaz Envio Serie', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${epA.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/pa1.jpg', order: 0 }] });

    const envioSerie = await request(app)
      .post(`/api/portal/series/${serie.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(envioSerie.status).toBe(200);

    // Episódio B (sem thumbnail): agora a série está SUBMETIDA (não publicada) — o enviar do episódio deve passar.
    const epB = await request(app)
      .post(`/api/portal/series/${serie.body._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap B Enviado Apos Serie Submetida', episode_number: 2 });
    await request(app)
      .post(`/api/portal/episodios/${epB.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/pb1.jpg', order: 0 }] });

    const res = await request(app)
      .post(`/api/portal/episodios/${epB.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.thumbnail).toBe('https://cdn.exemplo/pb1.jpg');
  });

  it('série já PUBLICADA: episódio avulso (capítulo novo) pode ser enviado direto; thumbnail existente NÃO é sobrescrito', async () => {
    const dono = await criarDono('Enviar Ep Serie Publicada');
    const serie = await Series.create({
      title: 'Serie Publicada Cap Avulso', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const ep = await request(app)
      .post(`/api/portal/series/${serie._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Avulso Com Thumbnail', episode_number: 7, thumbnail: 'https://cdn.exemplo/thumb-manual.jpg' });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/pavulso1.jpg', order: 0 }] });

    const res = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.thumbnail).toBe('https://cdn.exemplo/thumb-manual.jpg');
  });

  it('enviar DUAS vezes → 400 na segunda (idempotente-negativo)', async () => {
    const dono = await criarDono('Enviar Ep Duas Vezes');
    const serie = await Series.create({
      title: 'Serie Publicada Cap Duas Vezes', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: dono.canal._id,
    });
    const ep = await request(app)
      .post(`/api/portal/series/${serie._id}/episodios`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ title: 'Cap Duas Vezes', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/paineis`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }] });

    const primeira = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(primeira.status).toBe(200);

    const segunda = await request(app)
      .post(`/api/portal/episodios/${ep.body._id}/enviar`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(segunda.status).toBe(400);
  });

  it('ownership cruzado: A não envia episódio de B → 404', async () => {
    const donoA = await criarDono('Enviar Ep Ownership A');
    const donoB = await criarDono('Enviar Ep Ownership B');
    const serieB = await Series.create({
      title: 'Serie De B Publicada Para Ep', genre: 'Aventura', content_type: 'hiqua',
      isPublished: true, channelId: donoB.canal._id,
    });
    const epB = await request(app)
      .post(`/api/portal/series/${serieB._id}/episodios`)
      .set('Authorization', `Bearer ${donoB.token}`)
      .send({ title: 'Cap De B', episode_number: 1 });
    await request(app)
      .post(`/api/portal/episodios/${epB.body._id}/paineis`)
      .set('Authorization', `Bearer ${donoB.token}`)
      .send({ panels: [{ image_url: 'https://cdn.exemplo/p1.jpg', order: 0 }] });

    const res = await request(app)
      .post(`/api/portal/episodios/${epB.body._id}/enviar`)
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Criação/edição/submissão de draft NUNCA dispara push nem recálculo
// ═══════════════════════════════════════════════════════════════════════════

describe('Draft do portal nunca dispara push nem recálculo do algoritmo', () => {
  it('criar série, criar episódio, gravar painéis, editar série e enviar série+episódio — dispararRecalculo e notifyEpisodePublished NUNCA são chamados', async () => {
    const spyRecalculo = vi.spyOn(recommendationService, 'dispararRecalculo');
    const spyPush = vi.spyOn(notificationService, 'notifyEpisodePublished');
    try {
      const dono = await criarDono('Spy Push Recalculo');

      const serie = await request(app)
        .post('/api/portal/series')
        .set('Authorization', `Bearer ${dono.token}`)
        .send({ title: 'Serie Spy', cover_image: 'https://cdn.exemplo/capa-spy.jpg' });
      expect(serie.status).toBe(201);

      await request(app)
        .put(`/api/portal/series/${serie.body._id}`)
        .set('Authorization', `Bearer ${dono.token}`)
        .send({ description: 'Descricao editada' });

      const ep = await request(app)
        .post(`/api/portal/series/${serie.body._id}/episodios`)
        .set('Authorization', `Bearer ${dono.token}`)
        .send({ title: 'Cap Spy', episode_number: 1 });
      expect(ep.status).toBe(201);

      await request(app)
        .post(`/api/portal/episodios/${ep.body._id}/paineis`)
        .set('Authorization', `Bearer ${dono.token}`)
        .send({ panels: [{ image_url: 'https://cdn.exemplo/p1-spy.jpg', order: 0 }] });

      const envioSerie = await request(app)
        .post(`/api/portal/series/${serie.body._id}/enviar`)
        .set('Authorization', `Bearer ${dono.token}`);
      expect(envioSerie.status).toBe(200);

      const envioEp = await request(app)
        .post(`/api/portal/episodios/${ep.body._id}/enviar`)
        .set('Authorization', `Bearer ${dono.token}`);
      expect(envioEp.status).toBe(200);

      expect(spyRecalculo).not.toHaveBeenCalled();
      expect(spyPush).not.toHaveBeenCalled();
    } finally {
      spyRecalculo.mockRestore();
      spyPush.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/series — lista das próprias séries (Task 9, frontend: a
// aba Obras precisa persistir o _id das séries entre sessões — POST /series
// devolve o doc criado, mas nada listava depois).
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/series', () => {
  it('sem token → 401; usuário sem canal → 403', async () => {
    const semAuth = await request(app).get('/api/portal/series');
    expect(semAuth.status).toBe(401);

    const tokenSemCanal = await criarUsuarioSemCanal('Lista Sem Canal');
    const semCanal = await request(app)
      .get('/api/portal/series')
      .set('Authorization', `Bearer ${tokenSemCanal}`);
    expect(semCanal.status).toBe(403);
  });

  it('lista só as séries dos PRÓPRIOS canais, mais recente primeiro, shape pinado', async () => {
    const donoA = await criarDono('Lista A');
    const donoB = await criarDono('Lista B');

    await criarSerieDraft(donoA, { title: 'Serie A1', description: 'Desc A1' });
    await new Promise(r => setTimeout(r, 5));
    const a2 = await criarSerieDraft(donoA, { title: 'Serie A2', content_rating_sugerida: 'kids' });
    await criarSerieDraft(donoB, { title: 'Serie B1' });

    const res = await request(app)
      .get('/api/portal/series')
      .set('Authorization', `Bearer ${donoA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(2);
    // Mais recente primeiro.
    expect(res.body.series[0]._id).toBe(a2.body._id);
    expect(res.body.series.map(s => s.title).sort()).toEqual(['Serie A1', 'Serie A2']);
    expect(res.body.series.every(s => s.title !== 'Serie B1')).toBe(true);

    const item = res.body.series.find(s => s.title === 'Serie A2');
    expect(item).toMatchObject({
      title: 'Serie A2',
      content_type: 'hiqua',
      isPublished: false,
      submittedAt: null,
      content_rating_sugerida: 'kids',
      tags: [],
    });
    expect(item.channelId).toBe(String(donoA.canal._id));
    // Negativo (trava regressão do .select() da rota): translations NÃO faz
    // parte do shape de listagem — é detalhe da tradução automática, sem uso
    // na aba Obras do portal.
    //
    // RE-PINADO na Task 6 (spec rev.3, "Tags no portal/admin"): `tags` ENTROU
    // no select — o form de edição do portal precisa mostrar as tags atuais
    // da obra. Antes deste bloco o teste acusava `item.tags` INDEFINIDO; a
    // inversão é deliberada, ver comentário em routes/portal.js GET /series.
    expect(item.translations).toBeUndefined();
    expect(item.tags).toEqual([]);
  });

  it('inclui tags gravadas no shape de listagem (T6)', async () => {
    const dono = await criarDono('Lista Com Tags');
    await criarSerieDraft(dono, { title: 'Serie Com Tags Na Lista', tags: ['romance', 'drama'] });

    const res = await request(app)
      .get('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    const item = res.body.series.find(s => s.title === 'Serie Com Tags Na Lista');
    expect(item.tags.sort()).toEqual(['drama', 'romance']);
  });

  it('sem série alguma → { series: [] }', async () => {
    const dono = await criarDono('Lista Vazia');
    const res = await request(app)
      .get('/api/portal/series')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ series: [] });
  });
});
