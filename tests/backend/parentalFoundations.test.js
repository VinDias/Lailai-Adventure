/**
 * Testes: fundações do Bloco 2 — vocabulário de tags, User.parental,
 * Series.content_rating (Fase 5, Bloco 2, Task 1).
 * Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md (rev.3)
 *
 * Escopo desta task (NÃO cobre): validator de tags 0–8 do vocabulário (T2),
 * rotas /api/parental e PIN (T3), filtro de conteúdo (T4/T5). Aqui só as
 * fundações de modelo + a garantia de que pinHash não vaza em NENHUM shape
 * já existente hoje (auth/me, admin/users, export, login/register).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');
const { VOCABULARIO, SLUGS, isSlugValido } = require('../../utils/tagsVocabulario');

let app;
let User, Series, Channel;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Series = require('../../models/Series');
  Channel = require('../../models/Channel');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

let contador = 0;
function emailUnico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}@lorflux.test`;
}

// ═══════════════════════════════════════════════════════════════════════════
// utils/tagsVocabulario — fonte ÚNICA dos slugs (backend E frontend importam
// o mesmo JSON — drift entre camadas é impossível por construção)
// ═══════════════════════════════════════════════════════════════════════════

describe('utils/tagsVocabulario — vocabulário fechado de 19 tags', () => {
  const SLUGS_ESPERADOS = [
    'romance', 'drama', 'comedia', 'acao', 'aventura', 'fantasia', 'dark-fantasy',
    'ficcao-cientifica', 'terror', 'thriller', 'misterio', 'crime', 'historico',
    'sobrenatural', 'super-herois', 'slice-of-life', 'high-school', 'psicologico', 'lgbtqia+',
  ];

  it('tem exatamente 19 entradas', () => {
    expect(Array.isArray(VOCABULARIO)).toBe(true);
    expect(VOCABULARIO.length).toBe(19);
  });

  it('os slugs batem EXATAMENTE com a letra da spec (mesmos valores)', () => {
    const slugs = VOCABULARIO.map(v => v.slug);
    expect(slugs.slice().sort()).toEqual(SLUGS_ESPERADOS.slice().sort());
  });

  it('cada entrada tem {slug, rotuloPt} não vazios e slug sem duplicata', () => {
    const vistos = new Set();
    VOCABULARIO.forEach(v => {
      expect(typeof v.slug).toBe('string');
      expect(v.slug.trim().length).toBeGreaterThan(0);
      expect(typeof v.rotuloPt).toBe('string');
      expect(v.rotuloPt.trim().length).toBeGreaterThan(0);
      expect(vistos.has(v.slug)).toBe(false);
      vistos.add(v.slug);
    });
  });

  it('rótulos PT batem com o PDF (amostra dos slugs com hífen/acento/+)', () => {
    const mapa = Object.fromEntries(VOCABULARIO.map(v => [v.slug, v.rotuloPt]));
    expect(mapa['romance']).toBe('Romance');
    expect(mapa['comedia']).toBe('Comédia');
    expect(mapa['acao']).toBe('Ação');
    expect(mapa['dark-fantasy']).toBe('Dark Fantasy');
    expect(mapa['ficcao-cientifica']).toBe('Ficção Científica');
    expect(mapa['super-herois']).toBe('Super-heróis');
    expect(mapa['slice-of-life']).toBe('Slice of Life');
    expect(mapa['high-school']).toBe('High School');
    expect(mapa['psicologico']).toBe('Psicológico');
    expect(mapa['lgbtqia+']).toBe('LGBTQIA+');
  });

  it('SLUGS contém exatamente os 19 slugs do vocabulário', () => {
    expect(SLUGS.size).toBe(19);
    VOCABULARIO.forEach(v => expect(SLUGS.has(v.slug)).toBe(true));
  });

  it('isSlugValido: true só para slug pertencente ao vocabulário', () => {
    expect(isSlugValido('romance')).toBe(true);
    expect(isSlugValido('lgbtqia+')).toBe(true);
    expect(isSlugValido('dark-fantasy')).toBe(true);
  });

  it('isSlugValido: false para desconhecido, vazio, tipos errados', () => {
    expect(isSlugValido('fofura-invalida')).toBe(false);
    expect(isSlugValido('')).toBe(false);
    expect(isSlugValido(null)).toBe(false);
    expect(isSlugValido(undefined)).toBe(false);
    expect(isSlugValido(42)).toBe(false);
    expect(isSlugValido(['romance'])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// User.parental — modelo (subdoc irmão de consent)
// ═══════════════════════════════════════════════════════════════════════════

describe('User.parental — defaults de um documento novo', () => {
  it('classificacaoEtaria=young, tagsBloqueadas=[], pinTentativas=0, pinBloqueadoAte=null, pinHash=null', async () => {
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    const user = await User.create({
      email: emailUnico('parental-default'),
      passwordHash,
      nome: 'Default Parental',
    });
    expect(user.parental.classificacaoEtaria).toBe('young');
    expect(user.parental.tagsBloqueadas).toEqual([]);
    expect(user.parental.pinTentativas).toBe(0);
    expect(user.parental.pinBloqueadoAte).toBeNull();
    // Doc recém-criado em memória (não veio de find/projeção) — select:false
    // só afeta queries, então o valor default É visível aqui.
    expect(user.parental.pinHash).toBeNull();
  });
});

describe('User.parental — validação', () => {
  it('classificacaoEtaria só aceita kids/teen/young', async () => {
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    await expect(User.create({
      email: emailUnico('parental-enum-invalido'),
      passwordHash,
      nome: 'Enum Invalido',
      parental: { classificacaoEtaria: 'adulto' },
    })).rejects.toThrow();

    const ok = await User.create({
      email: emailUnico('parental-enum-kids'),
      passwordHash,
      nome: 'Enum Kids',
      parental: { classificacaoEtaria: 'kids' },
    });
    expect(ok.parental.classificacaoEtaria).toBe('kids');
  });

  it('tagsBloqueadas NÃO é validada contra o vocabulário no schema (permissivo de propósito — a rota da T3 valida)', async () => {
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    const user = await User.create({
      email: emailUnico('parental-tags-livres'),
      passwordHash,
      nome: 'Tags Livres No Schema',
      parental: { tagsBloqueadas: ['slug-que-nao-existe', 'outro-invalido-qualquer'] },
    });
    expect(user.parental.tagsBloqueadas).toEqual(['slug-que-nao-existe', 'outro-invalido-qualquer']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Series.content_rating — classificação OFICIAL (nasce nesta task; NENHUMA
// rota escreve nele ainda — T6 liga a escrita)
// ═══════════════════════════════════════════════════════════════════════════

describe('Series.content_rating', () => {
  it('default null', async () => {
    const serie = await Series.create({ title: 'Sem Rating Oficial', content_type: 'hiqua' });
    expect(serie.content_rating).toBeNull();
  });

  it('aceita kids/teen/young', async () => {
    for (const valor of ['kids', 'teen', 'young']) {
      const serie = await Series.create({ title: `Rating ${valor}`, content_type: 'hiqua', content_rating: valor });
      expect(serie.content_rating).toBe(valor);
    }
  });

  it('rejeita valor fora do enum', async () => {
    await expect(Series.create({
      title: 'Rating Invalido', content_type: 'hiqua', content_rating: 'adulto',
    })).rejects.toThrow();
  });
});

describe('Allowlists NÃO escrevem content_rating por acidente (T1 não liga nenhuma escrita)', () => {
  it('PUT /api/content/series/:id (admin) ignora content_rating no corpo — SERIES_FIELDS não inclui o campo', async () => {
    const serie = await Series.create({
      title: 'Serie Admin Allowlist Rating', content_type: 'hiqua', genre: 'Aventura', isPublished: true,
    });
    const res = await request(app)
      .put(`/api/content/series/${serie._id}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ content_rating: 'kids' });
    expect(res.status).toBe(200);
    expect(res.body.content_rating).toBeFalsy();

    const doBanco = await Series.findById(serie._id);
    expect(doBanco.content_rating).toBeNull();
  });

  it('POST /api/portal/series (ilustrador) ignora content_rating no corpo — PORTAL_SERIES_FIELDS não inclui o campo', async () => {
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    const dono = await User.create({ email: emailUnico('portal-rating-dono'), passwordHash, nome: 'Dono Rating Portal' });
    await Channel.create({ ownerId: dono._id, name: `Canal Rating ${Date.now()}` });
    const login = await request(app).post('/api/auth/login').send({ email: dono.email, password: 'Senha@123' });

    const res = await request(app)
      .post('/api/portal/series')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ title: 'Serie Portal Allowlist Rating', content_rating: 'kids' });
    expect(res.status).toBe(201);
    expect(res.body.content_rating).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Shape: pinHash NUNCA aparece em NENHUMA resposta que serializa User
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fixture com pinHash setado DIRETO no banco (bcrypt de '1234'), contornando
 * a inexistência da rota POST /api/parental/pin (T3) — é a única forma de
 * provar a AUSÊNCIA do campo com um VALOR de fato presente no documento
 * (senão o teste passaria mesmo se select:false estivesse quebrado, porque
 * o campo estaria null de qualquer forma).
 */
