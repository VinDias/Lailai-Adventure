/**
 * Testes: Fase 5 Bloco 1, Task 6 — mensagens editor<->ilustrador.
 * Cobre:
 *  - GET/POST /api/portal/mensagens (dono): thread VIGENTE do canal
 *    (canalId + ownerUserId: req.user.id + arquivadaEm: null), ordem
 *    cronológica ASC, canalId condicional (1 canal = default, >1 = obrigatório),
 *    allowlist estrita no POST (refTipo/refId/autorTipo/autorUserId/
 *    ownerUserId do body são sempre ignorados), limites de texto (vazio e
 *    2001 chars -> 400), lidaEm simétrico (GET marca as do editor, nunca as
 *    próprias), ownership cruzado -> 404.
 *  - GET/POST /api/admin/mensagens/:canalId (admin): vê TODAS as threads
 *    (vigente + arquivadas), lidaEm simétrico (marca as do ilustrador),
 *    refTipo/refId validados (enum, ObjectId, pertence ao MESMO canal).
 *  - Escopo por dono vigente: canal transferido A->B — B não lê o histórico
 *    de A; admin lê tudo.
 *  - Contadores do GET /portal/meu-estudio continuam batendo com o critério
 *    editor->não lida->vigente após estas rotas existirem.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;
let Channel, Series, Episode, User, MensagemPortal;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
  User = require('../../models/User');
  MensagemPortal = require('../../models/MensagemPortal');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

// ─── Helpers ────────────────────────────────────────────────────────────────

let contador = 0;
async function criarDono(nome) {
  contador += 1;
  const email = `portal-msg-${contador}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await User.create({ email, passwordHash, nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  const token = login.body.accessToken;
  const canal = await Channel.create({ ownerId: user._id, name: `Canal ${nome} ${Date.now()}` });
  return { id: user._id.toString(), token, canal };
}

// Usuário SEM canal algum — usado no teste de transferência: precisa virar
// dono de EXATAMENTE um canal (o transferido), senão canalId passa a ser
// obrigatório (regra de "1 canal = default, >1 = obrigatório") e o teste de
// escopo por dono vigente pararia de exercitar o caminho "canalId opcional".
async function criarUsuarioSemCanal(nome) {
  contador += 1;
  const email = `portal-msg-semcanal-${contador}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome, role: 'user' });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { id: user._id.toString(), token: login.body.accessToken, email };
}

const ADMIN_HEADER = () => `Bearer ${auth.getToken('admin')}`;

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/portal/mensagens
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/mensagens', () => {
  it('sem token -> 401; sem canal -> 403', async () => {
    const semAuth = await request(app).get('/api/portal/mensagens');
    expect(semAuth.status).toBe(401);

    const semCanal = await User.create({
      email: `portal-msg-semcanal-${Date.now()}@lorflux.test`,
      passwordHash: await bcrypt.hash('Senha@123', 10),
      nome: 'Sem Canal Msg', role: 'user',
    });
    const login = await request(app).post('/api/auth/login').send({ email: semCanal.email, password: 'Senha@123' });
    const res = await request(app)
      .get('/api/portal/mensagens')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('devolve a thread em ordem cronológica ASC (dono de UM canal, canalId opcional)', async () => {
    const dono = await criarDono('Ordem Cronologica');
    await MensagemPortal.create([
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'terceira', createdAt: new Date('2026-08-30T12:00:00.000Z') },
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'primeira', createdAt: new Date('2026-08-28T09:15:00.000Z') },
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'segunda', createdAt: new Date('2026-08-29T10:30:00.000Z') },
    ]);

    const res = await request(app)
      .get('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`);

    expect(res.status).toBe(200);
    expect(res.body.mensagens.map(m => m.texto)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('dono de DOIS canais: canalId ausente -> 400; canalId de canal alheio -> 404; canalId válido -> filtra certo', async () => {
    contador += 1;
    const email = `portal-msg-doiscanais-${contador}-${Date.now()}@lorflux.test`;
    const senha = 'Senha@123';
    const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: 'Dois Canais Msg', role: 'user' });
    const login = await request(app).post('/api/auth/login').send({ email, password: senha });
    const token = login.body.accessToken;
    const canalA = await Channel.create({ ownerId: user._id, name: 'Canal A Msg Dois' });
    const canalB = await Channel.create({ ownerId: user._id, name: 'Canal B Msg Dois' });
    await MensagemPortal.create({ canalId: canalB._id, ownerUserId: user._id, autorTipo: 'ilustrador', autorUserId: user._id, texto: 'msg do canal B' });

    const semCanalId = await request(app).get('/api/portal/mensagens').set('Authorization', `Bearer ${token}`);
    expect(semCanalId.status).toBe(400);

    const outroDono = await criarDono('Canal Alheio Para Msg DoisCanais');
    const canalAlheio = await request(app)
      .get('/api/portal/mensagens')
      .query({ canalId: String(outroDono.canal._id) })
      .set('Authorization', `Bearer ${token}`);
    expect(canalAlheio.status).toBe(404);

    const valido = await request(app)
      .get('/api/portal/mensagens')
      .query({ canalId: String(canalB._id) })
      .set('Authorization', `Bearer ${token}`);
    expect(valido.status).toBe(200);
    expect(valido.body.mensagens.length).toBe(1);
    expect(valido.body.mensagens[0].texto).toBe('msg do canal B');
  });

  it('lidaEm simétrico: GET marca como lida as mensagens do EDITOR ainda não lidas; NUNCA as do próprio ilustrador', async () => {
    const dono = await criarDono('LidaEm Simetrico Dono');
    const doEditor = await MensagemPortal.create({
      canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'mensagem do editor',
    });
    const doIlustrador = await MensagemPortal.create({
      canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'mensagem do proprio ilustrador',
    });
    expect(doEditor.lidaEm).toBeNull();
    expect(doIlustrador.lidaEm).toBeNull();

    const res = await request(app).get('/api/portal/mensagens').set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);

    const editorNoBanco = await MensagemPortal.findById(doEditor._id).lean();
    const ilustradorNoBanco = await MensagemPortal.findById(doIlustrador._id).lean();
    expect(editorNoBanco.lidaEm).not.toBeNull();
    expect(ilustradorNoBanco.lidaEm).toBeNull(); // nunca a própria

    const naResposta = res.body.mensagens.find(m => m.texto === 'mensagem do editor');
    expect(naResposta.lidaEm).not.toBeNull();
  });

  it('escopo por dono vigente: canal transferido A->B — B NÃO lê o histórico de A (thread arquivada)', async () => {
    const donoA = await criarDono('Transferencia A');
    // B ainda não é dono de canal algum — vira dono de EXATAMENTE um (o
    // transferido) após o PUT abaixo, mantendo canalId opcional no GET dele.
    const donoB = await criarUsuarioSemCanal('Transferencia B (email alvo)');
    const canal = donoA.canal;

    await MensagemPortal.create({ canalId: canal._id, ownerUserId: donoA.id, autorTipo: 'ilustrador', autorUserId: donoA.id, texto: 'segredo do dono A' });

    // Transfere o canal de A para o usuário de B via PUT admin com ownerEmail
    // (arquiva a thread de A automaticamente, T1).
    const transferencia = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ ownerEmail: donoB.email });
    expect(transferencia.status).toBe(200);

    // B manda uma mensagem nova na thread vigente dele.
    await MensagemPortal.create({ canalId: canal._id, ownerUserId: donoB.id, autorTipo: 'ilustrador', autorUserId: donoB.id, texto: 'mensagem nova do dono B' });

    const comoB = await request(app)
      .get('/api/portal/mensagens')
      .set('Authorization', `Bearer ${donoB.token}`);
    expect(comoB.status).toBe(200);
    expect(comoB.body.mensagens.length).toBe(1);
    expect(comoB.body.mensagens[0].texto).toBe('mensagem nova do dono B');
    expect(comoB.body.mensagens.some(m => m.texto === 'segredo do dono A')).toBe(false);
  });

  it('limit inválido -> 400; before inválido -> 400', async () => {
    const dono = await criarDono('Limit Before Invalidos');
    const limitInvalido = await request(app)
      .get('/api/portal/mensagens')
      .query({ limit: 'abc' })
      .set('Authorization', `Bearer ${dono.token}`);
    expect(limitInvalido.status).toBe(400);

    const beforeInvalido = await request(app)
      .get('/api/portal/mensagens')
      .query({ before: 'nao-e-uma-data' })
      .set('Authorization', `Bearer ${dono.token}`);
    expect(beforeInvalido.status).toBe(400);
  });

  it('limit + before: pagina mensagens mais antigas em ordem ASC', async () => {
    const dono = await criarDono('Paginacao Limit Before');
    await MensagemPortal.create([
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'msg 1', createdAt: new Date('2026-07-01T08:00:00.000Z') },
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'msg 2', createdAt: new Date('2026-07-02T08:00:00.000Z') },
      { canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'msg 3', createdAt: new Date('2026-07-03T08:00:00.000Z') },
    ]);

    const ultimaPagina = await request(app)
      .get('/api/portal/mensagens')
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${dono.token}`);
    expect(ultimaPagina.status).toBe(200);
    expect(ultimaPagina.body.mensagens.map(m => m.texto)).toEqual(['msg 3']);

    const paginaAnterior = await request(app)
      .get('/api/portal/mensagens')
      .query({ limit: 2, before: '2026-07-03T08:00:00.000Z' })
      .set('Authorization', `Bearer ${dono.token}`);
    expect(paginaAnterior.status).toBe(200);
    expect(paginaAnterior.body.mensagens.map(m => m.texto)).toEqual(['msg 1', 'msg 2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/portal/mensagens
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/portal/mensagens', () => {
  it('sem token -> 401; sem canal -> 403', async () => {
    const semAuth = await request(app).post('/api/portal/mensagens').send({ texto: 'oi' });
    expect(semAuth.status).toBe(401);
  });

  it('cria mensagem do ilustrador na thread vigente (dono de UM canal, canalId default)', async () => {
    const dono = await criarDono('Post Sucesso Um Canal');
    const res = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: 'Dúvida sobre o capítulo 2' });

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe('Dúvida sobre o capítulo 2');
    expect(res.body.autorTipo).toBe('ilustrador');
    expect(String(res.body.autorUserId)).toBe(dono.id);
    expect(String(res.body.ownerUserId)).toBe(dono.id);
    expect(String(res.body.canalId)).toBe(String(dono.canal._id));
    expect(res.body.refTipo).toBeNull();
    expect(res.body.lidaEm).toBeNull();
  });

  it('allowlist: refTipo/refId/autorTipo/autorUserId/ownerUserId no body são SEMPRE ignorados', async () => {
    const dono = await criarDono('Post Allowlist');
    const outroUsuario = await criarDono('Post Allowlist Vitima');

    const res = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({
        texto: 'tentativa maliciosa',
        refTipo: 'series',
        refId: '000000000000000000000123',
        autorTipo: 'editor',
        autorUserId: outroUsuario.id,
        ownerUserId: outroUsuario.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.autorTipo).toBe('ilustrador');
    expect(String(res.body.autorUserId)).toBe(dono.id);
    expect(String(res.body.ownerUserId)).toBe(dono.id);
    expect(res.body.refTipo).toBeNull();
    expect(res.body.refId).toBeNull();
  });

  it('texto vazio -> 400; texto só com espaços -> 400', async () => {
    const dono = await criarDono('Post Texto Vazio');
    const vazio = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: '' });
    expect(vazio.status).toBe(400);

    const espacos = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: '   ' });
    expect(espacos.status).toBe(400);

    const ausente = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({});
    expect(ausente.status).toBe(400);
  });

  it('texto com 2001 chars -> 400 (não 500); 2000 chars -> 201', async () => {
    const dono = await criarDono('Post Texto Maxlength');
    const estourado = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: 'a'.repeat(2001) });
    expect(estourado.status).toBe(400);

    const noLimite = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: 'a'.repeat(2000) });
    expect(noLimite.status).toBe(201);
    expect(noLimite.body.texto.length).toBe(2000);
  });

  it('dono de DOIS canais: canalId ausente -> 400; canalId de canal alheio -> 404', async () => {
    contador += 1;
    const email = `portal-msg-post-doiscanais-${contador}-${Date.now()}@lorflux.test`;
    const senha = 'Senha@123';
    const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: 'Dois Canais Post Msg', role: 'user' });
    const login = await request(app).post('/api/auth/login').send({ email, password: senha });
    const token = login.body.accessToken;
    await Channel.create({ ownerId: user._id, name: 'Canal Post A Dois' });
    const canalB = await Channel.create({ ownerId: user._id, name: 'Canal Post B Dois' });

    const semCanalId = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'sem canalId' });
    expect(semCanalId.status).toBe(400);

    const outroDono = await criarDono('Canal Alheio Para Post DoisCanais');
    const canalAlheio = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'canal alheio', canalId: String(outroDono.canal._id) });
    expect(canalAlheio.status).toBe(404);

    const valido = await request(app)
      .post('/api/portal/mensagens')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'canal certo', canalId: String(canalB._id) });
    expect(valido.status).toBe(201);
    expect(String(valido.body.canalId)).toBe(String(canalB._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/mensagens/:canalId
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/mensagens/:canalId', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const dono = await criarDono('Admin GET Nao Admin');
    const semAuth = await request(app).get(`/api/admin/mensagens/${dono.canal._id}`);
    expect(semAuth.status).toBe(401);

    const naoAdmin = await request(app)
      .get(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(naoAdmin.status).toBe(403);
  });

  it('canal inexistente -> 404', async () => {
    const res = await request(app)
      .get('/api/admin/mensagens/000000000000000000000000')
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(404);
  });

  it('vê a thread vigente E as arquivadas — B lê tudo, agrupado por thread', async () => {
    const donoA = await criarDono('Admin Ve Tudo A');
    const donoB = await criarDono('Admin Ve Tudo B');
    const canal = donoA.canal;

    await MensagemPortal.create({ canalId: canal._id, ownerUserId: donoA.id, autorTipo: 'ilustrador', autorUserId: donoA.id, texto: 'mensagem de A' });

    await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ ownerEmail: (await User.findById(donoB.id)).email });

    await MensagemPortal.create({ canalId: canal._id, ownerUserId: donoB.id, autorTipo: 'ilustrador', autorUserId: donoB.id, texto: 'mensagem de B' });

    const res = await request(app)
      .get(`/api/admin/mensagens/${canal._id}`)
      .set('Authorization', ADMIN_HEADER());

    expect(res.status).toBe(200);
    expect(res.body.threads.length).toBe(2);

    const vigente = res.body.threads.find(t => t.vigente);
    const arquivada = res.body.threads.find(t => !t.vigente);
    expect(String(vigente.ownerUserId)).toBe(donoB.id);
    expect(vigente.mensagens.map(m => m.texto)).toEqual(['mensagem de B']);
    expect(String(arquivada.ownerUserId)).toBe(donoA.id);
    expect(arquivada.arquivadaEm).not.toBeNull();
    expect(arquivada.mensagens.map(m => m.texto)).toEqual(['mensagem de A']);
  });

  it('lidaEm simétrico: marca como lida as mensagens do ILUSTRADOR ainda não lidas; NUNCA as do próprio editor', async () => {
    const dono = await criarDono('Admin LidaEm Simetrico');
    const doIlustrador = await MensagemPortal.create({
      canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'do ilustrador',
    });
    const doEditor = await MensagemPortal.create({
      canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'do editor',
    });

    const res = await request(app)
      .get(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER());
    expect(res.status).toBe(200);

    const ilustradorNoBanco = await MensagemPortal.findById(doIlustrador._id).lean();
    const editorNoBanco = await MensagemPortal.findById(doEditor._id).lean();
    expect(ilustradorNoBanco.lidaEm).not.toBeNull();
    expect(editorNoBanco.lidaEm).toBeNull(); // nunca a própria (do editor)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/mensagens/:canalId
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/mensagens/:canalId', () => {
  it('sem token -> 401; não-admin -> 403', async () => {
    const dono = await criarDono('Admin POST Nao Admin');
    const naoAdmin = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ texto: 'x' });
    expect(naoAdmin.status).toBe(403);
  });

  it('canal inexistente -> 404', async () => {
    const res = await request(app)
      .post('/api/admin/mensagens/000000000000000000000000')
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'x' });
    expect(res.status).toBe(404);
  });

  it('cria mensagem do editor com ownerUserId resolvido para o DONO ATUAL do canal', async () => {
    const dono = await criarDono('Admin Post Owner Atual');
    const res = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Resposta do editor' });

    expect(res.status).toBe(201);
    expect(res.body.autorTipo).toBe('editor');
    expect(String(res.body.autorUserId)).toBe(auth.getId('admin'));
    expect(String(res.body.ownerUserId)).toBe(dono.id);
  });

  it('texto vazio -> 400; 2001 chars -> 400', async () => {
    const dono = await criarDono('Admin Post Texto Invalido');
    const vazio = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: '' });
    expect(vazio.status).toBe(400);

    const estourado = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'a'.repeat(2001) });
    expect(estourado.status).toBe(400);
  });

  it('refTipo/refId válidos (série do MESMO canal) -> 201 com refs gravadas', async () => {
    const dono = await criarDono('Admin Post Ref Valida');
    const serie = await Series.create({ title: 'Serie Do Canal Ref', content_type: 'hiqua', channelId: dono.canal._id });

    const res = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Devolvido: falta thumbnail', refTipo: 'series', refId: String(serie._id) });

    expect(res.status).toBe(201);
    expect(res.body.refTipo).toBe('series');
    expect(String(res.body.refId)).toBe(String(serie._id));
  });

  it('refId de série de OUTRO canal -> 400', async () => {
    const donoA = await criarDono('Admin Post Ref Outro Canal A');
    const donoB = await criarDono('Admin Post Ref Outro Canal B');
    const serieDeB = await Series.create({ title: 'Serie De B Ref', content_type: 'hiqua', channelId: donoB.canal._id });

    const res = await request(app)
      .post(`/api/admin/mensagens/${donoA.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'referenciando obra errada', refTipo: 'series', refId: String(serieDeB._id) });

    expect(res.status).toBe(400);
  });

  it('refTipo/refId de episódio válido (do MESMO canal, via série) -> 201', async () => {
    const dono = await criarDono('Admin Post Ref Episodio Valido');
    const serie = await Series.create({ title: 'Serie Para Episodio Ref', content_type: 'hiqua', channelId: dono.canal._id });
    const episodio = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap Ref' });

    const res = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'Devolvido: capítulo 1', refTipo: 'episode', refId: String(episodio._id) });

    expect(res.status).toBe(201);
    expect(res.body.refTipo).toBe('episode');
    expect(String(res.body.refId)).toBe(String(episodio._id));
  });

  it('refId de episódio de OUTRO canal -> 400', async () => {
    const donoA = await criarDono('Admin Post Ref Ep Outro Canal A');
    const donoB = await criarDono('Admin Post Ref Ep Outro Canal B');
    const serieDeB = await Series.create({ title: 'Serie De B Para Ep Ref', content_type: 'hiqua', channelId: donoB.canal._id });
    const episodioDeB = await Episode.create({ seriesId: serieDeB._id, episode_number: 1, title: 'Cap De B' });

    const res = await request(app)
      .post(`/api/admin/mensagens/${donoA.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'referenciando capitulo errado', refTipo: 'episode', refId: String(episodioDeB._id) });

    expect(res.status).toBe(400);
  });

  it('refTipo inválido -> 400; refId com formato inválido -> 400; refTipo sem refId -> 400', async () => {
    const dono = await criarDono('Admin Post Ref Formatos Invalidos');

    const tipoInvalido = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'x', refTipo: 'capitulo', refId: '000000000000000000000123' });
    expect(tipoInvalido.status).toBe(400);

    const idInvalido = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'x', refTipo: 'series', refId: 'nao-e-objectid' });
    expect(idInvalido.status).toBe(400);

    const semRefId = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'x', refTipo: 'series' });
    expect(semRefId.status).toBe(400);
  });

  it('sem refTipo/refId -> 201 com ambos null (não obrigatórios)', async () => {
    const dono = await criarDono('Admin Post Sem Ref');
    const res = await request(app)
      .post(`/api/admin/mensagens/${dono.canal._id}`)
      .set('Authorization', ADMIN_HEADER())
      .send({ texto: 'mensagem simples sem ref' });
    expect(res.status).toBe(201);
    expect(res.body.refTipo).toBeNull();
    expect(res.body.refId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contadores do GET /portal/meu-estudio (editor -> não lida -> vigente)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/portal/meu-estudio — contador mensagensNaoLidas consistente com esta task', () => {
  it('mensagem do editor conta; do próprio ilustrador não conta; lida não conta; arquivada não conta', async () => {
    const dono = await criarDono('Contador Meu Estudio');

    // Do próprio ilustrador — nunca deve contar.
    await MensagemPortal.create({ canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'minha propria' });
    // Do editor, não lida — conta.
    await MensagemPortal.create({ canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'editor nao lida 1' });
    await MensagemPortal.create({ canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'editor nao lida 2' });
    // Do editor, arquivada — não conta mesmo sem lidaEm.
    await MensagemPortal.create({ canalId: dono.canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: auth.getId('admin'), texto: 'editor arquivada', arquivadaEm: new Date('2026-01-01T00:00:00.000Z') });

    const antes = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${dono.token}`);
    expect(antes.status).toBe(200);
    const canalAntes = antes.body.canais.find(c => String(c.channelId) === String(dono.canal._id));
    expect(canalAntes.mensagensNaoLidas).toBe(2);

    // Abrir a thread (GET /portal/mensagens) marca as do editor como lidas.
    await request(app).get('/api/portal/mensagens').set('Authorization', `Bearer ${dono.token}`);

    const depois = await request(app).get('/api/portal/meu-estudio').set('Authorization', `Bearer ${dono.token}`);
    const canalDepois = depois.body.canais.find(c => String(c.channelId) === String(dono.canal._id));
    expect(canalDepois.mensagensNaoLidas).toBe(0);
  });
});
