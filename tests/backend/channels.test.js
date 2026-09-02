/**
 * Testes: Canais (Fase 5 Bloco 1 — fundações do Portal do Ilustrador)
 * Cobre: POST /channels admin-only, PUT /channels/:id (branch admin +
 * troca de dono via ownerEmail + revogação pós-transferência), POST
 * /channels/:id/desativar, e o novo shape público de GET /channels/:id
 * (followersCount/isFollowing, sem followers[]).
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken, getId, getUsers } = require('../helpers/auth');

let app;
let Channel;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

async function criarCanal(ownerKey, name) {
  return Channel.create({ ownerId: getId(ownerKey), name });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/channels — vira admin-only
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/channels', () => {
  it('403 para usuário não-admin (autopromoção a ilustrador bloqueada)', async () => {
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ name: 'Canal Autopromovido' });
    expect(res.status).toBe(403);
  });

  it('201 para admin', async () => {
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ name: 'Canal Criado Pelo Admin' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Canal Criado Pelo Admin');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/channels/:id — branch admin + ownerEmail
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/channels/:id', () => {
  it('admin edita canal de terceiro (sem ser dono)', async () => {
    const canal = await criarCanal('user', 'Canal Do Usuario Comum');

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ description: 'Editado pelo Master' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Editado pelo Master');

    const atualizado = await Channel.findById(canal._id).lean();
    expect(atualizado.ownerId.toString()).toBe(getId('user'));
  });

  it('admin troca o dono via ownerEmail (e-mail válido, case-insensitive)', async () => {
    const canal = await criarCanal('user', 'Canal Para Transferir');
    const emailPremium = getUsers().premium.email;

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ ownerEmail: emailPremium.toUpperCase() });

    expect(res.status).toBe(200);

    const atualizado = await Channel.findById(canal._id).lean();
    expect(atualizado.ownerId.toString()).toBe(getId('premium'));
  });

  it('admin troca o dono via ownerEmail (e-mail inexistente) → 404 e não altera o canal', async () => {
    const canal = await criarCanal('user', 'Canal Email Invalido');

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ ownerEmail: 'nao-existe-ninguem-com-este-email@lorflux.test' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();

    const inalterado = await Channel.findById(canal._id).lean();
    expect(inalterado.ownerId.toString()).toBe(getId('user'));
  });

  it('revogação pós-transferência: admin transfere para A e depois para B, mesmo sem nunca ter sido dono', async () => {
    const canal = await criarCanal('inactive', 'Canal Revogacao'); // dono inicial nem é A nem B

    const t1 = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ ownerEmail: getUsers().user.email });
    expect(t1.status).toBe(200);

    let atual = await Channel.findById(canal._id).lean();
    expect(atual.ownerId.toString()).toBe(getId('user'));

    const t2 = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ ownerEmail: getUsers().premium.email });
    expect(t2.status).toBe(200);

    atual = await Channel.findById(canal._id).lean();
    expect(atual.ownerId.toString()).toBe(getId('premium'));
  });

  it('não-admin com ownerEmail no body → 403 SEMPRE, mesmo no próprio canal', async () => {
    const canal = await criarCanal('user', 'Canal Do Proprio Usuario');

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ ownerEmail: getUsers().premium.email, description: 'tentando trocar de dono' });

    expect(res.status).toBe(403);

    const inalterado = await Channel.findById(canal._id).lean();
    expect(inalterado.ownerId.toString()).toBe(getId('user'));
    expect(inalterado.description).not.toBe('tentando trocar de dono');
  });

  it('não-admin segue editando SÓ o próprio canal (canal de terceiro → 404)', async () => {
    const canalProprio = await criarCanal('user', 'Meu Canal');
    const canalDeOutro = await criarCanal('premium', 'Canal Do Premium');

    const ok = await request(app)
      .put(`/api/channels/${canalProprio._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ description: 'Atualizado por mim' });
    expect(ok.status).toBe(200);
    expect(ok.body.description).toBe('Atualizado por mim');

    const negado = await request(app)
      .put(`/api/channels/${canalDeOutro._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ description: 'Tentando editar canal alheio' });
    expect(negado.status).toBe(404);

    const inalterado = await Channel.findById(canalDeOutro._id).lean();
    expect(inalterado.description).not.toBe('Tentando editar canal alheio');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/channels/:id/desativar — nova rota, admin-only
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/channels/:id/desativar', () => {
  it('admin desativa o canal (isActive vira false)', async () => {
    const canal = await criarCanal('user', 'Canal A Desativar');

    const res = await request(app)
      .post(`/api/channels/${canal._id}/desativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send();

    expect(res.status).toBe(200);

    const atualizado = await Channel.findById(canal._id).lean();
    expect(atualizado.isActive).toBe(false);
  });

  it('403 para não-admin', async () => {
    const canal = await criarCanal('user', 'Canal Protegido');

    const res = await request(app)
      .post(`/api/channels/${canal._id}/desativar`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send();

    expect(res.status).toBe(403);

    const inalterado = await Channel.findById(canal._id).lean();
    expect(inalterado.isActive).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/channels/:id — shape público pinado
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/channels/:id — shape público', () => {
  it('tem followersCount/isFollowing e NÃO tem followers[]', async () => {
    const canal = await criarCanal('user', 'Canal Publico Shape');
    canal.followers = [getId('premium')];
    await canal.save();

    const res = await request(app).get(`/api/channels/${canal._id}`);

    expect(res.status).toBe(200);
    expect(res.body.followersCount).toBe(1);
    expect(typeof res.body.isFollowing).toBe('boolean');
    expect(res.body.followers).toBeUndefined();
  });

  it('isFollowing true para seguidor autenticado, false para anônimo', async () => {
    const canal = await criarCanal('user', 'Canal Seguidor');
    canal.followers = [getId('premium')];
    await canal.save();

    const anonimo = await request(app).get(`/api/channels/${canal._id}`);
    expect(anonimo.body.isFollowing).toBe(false);

    const logado = await request(app)
      .get(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('premium')}`);
    expect(logado.body.isFollowing).toBe(true);

    const outroLogado = await request(app)
      .get(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(outroLogado.body.isFollowing).toBe(false);
  });
});
