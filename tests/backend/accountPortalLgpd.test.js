/**
 * Testes: Fase 5 Bloco 1, Task 8 — LGPD do Portal do Ilustrador.
 * Cobre a interação entre DELETE /api/account/me (exclusão de conta) e a
 * titularidade de canal (routes/channels.js):
 *  - Dono de canal ATIVO: exclusão bloqueada (409), NADA é apagado
 *    (atomicidade — o request bloqueado não pode ter efeito colateral).
 *  - Desbloqueio: o editor desativa o canal (POST /channels/:id/desativar)
 *    OU transfere a titularidade (PUT /channels/:id ownerEmail) — em
 *    qualquer um dos dois casos a exclusão passa a funcionar.
 *  - Canais INATIVOS do ex-dono são transferidos ao primeiro usuário admin
 *    (o de createdAt mais antigo, role admin OU superadmin) — NUNCA
 *    apagados, obra publicada não pode sumir com a conta.
 *  - Mensagens do portal (MensagemPortal): as autoradas pelo usuário
 *    excluído são apagadas (comunicação privada dele); as do editor na
 *    MESMA thread são preservadas (autoria do editor, histórico do canal
 *    para o admin/próximo dono).
 *  - GET /api/account/me/export acrescenta `portalMessages` (autoradas OU
 *    recebidas, inclusive de threads arquivadas) e `channels[].isActive`
 *    (vínculo de canal).
 * A suíte LGPD pré-existente (tests/backend/security.test.js) cobre
 * exportação/exclusão "básica" (usuário sem canal) e não é tocada aqui.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');

let app;
let User, Channel, MensagemPortal, Favorite, ReadingProgress;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  Channel = require('../../models/Channel');
  MensagemPortal = require('../../models/MensagemPortal');
  Favorite = require('../../models/Favorite');
  ReadingProgress = require('../../models/ReadingProgress');
});

afterAll(() => db.closeDatabase());
// Isolamento total por teste: cada cenário monta seu próprio elenco de
// admins/donos — a lógica de "primeiro admin por createdAt" exige controle
// fino sobre quais admins existem no banco em cada teste.
afterEach(() => db.clearDatabase());

const SENHA = 'Senha@123';
let contador = 0;

async function criarUsuario(role = 'user', createdAt, nome) {
  contador += 1;
  const email = `lgpd-portal-${contador}-${Date.now()}@lorflux.test`;
  const passwordHash = await bcrypt.hash(SENHA, 10);
  const doc = { email, passwordHash, nome: nome || `Usuario LGPD ${contador}`, role };
  if (createdAt) doc.createdAt = createdAt;
  const user = await User.create(doc);
  const login = await request(app).post('/api/auth/login').send({ email, password: SENHA });
  return { id: user._id.toString(), token: login.body.accessToken, email };
}

async function criarCanal(ownerId, name, isActive = true) {
  return Channel.create({ ownerId, name, isActive });
}

function excluirConta(token) {
  return request(app)
    .delete('/api/account/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: SENHA });
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloqueio por canal ATIVO
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/account/me — bloqueio LGPD por canal ativo', () => {
  it('dono de canal ATIVO recebe 409 e NADA é apagado (atomicidade)', async () => {
    const dono = await criarUsuario('user', undefined, 'Dono Bloqueio Ativo');
    const canal = await criarCanal(dono.id, 'Canal Bloqueio Ativo', true);
    const favorito = await Favorite.create({ userId: dono.id, seriesId: new mongoose.Types.ObjectId() });
    const progresso = await ReadingProgress.create({
      userId: dono.id,
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.37,
    });

    const res = await excluirConta(dono.token);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/canal/i);

    // Nada foi tocado: conta, canal (inalterado), favorito e progresso seguem.
    expect(await User.findById(dono.id)).not.toBeNull();
    const canalAinda = await Channel.findById(canal._id);
    expect(canalAinda).not.toBeNull();
    expect(canalAinda.ownerId.toString()).toBe(dono.id);
    expect(canalAinda.isActive).toBe(true);
    expect(await Favorite.findById(favorito._id)).not.toBeNull();
    expect(await ReadingProgress.findById(progresso._id)).not.toBeNull();
  });

  it('dono só de canal(is) INATIVO(S) — sem nenhum ativo — NÃO é bloqueado', async () => {
    await criarUsuario('admin', new Date('2023-01-01T00:00:00.000Z'), 'Admin Disponivel');
    const dono = await criarUsuario('user', undefined, 'Dono So Inativo');
    await criarCanal(dono.id, 'Canal Ja Inativo', false);

    const res = await excluirConta(dono.token);
    expect(res.status).toBe(200);
    expect(await User.findById(dono.id)).toBeNull();
  });

  it('usuário sem canal algum não é bloqueado (comportamento LGPD pré-existente intacto)', async () => {
    const semCanal = await criarUsuario('user', undefined, 'Usuario Sem Canal Algum');
    const res = await excluirConta(semCanal.token);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fluxo completo: desativar desbloqueia
// ═══════════════════════════════════════════════════════════════════════════

describe('Fluxo completo: canal ativo bloqueia → editor desativa → exclusão passa', () => {
  it('após desativar, a exclusão transfere o canal ao admin, apaga mensagens do dono, preserva as do editor e limpa o resto do LGPD', async () => {
    const admin = await criarUsuario('admin', new Date('2023-01-01T00:00:00.000Z'), 'Admin Fluxo Completo');
    const dono = await criarUsuario('user', undefined, 'Dono Fluxo Completo');
    const canal = await criarCanal(dono.id, 'Canal Fluxo Completo', true);
    const favorito = await Favorite.create({ userId: dono.id, seriesId: new mongoose.Types.ObjectId() });

    const msgDoDono = await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'mensagem do dono',
    });
    const msgDoEditor = await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: admin.id, texto: 'mensagem do editor',
    });

    // 1) bloqueado enquanto o canal está ativo.
    const bloqueado = await excluirConta(dono.token);
    expect(bloqueado.status).toBe(409);

    // 2) o editor desativa o canal.
    const desativar = await request(app)
      .post(`/api/channels/${canal._id}/desativar`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(desativar.status).toBe(200);
    expect(desativar.body.isActive).toBe(false);

    // 3) a exclusão agora passa.
    const excluido = await excluirConta(dono.token);
    expect(excluido.status).toBe(200);

    expect(await User.findById(dono.id)).toBeNull();

    // Canal transferido ao admin (único admin existente), segue inativo — NUNCA apagado.
    const canalDepois = await Channel.findById(canal._id);
    expect(canalDepois).not.toBeNull();
    expect(canalDepois.ownerId.toString()).toBe(admin.id);
    expect(canalDepois.isActive).toBe(false);

    // Mensagem do dono apagada; a do editor preservada (órfã de interlocutor, histórico do canal mantido).
    expect(await MensagemPortal.findById(msgDoDono._id)).toBeNull();
    const editorPreservada = await MensagemPortal.findById(msgDoEditor._id);
    expect(editorPreservada).not.toBeNull();
    expect(editorPreservada.texto).toBe('mensagem do editor');

    // Resto da exclusão LGPD segue intacto.
    expect(await Favorite.findById(favorito._id)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Desbloqueio via transferência de titularidade
// ═══════════════════════════════════════════════════════════════════════════

describe('Desbloqueio via transferência de titularidade (PUT /channels/:id ownerEmail)', () => {
  it('após o admin transferir o canal para outro usuário, o ex-dono exclui a conta normalmente', async () => {
    const admin = await criarUsuario('admin', new Date('2023-01-01T00:00:00.000Z'), 'Admin Transferencia');
    const donoA = await criarUsuario('user', undefined, 'Dono A Transferencia');
    const donoB = await criarUsuario('user', undefined, 'Dono B Transferencia');
    const canal = await criarCanal(donoA.id, 'Canal Transferencia Exclusao', true);

    const transferir = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ownerEmail: donoB.email });
    expect(transferir.status).toBe(200);

    const excluir = await excluirConta(donoA.token);
    expect(excluir.status).toBe(200);
    expect(await User.findById(donoA.id)).toBeNull();

    // O canal não é mais do ex-dono: segue com o novo dono, intacto e ATIVO
    // (transferência de titularidade não desativa o canal).
    const canalDepois = await Channel.findById(canal._id);
    expect(canalDepois.ownerId.toString()).toBe(donoB.id);
    expect(canalDepois.isActive).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Canais inativos → primeiro admin (mais antigo por createdAt)
// ═══════════════════════════════════════════════════════════════════════════

describe('Canais inativos são transferidos ao PRIMEIRO admin (mais antigo por createdAt)', () => {
  it('entre dois admins de createdAt distintos, o canal vai para o mais antigo — mesmo criado DEPOIS no banco', async () => {
    // Criado PRIMEIRO no banco, mas com createdAt mais RECENTE.
    const adminRecente = await criarUsuario('admin', new Date('2025-06-01T00:00:00.000Z'), 'Admin Recente');
    // Criado DEPOIS no banco, mas com createdAt mais ANTIGO — deve vencer
    // (prova que a seleção usa createdAt, não ordem de inserção nem _id).
    const adminAntigo = await criarUsuario('superadmin', new Date('2020-01-01T00:00:00.000Z'), 'Admin Antigo');

    const dono = await criarUsuario('user', undefined, 'Dono Canal Inativo Dois Admins');
    const canal = await criarCanal(dono.id, 'Canal Inativo Para Admin Mais Antigo', false);

    const res = await excluirConta(dono.token);
    expect(res.status).toBe(200);

    const canalDepois = await Channel.findById(canal._id);
    expect(canalDepois.ownerId.toString()).toBe(adminAntigo.id);
    expect(canalDepois.ownerId.toString()).not.toBe(adminRecente.id);
  });

  it('vários canais inativos do mesmo dono são TODOS transferidos ao primeiro admin', async () => {
    const admin = await criarUsuario('admin', new Date('2022-01-01T00:00:00.000Z'), 'Admin Varios Canais');
    const dono = await criarUsuario('user', undefined, 'Dono Varios Canais Inativos');
    const canalA = await criarCanal(dono.id, 'Canal Inativo A', false);
    const canalB = await criarCanal(dono.id, 'Canal Inativo B', false);

    const res = await excluirConta(dono.token);
    expect(res.status).toBe(200);

    expect((await Channel.findById(canalA._id)).ownerId.toString()).toBe(admin.id);
    expect((await Channel.findById(canalB._id)).ownerId.toString()).toBe(admin.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mensagens: autoradas apagadas, do editor preservadas
// ═══════════════════════════════════════════════════════════════════════════

describe('Exclusão: mensagens autoradas pelo usuário são apagadas; as do editor são preservadas', () => {
  it('apaga só as mensagens cujo autorUserId é o usuário excluído', async () => {
    const admin = await criarUsuario('admin', new Date('2023-01-01T00:00:00.000Z'), 'Admin Mensagens');
    const dono = await criarUsuario('user', undefined, 'Dono Mensagens Canal Inativo');
    const canal = await criarCanal(dono.id, 'Canal Inativo Mensagens', false);

    const msgIlustrador1 = await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'primeira do dono',
    });
    const msgIlustrador2 = await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'segunda do dono',
    });
    const msgEditor = await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: admin.id, texto: 'resposta do editor',
    });

    const res = await excluirConta(dono.token);
    expect(res.status).toBe(200);

    expect(await MensagemPortal.findById(msgIlustrador1._id)).toBeNull();
    expect(await MensagemPortal.findById(msgIlustrador2._id)).toBeNull();
    const editorAinda = await MensagemPortal.findById(msgEditor._id);
    expect(editorAinda).not.toBeNull();
    expect(editorAinda.texto).toBe('resposta do editor');
    // Fica órfã de interlocutor (ownerUserId aponta pra conta apagada) —
    // preserva o histórico do canal para o admin/próximo dono, não é limpa.
    expect(editorAinda.ownerUserId.toString()).toBe(dono.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sem admin algum (caso teoricamente impossível) — aborta em vez de órfãozar
// ═══════════════════════════════════════════════════════════════════════════

describe('Exclusão sem NENHUM admin no sistema para receber canais inativos', () => {
  it('aborta com 500 (logado) em vez de órfãozar o canal — conta e canal seguem intactos', async () => {
    const dono = await criarUsuario('user', undefined, 'Dono Sem Admin Nenhum');
    const canal = await criarCanal(dono.id, 'Canal Inativo Sem Admin', false);

    const res = await excluirConta(dono.token);

    expect(res.status).toBe(500);
    expect(await User.findById(dono.id)).not.toBeNull();
    const canalAinda = await Channel.findById(canal._id);
    expect(canalAinda.ownerId.toString()).toBe(dono.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Export LGPD: mensagens do portal + vínculo de canal
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/account/me/export — vínculo de canal (id, nome, isActive)', () => {
  it('inclui os canais do usuário com isActive', async () => {
    const dono = await criarUsuario('user', undefined, 'Dono Export Canais');
    const canalAtivo = await criarCanal(dono.id, 'Canal Export Ativo', true);
    const canalInativo = await criarCanal(dono.id, 'Canal Export Inativo', false);

    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);

    expect(data.channels.length).toBe(2);
    const ativoNoExport = data.channels.find(c => String(c.id) === String(canalAtivo._id));
    const inativoNoExport = data.channels.find(c => String(c.id) === String(canalInativo._id));
    expect(ativoNoExport.name).toBe('Canal Export Ativo');
    expect(ativoNoExport.isActive).toBe(true);
    expect(inativoNoExport.isActive).toBe(false);
  });
});

describe('GET /api/account/me/export — mensagens do portal (autoradas, recebidas e arquivadas)', () => {
  it('inclui mensagens autoradas E recebidas, inclusive de threads ARQUIVADAS (troca de dono)', async () => {
    const admin = await criarUsuario('admin', new Date('2023-01-01T00:00:00.000Z'), 'Admin Export Msg');
    const dono = await criarUsuario('user', undefined, 'Dono Export Msg');
    const outroDono = await criarUsuario('user', undefined, 'Outro Dono Export Msg');
    const canal = await criarCanal(dono.id, 'Canal Export Msg', true);

    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'ilustrador', autorUserId: dono.id, texto: 'minha pergunta',
    });
    await MensagemPortal.create({
      canalId: canal._id, ownerUserId: dono.id, autorTipo: 'editor', autorUserId: admin.id, texto: 'resposta do editor',
    });

    // Transfere o canal — arquiva a thread; o histórico continua acessível
    // ao EX-dono no próprio export dele (decisão da spec).
    const transferir = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ownerEmail: outroDono.email });
    expect(transferir.status).toBe(200);

    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);

    expect(data.portalMessages.length).toBe(2);
    const textos = data.portalMessages.map(m => m.texto).sort();
    expect(textos).toEqual(['minha pergunta', 'resposta do editor']);

    const autoradaNoExport = data.portalMessages.find(m => m.texto === 'minha pergunta');
    expect(autoradaNoExport.arquivadaEm).not.toBeNull(); // thread arquivada, mas presente no export
    expect(autoradaNoExport.autorTipo).toBe('ilustrador');

    const recebidaNoExport = data.portalMessages.find(m => m.texto === 'resposta do editor');
    expect(recebidaNoExport.autorTipo).toBe('editor');
    expect(recebidaNoExport.refTipo).toBeNull();
  });

  it('usuário sem canal e sem mensagens: seções ficam como arrays vazios (não ausentes)', async () => {
    const semNada = await criarUsuario('user', undefined, 'Usuario Sem Canal Nem Mensagem Export');
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${semNada.token}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);
    expect(data.channels).toEqual([]);
    expect(data.portalMessages).toEqual([]);
  });
});
