/**
 * Testes: `utils/parentalFilter.js` — Fase 5, Bloco 2, Task 4.
 * Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.3, seções "Semântica etária (FORMA da query pinada)", "Filtro
 * pessoal (tags)", "Fonte única do filtro", "Exceções ao filtro").
 * Ledger: .superpowers/sdd/2026-09-03-fase5-bloco2/progress.md, rulings
 * P3 (semântica POSITIVA é LEI), P4 (serieVisivelPara LANÇA sem engolir),
 * P5 (exceções vivem no HELPER).
 *
 * Escopo: as TRÊS peças puras/assíncronas exportadas pelo módulo —
 * `passaFiltroParental` (predicado puro, sem exceções), `getFiltroParental`
 * (fragmento Mongo para LISTAS) e `serieVisivelPara` (doc único: admin/dono/
 * anônimo + delegação). A aplicação nas 6 superfícies de lista está em
 * `tests/backend/parentalListSurfaces.test.js`.
 */
const bcrypt = require('bcrypt');
const db = require('../helpers/db');

let User, Channel, Series;
let passaFiltroParental, getFiltroParental, serieVisivelPara;

beforeAll(async () => {
  await db.connect();
  require('../../server'); // garante models/rotas registrados do mesmo jeito que em produção
  User = require('../../models/User');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  ({ passaFiltroParental, getFiltroParental, serieVisivelPara } = require('../../utils/parentalFilter'));
});

afterAll(() => db.closeDatabase());
afterEach(() => db.clearDatabase());

