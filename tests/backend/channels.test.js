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

  // Fix round da T8 — achado do revisor: name como ARRAY faz o Mongoose
  // lançar ValidationError (não CastError) na criação — Channel.create()
  // roda validação completa ANTES de salvar (diferente do cast síncrono de
  // findByIdAndUpdate). Sem tratamento de ValidationError, caía no catch
  // genérico e virava 500.
  it('name como ARRAY (ValidationError, não CastError) -> 400, não 500', async () => {
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ name: ['a', 'b'] });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
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

  // Fix round da T8 — achado do revisor: name como ARRAY faz channel.save()
  // lançar ValidationError (não CastError) — validação completa do documento
  // roda no save(), diferente do cast síncrono de findByIdAndUpdate (que é
  // o caminho que produz CastError puro em routes/adminPortal.js). Sem
  // tratamento de ValidationError aqui, caía no catch genérico e virava 500.
  it('name como ARRAY (ValidationError, não CastError) -> 400, não 500', async () => {
    const canal = await criarCanal('user', 'Canal Validation Error');
    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ name: ['a', 'b'] });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);

    const inalterado = await Channel.findById(canal._id).lean();
    expect(inalterado.name).toBe('Canal Validation Error');
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

// ═══════════════════════════════════════════════════════════════════════════
// followers[] fora de TODAS as respostas (triagem final do Bloco 1): o GET
// público já escondia; /me, a resposta do PUT e a do desativar ainda vazavam
// os userIds dos seguidores (dado pessoal de leitor).
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Higiene do Bloco 1 (Fase 5 Bloco 2, Task 8): CastError (id malformado) em
// TODAS as rotas de canal com :id devolve 404 — não mais o 500 do catch
// genérico (o CastError do Mongoose caía sem tratamento específico). Padrão
// restrito a `err.path === '_id'` (utils/routeErrors.js) — ver o mesmo
// arquivo para o outro lado (CastError em outro campo → 400, coberto em
// adminAprovacoes.test.js, a rota que de fato recebe campos castáveis).
// ═══════════════════════════════════════════════════════════════════════════

