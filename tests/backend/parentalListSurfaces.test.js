/**
 * Testes: aplicação do filtro parental nas SEIS superfícies de LISTA (Fase 5,
 * Bloco 2, Task 4). Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.3, seções "Superfícies filtradas (lista)", "Guest", "Exceções ao
 * filtro"). Ledger: rulings P3 (semântica POSITIVA), P5 (admin bypassa
 * getFiltroParental; DONO não — "nas listas o filtro vale para todos").
 *
 * As seis superfícies: GET /api/content/series, GET /api/content/search
 * (ramo séries), GET /api/content/agenda, GET /api/content/recommendations
 * (candidatos + fallback), GET /api/favorites, GET /api/me/continue.
 *
 * Unit tests de `utils/parentalFilter.js` (predicado/fragmento/serieVisivelPara)
 * estão em tests/backend/parentalFilter.test.js — aqui só a APLICAÇÃO nas
 * rotas, matriz filtro × superfície × perfil.
 *
 * NÃO cobre: episódios da série, episódio/leitor, signed-url, ramo EPISÓDIOS
 * da busca, push, writes de engajamento (favoritar/votar/SR) — tudo isso é
 * T5 (doc único).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let User, Series, Channel, Episode, Favorite, ReadingProgress, SeriesScore;
let recommendationService;

const SENHA = 'Senha@123';
let contador = 0;
function unico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}`;
}

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  Episode = require('../../models/Episode');
  Favorite = require('../../models/Favorite');
  ReadingProgress = require('../../models/ReadingProgress');
  SeriesScore = require('../../models/SeriesScore');
  recommendationService = require('../../services/recommendationService');
  await auth.createUsers(app); // 'admin'/'user' genéricos de outros describes (não usados aqui, mas mantém o padrão do helper)
});

afterAll(() => db.closeDatabase());

// Isolamento por teste: só o CONTEÚDO é limpo (Series/Channel/Episode/
// Favorite/ReadingProgress/SeriesScore) — os USUÁRIOS DE PERFIL abaixo são
// criados UMA VEZ (beforeAll seguinte) e precisam sobreviver entre testes,
// porque getFiltroParental/serieVisivelPara fazem um User.findById DE
// VERDADE (não confiam só no papel/role do JWT) — um db.clearDatabase()
// cheio apagaria esses documentos e toda conta cairia no default
// (young, sem bloqueio), mascarando exatamente o que a matriz testa.
beforeEach(async () => {
  await Promise.all([
    Series.deleteMany({}),
    Channel.deleteMany({}),
    Episode.deleteMany({}),
    Favorite.deleteMany({}),
    ReadingProgress.deleteMany({}),
    SeriesScore.deleteMany({}),
  ]);
});

// ─── perfis reutilizados pela matriz inteira ─────────────────────────────
async function criarPerfil({ classificacaoEtaria = 'young', tagsBloqueadas = [], role = 'user' } = {}) {
  const email = `${unico('perfil')}@lorflux.test`;
  const passwordHash = await bcrypt.hash(SENHA, 10);
  const user = await User.create({
    email, passwordHash, nome: 'Perfil Lista', role,
    parental: { classificacaoEtaria, tagsBloqueadas },
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: SENHA });
  return { id: user._id.toString(), token: login.body.accessToken };
}

let kids, teen, young, youngTagBloqueada, adminRestritivo;

beforeAll(async () => {
  kids = await criarPerfil({ classificacaoEtaria: 'kids' });
  teen = await criarPerfil({ classificacaoEtaria: 'teen' });
  young = await criarPerfil({ classificacaoEtaria: 'young' });
  youngTagBloqueada = await criarPerfil({ classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] });
  // Preferências DELIBERADAMENTE restritivas — prova que o bypass de admin é
  // pela role, não porque o admin "por acaso" não tem nada bloqueado.
  adminRestritivo = await criarPerfil({ classificacaoEtaria: 'kids', tagsBloqueadas: ['acao'], role: 'admin' });
});

function authed(req, perfil) {
  return perfil?.token ? req.set('Authorization', `Bearer ${perfil.token}`) : req;
}
const idsOf = (lista) => lista.map((s) => String(s._id));

// ─── fixtures de conteúdo ─────────────────────────────────────────────────
async function criarSerie(tituloBase, overrides = {}) {
  return Series.create({
    title: `${tituloBase} ${unico('x')}`,
    genre: 'Teste',
    content_type: 'hiqua',
    isPublished: true,
    ...overrides,
  });
}

async function tornarAusente(id) {
  await Series.updateOne({ _id: id }, { $unset: { content_rating: 1, tags: 1 } });
}

/** kids/teen/young/nulo/ausente — as 5 classificações da matriz. */
async function criarConjuntoClassificacoes(prefixo, extra = {}) {
  const kidsS = await criarSerie(`${prefixo} Kids`, { content_rating: 'kids', ...extra });
  const teenS = await criarSerie(`${prefixo} Teen`, { content_rating: 'teen', ...extra });
  const youngS = await criarSerie(`${prefixo} Young`, { content_rating: 'young', ...extra });
  const nuloS = await criarSerie(`${prefixo} Nulo`, { content_rating: null, ...extra });
  const ausenteS = await criarSerie(`${prefixo} Ausente`, { ...extra });
  await tornarAusente(ausenteS._id);
  return { kidsS, teenS, youngS, nuloS, ausenteS };
}

