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
});

describe('EngagementEvent — índice novo por seriesId', () => {
  it('declara {seriesId, userId, type, flagged} (só índice: nenhum documento é tocado)', async () => {
    const idx = await EngagementEvent.collection.indexes();
    expect(idx.find(i => i.key.seriesId === 1 && i.key.userId === 1 && i.key.type === 1 && i.key.flagged === 1)).toBeTruthy();
  });
});

describe('utils/primeiroAdmin', () => {
  it('devolve o admin/superadmin de createdAt mais antigo (mesmo critério de routes/account.js)', async () => {
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 }).lean();
    const escolhido = await primeiroAdmin();
    expect(String(escolhido._id)).toBe(String(admins[0]._id));
  });
});