async function criarUsuarioComPin(nome) {
  const email = emailUnico('parental-com-pin');
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const pinHash = await bcrypt.hash('1234', 12);
  const user = await User.create({
    email, passwordHash, nome,
    parental: { classificacaoEtaria: 'teen', tagsBloqueadas: ['romance'], pinHash },
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { id: user._id.toString(), token: login.body.accessToken, email };
}

describe('GET /api/auth/me — pinHash (e parental inteiro) ausente', () => {
  it('resposta não contém "pinHash" em texto nenhum, mesmo com pinHash setado no banco', async () => {
    const dono = await criarUsuarioComPin('Auth Me Com Pin');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    expect(res.body.user).not.toHaveProperty('parental');
  });
});

describe('GET /api/admin/users — parental INTEIRO ausente (preferências são privadas, nem superadmin vê)', () => {
  it('nenhum usuário listado expõe parental (nem pinHash isolado), mesmo com fixture de pinHash setado', async () => {
    await criarUsuarioComPin('Admin Users Com Pin');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${auth.getToken('superadmin')}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    res.body.users.forEach(u => expect(u).not.toHaveProperty('parental'));
  });
});

describe('GET /api/account/me/export — parental presente CAMPO A CAMPO, pinHash NUNCA', () => {
  it('com PIN setado: temPin=true e pinHash não aparece em lugar nenhum do payload', async () => {
    const dono = await criarUsuarioComPin('Export Com Pin');
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('pinHash');

    const data = JSON.parse(res.text);
    expect(data.account.parental).toEqual({
      classificacaoEtaria: 'teen',
      tagsBloqueadas: ['romance'],
      temPin: true,
    });
  });

  it('sem PIN definido: temPin=false, tagsBloqueadas=[] e classificacaoEtaria default (young)', async () => {
    const email = emailUnico('export-sem-pin');
    const senha = 'Senha@123';
    const passwordHash = await bcrypt.hash(senha, 10);
    await User.create({ email, passwordHash, nome: 'Export Sem Pin' });
    const login = await request(app).post('/api/auth/login').send({ email, password: senha });

    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('pinHash');

    const data = JSON.parse(res.text);
    expect(data.account.parental).toEqual({
      classificacaoEtaria: 'young',
      tagsBloqueadas: [],
      temPin: false,
    });
  });
});

describe('login/register — resposta de auth não vaza pinHash nem parental', () => {
  it('POST /api/auth/register: resposta não contém "pinHash"', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: emailUnico('register-sem-vazar'), password: 'Senha@123', nome: 'Register Sem Vazar', acceptedTerms: true,
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    expect(res.body.user).not.toHaveProperty('parental');
  });

  it('POST /api/auth/login: resposta não contém "pinHash", mesmo com pinHash setado no banco', async () => {
    const dono = await criarUsuarioComPin('Login Sem Vazar');
    const res = await request(app).post('/api/auth/login').send({ email: dono.email, password: 'Senha@123' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    expect(res.body.user).not.toHaveProperty('parental');
  });
});

describe('POST /api/auth/reset-password NÃO toca em parental (garantia da spec, PIN é fluxo separado — T3)', () => {
  it('parental do usuário fica intacto depois de redefinir a senha', async () => {
    const dono = await criarUsuarioComPin('Reset Nao Toca Parental');
    const PasswordResetToken = require('../../models/PasswordResetToken');
    await PasswordResetToken.deleteMany({ userId: dono.id });
    await PasswordResetToken.create({ userId: dono.id, token: 'reset-token-parental-123' });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token-parental-123', password: 'NovaSenha@123' });
    expect(res.status).toBe(200);

    const depois = await User.findById(dono.id).select('+parental.pinHash');
    expect(depois.parental.classificacaoEtaria).toBe('teen');
    expect(depois.parental.tagsBloqueadas).toEqual(['romance']);
    expect(depois.parental.pinHash).toBeTruthy();
  });
});