async function criarSerieTag(prefixo, tag, extra = {}) {
  return criarSerie(`${prefixo} Tag`, { content_rating: 'young', tags: [tag], ...extra });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) GET /api/content/series
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/series — filtro parental', () => {
  it('kids só vê content_rating kids', async () => {
    const { kidsS, teenS, youngS } = await criarConjuntoClassificacoes('SerieLista1');
    const res = await authed(request(app).get('/api/content/series?type=hiqua'), kids);
    const ids = idsOf(res.body);
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
  });

  it('teen vê kids/teen mas NÃO young/null/AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('SerieLista2');
    const res = await authed(request(app).get('/api/content/series?type=hiqua'), teen);
    const ids = idsOf(res.body);
    expect(ids).toContain(String(kidsS._id));
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê TUDO, inclusive content_rating null e campo AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('SerieLista3');
    const res = await authed(request(app).get('/api/content/series?type=hiqua'), young);
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('tag bloqueada some da lista mesmo com rating permitido', async () => {
    const tagueada = await criarSerieTag('SerieLista4', 'acao');
    const semTag = await criarSerie('SerieLista4 SemTag', { content_rating: 'young' });
    const res = await authed(request(app).get('/api/content/series?type=hiqua'), youngTagBloqueada);
    const ids = idsOf(res.body);
    expect(ids).not.toContain(String(tagueada._id));
    expect(ids).toContain(String(semTag._id));
  });

  it('anônimo vê tudo — sem filtro nenhum', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('SerieLista5');
    const res = await request(app).get('/api/content/series?type=hiqua');
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê tudo nas listas — mesmo com classificacaoEtaria=kids e tag bloqueada nas PRÓPRIAS preferências', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('SerieLista6');
    const tagueada = await criarSerieTag('SerieLista6', 'acao');
    const res = await authed(request(app).get('/api/content/series?type=hiqua'), adminRestritivo);
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS, tagueada].forEach((s) => expect(ids).toContain(String(s._id)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) GET /api/content/search — ramo SÉRIES
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/search (ramo séries) — filtro parental', () => {
  // O ramo EPISÓDIOS (routes/content.js:44-51) fica de fora desta task — a
  // T5 (post-filter com serieVisivelPara na série populada) precisa do MESMO
  // filtroParental aqui computado; ver comentário deixado em routes/content.js.

  it('kids só vê séries kids no resultado da busca', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('BuscaMatrix7');
    const res = await authed(request(app).get('/api/content/search?q=BuscaMatrix7'), kids);
    const ids = idsOf(res.body.series);
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
  });

  it('teen não vê young/null/AUSENTE na busca', async () => {
    const { teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('BuscaMatrix8');
    const res = await authed(request(app).get('/api/content/search?q=BuscaMatrix8'), teen);
    const ids = idsOf(res.body.series);
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê tudo na busca, inclusive null e AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('BuscaMatrix9');
    const res = await authed(request(app).get('/api/content/search?q=BuscaMatrix9'), young);
    const ids = idsOf(res.body.series);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('tag bloqueada some da busca', async () => {
    const tagueada = await criarSerieTag('BuscaMatrix10', 'acao');
    const res = await authed(request(app).get('/api/content/search?q=BuscaMatrix10'), youngTagBloqueada);
    expect(idsOf(res.body.series)).not.toContain(String(tagueada._id));
  });

  it('anônimo vê tudo na busca', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('BuscaMatrix11');
    const res = await request(app).get('/api/content/search?q=BuscaMatrix11');
    const ids = idsOf(res.body.series);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê tudo na busca, mesmo com preferências restritivas próprias', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('BuscaMatrix12');
    const res = await authed(request(app).get('/api/content/search?q=BuscaMatrix12'), adminRestritivo);
    const ids = idsOf(res.body.series);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) GET /api/content/agenda
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/agenda — filtro parental', () => {
  const DIA = 3;
  function idsDoDia(res) {
    return res.body[String(DIA)].map((s) => String(s._id));
  }

  it('kids só vê kids na agenda', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('Agenda13', { releaseDay: DIA });
    const res = await authed(request(app).get('/api/content/agenda'), kids);
    const ids = idsDoDia(res);
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
  });

  it('teen não vê young/null/AUSENTE na agenda', async () => {
    const { teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Agenda14', { releaseDay: DIA });
    const res = await authed(request(app).get('/api/content/agenda'), teen);
    const ids = idsDoDia(res);
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê tudo na agenda, inclusive null e AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Agenda15', { releaseDay: DIA });
    const res = await authed(request(app).get('/api/content/agenda'), young);
    const ids = idsDoDia(res);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('tag bloqueada some da agenda', async () => {
    const tagueada = await criarSerieTag('Agenda16', 'acao', { releaseDay: DIA });
    const res = await authed(request(app).get('/api/content/agenda'), youngTagBloqueada);
    expect(idsDoDia(res)).not.toContain(String(tagueada._id));
  });

  it('anônimo vê tudo na agenda (rota ganhou optionalAuth mas continua pública)', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Agenda17', { releaseDay: DIA });
    const res = await request(app).get('/api/content/agenda');
    const ids = idsDoDia(res);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê tudo na agenda, mesmo com preferências restritivas próprias', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Agenda18', { releaseDay: DIA });
    const res = await authed(request(app).get('/api/content/agenda'), adminRestritivo);
    const ids = idsDoDia(res);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4) GET /api/content/recommendations — candidatos (:1335) + fallback (:259)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/content/recommendations — filtro parental', () => {
  async function criarScore(seriesId, overrides = {}) {
    return SeriesScore.create({
      seriesId, contentType: 'hiqua', scoreFinal: 0, confidence: 0, potentialScore: 0,
      qualidade: 0, retencao: 0, descoberta: 0, leitoresUnicos: 0, penalizacoes: [],
      computedAt: new Date(), ...overrides,
    });
  }

  it('kids só vê kids nas recomendações', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('Recom19');
    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), kids);
    const ids = idsOf(res.body);
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
  });

  it('teen não vê young/null/AUSENTE nas recomendações', async () => {
    const { teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Recom20');
    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), teen);
    const ids = idsOf(res.body);
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê tudo nas recomendações, inclusive null e AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Recom21');
    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), young);
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('tag bloqueada some das recomendações', async () => {
    const tagueada = await criarSerieTag('Recom22', 'acao');
    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), youngTagBloqueada);
    expect(idsOf(res.body)).not.toContain(String(tagueada._id));
  });

  it('anônimo vê tudo nas recomendações', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Recom23');
    const res = await request(app).get('/api/content/recommendations?type=hiqua');
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê tudo nas recomendações, mesmo com preferências restritivas próprias', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Recom24');
    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), adminRestritivo);
    const ids = idsOf(res.body);
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  // Spec: "bloqueada no TOPO do score não aparece e a cota completa com a
  // próxima". serieBloqueada tem o MAIOR scoreFinal×confidence do catálogo —
  // sem o filtro ela abriria o feed. Como o fragmento entra DENTRO do
  // Series.find de buildRecommendations (candidatos, :1335), ela nunca é
  // sequer CARREGADA: N (base das cotas 50/30/20) já nasce sem ela, e as
  // duas séries visíveis restantes preenchem a cota inteira sozinhas.
  it('candidatos: série bloqueada no TOPO do score não aparece — a cota completa com as próximas', async () => {
    const bloqueada = await criarSerie('RecomCota Bloqueada', { content_rating: 'young' });
    const segunda = await criarSerie('RecomCota Segunda', { content_rating: 'teen' });
    const terceira = await criarSerie('RecomCota Terceira', { content_rating: 'teen' });
    await criarScore(bloqueada._id, { scoreFinal: 100, confidence: 1 }); // topo absoluto
    await criarScore(segunda._id, { scoreFinal: 50, confidence: 0.5 });
    await criarScore(terceira._id, { scoreFinal: 10, confidence: 0.5 });

    const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), teen); // teen não vê 'young'
    const ids = idsOf(res.body);
    expect(ids).not.toContain(String(bloqueada._id));
    expect(ids).toContain(String(segunda._id));
    expect(ids).toContain(String(terceira._id));
    expect(ids).toHaveLength(2); // a cota inteira veio das duas restantes — nenhum buraco
  });

  // Spec: "fallback filtra (force o fallback como os testes do B4 fazem —
  // spy que lança em buildRecommendations)". O fragmento é calculado UMA VEZ
  // na rota e reaproveitado tanto na chamada normal quanto no catch — aqui
  // provamos que o catch (Series.find cru, routes/content.js:259) recebe o
  // MESMO fragmento.
  it('fallback (spy rejeitando buildRecommendations) também filtra pelo perfil', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('RecomFallback25');
    const spy = vi.spyOn(recommendationService, 'buildRecommendations')
      .mockRejectedValueOnce(new Error('Falha simulada de recomendacao'));
    try {
      const res = await authed(request(app).get('/api/content/recommendations?type=hiqua'), kids);
      expect(res.status).toBe(200);
      const ids = idsOf(res.body);
      expect(ids).toContain(String(kidsS._id));
      expect(ids).not.toContain(String(teenS._id));
    } finally {
      spy.mockRestore();
    }
  });

  it('fallback também respeita anônimo (sem filtro) e admin (sem filtro)', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('RecomFallback26');
    const spy = vi.spyOn(recommendationService, 'buildRecommendations')
      .mockRejectedValueOnce(new Error('Falha simulada de recomendacao'))
      .mockRejectedValueOnce(new Error('Falha simulada de recomendacao'));
    try {
      const resAnon = await request(app).get('/api/content/recommendations?type=hiqua');
      expect(idsOf(resAnon.body)).toEqual(expect.arrayContaining([String(kidsS._id), String(teenS._id)]));

      const resAdmin = await authed(request(app).get('/api/content/recommendations?type=hiqua'), adminRestritivo);
      expect(idsOf(resAdmin.body)).toEqual(expect.arrayContaining([String(kidsS._id), String(teenS._id)]));
    } finally {
      spy.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5) GET /api/favorites
// ═══════════════════════════════════════════════════════════════════════════
// Sem caso "anônimo": a rota exige verifyToken (401 sem conta) — não há
// concpeito de "favoritos de visitante" para testar aqui.

describe('GET /api/favorites — filtro parental', () => {
  async function favoritar(perfil, serie) {
    const res = await authed(request(app).post(`/api/favorites/${serie._id}`), perfil);
    expect(res.status).toBe(200);
  }

  it('kids só vê os PRÓPRIOS favoritos kids', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('Favoritos27');
    await favoritar(kids, kidsS);
    await favoritar(kids, teenS);
    const res = await authed(request(app).get('/api/favorites'), kids);
    const ids = res.body.map((i) => String(i.seriesId));
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
  });

  it('teen não vê young/null/AUSENTE nos favoritos', async () => {
    const { teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Favoritos28');
    await favoritar(teen, teenS);
    await favoritar(teen, youngS);
    await favoritar(teen, nuloS);
    await favoritar(teen, ausenteS);
    const res = await authed(request(app).get('/api/favorites'), teen);
    const ids = res.body.map((i) => String(i.seriesId));
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê todos os próprios favoritos, inclusive null e AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Favoritos29');
    for (const s of [kidsS, teenS, youngS, nuloS, ausenteS]) await favoritar(young, s);
    const res = await authed(request(app).get('/api/favorites'), young);
    const ids = res.body.map((i) => String(i.seriesId));
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê todos os próprios favoritos, mesmo com preferências restritivas próprias', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Favoritos30');
    for (const s of [kidsS, teenS, youngS, nuloS, ausenteS]) await favoritar(adminRestritivo, s);
    const res = await authed(request(app).get('/api/favorites'), adminRestritivo);
    const ids = res.body.map((i) => String(i.seriesId));
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  // Spec: "favorito persiste e volta ao desbloquear" — o Favorite NÃO é
  // apagado; ele só some da LISTA enquanto a tag está bloqueada.
  it('obra favoritada → bloquear tag → some da lista → desbloquear → volta (o Favorite nunca é apagado)', async () => {
    const mutavel = await criarPerfil({ classificacaoEtaria: 'young', tagsBloqueadas: [] });
    const tagueada = await criarSerieTag('Favoritos31', 'acao');
    await favoritar(mutavel, tagueada);

    let res = await authed(request(app).get('/api/favorites'), mutavel);
    expect(res.body.map((i) => String(i.seriesId))).toContain(String(tagueada._id));

    await User.findByIdAndUpdate(mutavel.id, { $set: { 'parental.tagsBloqueadas': ['acao'] } });
    res = await authed(request(app).get('/api/favorites'), mutavel);
    expect(res.body.map((i) => String(i.seriesId))).not.toContain(String(tagueada._id));

    // O documento Favorite continua no banco — só a LISTA filtrou.
    const favoritoNoBanco = await Favorite.findOne({ userId: mutavel.id, seriesId: tagueada._id }).lean();
    expect(favoritoNoBanco).toBeTruthy();

    await User.findByIdAndUpdate(mutavel.id, { $set: { 'parental.tagsBloqueadas': [] } });
    res = await authed(request(app).get('/api/favorites'), mutavel);
    expect(res.body.map((i) => String(i.seriesId))).toContain(String(tagueada._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6) GET /api/me/continue
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/me/continue — filtro parental', () => {
  async function darProgresso(identidade, serie, { percent = 0.5 } = {}) {
    const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Ep 1', status: 'published' });
    await ReadingProgress.create({ ...identidade, seriesId: serie._id, episodeId: ep._id, contentType: 'hiqua', percent });
  }
  function identidadeDe(perfil) { return { userId: perfil.id }; }

  it('kids só vê o próprio progresso em obra kids', async () => {
    const { kidsS, teenS } = await criarConjuntoClassificacoes('Continuar32');
    await darProgresso(identidadeDe(kids), kidsS);
    await darProgresso(identidadeDe(kids), teenS);
    const res = await authed(request(app).get('/api/me/continue?contentType=hiqua'), kids);
    const ids = res.body.map((i) => String(i.seriesId));
    expect(ids).toContain(String(kidsS._id));
    expect(ids).not.toContain(String(teenS._id));
  });

  it('teen não vê young/null/AUSENTE em continuar', async () => {
    const { teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Continuar33');
    for (const s of [teenS, youngS, nuloS, ausenteS]) await darProgresso(identidadeDe(teen), s);
    const res = await authed(request(app).get('/api/me/continue?contentType=hiqua'), teen);
    const ids = res.body.map((i) => String(i.seriesId));
    expect(ids).toContain(String(teenS._id));
    expect(ids).not.toContain(String(youngS._id));
    expect(ids).not.toContain(String(nuloS._id));
    expect(ids).not.toContain(String(ausenteS._id));
  });

  it('young vê tudo em continuar, inclusive null e AUSENTE', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Continuar34');
    for (const s of [kidsS, teenS, youngS, nuloS, ausenteS]) await darProgresso(identidadeDe(young), s);
    const res = await authed(request(app).get('/api/me/continue?contentType=hiqua'), young);
    const ids = res.body.map((i) => String(i.seriesId));
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('tag bloqueada some de continuar', async () => {
    const tagueada = await criarSerieTag('Continuar35', 'acao');
    await darProgresso(identidadeDe(youngTagBloqueada), tagueada);
    const res = await authed(request(app).get('/api/me/continue?contentType=hiqua'), youngTagBloqueada);
    expect(res.body.map((i) => String(i.seriesId))).not.toContain(String(tagueada._id));
  });

  it('anônimo (visitante com X-Anonymous-Id) vê tudo em continuar', async () => {
    const anonymousId = 'aaaaaaa0-1111-4bbb-8ccc-0123456789ab';
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Continuar36');
    for (const s of [kidsS, teenS, youngS, nuloS, ausenteS]) await darProgresso({ anonymousId }, s);
    const res = await request(app).get('/api/me/continue?contentType=hiqua').set('X-Anonymous-Id', anonymousId);
    const ids = res.body.map((i) => String(i.seriesId));
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });

  it('admin vê tudo em continuar, mesmo com preferências restritivas próprias', async () => {
    const { kidsS, teenS, youngS, nuloS, ausenteS } = await criarConjuntoClassificacoes('Continuar37');
    for (const s of [kidsS, teenS, youngS, nuloS, ausenteS]) await darProgresso(identidadeDe(adminRestritivo), s);
    const res = await authed(request(app).get('/api/me/continue?contentType=hiqua'), adminRestritivo);
    const ids = res.body.map((i) => String(i.seriesId));
    [kidsS, teenS, youngS, nuloS, ausenteS].forEach((s) => expect(ids).toContain(String(s._id)));
  });
});
