/**
 * Testes: Fase 4, Bloco 1 — progresso de leitura e "Continuar".
 * Cobre modelo, gravação, carrossel, migração do visitante e LGPD.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

const ANON = '11111111-2222-4333-8444-555555555555';

describe('modelo ReadingProgress', () => {
  it('exige exatamente um identificador: userId ou anonymousId', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    };

    await expect(ReadingProgress.create({ ...base })).rejects.toThrow();
    await expect(
      ReadingProgress.create({ ...base, userId: auth.getId('user'), anonymousId: ANON }),
    ).rejects.toThrow();

    const soUsuario = await ReadingProgress.create({ ...base, userId: auth.getId('user') });
    expect(soUsuario.userId).toBeTruthy();

    const soVisitante = await ReadingProgress.create({ ...base, anonymousId: ANON });
    expect(soVisitante.anonymousId).toBe(ANON);
  });

  it('marca completed a partir de 90% e recusa percent fora de 0..1', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      userId: auth.getId('user'),
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
    };

    const quase = await ReadingProgress.create({ ...base, percent: 0.89 });
    expect(quase.completed).toBe(false);

    const fim = await ReadingProgress.create({
      ...base,
      episodeId: new mongoose.Types.ObjectId(),
      percent: 0.9,
    });
    expect(fim.completed).toBe(true);

    await expect(
      ReadingProgress.create({ ...base, episodeId: new mongoose.Types.ObjectId(), percent: 1.5 }),
    ).rejects.toThrow();
  });
});

describe('identidade do request', () => {
  const getIdentity = require('../../utils/requestIdentity');

  it('prefere a conta quando há token válido', () => {
    const req = { user: { id: 'abc123' }, headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ userId: 'abc123' });
  });

  it('cai para o visitante quando não há conta', () => {
    const req = { headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ anonymousId: ANON });
  });

  it('recusa identificador de visitante fora do formato UUID', () => {
    expect(getIdentity({ headers: { 'x-anonymous-id': 'nao-e-uuid' } })).toBeNull();
    expect(getIdentity({ headers: {} })).toBeNull();
  });
});

describe('PUT /api/me/progress', () => {
  let serie, episodio;

  beforeAll(async () => {
    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Obra do Progresso', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body;

    const e = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: serie._id || serie.id, episode_number: 1, title: 'Capitulo 1' });
    episodio = e.body;
  });

  const corpo = (extra = {}) => ({
    seriesId: serie._id || serie.id,
    episodeId: episodio._id || episodio.id,
    contentType: 'hiqua',
    percent: 0.4,
    position: 0,
    ...extra,
  });

  it('grava o progresso de quem tem conta', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo());

    expect(res.status).toBe(200);
    expect(res.body.percent).toBeCloseTo(0.4);
    expect(res.body.completed).toBe(false);
  });

  it('atualiza em vez de duplicar quando o mesmo episodio volta', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 0.7 }));

    const ReadingProgress = require('../../models/ReadingProgress');
    const docs = await ReadingProgress.find({
      userId: auth.getId('user'),
      episodeId: episodio._id || episodio.id,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].percent).toBeCloseTo(0.7);
  });

  it('grava o progresso do visitante pelo cabecalho', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send(corpo({ percent: 0.25 }));

    expect(res.status).toBe(200);
    expect(res.body.anonymousId).toBe(ANON);
    expect(res.body.userId).toBeUndefined();
  });

  it('recusa quem nao traz conta nem identificador de visitante', async () => {
    const res = await request(app).put('/api/me/progress').send(corpo());
    expect(res.status).toBe(400);
  });

  it('recusa percent fora de 0..1', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 2 }));
    expect(res.status).toBe(400);
  });

  it('recusa seriesId/episodeId com formato invalido (nao e ObjectId)', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ seriesId: 'nao-e-um-objectid', episodeId: 'tambem-nao' }));
    expect(res.status).toBe(400);
  });

  it('nao perde o progresso quando duas gravacoes colidem na mesma janela (corrida)', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const userId = auth.getId('user');
    const episodeIdCorrida = new mongoose.Types.ObjectId().toString();

    // Simula o concorrente: um segundo PUT que grava o mesmo documento entre o
    // nosso findOne() e o nosso create(), disparando E11000 no índice único
    // parcial (userId + episodeId). O serviço precisa recuperar sozinho, sem
    // perder a nossa gravação nem duplicar o documento.
    const originalCreate = ReadingProgress.create.bind(ReadingProgress);
    const dadosConcorrente = {
      userId,
      seriesId: serie._id || serie.id,
      episodeId: episodeIdCorrida,
      contentType: 'hiqua',
      percent: 0.2,
      position: 0,
    };
    const spy = vi.spyOn(ReadingProgress, 'create').mockImplementationOnce(async () => {
      await originalCreate(dadosConcorrente);
      const err = new Error('E11000 duplicate key error collection');
      err.code = 11000;
      throw err;
    });

    try {
      const res = await request(app)
        .put('/api/me/progress')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send(corpo({ episodeId: episodeIdCorrida, percent: 0.55 }));

      // 200, não 500: a corrida é tratada, e a resposta é a nossa própria
      // gravação (0.55), não a do concorrente (0.2).
      expect(res.status).toBe(200);
      expect(res.body.percent).toBeCloseTo(0.55);

      const docs = await ReadingProgress.find({ userId, episodeId: episodeIdCorrida });
      expect(docs).toHaveLength(1);
      expect(docs[0].percent).toBeCloseTo(0.55);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('GET /api/me/continue', () => {
  const ReadingProgress = require('../../models/ReadingProgress');
  const mongoose = require('mongoose');
  let serieA, epA1, epA2;

  async function criarSerie(titulo, tipo) {
    const r = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: titulo, genre: 'Teste', content_type: tipo, isPublished: true });
    return r.body._id || r.body.id;
  }

  async function criarEpisodio(seriesId, n) {
    const r = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId, episode_number: n, title: `Capitulo ${n}` });
    return r.body._id || r.body.id;
  }

  beforeAll(async () => {
    await ReadingProgress.deleteMany({ userId: auth.getId('premium') });
    serieA = await criarSerie('Serie Carrossel', 'hiqua');
    epA1 = await criarEpisodio(serieA, 1);
    epA2 = await criarEpisodio(serieA, 2);
  });

  const salvar = (episodeId, percent, seriesId = serieA, contentType = 'hiqua') =>
    request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`)
      .send({ seriesId, episodeId, contentType, percent });

  it('devolve uma linha por obra, com a serie embutida', async () => {
    await salvar(epA1, 0.5);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].series.title).toBe('Serie Carrossel');
    expect(res.body[0].percent).toBeCloseTo(0.5);
  });

  it('mostra o episodio mais recente quando ha varios da mesma obra', async () => {
    await salvar(epA2, 0.3);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(1);
    expect(String(res.body[0].episodeId)).toBe(String(epA2));
  });

  it('tira a obra do carrossel quando o ultimo episodio publicado termina', async () => {
    await salvar(epA2, 0.95); // conclui o episódio 2, que é o último
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(0);
  });

  it('traz a obra de volta quando sai capitulo novo', async () => {
    await criarEpisodio(serieA, 3);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(1);
  });

  it('no VCine so mostra o que esta entre 10% e 90%', async () => {
    const serieV = await criarSerie('Curta Vertical', 'vcine');
    const epV = await criarEpisodio(serieV, 1);

    await salvar(epV, 0.05, serieV, 'vcine');
    let res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieV))).toBe(false);

    await salvar(epV, 0.5, serieV, 'vcine');
    res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieV))).toBe(true);
  });

  it('ignora progresso parado ha mais de 90 dias', async () => {
    const antigo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    // { timestamps: false }: sem isso, o hook de timestamps do Mongoose
    // sobrescreve nosso `updatedAt` manual com a hora atual em todo updateMany
    // (comportamento do schema `{ timestamps: true }`, independente do que já
    // vier em $set) e o teste nunca conseguiria simular progresso antigo.
    await ReadingProgress.updateMany(
      { userId: auth.getId('premium') },
      { $set: { updatedAt: antigo } },
      { timestamps: false },
    );

    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body).toHaveLength(0);
  });

  it('nunca mistura o progresso de identidades diferentes', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send({ seriesId: serieA, episodeId: epA1, contentType: 'hiqua', percent: 0.6 });

    const doVisitante = await request(app).get('/api/me/continue').set('X-Anonymous-Id', ANON);
    const deOutroVisitante = await request(app)
      .get('/api/me/continue')
      .set('X-Anonymous-Id', '99999999-8888-4777-8666-555555555555');

    expect(doVisitante.body.length).toBeGreaterThan(0);
    expect(deOutroVisitante.body).toHaveLength(0);
  });

  // Achado IMPORTANT da revisão final: despublicar é a alavanca de emergência
  // do cliente (pedido de terceiros, direitos autorais, conteúdo problemático)
  // — e, ao contrário do catálogo (routes/content.js) e dos favoritos
  // (routes/favorites.js), o carrossel não filtrava por isPublished.
  it('some do carrossel quando a obra e despublicada', async () => {
    const Series = require('../../models/Series');
    const serieSumindo = await criarSerie('Obra Que Sera Despublicada', 'hiqua');
    const epSumindo = await criarEpisodio(serieSumindo, 1);
    await salvar(epSumindo, 0.4, serieSumindo, 'hiqua');

    let res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieSumindo))).toBe(true);

    await Series.findByIdAndUpdate(serieSumindo, { isPublished: false });

    res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieSumindo))).toBe(false);
  });
});

// Regressão dos dois achados "Important" da revisão da Task 4. Massa criada
// direto pelos models (sem passar pelas rotas de conteúdo) — mais rápido, e
// o que testamos aqui é a regra de agrupamento/corte, não as rotas em si.
describe('GET /api/me/continue — regras de escala (regressão da revisão)', () => {
  const ReadingProgress = require('../../models/ReadingProgress');
  const Series = require('../../models/Series');
  const Episode = require('../../models/Episode');
  const mongoose = require('mongoose');

  it('uma obra com muitas linhas recentes nao empurra outra obra (com so 1 linha, mais antiga) para fora', async () => {
    const ANON_LINHAS = 'bbbbbbbb-1111-4222-8333-555555555555';
    const QTD = 210; // mais que o antigo `.limit(200)` sobre linhas brutas

    const serieCheia = await Series.create({
      title: 'Obra Relida Muitas Vezes', genre: 'Teste', content_type: 'hiqua', isPublished: true,
    });
    const serieRara = await Series.create({
      title: 'Obra Rara', genre: 'Teste', content_type: 'hiqua', isPublished: true,
    });

    const episodios = Array.from({ length: QTD }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      seriesId: serieCheia._id,
      episode_number: i + 1,
      title: `Cap ${i + 1}`,
    }));
    await Episode.insertMany(episodios);

    const agora = Date.now();
    // 210 linhas de progresso recentes, todas da mesma obra (releitura em
    // massa). insertMany não passa por save(), então o `updatedAt` explícito
    // aqui é respeitado (diferente de create()/save(), que sempre sobrescreve
    // em documento novo).
    const linhasCheia = episodios.map((ep, i) => ({
      anonymousId: ANON_LINHAS,
      seriesId: serieCheia._id,
      episodeId: ep._id,
      contentType: 'hiqua',
      percent: 0.3,
      updatedAt: new Date(agora - i * 1000),
      createdAt: new Date(agora - i * 1000),
    }));
    await ReadingProgress.insertMany(linhasCheia);

    const epRara = await Episode.create({ seriesId: serieRara._id, episode_number: 1, title: 'Cap 1' });
    // Mais antiga que as 210 linhas acima, mas ainda dentro da janela de
    // poda de 90 dias — é a linha que o antigo `.limit(200)` sobre linhas
    // (em vez de obras) engolia.
    await ReadingProgress.insertMany([{
      anonymousId: ANON_LINHAS,
      seriesId: serieRara._id,
      episodeId: epRara._id,
      contentType: 'hiqua',
      percent: 0.2,
      updatedAt: new Date(agora - (QTD + 100) * 1000),
      createdAt: new Date(agora - (QTD + 100) * 1000),
    }]);

    const res = await request(app).get('/api/me/continue').set('X-Anonymous-Id', ANON_LINHAS);

    expect(res.status).toBe(200);
    expect(res.body.some(r => String(r.seriesId) === String(serieRara._id))).toBe(true);
  });

  it('corta em 20 obras mesmo havendo mais candidatas dentro da janela (regra 5)', async () => {
    const ANON_TETO = 'cccccccc-1111-4222-8333-666666666666';
    const QTD_OBRAS = 25; // mais que o teto de 20

    const series = Array.from({ length: QTD_OBRAS }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      title: `Obra Teto ${i + 1}`,
      genre: 'Teste',
      content_type: 'hiqua',
      isPublished: true,
    }));
    await Series.insertMany(series);

    const episodios = series.map(s => ({
      _id: new mongoose.Types.ObjectId(),
      seriesId: s._id,
      episode_number: 1,
      title: 'Cap 1',
    }));
    await Episode.insertMany(episodios);

    const agora = Date.now();
    const linhas = series.map((s, i) => ({
      anonymousId: ANON_TETO,
      seriesId: s._id,
      episodeId: episodios[i]._id,
      contentType: 'hiqua',
      percent: 0.3,
      updatedAt: new Date(agora - i * 1000),
      createdAt: new Date(agora - i * 1000),
    }));
    await ReadingProgress.insertMany(linhas);

    const res = await request(app).get('/api/me/continue').set('X-Anonymous-Id', ANON_TETO);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(20);
  });

  // Achado IMPORTANT da revisão final: o teto de 20 somava os três tipos de
  // conteúdo juntos. Um usuário com 20 obras hiqua em andamento via o
  // carrossel do VCine vazio, mesmo tendo 1 obra vcine em dia. Passar
  // `contentType` filtra e aplica o teto só dentro daquele tipo.
  it('filtra e aplica o teto por contentType quando a query e passada (nao mistura abas)', async () => {
    const ANON_ABA = 'dddddddd-1111-4222-8333-888888888888';
    const QTD_HIQUA = 20; // já ocupa o teto global sozinho

    const seriesHiqua = Array.from({ length: QTD_HIQUA }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      title: `Obra Aba Hiqua ${i + 1}`,
      genre: 'Teste',
      content_type: 'hiqua',
      isPublished: true,
    }));
    await Series.insertMany(seriesHiqua);
    const episodiosHiqua = seriesHiqua.map(s => ({
      _id: new mongoose.Types.ObjectId(), seriesId: s._id, episode_number: 1, title: 'Cap 1',
    }));
    await Episode.insertMany(episodiosHiqua);

    const serieVcine = await Series.create({
      title: 'Obra Aba VCine', genre: 'Teste', content_type: 'vcine', isPublished: true,
    });
    const epVcine = await Episode.create({ seriesId: serieVcine._id, episode_number: 1, title: 'Cap 1' });

    const agora = Date.now();
    const linhasHiqua = seriesHiqua.map((s, i) => ({
      anonymousId: ANON_ABA,
      seriesId: s._id,
      episodeId: episodiosHiqua[i]._id,
      contentType: 'hiqua',
      percent: 0.3,
      updatedAt: new Date(agora - i * 1000), // todas mais recentes que a vcine
      createdAt: new Date(agora - i * 1000),
    }));
    await ReadingProgress.insertMany(linhasHiqua);
    // A obra vcine é a mais antiga de todas — sem filtro por tipo, o teto
    // global de 20 (já ocupado pelas 20 hiqua) a deixa de fora.
    await ReadingProgress.insertMany([{
      anonymousId: ANON_ABA,
      seriesId: serieVcine._id,
      episodeId: epVcine._id,
      contentType: 'vcine',
      percent: 0.5,
      updatedAt: new Date(agora - (QTD_HIQUA + 100) * 1000),
      createdAt: new Date(agora - (QTD_HIQUA + 100) * 1000),
    }]);

    const semFiltro = await request(app).get('/api/me/continue').set('X-Anonymous-Id', ANON_ABA);
    expect(semFiltro.body.some(r => String(r.seriesId) === String(serieVcine._id))).toBe(false);

    const abaVcine = await request(app)
      .get('/api/me/continue?contentType=vcine')
      .set('X-Anonymous-Id', ANON_ABA);
    expect(abaVcine.status).toBe(200);
    expect(abaVcine.body).toHaveLength(1);
    expect(String(abaVcine.body[0].seriesId)).toBe(String(serieVcine._id));

    const abaHiqua = await request(app)
      .get('/api/me/continue?contentType=hiqua')
      .set('X-Anonymous-Id', ANON_ABA);
    expect(abaHiqua.body).toHaveLength(20);
    expect(abaHiqua.body.every(r => r.contentType === 'hiqua')).toBe(true);
  });
});

// Achado CRITICAL da revisão final: a restauração de "onde parei" (leitor e
// player) usava GET /api/me/continue e procurava o episódio na lista — mas
// essa lista é podada (90 dias, 1 linha por obra, VCine 10-90%, teto de 20,
// obra concluída removida). Uma rota dedicada devolve a linha crua de UM
// episódio, sem nenhuma dessas regras de carrossel.
describe('GET /api/me/progress/:episodeId', () => {
  let serie, episodio, outroEpisodio;

  beforeAll(async () => {
    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Obra da Rota Unica', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body._id || s.body.id;

    const e = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: serie, episode_number: 1, title: 'Capitulo 1' });
    episodio = e.body._id || e.body.id;

    const e2 = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: serie, episode_number: 2, title: 'Capitulo 2' });
    outroEpisodio = e2.body._id || e2.body.id;
  });

  it('devolve a linha crua do episodio quando ha progresso salvo', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: episodio, contentType: 'hiqua', percent: 0.42, position: 7 });

    const res = await request(app)
      .get(`/api/me/progress/${episodio}`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body.percent).toBeCloseTo(0.42);
    expect(res.body.position).toBe(7);
    expect(String(res.body.episodeId)).toBe(String(episodio));
  });

  it('devolve null quando nao ha progresso salvo para o episodio', async () => {
    const res = await request(app)
      .get(`/api/me/progress/${outroEpisodio}`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  // Prova o ponto central do achado: o episódio não é o mais recente da obra
  // (o usuário voltou ao capítulo 1 depois de já ter lido o 2), então
  // GET /api/me/continue nunca devolveria essa linha — mas a rota dedicada
  // devolve, porque não aplica a regra "uma linha por obra".
  it('devolve o progresso mesmo quando nao e o episodio mais recente da obra (sem a poda do carrossel)', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: episodio, contentType: 'hiqua', percent: 0.55 });
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: outroEpisodio, contentType: 'hiqua', percent: 0.3 });

    // O carrossel só mostraria o capítulo 2 (mais recente) — a rota dedicada
    // ainda devolve o capítulo 1 corretamente.
    const carrossel = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(carrossel.body.every(r => String(r.episodeId) !== String(episodio))).toBe(true);

    const res = await request(app)
      .get(`/api/me/progress/${episodio}`)
      .set('Authorization', `Bearer ${auth.getToken('user')}`);
    expect(res.status).toBe(200);
    expect(res.body.percent).toBeCloseTo(0.55);
  });

  it('nunca mistura o progresso de identidades diferentes', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send({ seriesId: serie, episodeId: outroEpisodio, contentType: 'hiqua', percent: 0.6 });

    const doVisitante = await request(app)
      .get(`/api/me/progress/${outroEpisodio}`)
      .set('X-Anonymous-Id', ANON);
    expect(doVisitante.body.percent).toBeCloseTo(0.6);

    // A conta 'user' não gravou progresso nesse episódio (só o visitante) —
    // não pode enxergar a linha do visitante.
    const daConta = await request(app)
      .get(`/api/me/progress/${outroEpisodio}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(daConta.body).toBeNull();
  });

  it('recusa quem nao traz conta nem identificador de visitante', async () => {
    const res = await request(app).get(`/api/me/progress/${episodio}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/me/progress/claim', () => {
  const ReadingProgress = require('../../models/ReadingProgress');
  const mongoose = require('mongoose');
  const VISITANTE = '22222222-3333-4444-8555-666666666666';
  let serie, ep1, ep2;

  beforeAll(async () => {
    await ReadingProgress.deleteMany({ userId: auth.getId('user') });
    await ReadingProgress.deleteMany({ anonymousId: VISITANTE });

    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Serie da Migracao', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body._id || s.body.id;

    for (const n of [1, 2]) {
      const e = await request(app)
        .post('/api/content/episodes')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ seriesId: serie, episode_number: n, title: `Capitulo ${n}` });
      if (n === 1) ep1 = e.body._id || e.body.id;
      else ep2 = e.body._id || e.body.id;
    }
  });

  it('move o progresso do visitante para a conta', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: ep1, contentType: 'hiqua', percent: 0.6 });

    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.movidos).toBe(1);

    const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: ep1 });
    expect(naConta.percent).toBeCloseTo(0.6);

    const sobrou = await ReadingProgress.findOne({ anonymousId: VISITANTE, episodeId: ep1 });
    expect(sobrou).toBeNull();
  });

  it('quando os dois lados tem o mesmo episodio, vence o maior percentual', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: ep2, contentType: 'hiqua', percent: 0.8 });

    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: ep2, contentType: 'hiqua', percent: 0.3 });

    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.fundidos).toBe(1);

    const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: ep2 });
    expect(naConta.percent).toBeCloseTo(0.8); // o da conta era maior e prevalece
  });

  it('quando o visitante tem percentual maior, vence o visitante (percent, position e completed atualizam)', async () => {
    const ep3 = new mongoose.Types.ObjectId().toString();

    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: ep3, contentType: 'hiqua', percent: 0.2, position: 10 });

    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: ep3, contentType: 'hiqua', percent: 0.95, position: 500 });

    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.fundidos).toBe(1);

    const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: ep3 });
    expect(naConta.percent).toBeCloseTo(0.95); // o do visitante era maior e prevalece
    expect(naConta.position).toBe(500);
    expect(naConta.completed).toBe(true); // prova que o .save() rodou e o hook recalculou

    const sobrou = await ReadingProgress.findOne({ anonymousId: VISITANTE, episodeId: ep3 });
    expect(sobrou).toBeNull();
  });

  it('recupera de corrida quando um documento da conta surge entre o snapshot e a escrita (E11000)', async () => {
    const epCorrida = new mongoose.Types.ObjectId().toString();

    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: epCorrida, contentType: 'hiqua', percent: 0.4 });

    // Simula o concorrente: um PUT da própria conta que cria o documento
    // {userId, episodeId} bem entre o snapshot de `daConta` (que não via esse
    // documento) e o updateOne que reatribuiria o documento do visitante — o
    // índice único parcial barra a reatribuição com E11000, a mesma classe de
    // corrida que saveProgress já trata para o seu próprio índice.
    const spy = vi.spyOn(ReadingProgress, 'updateOne').mockImplementationOnce(async () => {
      await ReadingProgress.create({
        userId: auth.getId('user'),
        seriesId: serie,
        episodeId: epCorrida,
        contentType: 'hiqua',
        percent: 0.1,
        position: 0,
      });
      const err = new Error('E11000 duplicate key error collection');
      err.code = 11000;
      throw err;
    });

    try {
      const res = await request(app)
        .post('/api/me/progress/claim')
        .set('Authorization', `Bearer ${auth.getToken('user')}`)
        .send({ anonymousId: VISITANTE });

      // 200, não 500: o item que colidiu é tratado como fusão genuína, não
      // aborta a chamada nem descarta os contadores já acumulados.
      expect(res.status).toBe(200);
      expect(res.body.fundidos).toBe(1);

      const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: epCorrida });
      expect(naConta.percent).toBeCloseTo(0.4); // visitante (0.4) venceu o concorrente (0.1)

      const sobrou = await ReadingProgress.findOne({ anonymousId: VISITANTE, episodeId: epCorrida });
      expect(sobrou).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('e idempotente: chamar de novo nao duplica nem regride', async () => {
    const antes = await ReadingProgress.countDocuments({ userId: auth.getId('user') });
    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.movidos).toBe(0);
    expect(await ReadingProgress.countDocuments({ userId: auth.getId('user') })).toBe(antes);
  });

  it('exige conta: visitante nao pode reivindicar', async () => {
    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ anonymousId: VISITANTE });
    expect(res.status).toBe(401);
  });

  // Achado IMPORTANT da revisão final: o `updateOne` da migração usa o
  // schema com `{ timestamps: true }`, que por padrão carimba `updatedAt:
  // now` em TODO updateOne — sobrescrevendo a data original de cada linha
  // migrada. Como `buildContinueList` ordena por `updatedAt` pra escolher a
  // linha mais recente de cada obra, todas as linhas migradas empatando na
  // mesma "agora" quebra essa ordenação (o Mongo escolhe arbitrariamente
  // entre as empatadas). `{ timestamps: false }` no updateOne preserva a
  // data original.
  it('a migracao preserva o updatedAt original da linha (nao embaralha a ordem do carrossel)', async () => {
    const bcrypt = require('bcrypt');
    const User = require('../../models/User');
    const VISITANTE_ORDEM = '44444444-1111-4222-8333-999999999999';

    const antigo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 dias atrás
    const [linha] = await ReadingProgress.insertMany([{
      anonymousId: VISITANTE_ORDEM,
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
      updatedAt: antigo,
      createdAt: antigo,
    }]);

    const contaNova = await User.create({
      email: `ordem-migracao-${Date.now()}@lorflux.test`,
      passwordHash: await bcrypt.hash('OrdemMigracao@123', 10),
      nome: 'Conta da Migração',
    });

    const progressService = require('../../services/progressService');
    const resumo = await progressService.claimAnonymousProgress(contaNova._id.toString(), VISITANTE_ORDEM);
    expect(resumo.movidos).toBe(1);

    const migrada = await ReadingProgress.findById(linha._id);
    expect(migrada.updatedAt.getTime()).toBe(antigo.getTime());
  });
});

describe('LGPD do progresso', () => {
  const ReadingProgress = require('../../models/ReadingProgress');

  it('o export do titular inclui o progresso de leitura', async () => {
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('readingProgress');
    expect(Array.isArray(res.body.readingProgress)).toBe(true);
  });

  // Achado da revisão final (item 9): o segundo exato onde o titular parou de
  // assistir também é dado dele (LGPD, Art. 18) — o export trazia só `percent`.
  it('o export do titular inclui o position exato de cada progresso', async () => {
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body.readingProgress.length).toBeGreaterThan(0);
    expect(res.body.readingProgress.every(p => typeof p.position === 'number')).toBe(true);
  });

  it('excluir a conta apaga o progresso junto', async () => {
    const bcrypt = require('bcrypt');
    const User = require('../../models/User');
    const descartavel = await User.create({
      email: 'progresso-lgpd@lorflux.test',
      passwordHash: await bcrypt.hash('Descartavel@123', 10),
      nome: 'Conta Descartavel',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'progresso-lgpd@lorflux.test', password: 'Descartavel@123' });
    const token = login.body.accessToken;

    const mongoose = require('mongoose');
    await ReadingProgress.create({
      userId: descartavel._id,
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    });

    await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Descartavel@123' });

    expect(await ReadingProgress.countDocuments({ userId: descartavel._id })).toBe(0);
  });
});
