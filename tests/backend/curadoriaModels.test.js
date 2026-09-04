/**
 * Fase 5 Bloco 3, Task 1 — models Sinalizacao/CasoCuradoria, índice novo do
 * EngagementEvent e utils/primeiroAdmin. O teste de concorrência do caso
 * único usa o ÍNDICE do banco (não checagem em código): 2 creates em
 * Promise.all -> exatamente 1 sobrevive (E11000 no outro).
 */
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Sinalizacao, CasoCuradoria, EngagementEvent, User, primeiroAdmin;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Sinalizacao = require('../../models/Sinalizacao');
  CasoCuradoria = require('../../models/CasoCuradoria');
  EngagementEvent = require('../../models/EngagementEvent');
  User = require('../../models/User');
  ({ primeiroAdmin } = require('../../utils/primeiroAdmin'));
  await auth.createUsers(app);
  // Índices únicos são construídos em background pelo autoIndex — sem
  // init() o teste de unicidade é uma corrida (superReader.test.js:35-41).
  await Sinalizacao.init();
  await CasoCuradoria.init();
  await EngagementEvent.init();
});

afterAll(() => db.closeDatabase());

const oid = () => new mongoose.Types.ObjectId();

describe('Sinalizacao', () => {
  it('unique {userId, seriesId}: 2ª sinalização do mesmo usuário na mesma obra -> E11000', async () => {
    const seriesId = oid(); const userId = oid();
    const base = { seriesId, userId, motivo: 'spam_ou_enganoso', grave: false, valida: true, contaCriadaEm: new Date('2026-01-07T00:00:00Z') };
    await Sinalizacao.create(base);
    await expect(Sinalizacao.create({ ...base, motivo: 'outro', descricao: 'x' })).rejects.toMatchObject({ code: 11000 });
  });

  it('motivo fora do enum -> ValidationError; descricao > 500 -> ValidationError', async () => {
    await expect(Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'violencia_excessiva', grave: false, valida: true, contaCriadaEm: new Date() }))
      .rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'outro', grave: false, valida: true, contaCriadaEm: new Date(), descricao: 'a'.repeat(501) }))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('índices declarados: {userId,seriesId} unique e {seriesId,revisadaEm,valida}', async () => {
    const idx = await Sinalizacao.collection.indexes();
    expect(idx.find(i => i.key.userId === 1 && i.key.seriesId === 1 && i.unique)).toBeTruthy();
    expect(idx.find(i => i.key.seriesId === 1 && i.key.revisadaEm === 1 && i.key.valida === 1)).toBeTruthy();
  });

  it('invalidaMotivo fora do enum -> ValidationError', async () => {
    await expect(Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'spam_ou_enganoso', valida: false, invalidaMotivo: 'fraude', contaCriadaEm: new Date() }))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('descricao com exatamente 500 chars é aceita (fronteira positiva de DESCRICAO_MAX)', async () => {
    await expect(Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'outro', valida: true, contaCriadaEm: new Date(), descricao: 'a'.repeat(500) }))
      .resolves.toBeTruthy();
  });

  it('grave é DERIVADO do motivo pelo pre-validate — ignora o valor enviado (fix round: campo não podia ser digitado à mão)', async () => {
    const s1 = await Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'direitos_autorais', grave: false, valida: true, contaCriadaEm: new Date() });
    expect(s1.grave).toBe(true);
    const s2 = await Sinalizacao.create({ seriesId: oid(), userId: oid(), motivo: 'outro', grave: true, descricao: 'x', valida: true, contaCriadaEm: new Date() });
    expect(s2.grave).toBe(false);
  });
});

