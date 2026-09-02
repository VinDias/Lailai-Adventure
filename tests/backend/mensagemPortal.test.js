/**
 * Testes: MensagemPortal (Fase 5 Bloco 1 — fundações do Portal do Ilustrador)
 * Cobre: validações do model e o helper arquivarThreadDoCanal (chamado na
 * troca de dono do PUT /channels/:id admin — testado aqui via integração).
 * Rotas de mensagem (GET/POST /portal/mensagens, /admin/mensagens/:canalId)
 * são da Task 6 — não testadas neste arquivo.
 */
const request = require('supertest');
const db = require('../helpers/db');
const { createUsers, getToken, getId, getUsers } = require('../helpers/auth');

let app;
let Channel;
let MensagemPortal;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Channel = require('../../models/Channel');
  MensagemPortal = require('../../models/MensagemPortal');
  await createUsers(app);
});

afterAll(() => db.closeDatabase());

async function criarCanal(ownerKey, name) {
  return Channel.create({ ownerId: getId(ownerKey), name });
}

function mensagemBase(overrides = {}) {
  return {
    autorTipo: 'ilustrador',
    autorUserId: getId('user'),
    texto: 'Olá, uma dúvida sobre o capítulo 3.',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Validações do model
// ═══════════════════════════════════════════════════════════════════════════

describe('MensagemPortal — validações', () => {
  it('texto é obrigatório', async () => {
    const canal = await criarCanal('user', 'Canal Msg Texto Obrigatorio');
    await expect(
      MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), texto: undefined }))
    ).rejects.toThrow();
  });

  it('texto respeita maxlength de 2000 (2001 falha, 2000 passa)', async () => {
    const canal = await criarCanal('user', 'Canal Msg Maxlength');

    await expect(
      MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), texto: 'a'.repeat(2001) }))
    ).rejects.toThrow();

    const ok = await MensagemPortal.create(
      mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), texto: 'a'.repeat(2000) })
    );
    expect(ok.texto.length).toBe(2000);
  });

  it('autorTipo só aceita editor|ilustrador', async () => {
    const canal = await criarCanal('user', 'Canal Msg AutorTipo');
    await expect(
      MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), autorTipo: 'leitor' }))
    ).rejects.toThrow();

    const ok = await MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), autorTipo: 'editor', autorUserId: getId('admin') }));
    expect(ok.autorTipo).toBe('editor');
  });

  it('refTipo só aceita series|episode|null', async () => {
    const canal = await criarCanal('user', 'Canal Msg RefTipo');
    await expect(
      MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), refTipo: 'capitulo' }))
    ).rejects.toThrow();

    const semRef = await MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user') }));
    expect(semRef.refTipo).toBeNull();

    const comRef = await MensagemPortal.create(
      mensagemBase({ canalId: canal._id, ownerUserId: getId('user'), refTipo: 'episode', refId: canal._id })
    );
    expect(comRef.refTipo).toBe('episode');
  });

  it('canalId, ownerUserId e autorUserId são obrigatórios', async () => {
    await expect(MensagemPortal.create(mensagemBase({ ownerUserId: getId('user') }))).rejects.toThrow(); // sem canalId
    const canal = await criarCanal('user', 'Canal Msg Obrigatorios');
    await expect(MensagemPortal.create(mensagemBase({ canalId: canal._id }))).rejects.toThrow(); // sem ownerUserId
  });

  it('lidaEm e arquivadaEm nascem null por padrão', async () => {
    const canal = await criarCanal('user', 'Canal Msg Defaults');
    const msg = await MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user') }));
    expect(msg.lidaEm).toBeNull();
    expect(msg.arquivadaEm).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// arquivarThreadDoCanal — helper estático
// ═══════════════════════════════════════════════════════════════════════════

describe('MensagemPortal.arquivarThreadDoCanal', () => {
  it('arquiva só as mensagens do canal informado e só as ainda não arquivadas', async () => {
    const canal1 = await criarCanal('user', 'Canal Arquivar 1');
    const canal2 = await criarCanal('premium', 'Canal Arquivar 2');

    const m1 = await MensagemPortal.create(mensagemBase({ canalId: canal1._id, ownerUserId: getId('user') }));
    const m2 = await MensagemPortal.create(mensagemBase({ canalId: canal1._id, ownerUserId: getId('user'), texto: 'segunda mensagem do canal 1' }));
    // Mensagem já arquivada antes da chamada — não deve ser tocada (arquivadaEm original preservado)
    const jaArquivadaData = new Date('2026-05-14T10:00:00.000Z');
    const m3 = await MensagemPortal.create(
      mensagemBase({ canalId: canal1._id, ownerUserId: getId('user'), texto: 'ja arquivada', arquivadaEm: jaArquivadaData })
    );
    const mOutroCanal = await MensagemPortal.create(mensagemBase({ canalId: canal2._id, ownerUserId: getId('premium'), texto: 'mensagem do outro canal' }));

    const dataArquivamento = new Date('2026-09-02T08:17:00.000Z'); // valor não-redondo, injetado
    await MensagemPortal.arquivarThreadDoCanal(canal1._id, dataArquivamento);

    const [r1, r2, r3, rOutro] = await Promise.all([
      MensagemPortal.findById(m1._id).lean(),
      MensagemPortal.findById(m2._id).lean(),
      MensagemPortal.findById(m3._id).lean(),
      MensagemPortal.findById(mOutroCanal._id).lean(),
    ]);

    expect(r1.arquivadaEm.toISOString()).toBe(dataArquivamento.toISOString());
    expect(r2.arquivadaEm.toISOString()).toBe(dataArquivamento.toISOString());
    expect(r3.arquivadaEm.toISOString()).toBe(jaArquivadaData.toISOString()); // preservada, não sobrescrita
    expect(rOutro.arquivadaEm).toBeNull(); // canal2 intocado
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integração: troca de dono no PUT /channels/:id arquiva a thread
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/channels/:id (ownerEmail) — arquiva a thread do canal', () => {
  it('mensagens não arquivadas do canal viram arquivadas após a transferência de dono', async () => {
    const canal = await criarCanal('user', 'Canal Thread A Arquivar');
    const msg = await MensagemPortal.create(mensagemBase({ canalId: canal._id, ownerUserId: getId('user') }));
    expect(msg.arquivadaEm).toBeNull();

    const res = await request(app)
      .put(`/api/channels/${canal._id}`)
      .set('Authorization', `Bearer ${getToken('admin')}`)
      .send({ ownerEmail: getUsers().premium.email });
    expect(res.status).toBe(200);

    const atualizada = await MensagemPortal.findById(msg._id).lean();
    expect(atualizada.arquivadaEm).not.toBeNull();
  });
});