describe('Higiene do Bloco 1: CastError (id malformado) → 404 em rotas de canal', () => {
  const ID_MALFORMADO = 'id-nao-e-um-objectid';

  it('GET /api/channels/:id', async () => {
    const res = await request(app).get(`/api/channels/${ID_MALFORMADO}`);
    expect(res.status).toBe(404);
  });

  it('PUT /api/channels/:id (admin)', async () => {
    const res = await request(app)
      .put(`/api/channels/${ID_MALFORMADO}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ description: 'X' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/channels/:id (não-admin)', async () => {
    const res = await request(app)
      .put(`/api/channels/${ID_MALFORMADO}`)
      .set('Authorization', `Bearer ${getToken('user')}`)
      .send({ description: 'X' });
    expect(res.status).toBe(404);
  });

  it('POST /api/channels/:id/desativar', async () => {
    const res = await request(app)
      .post(`/api/channels/${ID_MALFORMADO}/desativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(404);
  });

  it('POST /api/channels/:id/reativar', async () => {
    const res = await request(app)
      .post(`/api/channels/${ID_MALFORMADO}/reativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(404);
  });

  it('POST /api/channels/:id/follow', async () => {
    const res = await request(app)
      .post(`/api/channels/${ID_MALFORMADO}/follow`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/channels/:id/follow', async () => {
    const res = await request(app)
      .delete(`/api/channels/${ID_MALFORMADO}/follow`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/channels?includeInactive=true — Fase 5 Bloco 2, Task 8. A rota já
// é admin-only (middleware requireAdmin) — não-admin nunca alcança o
// handler, então o parâmetro simplesmente não tem efeito nenhum pra ele.
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/channels?includeInactive=true', () => {
  it('admin sem o parâmetro: só ativos (regressão do shape antigo)', async () => {
    const ativo = await criarCanal('user', 'Canal Ativo Regressao IncludeInactive');
    const inativo = await criarCanal('premium', 'Canal Inativo Regressao IncludeInactive');
    inativo.isActive = false;
    await inativo.save();

    const res = await request(app)
      .get('/api/channels')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.some(c => c._id === String(inativo._id))).toBe(false);
    expect(res.body.some(c => c._id === String(ativo._id))).toBe(true);
  });

  it('admin com includeInactive=true: TODOS os canais, com isActive no shape', async () => {
    const ativo = await criarCanal('user', 'Canal Ativo Com IncludeInactive');
    const inativo = await criarCanal('premium', 'Canal Inativo Com IncludeInactive');
    inativo.isActive = false;
    await inativo.save();

    const res = await request(app)
      .get('/api/channels?includeInactive=true')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);

    const achadoInativo = res.body.find(c => c._id === String(inativo._id));
    expect(achadoInativo).toBeDefined();
    expect(achadoInativo.isActive).toBe(false);

    const achadoAtivo = res.body.find(c => c._id === String(ativo._id));
    expect(achadoAtivo).toBeDefined();
    expect(achadoAtivo.isActive).toBe(true);
  });

  it('não-admin: 403 (a rota inteira é admin-only, o parâmetro não abre exceção)', async () => {
    const res = await request(app)
      .get('/api/channels?includeInactive=true')
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/channels/:id/reativar — Fase 5 Bloco 2, Task 8 (conserto da
// desativação sem inversa — cortesia registrada, não faturável no B2).
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/channels/:id/reativar', () => {
  it('admin reativa o canal (isActive volta a true)', async () => {
    const canal = await criarCanal('user', 'Canal A Reativar');
    canal.isActive = false;
    await canal.save();

    const res = await request(app)
      .post(`/api/channels/${canal._id}/reativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);

    const atualizado = await Channel.findById(canal._id).lean();
    expect(atualizado.isActive).toBe(true);
  });

  it('403 para não-admin (canal permanece inativo)', async () => {
    const canal = await criarCanal('user', 'Canal Reativar Protegido');
    canal.isActive = false;
    await canal.save();

    const res = await request(app)
      .post(`/api/channels/${canal._id}/reativar`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(res.status).toBe(403);

    const inalterado = await Channel.findById(canal._id).lean();
    expect(inalterado.isActive).toBe(false);
  });

  it('canal inexistente → 404', async () => {
    const res = await request(app)
      .post('/api/channels/000000000000000000000000/reativar')
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(404);
  });

  it('resposta não devolve followers[]', async () => {
    const canal = await criarCanal('user', 'Canal Reativar Sem Followers');
    canal.isActive = false;
    canal.followers = [getId('premium')];
    await canal.save();

    const res = await request(app)
      .post(`/api/channels/${canal._id}/reativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.followers).toBeUndefined();
  });

  it('NÃO desarquiva a thread de mensagens do canal (a arquivada era do ex-dono; o dono atual tem a vigente própria)', async () => {
    const MensagemPortal = require('../../models/MensagemPortal');
    const canal = await criarCanal('user', 'Canal Reativar Thread Arquivada');

    const arquivada = await MensagemPortal.create({
      canalId: canal._id,
      ownerUserId: getId('premium'), // ex-dono simulado — não precisa ser o ownerId real do canal
      autorTipo: 'ilustrador',
      autorUserId: getId('premium'),
      texto: 'Mensagem do ex-dono',
      arquivadaEm: new Date('2026-08-01T00:00:00.000Z'),
    });

    await request(app)
      .post(`/api/channels/${canal._id}/desativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);

    await request(app)
      .post(`/api/channels/${canal._id}/reativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);

    const depois = await MensagemPortal.findById(arquivada._id).lean();
    expect(depois.arquivadaEm).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/channels/:id — admin enxerga canal INATIVO (Fase 5 Bloco 2, Task
// 8): necessário pro CanaisPanel buscar o detalhe completo (dono populado
// etc.) de um canal inativo listado via includeInactive=true. Público e
// não-admin continuam recebendo 404 — só o shape pinado da Fase 5 muda de
// consumidor, nunca de forma.
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/channels/:id — admin enxerga canal inativo', () => {
  it('canal inativo: 404 para anônimo e não-admin; 200 (com isActive:false) para admin', async () => {
    const canal = await criarCanal('user', 'Canal Inativo Detalhe Admin');
    canal.isActive = false;
    await canal.save();

    const anonimo = await request(app).get(`/api/channels/${canal._id}`);
    expect(anonimo.status).toBe(404);

    const naoAdmin = await request(app)
      .get(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('user')}`);
    expect(naoAdmin.status).toBe(404);

    const admin = await request(app)
      .get(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`);
    expect(admin.status).toBe(200);
    expect(admin.body.isActive).toBe(false);
    expect(admin.body.followers).toBeUndefined();
  });
});

describe('followers[] nunca sai nas demais respostas de canal', () => {
  it('GET /channels/me não devolve followers[]', async () => {
    const canal = await criarCanal('premium', 'Canal Me Sem Followers');
    canal.followers = [getId('user')];
    await canal.save();

    const res = await request(app)
      .get('/api/channels/me')
      .set('Authorization', `Bearer ${getToken('premium')}`);

    expect(res.status).toBe(200);
    const meu = res.body.find(c => c._id === String(canal._id));
    expect(meu).toBeDefined();
    expect(meu.followers).toBeUndefined();
  });

  it('resposta do PUT /channels/:id não devolve followers[]', async () => {
    const canal = await criarCanal('premium', 'Canal Put Sem Followers');
    canal.followers = [getId('user')];
    await canal.save();

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('premium')}`)
      .send({ description: 'Nova descricao' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Nova descricao');
    expect(res.body.followers).toBeUndefined();
  });

  it('resposta do POST /channels/:id/desativar não devolve followers[]', async () => {
    const canal = await criarCanal('user', 'Canal Desativar Sem Followers');
    canal.followers = [getId('premium')];
    await canal.save();

    const res = await request(app)
      .post(`/api/channels/${canal._id}/desativar`)
      .set('Authorization', `Bearer ${getToken('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(res.body.followers).toBeUndefined();
  });
});