let contador = 0;
function emailUnico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}@lorflux.test`;
}

async function criarUsuario({ role = 'user', classificacaoEtaria, tagsBloqueadas } = {}) {
  const passwordHash = await bcrypt.hash('Senha@123', 10);
  const user = await User.create({
    email: emailUnico('parentalfilter'),
    passwordHash,
    nome: 'Usuario Teste',
    role,
    ...(classificacaoEtaria !== undefined || tagsBloqueadas !== undefined
      ? { parental: { classificacaoEtaria, tagsBloqueadas } }
      : {}),
  });
  return user;
}

// ═══════════════════════════════════════════════════════════════════════════
// passaFiltroParental — predicado PURO, sem exceções (admin/dono não entram
// aqui — isso é serieVisivelPara)
// ═══════════════════════════════════════════════════════════════════════════

describe('passaFiltroParental — escada etária × content_rating', () => {
  const casos = [
    // [classificacaoEtaria, content_rating, esperado]
    ['kids', 'kids', true],
    ['kids', 'teen', false],
    ['kids', 'young', false],
    ['kids', null, false], // null conta como 'young' — kids não vê
    ['teen', 'kids', true],
    ['teen', 'teen', true],
    ['teen', 'young', false],
    ['teen', null, false], // null conta como 'young' — teen não vê
    ['young', 'kids', true],
    ['young', 'teen', true],
    ['young', 'young', true],
    ['young', null, true], // null conta como 'young' — young vê tudo
  ];

  casos.forEach(([classificacaoEtaria, content_rating, esperado]) => {
    it(`${classificacaoEtaria} × content_rating=${content_rating === null ? 'null' : content_rating} → ${esperado}`, () => {
      const parental = { classificacaoEtaria, tagsBloqueadas: [] };
      const serie = { content_rating, tags: [] };
      expect(passaFiltroParental(parental, serie)).toBe(esperado);
    });
  });

  it('parental null/undefined é tratado como young SEM bloqueio (visitante ou conta sem preferências)', () => {
    const serie = { content_rating: 'young', tags: ['acao'] };
    expect(passaFiltroParental(null, serie)).toBe(true);
    expect(passaFiltroParental(undefined, serie)).toBe(true);
  });
});

describe('passaFiltroParental — campo AUSENTE (undefined) LANÇA (ruling P4, fail-closed)', () => {
  it('content_rating undefined lança erro claro', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: [] };
    expect(() => passaFiltroParental(parental, { tags: [] })).toThrow();
  });

  it('tags undefined lança erro claro', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: [] };
    expect(() => passaFiltroParental(parental, { content_rating: 'kids' })).toThrow();
  });

  it('os DOIS campos ausentes também lança (não silencia por já ter achado um motivo)', () => {
    expect(() => passaFiltroParental(null, {})).toThrow();
  });

  it('lança mesmo para young (fail-closed vale para TODA classificação, não só kids/teen)', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: [] };
    expect(() => passaFiltroParental(parental, { content_rating: undefined, tags: [] })).toThrow();
  });

  it('content_rating null (não undefined) NÃO lança — null é um valor válido (= young)', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: [] };
    expect(() => passaFiltroParental(parental, { content_rating: null, tags: [] })).not.toThrow();
  });
});

describe('passaFiltroParental — tags bloqueadas (filtro pessoal)', () => {
  it('alguma tag da série em tagsBloqueadas → false, mesmo com rating permitido', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] };
    const serie = { content_rating: 'young', tags: ['acao', 'aventura'] };
    expect(passaFiltroParental(parental, serie)).toBe(false);
  });

  it('nenhuma tag bloqueada em comum → true', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] };
    const serie = { content_rating: 'young', tags: ['romance', 'drama'] };
    expect(passaFiltroParental(parental, serie)).toBe(true);
  });

  it('série sem tags (array vazio) nunca é bloqueada por tag', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] };
    const serie = { content_rating: 'young', tags: [] };
    expect(passaFiltroParental(parental, serie)).toBe(true);
  });

  it('tagsBloqueadas vazia nunca bloqueia', () => {
    const parental = { classificacaoEtaria: 'young', tagsBloqueadas: [] };
    const serie = { content_rating: 'young', tags: ['acao'] };
    expect(passaFiltroParental(parental, serie)).toBe(true);
  });

  it('rating reprovado E tag bloqueada → false pelo motivo do rating (combinação continua false)', () => {
    const parental = { classificacaoEtaria: 'kids', tagsBloqueadas: ['acao'] };
    const serie = { content_rating: 'teen', tags: ['acao'] };
    expect(passaFiltroParental(parental, serie)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getFiltroParental — fragmento Mongo para QUERIES DE LISTA. Semântica
// POSITIVA é LEI (ledger P3): $in nunca $ne/$nin para content_rating.
// ═══════════════════════════════════════════════════════════════════════════

describe('getFiltroParental — FORMA exata do fragmento (pinada)', () => {
  it('sem user (anônimo) → {} — nenhuma cláusula', async () => {
    expect(await getFiltroParental(null)).toEqual({});
    expect(await getFiltroParental(undefined)).toEqual({});
  });

  it('admin (isAdminUser) → {} — exceção P5, mesmo com preferências restritivas no banco', async () => {
    const admin = await criarUsuario({ role: 'admin', classificacaoEtaria: 'kids', tagsBloqueadas: ['acao'] });
    expect(await getFiltroParental({ id: admin._id.toString(), role: 'admin' })).toEqual({});
  });

  it('superadmin → {} — isAdminUser cobre os dois papéis', async () => {
    const superadmin = await criarUsuario({ role: 'superadmin', classificacaoEtaria: 'kids' });
    expect(await getFiltroParental({ id: superadmin._id.toString(), role: 'superadmin' })).toEqual({});
  });

  it('kids, sem tags bloqueadas → { content_rating: "kids" } — igualdade exata, sem $in', async () => {
    const kids = await criarUsuario({ classificacaoEtaria: 'kids', tagsBloqueadas: [] });
    const fragmento = await getFiltroParental({ id: kids._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ content_rating: 'kids' });
  });

  it('kids, COM tags bloqueadas → content_rating "kids" + tags $nin', async () => {
    const kids = await criarUsuario({ classificacaoEtaria: 'kids', tagsBloqueadas: ['terror', 'crime'] });
    const fragmento = await getFiltroParental({ id: kids._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ content_rating: 'kids', tags: { $nin: ['terror', 'crime'] } });
  });

  it('teen, sem tags bloqueadas → { content_rating: { $in: ["kids","teen"] } } — POSITIVO, nunca $ne/$nin no rating', async () => {
    const teen = await criarUsuario({ classificacaoEtaria: 'teen', tagsBloqueadas: [] });
    const fragmento = await getFiltroParental({ id: teen._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ content_rating: { $in: ['kids', 'teen'] } });
  });

  it('teen, COM tags bloqueadas → content_rating $in + tags $nin', async () => {
    const teen = await criarUsuario({ classificacaoEtaria: 'teen', tagsBloqueadas: ['thriller'] });
    const fragmento = await getFiltroParental({ id: teen._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ content_rating: { $in: ['kids', 'teen'] }, tags: { $nin: ['thriller'] } });
  });

  it('young, sem tags bloqueadas → {} — SEM cláusula de content_rating (vê tudo, inclusive não classificada)', async () => {
    const young = await criarUsuario({ classificacaoEtaria: 'young', tagsBloqueadas: [] });
    const fragmento = await getFiltroParental({ id: young._id.toString(), role: 'user' });
    expect(fragmento).toEqual({});
  });

  it('young, COM tags bloqueadas → só a cláusula de tags, sem content_rating', async () => {
    const young = await criarUsuario({ classificacaoEtaria: 'young', tagsBloqueadas: ['lgbtqia+'] });
    const fragmento = await getFiltroParental({ id: young._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ tags: { $nin: ['lgbtqia+'] } });
  });

  it('usuário sem subdocumento parental salvo explicitamente cai nos defaults do schema (young, {})', async () => {
    const passwordHash = await bcrypt.hash('Senha@123', 10);
    const user = await User.create({ email: emailUnico('parentalfilter-default'), passwordHash, nome: 'Sem Parental Explicito', role: 'user' });
    const fragmento = await getFiltroParental({ id: user._id.toString(), role: 'user' });
    expect(fragmento).toEqual({});
  });

  // Achado da revisão da T4: valor FORA do enum (só chega por escrita bruta ou
  // migração — o schema barra o resto) caía em young ({}), fail-OPEN. Agora
  // cai no degrau MAIS restritivo (kids), nos dois helpers.
  it('classificacaoEtaria fora do enum (escrita bruta) → fragmento de KIDS, nunca {} (fail-closed)', async () => {
    const user = await criarUsuario({ classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] });
    await User.updateOne({ _id: user._id }, { $set: { 'parental.classificacaoEtaria': 'adulto' } });
    const fragmento = await getFiltroParental({ id: user._id.toString(), role: 'user' });
    expect(fragmento).toEqual({ content_rating: 'kids', tags: { $nin: ['acao'] } });
  });

  it('passaFiltroParental com classificacaoEtaria fora do enum se comporta como KIDS (não lança TypeError, não abre)', () => {
    const corrompido = { classificacaoEtaria: 'adulto', tagsBloqueadas: [] };
    expect(passaFiltroParental(corrompido, { content_rating: 'kids', tags: [] })).toBe(true);
    expect(passaFiltroParental(corrompido, { content_rating: 'teen', tags: [] })).toBe(false);
    expect(passaFiltroParental(corrompido, { content_rating: null, tags: [] })).toBe(false);
  });

  it('nenhuma chave do fragmento usa $ne ou $nin para content_rating em NENHUM perfil (varredura anti-regressão)', async () => {
    const perfis = [
      { classificacaoEtaria: 'kids', tagsBloqueadas: [] },
      { classificacaoEtaria: 'teen', tagsBloqueadas: ['acao'] },
      { classificacaoEtaria: 'young', tagsBloqueadas: ['acao'] },
    ];
    for (const p of perfis) {
      const user = await criarUsuario(p);
      const fragmento = await getFiltroParental({ id: user._id.toString(), role: 'user' });
      if (fragmento.content_rating && typeof fragmento.content_rating === 'object') {
        expect(fragmento.content_rating.$ne).toBeUndefined();
        expect(fragmento.content_rating.$nin).toBeUndefined();
        expect(fragmento.content_rating.$in).toBeDefined();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// serieVisivelPara — DOC ÚNICO: true para admin, true para dono do canal,
// true para anônimo; senão delega em passaFiltroParental (que lança se a
// série vier sem content_rating/tags — select/populate estreito).
// ═══════════════════════════════════════════════════════════════════════════

describe('serieVisivelPara', () => {
  it('anônimo (sem user) → true, mesmo sem content_rating/tags na série (não precisa nem olhar o doc)', async () => {
    const visivel = await serieVisivelPara(null, {});
    expect(visivel).toBe(true);
  });

  it('admin → true mesmo com doc incompleto (bypass antes de tocar em content_rating/tags)', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const visivel = await serieVisivelPara({ id: admin._id.toString(), role: 'admin' }, {});
    expect(visivel).toBe(true);
  });

  it('dono do canal da série → true mesmo com a própria tag bloqueada (doc incompleto não importa, bypass antes)', async () => {
    const dono = await criarUsuario({ classificacaoEtaria: 'kids', tagsBloqueadas: ['acao'] });
    const canal = await Channel.create({ name: 'Canal do Dono', ownerId: dono._id });
    const serie = await Series.create({
      title: 'Obra do Dono', genre: 'Teste', content_type: 'hiqua', isPublished: true,
      channelId: canal._id, content_rating: 'teen', tags: ['acao'],
    });
    const visivel = await serieVisivelPara({ id: dono._id.toString(), role: 'user' }, serie.toObject());
    expect(visivel).toBe(true);
  });

  it('channelId ausente → dono-check é false SEM lançar (segue pro predicado normal)', async () => {
    const user = await criarUsuario({ classificacaoEtaria: 'young' });
    const serie = { content_rating: 'young', tags: [] }; // sem channelId
    const visivel = await serieVisivelPara({ id: user._id.toString(), role: 'user' }, serie);
    expect(visivel).toBe(true); // passa pelo predicado normal (young vê tudo)
  });

  it('channelId de OUTRO dono → dono-check false, cai no predicado normal (pode reprovar)', async () => {
    const outroDono = await criarUsuario();
    const canal = await Channel.create({ name: 'Canal De Outro', ownerId: outroDono._id });
    const visitante = await criarUsuario({ classificacaoEtaria: 'kids' });
    const serie = { channelId: canal._id, content_rating: 'teen', tags: [] };
    const visivel = await serieVisivelPara({ id: visitante._id.toString(), role: 'user' }, serie);
    expect(visivel).toBe(false); // kids não vê teen, e ele não é dono
  });

  it('usuário comum, série com campos presentes → delega corretamente pro predicado (aprova)', async () => {
    const user = await criarUsuario({ classificacaoEtaria: 'young' });
    const serie = { content_rating: 'kids', tags: [] };
    expect(await serieVisivelPara({ id: user._id.toString(), role: 'user' }, serie)).toBe(true);
  });

  it('usuário comum, série SEM content_rating/tags (select estreito) → LANÇA (fail-closed, ruling P4)', async () => {
    const user = await criarUsuario({ classificacaoEtaria: 'young' });
    await expect(serieVisivelPara({ id: user._id.toString(), role: 'user' }, {})).rejects.toThrow();
  });

  it('usuário comum reprovado pelo predicado (kids × rating teen) → false', async () => {
    const user = await criarUsuario({ classificacaoEtaria: 'kids' });
    const serie = { content_rating: 'teen', tags: [] };
    expect(await serieVisivelPara({ id: user._id.toString(), role: 'user' }, serie)).toBe(false);
  });
});
