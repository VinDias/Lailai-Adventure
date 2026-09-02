/**
 * Testes: Fase 5 Bloco 1, Task 3 — service de royalties + painel de números
 * do Portal do Ilustrador.
 * Cobre:
 *  - services/royaltyReportService.js: buildReport/buildSuperReaderSummary
 *    saíram de routes/royalties.js SEM mudar comportamento (a prova real é
 *    tests/backend/royalties.test.js continuar verde, intocado — aqui só
 *    testamos o que é NOVO: periodoAtual e o contrato do módulo).
 *  - GET /api/portal/meu-estudio: canais do usuário + contagens; 403 para
 *    quem não é dono de canal ATIVO.
 *  - GET /api/portal/resumo: mês corrente (sem R$) via buildReport escopado,
 *    período fechado (com R$) via RoyaltyPeriod.breakdown escopado, Super
 *    Reader escopado; isolamento entre donos.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let Channel, Series, Episode, MensagemPortal, EngagementEvent, RoyaltyPeriod, SuperReaderContribution, User;
let engagementLogger;
let royaltyReportService;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  MensagemPortal = require('../../models/MensagemPortal');
  EngagementEvent = require('../../models/EngagementEvent');
  RoyaltyPeriod = require('../../models/RoyaltyPeriod');
  SuperReaderContribution = require('../../models/SuperReaderContribution');
  User = require('../../models/User');
  engagementLogger = require('../../services/engagementLogger');
  royaltyReportService = require('../../services/royaltyReportService');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Helpers ────────────────────────────────────────────────────────────────

let contadorUsuario = 0;
async function criarUsuarioComToken(nome) {
  contadorUsuario += 1;
  const email = `portal-royalties-${contadorUsuario}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { id: user._id.toString(), token: login.body.accessToken };
}

// 'YYYY-MM' do mês corrente REAL (mesma lógica de royalties.test.js) — usado
// pra derivar cenários que nunca colidem com o mês corrente de verdade.
const currentPeriod = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Sempre no passado em relação a "agora" de verdade — nunca é o mês corrente.
function periodoPassado(mesesAtras) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mesesAtras, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// services/royaltyReportService.js — contrato do módulo extraído
// ═══════════════════════════════════════════════════════════════════════════

describe('services/royaltyReportService — contrato', () => {
  it('exporta parsePeriod, periodoAtual, buildReport e buildSuperReaderSummary', () => {
    expect(typeof royaltyReportService.parsePeriod).toBe('function');
    expect(typeof royaltyReportService.periodoAtual).toBe('function');
    expect(typeof royaltyReportService.buildReport).toBe('function');
    expect(typeof royaltyReportService.buildSuperReaderSummary).toBe('function');
  });

  it('parsePeriod aceita YYYY-MM válido e rejeita formatos/meses inválidos', () => {
    const range = royaltyReportService.parsePeriod('2026-09');
    expect(range.start.toISOString()).toBe(new Date(Date.UTC(2026, 8, 1)).toISOString());
    expect(range.end.toISOString()).toBe(new Date(Date.UTC(2026, 9, 1)).toISOString());
    expect(royaltyReportService.parsePeriod('2026-13')).toBeNull();
    expect(royaltyReportService.parsePeriod('lixo')).toBeNull();
    expect(royaltyReportService.parsePeriod(undefined)).toBeNull();
  });

  it('periodoAtual: data injetável (não-redonda) deriva YYYY-MM em UTC; sem argumento usa o relógio real', () => {
    const data = new Date('2026-03-05T23:50:17.123Z'); // valor não-redondo
    expect(royaltyReportService.periodoAtual(data)).toBe('2026-03');
    expect(royaltyReportService.periodoAtual()).toBe(currentPeriod());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 403 — quem não é dono de canal ATIVO (as 2 rotas novas)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/meu-estudio e /api/portal/resumo — guarda de dono', () => {
  it('sem token → 401', async () => {
    const r1 = await request(app).get('/api/portal/meu-estudio');
    const r2 = await request(app).get('/api/portal/resumo');
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });

  it('usuário comum sem NENHUM canal → 403 com mensagem clara, nas duas rotas', async () => {
    const semCanal = await criarUsuarioComToken('Sem Canal Nenhum');

    const estudio = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${semCanal.token}`);
    expect(estudio.status).toBe(403);
    expect(typeof estudio.body.error).toBe('string');
    expect(estudio.body.error.length).toBeGreaterThan(0);

    const resumo = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${semCanal.token}`);
    expect(resumo.status).toBe(403);
    expect(typeof resumo.body.error).toBe('string');
  });

  it('dono de canal INATIVO (isActive: false) → 403 nas duas rotas — canal desativado não conta', async () => {
    const donoInativo = await criarUsuarioComToken('Dono Canal Inativo');
    await Channel.create({ ownerId: donoInativo.id, name: 'Canal Inativo Guarda', isActive: false });

    const estudio = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${donoInativo.token}`);
    expect(estudio.status).toBe(403);

    const resumo = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoInativo.token}`);
    expect(resumo.status).toBe(403);
  });

  it('dono de UM canal ativo e OUTRO inativo → passa (o canal inativo só não entra na lista/números)', async () => {
    const dono = await criarUsuarioComToken('Dono Misto Ativo Inativo');
    await Channel.create({ ownerId: dono.id, name: 'Canal Misto Ativo', isActive: true });
    await Channel.create({ ownerId: dono.id, name: 'Canal Misto Inativo', isActive: false });

    const res = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canais).toHaveLength(1);
    expect(res.body.canais[0].name).toBe('Canal Misto Ativo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/resumo — mês corrente: isolamento entre donos + bate com o
// service admin (comparação literal) + shape sem R$
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/resumo — mês corrente (sem R$)', () => {
  let donoA, donoB, canalA, canalB, serieA, serieB, epA, epB;

  beforeAll(async () => {
    // Cenário limpo: mês corrente só com os eventos deste describe.
    await EngagementEvent.deleteMany({});

    donoA = await criarUsuarioComToken('Dono Resumo A');
    donoB = await criarUsuarioComToken('Dono Resumo B');
    canalA = await Channel.create({ ownerId: donoA.id, name: 'Canal Resumo A' });
    canalB = await Channel.create({ ownerId: donoB.id, name: 'Canal Resumo B' });
    serieA = await Series.create({ title: 'Obra Resumo A', content_type: 'hiqua', channelId: canalA._id, isPublished: true, genre: 'Aventura' });
    serieB = await Series.create({ title: 'Obra Resumo B', content_type: 'vcine', channelId: canalB._id, isPublished: true, genre: 'Drama' });
    epA = await Episode.create({ seriesId: serieA._id, episode_number: 1, title: 'A1', status: 'published' });
    epB = await Episode.create({ seriesId: serieB._id, episode_number: 1, title: 'B1', status: 'published' });

    // 5 views válidas (consumidores distintos) para A, 2 válidas + 1 duplicada
    // (flagged, não conta) para B — valores não-redondos na fração final.
    for (let i = 0; i < 5; i++) {
      await engagementLogger.logEvent({ type: 'view', seriesId: serieA._id, episodeId: epA._id, ip: `30.0.0.${i}`, ua: 'x' });
    }
    await engagementLogger.logEvent({ type: 'read', seriesId: serieB._id, episodeId: epB._id, ip: '30.1.0.1', ua: 'x' });
    await engagementLogger.logEvent({ type: 'read', seriesId: serieB._id, episodeId: epB._id, ip: '30.1.0.2', ua: 'x' });
    await engagementLogger.flushForTests();
  });

  it('resumo de A contém só o canal de A (nada de B) — e vice-versa', async () => {
    const resA = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoA.token}`);
    expect(resA.status).toBe(200);
    expect(resA.body.canais).toHaveLength(1);
    expect(String(resA.body.canais[0].channelId)).toBe(String(canalA._id));

    const resB = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoB.token}`);
    expect(resB.status).toBe(200);
    expect(resB.body.canais).toHaveLength(1);
    expect(String(resB.body.canais[0].channelId)).toBe(String(canalB._id));
  });

  it('bate literalmente com o service admin: mesmos points/share do GET /api/admin/royalties/report', async () => {
    const admin = await request(app)
      .get(`/api/admin/royalties/report?period=${currentPeriod()}`)
      .set('Authorization', `Bearer ${auth.getToken('admin')}`);
    expect(admin.status).toBe(200);
    const canalAdminA = admin.body.channels.find(c => String(c.channelId) === String(canalA._id));
    expect(canalAdminA).toBeTruthy();
    // não-redondo: 5 de um total de 7 pontos
    expect(canalAdminA.points).toBe(5);
    expect(canalAdminA.share).toBeCloseTo(5 / 7);

    const resA = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoA.token}`);
    const canalPortalA = resA.body.canais[0];
    expect(canalPortalA.points).toBe(canalAdminA.points);
    expect(canalPortalA.share).toBe(canalAdminA.share); // literal — mesmo float, sem recomputar
  });

  it('mês corrente NUNCA tem campo de R$ (a chave "amount" não existe no shape)', async () => {
    const resA = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoA.token}`);
    expect(resA.status).toBe(200);
    expect(resA.body.canais[0]).not.toHaveProperty('amount');
    expect(JSON.stringify(resA.body.canais)).not.toContain('amount');
  });

  it('period ausente e period=mês atual explícito dão o mesmo resultado (status "aberto")', async () => {
    const semPeriod = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoA.token}`);
    const comPeriod = await request(app).get(`/api/portal/resumo?period=${currentPeriod()}`).set('Authorization', `Bearer ${donoA.token}`);
    expect(semPeriod.body.period).toBe(currentPeriod());
    expect(comPeriod.body.period).toBe(currentPeriod());
    expect(semPeriod.body.canais[0].points).toBe(comPeriod.body.canais[0].points);
    expect(comPeriod.body.canais[0]).not.toHaveProperty('amount');
  });

  it('period malformado → 400', async () => {
    const res = await request(app).get('/api/portal/resumo?period=lixo').set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(400);
  });

  it('period no passado sem RoyaltyPeriod fechado → 404', async () => {
    const res = await request(app)
      .get(`/api/portal/resumo?period=${periodoPassado(60)}`)
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/resumo — período FECHADO: com R$, filtrado ao canal
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/resumo — período fechado (com R$)', () => {
  let donoA, donoB, canalA, canalB, canalOutro;
  const periodoFechado = periodoPassado(2);

  beforeAll(async () => {
    donoA = await criarUsuarioComToken('Dono Fechado A');
    donoB = await criarUsuarioComToken('Dono Fechado B');
    canalA = await Channel.create({ ownerId: donoA.id, name: 'Canal Fechado A' });
    canalB = await Channel.create({ ownerId: donoB.id, name: 'Canal Fechado B' });
    canalOutro = await Channel.create({ ownerId: auth.getId('admin'), name: 'Canal Fechado Outro' });

    await RoyaltyPeriod.create({
      period: periodoFechado,
      poolSuggested: 250,
      poolFinal: 137.5, // não-redondo
      status: 'closed',
      breakdown: [
        { channelId: canalA._id, channelName: canalA.name, points: 33, share: 0.6, amount: 82.5 },
        { channelId: canalB._id, channelName: canalB.name, points: 22, share: 0.4, amount: 55 },
        { channelId: canalOutro._id, channelName: canalOutro.name, points: 5, share: 0.0909, amount: 12.5 },
      ],
      closedAt: new Date('2026-01-05T03:00:00.000Z'),
      closedBy: auth.getId('admin'),
    });
  });

  it('dono A vê só a linha do próprio canal, com amount (R$) — nada de B nem do canal outro', async () => {
    const res = await request(app)
      .get(`/api/portal/resumo?period=${periodoFechado}`)
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canais).toHaveLength(1);
    const linha = res.body.canais[0];
    expect(String(linha.channelId)).toBe(String(canalA._id));
    expect(linha.points).toBe(33);
    expect(linha.share).toBeCloseTo(0.6);
    expect(linha.amount).toBe(82.5);
  });

  it('dono B vê só a linha do próprio canal, com amount diferente', async () => {
    const res = await request(app)
      .get(`/api/portal/resumo?period=${periodoFechado}`)
      .set('Authorization', `Bearer ${donoB.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canais).toHaveLength(1);
    expect(res.body.canais[0].amount).toBe(55);
  });

  it('período fechado aparece na lista de períodos fechados disponíveis do dono', async () => {
    const res = await request(app)
      .get('/api/portal/resumo')
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.body.periodosFechadosDisponiveis).toContain(periodoFechado);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/resumo — Super Reader escopado
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/resumo — Super Reader escopado', () => {
  let donoA, donoB, canalA, canalB, serieA, serieB;

  beforeAll(async () => {
    donoA = await criarUsuarioComToken('Dono SR A');
    donoB = await criarUsuarioComToken('Dono SR B');
    canalA = await Channel.create({ ownerId: donoA.id, name: 'Canal SR A' });
    canalB = await Channel.create({ ownerId: donoB.id, name: 'Canal SR B' });
    serieA = await Series.create({ title: 'Obra SR A', content_type: 'hiqua', channelId: canalA._id });
    serieB = await Series.create({ title: 'Obra SR B', content_type: 'hiqua', channelId: canalB._id });

    await SuperReaderContribution.create({
      seriesId: serieA._id,
      channelId: canalA._id,
      amountCents: 733,
      currency: 'brl',
      authorShareCents: 586,
      platformShareCents: 147,
      stripeSessionId: `sess-sr-a-${new mongoose.Types.ObjectId()}`,
      period: currentPeriod(),
    });
    await SuperReaderContribution.create({
      seriesId: serieB._id,
      channelId: canalB._id,
      amountCents: 512,
      currency: 'brl',
      authorShareCents: 410,
      platformShareCents: 102,
      stripeSessionId: `sess-sr-b-${new mongoose.Types.ObjectId()}`,
      period: currentPeriod(),
    });
  });

  it('resumo de A traz só o apoio SR do canal de A', async () => {
    const res = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.superReader.porCanal).toHaveLength(1);
    const linha = res.body.superReader.porCanal[0];
    expect(String(linha.channelId)).toBe(String(canalA._id));
    expect(linha.apoios).toBe(1);
    expect(linha.autorCents).toBe(586);
  });

  it('resumo de B traz só o apoio SR do canal de B — nada de A', async () => {
    const res = await request(app).get('/api/portal/resumo').set('Authorization', `Bearer ${donoB.token}`);
    expect(res.body.superReader.porCanal).toHaveLength(1);
    expect(res.body.superReader.porCanal[0].autorCents).toBe(410);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/meu-estudio — contagens (obras, pendentes, não lidas)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/meu-estudio — contagens por canal', () => {
  let dono, canal;

  beforeAll(async () => {
    dono = await criarUsuarioComToken('Dono Estudio Contagens');
    canal = await Channel.create({ ownerId: dono.id, name: 'Canal Estudio Contagens' });

    // 3 obras no canal: 1 pendente (submetida, não publicada), 1 publicada
    // (não pendente), 1 draft nunca enviada (não pendente).
    const seriePendente = await Series.create({
      title: 'Serie Pendente Estudio', content_type: 'hiqua', channelId: canal._id,
      submittedAt: new Date('2026-08-20T11:05:00.000Z'), isPublished: false,
    });
    await Series.create({
      title: 'Serie Publicada Estudio', content_type: 'hiqua', channelId: canal._id,
      isPublished: true, genre: 'Aventura',
    });
    await Series.create({
      title: 'Serie Draft Estudio', content_type: 'hiqua', channelId: canal._id,
    });

    // 2 capítulos numa das séries: 1 pendente (submetido, draft), 1 publicado.
    await Episode.create({
      seriesId: seriePendente._id, episode_number: 1, title: 'Cap Pendente',
      submittedAt: new Date('2026-08-21T09:00:00.000Z'), status: 'draft',
    });
    await Episode.create({
      seriesId: seriePendente._id, episode_number: 2, title: 'Cap Publicado', status: 'published',
    });

    // Mensagens: 1 não lida (conta), 1 lida (não conta), 1 arquivada (não
    // conta), 1 do próprio ilustrador (não conta — não é do editor).
    const editorId = auth.getId('admin');
    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: editorId,
      texto: 'Mensagem não lida do editor',
    });
    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: editorId,
      texto: 'Mensagem já lida do editor', lidaEm: new Date('2026-08-22T10:00:00.000Z'),
    });
    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: editorId,
      texto: 'Mensagem arquivada do editor', arquivadaEm: new Date('2026-08-23T10:00:00.000Z'),
    });
    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id,
      texto: 'Mensagem do próprio ilustrador (não conta como não lida do editor)',
    });
  });

  it('obras = 3, pendentes = 2 (1 série + 1 episódio), mensagensNaoLidas = 1', async () => {
    const res = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canais).toHaveLength(1);
    const linha = res.body.canais[0];
    expect(String(linha.channelId)).toBe(String(canal._id));
    expect(linha.obras).toBe(3);
    expect(linha.pendentes).toBe(2);
    expect(linha.mensagensNaoLidas).toBe(1);
  });
});