describe('CasoCuradoria — 1 caso aberto por obra garantido pelo banco', () => {
  const novoCaso = (seriesId) => ({
    seriesId, abertoEm: new Date('2026-09-04T12:00:00Z'),
    gatilho: { tipo: 'pequena', S: 23, V: 41, limiar: 20 }, resumoMotivos: { spam_ou_enganoso: 23 },
  });

  it('2 creates concorrentes para a mesma obra -> exatamente 1 documento, o outro E11000', async () => {
    const seriesId = oid();
    const resultados = await Promise.allSettled([
      CasoCuradoria.create(novoCaso(seriesId)),
      CasoCuradoria.create(novoCaso(seriesId)),
    ]);
    const ok = resultados.filter(r => r.status === 'fulfilled');
    const falhou = resultados.filter(r => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(falhou).toHaveLength(1);
    expect(falhou[0].reason.code).toBe(11000);
    expect(await CasoCuradoria.countDocuments({ seriesId })).toBe(1);
  });

  it('caso FECHADO (emAberto:false) não bloqueia a abertura de um novo caso da mesma obra', async () => {
    const seriesId = oid();
    const c1 = await CasoCuradoria.create(novoCaso(seriesId));
    c1.emAberto = false; c1.status = 'fechado'; c1.decisao = 'aprovar'; await c1.save();
    await expect(CasoCuradoria.create(novoCaso(seriesId))).resolves.toBeTruthy();
    expect(await CasoCuradoria.countDocuments({ seriesId })).toBe(2);
    // ...mas um 2º ABERTO continua impossível
    await expect(CasoCuradoria.create(novoCaso(seriesId))).rejects.toMatchObject({ code: 11000 });
  });

  it('defaults e enums: emAberto true, status aberto, prioridade normal, avisoArtista pendente; statics', async () => {
    const c = await CasoCuradoria.create(novoCaso(oid()));
    expect(c.emAberto).toBe(true);
    expect(c.status).toBe('aberto');
    expect(c.prioridade).toBe('normal');
    expect(c.avisoArtista).toBe('pendente');
    expect(c.sinalizacoesAbusivas).toBe(false);
    expect(CasoCuradoria.STATUS_ABERTOS).toEqual(['aberto', 'aguardando_artista']);
    expect(CasoCuradoria.DECISOES).toEqual(['aprovar', 'reclassificar', 'solicitar_correcao', 'remover']);
    await expect(CasoCuradoria.create({ ...novoCaso(oid()), status: 'pendente' })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('emAberto é DERIVADO do status pelo pre-validate — não confia no valor enviado (fix round)', async () => {
    const fechado = await CasoCuradoria.create({ ...novoCaso(oid()), status: 'fechado', emAberto: true, decisao: 'aprovar' });
    expect(fechado.emAberto).toBe(false);
    const aguardando = await CasoCuradoria.create({ ...novoCaso(oid()), status: 'aguardando_artista' });
    expect(aguardando.emAberto).toBe(true);
  });

  it('resumoMotivos com motivo desconhecido -> ValidationError com mensagem em errors.resumoMotivos (invalidate(), não new ValidationError(new Error()) que perdia a mensagem)', async () => {
    const erro = await CasoCuradoria.create({ ...novoCaso(oid()), resumoMotivos: { violencia_excessiva: 3 } }).catch(e => e);
    expect(erro.name).toBe('ValidationError');
    expect(erro.errors.resumoMotivos).toBeTruthy();
    expect(erro.errors.resumoMotivos.message).toContain('violencia_excessiva');
  });

  it.each([
    ['gatilho.tipo fora do enum', { gatilho: { tipo: 'xyz', S: 1, V: 1, limiar: 1 } }],
    ['prioridade fora do enum', { prioridade: 'urgente' }],
    ['decisao fora do enum', { decisao: 'ignorar' }],
    ['avisoArtista fora do enum', { avisoArtista: 'talvez' }],
  ])('%s -> ValidationError', async (_nome, overrides) => {
    await expect(CasoCuradoria.create({ ...novoCaso(oid()), ...overrides }))
      .rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('motivoDecisao: 1500 chars aceita, 1501 rejeita (fronteira de TEXTO_ADMIN_MAX, não mais um literal 1500 solto)', async () => {
    await expect(CasoCuradoria.create({ ...novoCaso(oid()), motivoDecisao: 'a'.repeat(1500) })).resolves.toBeTruthy();
    await expect(CasoCuradoria.create({ ...novoCaso(oid()), motivoDecisao: 'a'.repeat(1501) })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('índices declarados: único parcial {seriesId} com emAberto:true, {emAberto,prioridade,abertoEm} e {seriesId,decisao,decisaoEm:-1}', async () => {
    const idx = await CasoCuradoria.collection.indexes();
    expect(idx.find(i => i.key.seriesId === 1 && Object.keys(i.key).length === 1 && i.unique && i.partialFilterExpression && i.partialFilterExpression.emAberto === true)).toBeTruthy();
    expect(idx.find(i => i.key.emAberto === 1 && i.key.prioridade === 1 && i.key.abertoEm === 1)).toBeTruthy();
    expect(idx.find(i => i.key.seriesId === 1 && i.key.decisao === 1 && i.key.decisaoEm === -1)).toBeTruthy();
  });
});

describe('EngagementEvent — índice novo por seriesId', () => {
  it('declara {seriesId, userId, type, flagged} (só índice: nenhum documento é tocado)', async () => {
    const idx = await EngagementEvent.collection.indexes();
    expect(idx.find(i => i.key.seriesId === 1 && i.key.userId === 1 && i.key.type === 1 && i.key.flagged === 1)).toBeTruthy();
  });
});

describe('utils/primeiroAdmin', () => {
  // Fix round: o teste original comparava com um oráculo-espelho
  // (User.find({role: {$in:[...]}}) ... admins[0]) que faz a MESMA query
  // que a implementação — uma mutação que removesse o filtro de role em
  // primeiroAdmin() (ex.: `User.findOne({}).sort({createdAt:1})`) ainda
  // passaria, porque o superadmin de tests/helpers/auth.js:10 também é o
  // primeiro usuário criado no banco (coincidência do fixture). Este
  // usuário comum, inserido com createdAt ANTERIOR a todos os fixtures,
  // quebra essa coincidência: só o filtro de role correto continua achando
  // o superadmin.
  it('filtra por role — não é "o usuário mais antigo do banco" (fixture: tests/helpers/auth.js:10)', async () => {
    await User.collection.insertOne({
      email: 'antigo-comum@lorflux.test', passwordHash: 'x', nome: 'Antigo', role: 'user',
      isActive: true, createdAt: new Date('2020-01-01T00:00:00Z'), updatedAt: new Date('2020-01-01T00:00:00Z'),
    });
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 }).lean();
    const escolhido = await primeiroAdmin();
    expect(String(escolhido._id)).toBe(String(admins[0]._id));
    expect(escolhido.email).toBe('superadmin@lorflux.test');
  });
});

describe('primeiroAdmin() sem nenhum admin no sistema (roda por último no arquivo: remove e recria)', () => {
  let adminsRemovidos = [];

  beforeAll(async () => {
    adminsRemovidos = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
    await User.deleteMany({ role: { $in: ['admin', 'superadmin'] } });
  });

  afterAll(async () => {
    if (adminsRemovidos.length) await User.collection.insertMany(adminsRemovidos);
  });

  it('devolve null (nenhum admin/superadmin disponível)', async () => {
    expect(await primeiroAdmin()).toBeNull();
  });
});
