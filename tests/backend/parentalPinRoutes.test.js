/**
 * Testes: Fase 5, Bloco 2, Task 3 — rotas /api/parental + PIN de proteção.
 * Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.3, seções "Modelo do usuário", "PIN", "Recuperação de PIN",
 * "Exclusão de conta × PIN", "Rotas").
 *
 * Escopo: GET/PUT /api/parental, POST /api/parental/pin (definir/trocar/
 * remover), rate limit persistido do PIN (services/parentalPinService.js),
 * recuperação de PIN por token de e-mail, e a extensão de
 * DELETE /api/account/me para exigir o PIN quando `temPin`. NÃO cobre o
 * filtro de conteúdo em si (T4/T5) nem o formulário do frontend (T7).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const db = require('../helpers/db');

let app;
let User;
let emailService;
let parentalPinService;

const SENHA_PADRAO = 'Senha@123';
let contador = 0;

function emailUnico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}@lorflux.test`;
}

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  User = require('../../models/User');
  emailService = require('../../services/emailService');
  parentalPinService = require('../../services/parentalPinService');
});

afterAll(() => db.closeDatabase());
afterEach(() => db.clearDatabase());

// ─── helpers de request ──────────────────────────────────────────────────
function getParental(token) {
  return request(app).get('/api/parental').set('Authorization', `Bearer ${token}`);
}
function putParental(token, body) {
  return request(app).put('/api/parental').set('Authorization', `Bearer ${token}`).send(body);
}
function postPin(token, body) {
  return request(app).post('/api/parental/pin').set('Authorization', `Bearer ${token}`).send(body);
}
function recuperarPin(token, body) {
  return request(app).post('/api/parental/pin/recuperar').set('Authorization', `Bearer ${token}`).send(body);
}
function confirmarPin(token, body) {
  return request(app).post('/api/parental/pin/recuperar/confirmar').set('Authorization', `Bearer ${token}`).send(body);
}
function excluirConta(token, body) {
  return request(app).delete('/api/account/me').set('Authorization', `Bearer ${token}`).send(body);
}

// ─── helpers de fixture ──────────────────────────────────────────────────
async function criarUsuarioLocal(nome) {
  const email = emailUnico('parental-local');
  const passwordHash = await bcrypt.hash(SENHA_PADRAO, 10);
  const user = await User.create({ email, passwordHash, nome, provider: 'local' });
  const login = await request(app).post('/api/auth/login').send({ email, password: SENHA_PADRAO });
  return { id: user._id.toString(), token: login.body.accessToken, email };
}

async function criarUsuarioGoogle(nome) {
  const googleVerifier = require('../../utils/googleTokenVerifier');
  const email = emailUnico('parental-google');
  const sub = `google-sub-parental-${contador}-${Date.now()}`;
  process.env.GOOGLE_CLIENT_ID = 'client-id-teste-parental';
  googleVerifier.__setVerifierForTests(async () => ({
    sub, email, email_verified: true, name: nome, picture: 'https://lh3.googleusercontent.com/foto.jpg',
  }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'tok' });
  googleVerifier.__setVerifierForTests(null);
  delete process.env.GOOGLE_CLIENT_ID;
  return { id: res.body.user.id, token: res.body.accessToken, email };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/parental
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/parental — shape', () => {
  it('com PIN definido: temPin=true, vocabulario com 19 entradas, pinHash em NENHUM lugar do texto bruto', async () => {
    const dono = await criarUsuarioLocal('Shape Get Com Pin');
    await postPin(dono.token, { novoPin: '3305' });

    const res = await getParental(dono.token);
    expect(res.status).toBe(200);
    expect(res.body.temPin).toBe(true);
    expect(Array.isArray(res.body.vocabulario)).toBe(true);
    expect(res.body.vocabulario.length).toBe(19);
    expect(res.body.vocabulario[0]).toHaveProperty('slug');
    expect(res.body.vocabulario[0]).toHaveProperty('rotuloPt');

    const bruto = JSON.stringify(res.body);
    expect(bruto).not.toContain('pinHash');
    expect(bruto).not.toContain('$2b$');
    expect(bruto).not.toContain('pinTentativas');
    expect(bruto).not.toContain('pinBloqueadoAte');
  });

  it('sem PIN definido: temPin=false, defaults (young, [])', async () => {
    const dono = await criarUsuarioLocal('Shape Get Sem Pin');
    const res = await getParental(dono.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ classificacaoEtaria: 'young', tagsBloqueadas: [], temPin: false });
  });

  it('sem token -> 401', async () => {
    const res = await request(app).get('/api/parental');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/parental — sem PIN (livre)
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/parental — sem PIN definido (livre)', () => {
  it('aplica classificacaoEtaria e tagsBloqueadas; resposta = shape do GET SEM vocabulario', async () => {
    const dono = await criarUsuarioLocal('Put Livre Sem Pin');
    const res = await putParental(dono.token, { classificacaoEtaria: 'kids', tagsBloqueadas: ['romance', 'terror'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ classificacaoEtaria: 'kids', tagsBloqueadas: ['romance', 'terror'], temPin: false });
    expect(res.body).not.toHaveProperty('vocabulario');
  });

  it('classificacaoEtaria fora do enum -> 400', async () => {
    const dono = await criarUsuarioLocal('Put Enum Invalido');
    const res = await putParental(dono.token, { classificacaoEtaria: 'adulto' });
    expect(res.status).toBe(400);
    const doBanco = await User.findById(dono.id);
    expect(doBanco.parental.classificacaoEtaria).toBe('young'); // não mudou
  });

  it('slug fora do vocabulário -> 400 NOMEANDO o ofensor', async () => {
    const dono = await criarUsuarioLocal('Put Slug Invalido');
    const res = await putParental(dono.token, { tagsBloqueadas: ['romance', 'fofura-que-nao-existe'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('fofura-que-nao-existe');
  });

  // Achado da revisão da T3: 5000 repetições de um slug válido passavam na
  // validação e viravam um $nin gigante em toda query de lista do usuário.
  it('tagsBloqueadas é DEDUPLICADA no banco (lista vira $nin de toda query de lista)', async () => {
    const dono = await criarUsuarioLocal('Put Dedupe Tags');
    const repetidas = Array.from({ length: 4237 }, (_, i) => (i % 2 === 0 ? 'romance' : 'terror'));
    const res = await putParental(dono.token, { tagsBloqueadas: repetidas });
    expect(res.status).toBe(200);
    expect(res.body.tagsBloqueadas).toEqual(['romance', 'terror']);

    const doBanco = await User.findById(dono.id).lean();
    expect(doBanco.parental.tagsBloqueadas).toEqual(['romance', 'terror']);
  });

  it('allowlist estrita: pinHash/pinTentativas/pinBloqueadoAte/role extras no body são IGNORADOS no banco', async () => {
    const dono = await criarUsuarioLocal('Put Allowlist Extras');
    const res = await putParental(dono.token, {
      classificacaoEtaria: 'teen',
      pinHash: '$2b$12$hackedhackedhackedhackedhackedhackedhacked',
      pinTentativas: 999,
      pinBloqueadoAte: new Date(Date.now() + 999999999).toISOString(),
      role: 'superadmin',
    });
    expect(res.status).toBe(200);

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).toBeNull();
    expect(atual.parental.pinTentativas).toBe(0);
    expect(atual.parental.pinBloqueadoAte).toBeNull();
    expect(atual.role).toBe('user');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/parental — COM PIN (gate)
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/parental — com PIN definido (gate)', () => {
  it('SEM pin no body -> 401, sem contar como tentativa, sem aplicar a mudança', async () => {
    const dono = await criarUsuarioLocal('Put Pin Ausente');
    await postPin(dono.token, { novoPin: '9021' });

    const res = await putParental(dono.token, { classificacaoEtaria: 'kids' });
    expect(res.status).toBe(401);
    expect(res.body.tentativasRestantes).toBeUndefined();

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinTentativas).toBe(0);
    expect(atual.parental.classificacaoEtaria).toBe('young'); // não mudou
  });

  it('pin ERRADO -> 401 com tentativasRestantes, sem aplicar a mudança', async () => {
    const dono = await criarUsuarioLocal('Put Pin Errado');
    await postPin(dono.token, { novoPin: '4471' });

    const res = await putParental(dono.token, { pin: '0000', classificacaoEtaria: 'kids' });
    expect(res.status).toBe(401);
    expect(res.body.tentativasRestantes).toBe(4);

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinTentativas).toBe(1);
    expect(atual.parental.classificacaoEtaria).toBe('young');
  });

  it('pin CERTO aplica a mudança e ZERA tentativas anteriores', async () => {
    const dono = await criarUsuarioLocal('Put Pin Certo Zera');
    await postPin(dono.token, { novoPin: '4471' });
    // 2 erros antes de acertar.
    await putParental(dono.token, { pin: '0000' });
    await putParental(dono.token, { pin: '1111' });
    let atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinTentativas).toBe(2);

    const res = await putParental(dono.token, { pin: '4471', classificacaoEtaria: 'teen' });
    expect(res.status).toBe(200);
    expect(res.body.classificacaoEtaria).toBe('teen');

    atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.classificacaoEtaria).toBe('teen');
    expect(atual.parental.pinTentativas).toBe(0);
    expect(atual.parental.pinBloqueadoAte).toBeNull();
  });

  it('5 erros consecutivos bloqueiam (PERSISTIDO no doc); só a PRÓXIMA request responde 429', async () => {
    const dono = await criarUsuarioLocal('Put Cinco Erros Bloqueio');
    await postPin(dono.token, { novoPin: '7392' });

    for (let i = 1; i <= 5; i++) {
      const res = await putParental(dono.token, { pin: '0000' });
      expect(res.status).toBe(401);
      expect(res.body.tentativasRestantes).toBe(i === 5 ? 0 : 5 - i);
    }

    const noBanco = await User.findById(dono.id).select('+parental.pinHash');
    expect(noBanco.parental.pinTentativas).toBe(5);
    expect(noBanco.parental.pinBloqueadoAte).not.toBeNull();
    expect(noBanco.parental.pinBloqueadoAte.getTime()).toBeGreaterThan(Date.now());

    // Nova request, mesmo com o PIN CERTO — bloqueado responde 429 SEM avaliar o pin.
    const bloqueada = await putParental(dono.token, { pin: '7392' });
    expect(bloqueada.status).toBe(429);
  });

  it('bloqueado (pinBloqueadoAte injetado no futuro) responde 429 mesmo com o PIN CERTO — não avalia o pin', async () => {
    const dono = await criarUsuarioLocal('Put Bloqueado Pin Certo');
    await postPin(dono.token, { novoPin: '5588' });
    await User.findByIdAndUpdate(dono.id, {
      $set: { 'parental.pinTentativas': 5, 'parental.pinBloqueadoAte': new Date(Date.now() + 11 * 60 * 1000 + 3000) },
    });

    const res = await putParental(dono.token, { pin: '5588' });
    expect(res.status).toBe(429);

    const depois = await User.findById(dono.id).select('+parental.pinHash');
    expect(depois.parental.pinTentativas).toBe(5); // não incrementou nem zerou — nem chegou a comparar
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/parental/pin — definir/trocar/remover
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/parental/pin', () => {
  it('DEFINE quando não há PIN prévio (só novoPin, sem checar pinAtual)', async () => {
    const dono = await criarUsuarioLocal('Pin Definir');
    const res = await postPin(dono.token, { novoPin: '2468' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ temPin: true });
    expect(JSON.stringify(res.body)).not.toContain('pinHash');

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).toBeTruthy();
  });

  it('TROCA com pinAtual correto — o pin antigo deixa de valer', async () => {
    const dono = await criarUsuarioLocal('Pin Trocar');
    await postPin(dono.token, { novoPin: '1111' });
    const res = await postPin(dono.token, { pinAtual: '1111', novoPin: '2222' });
    expect(res.status).toBe(200);
    expect(res.body.temPin).toBe(true);

    const comPinVelho = await postPin(dono.token, { pinAtual: '1111', novoPin: '3333' });
    expect(comPinVelho.status).toBe(401);
  });

  it('TROCA com pinAtual ERRADO -> 401 (rate limitado)', async () => {
    const dono = await criarUsuarioLocal('Pin Trocar Errado');
    await postPin(dono.token, { novoPin: '9999' });
    const res = await postPin(dono.token, { pinAtual: '0000', novoPin: '1212' });
    expect(res.status).toBe(401);
    expect(res.body.tentativasRestantes).toBe(4);
  });

  it('REMOVE com pinAtual correto e remover:true', async () => {
    const dono = await criarUsuarioLocal('Pin Remover');
    await postPin(dono.token, { novoPin: '6060' });
    const res = await postPin(dono.token, { pinAtual: '6060', remover: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ temPin: false });

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).toBeNull();
  });

  it('REMOVE com pinAtual ERRADO -> 401, PIN continua ativo', async () => {
    const dono = await criarUsuarioLocal('Pin Remover Errado');
    await postPin(dono.token, { novoPin: '6161' });
    const res = await postPin(dono.token, { pinAtual: '0000', remover: true });
    expect(res.status).toBe(401);

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).toBeTruthy();
  });

  it('REMOVE sem PIN prévio -> 400', async () => {
    const dono = await criarUsuarioLocal('Pin Remover Sem Pin');
    const res = await postPin(dono.token, { remover: true, pinAtual: 'qualquer' });
    expect(res.status).toBe(400);
  });

  it.each([
    ['3 dígitos', '123'],
    ['7 dígitos', '1234567'],
    ['letras', 'abcd'],
    ['misto', '12a4'],
  ])('formato inválido (%s: "%s") -> 400', async (_rotulo, pinInvalido) => {
    const dono = await criarUsuarioLocal(`Pin Formato ${_rotulo}`);
    const res = await postPin(dono.token, { novoPin: pinInvalido });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Recuperação de PIN
// ═══════════════════════════════════════════════════════════════════════════

describe('Recuperação de PIN', () => {
  let capturedEmails;

  beforeEach(() => {
    capturedEmails = [];
    emailService.__setSenderForTests(async (opts) => {
      capturedEmails.push(opts);
      return { messageId: 'test-message-id' };
    });
  });

  afterEach(() => emailService.__setSenderForTests(null));

  it('conta LOCAL sem senha no body -> 401', async () => {
    const dono = await criarUsuarioLocal('Recuperar Sem Senha');
    await postPin(dono.token, { novoPin: '4040' });
    const res = await recuperarPin(dono.token, {});
    expect(res.status).toBe(401);
    expect(capturedEmails.length).toBe(0);
  });

  it('conta LOCAL com senha ERRADA -> 401', async () => {
    const dono = await criarUsuarioLocal('Recuperar Senha Errada');
    await postPin(dono.token, { novoPin: '4040' });
    const res = await recuperarPin(dono.token, { password: 'SenhaErrada@999' });
    expect(res.status).toBe(401);
    expect(capturedEmails.length).toBe(0);
  });

  it('conta LOCAL com senha CORRETA -> 200, token gravado no banco, e-mail enviado', async () => {
    const dono = await criarUsuarioLocal('Recuperar Senha Certa');
    await postPin(dono.token, { novoPin: '4040' });
    const res = await recuperarPin(dono.token, { password: SENHA_PADRAO });
    expect(res.status).toBe(200);
    expect(capturedEmails.length).toBe(1);
    expect(capturedEmails[0].to).toBe(dono.email);

    const ParentalPinResetToken = require('../../models/ParentalPinResetToken');
    const registro = await ParentalPinResetToken.findOne({ userId: dono.id });
    expect(registro).not.toBeNull();
    expect(registro.token).toBeTruthy();
  });

  it('conta SOCIAL: recupera SEM senha (rota logada, provider != local — sem checagem de senha)', async () => {
    const dono = await criarUsuarioGoogle('Recuperar Social');
    await postPin(dono.token, { novoPin: '5050' });
    const res = await recuperarPin(dono.token, {});
    expect(res.status).toBe(200);
    expect(capturedEmails.length).toBe(1);
  });

  it('confirmar com token válido REMOVE o PIN e zera tentativas/bloqueio', async () => {
    const dono = await criarUsuarioLocal('Confirmar Remove Pin');
    await postPin(dono.token, { novoPin: '7070' });
    // 2 erros de troca antes da recuperação, pra provar que zera isso também.
    await postPin(dono.token, { pinAtual: '0000', novoPin: '1234' });
    await postPin(dono.token, { pinAtual: '0000', novoPin: '1234' });

    await recuperarPin(dono.token, { password: SENHA_PADRAO });
    const ParentalPinResetToken = require('../../models/ParentalPinResetToken');
    const registro = await ParentalPinResetToken.findOne({ userId: dono.id });

    const res = await confirmarPin(dono.token, { token: registro.token });
    expect(res.status).toBe(200);

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).toBeNull();
    expect(atual.parental.pinTentativas).toBe(0);
    expect(atual.parental.pinBloqueadoAte).toBeNull();
  });

  it('token EXPIRADO (createdAt injetado > 1h atrás) -> 400, PIN não é mexido', async () => {
    const dono = await criarUsuarioLocal('Confirmar Token Expirado');
    await postPin(dono.token, { novoPin: '8080' });

    const ParentalPinResetToken = require('../../models/ParentalPinResetToken');
    const tokenVelho = 'token-expirado-parental-teste-nao-redondo-8f3a1';
    await ParentalPinResetToken.create({
      userId: dono.id,
      token: tokenVelho,
      createdAt: new Date(Date.now() - (61 * 60 * 1000 + 47 * 1000)), // 1h01min47s atrás
    });

    const res = await confirmarPin(dono.token, { token: tokenVelho });
    expect(res.status).toBe(400);

    const atual = await User.findById(dono.id).select('+parental.pinHash');
    expect(atual.parental.pinHash).not.toBeNull();
  });

  it('token REUSADO (já confirmado) -> 400 na segunda tentativa', async () => {
    const dono = await criarUsuarioLocal('Confirmar Token Reusado');
    await postPin(dono.token, { novoPin: '9090' });
    await recuperarPin(dono.token, { password: SENHA_PADRAO });
    const ParentalPinResetToken = require('../../models/ParentalPinResetToken');
    const registro = await ParentalPinResetToken.findOne({ userId: dono.id });

    const primeira = await confirmarPin(dono.token, { token: registro.token });
    expect(primeira.status).toBe(200);

    const segunda = await confirmarPin(dono.token, { token: registro.token });
    expect(segunda.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reset de senha NÃO toca parental (regressão da T1 — não afrouxar)
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/reset-password NÃO toca em parental mesmo com PIN ativo (regressão)', () => {
  it('PIN e tentativas seguem intactos depois de redefinir a senha', async () => {
    const dono = await criarUsuarioLocal('Reset Senha Nao Toca Pin');
    await postPin(dono.token, { novoPin: '3131' });
    await putParental(dono.token, { pin: '0000' }); // 1 erro, pra provar que sobrevive

    const PasswordResetToken = require('../../models/PasswordResetToken');
    await PasswordResetToken.deleteMany({ userId: dono.id });
    await PasswordResetToken.create({ userId: dono.id, token: 'reset-token-t3-parental-abc' });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'reset-token-t3-parental-abc', password: 'NovaSenha@456' });
    expect(res.status).toBe(200);

    const depois = await User.findById(dono.id).select('+parental.pinHash');
    expect(depois.parental.pinHash).toBeTruthy();
    expect(depois.parental.pinTentativas).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/account/me — exige PIN quando temPin (QUALQUER provider)
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/account/me — exige PIN quando temPin', () => {
  it('LOCAL: senha certa mas SEM pin no body -> 401, conta intacta', async () => {
    const dono = await criarUsuarioLocal('Delete Local Sem Pin Body');
    await postPin(dono.token, { novoPin: '1357' });
    const res = await excluirConta(dono.token, { password: SENHA_PADRAO });
    expect(res.status).toBe(401);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('LOCAL: senha certa + pin ERRADO -> 401, conta intacta', async () => {
    const dono = await criarUsuarioLocal('Delete Local Pin Errado');
    await postPin(dono.token, { novoPin: '1357' });
    const res = await excluirConta(dono.token, { password: SENHA_PADRAO, pin: '0000' });
    expect(res.status).toBe(401);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('LOCAL: senha certa + pin CERTO -> procede (exclui, sem canal ativo)', async () => {
    const dono = await criarUsuarioLocal('Delete Local Pin Certo');
    await postPin(dono.token, { novoPin: '1357' });
    const res = await excluirConta(dono.token, { password: SENHA_PADRAO, pin: '1357' });
    expect(res.status).toBe(200);
    expect(await User.findById(dono.id)).toBeNull();
  });

  it('LOCAL: senha e pin corretos, mas dono de canal ATIVO -> 409 (ordem: senha → pin → canal)', async () => {
    const dono = await criarUsuarioLocal('Delete Local Pin Certo Canal Ativo');
    await postPin(dono.token, { novoPin: '2244' });
    const Channel = require('../../models/Channel');
    await Channel.create({ ownerId: dono.id, name: `Canal Delete Pin ${Date.now()}`, isActive: true });

    const res = await excluirConta(dono.token, { password: SENHA_PADRAO, pin: '2244' });
    expect(res.status).toBe(409);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('GOOGLE (social): SEM pin -> 401, sem exigir senha (não existe para essa conta)', async () => {
    const dono = await criarUsuarioGoogle('Delete Google Sem Pin');
    await postPin(dono.token, { novoPin: '8899' });
    const res = await excluirConta(dono.token, {});
    expect(res.status).toBe(401);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('GOOGLE (social): pin ERRADO -> 401, conta intacta', async () => {
    const dono = await criarUsuarioGoogle('Delete Google Pin Errado');
    await postPin(dono.token, { novoPin: '8899' });
    const res = await excluirConta(dono.token, { pin: '0000' });
    expect(res.status).toBe(401);
    expect(await User.findById(dono.id)).not.toBeNull();
  });

  it('GOOGLE (social): pin CERTO -> procede (exclui)', async () => {
    const dono = await criarUsuarioGoogle('Delete Google Pin Certo');
    await postPin(dono.token, { novoPin: '8899' });
    const res = await excluirConta(dono.token, { pin: '8899' });
    expect(res.status).toBe(200);
    expect(await User.findById(dono.id)).toBeNull();
  });

  // Achado da revisão da T3: o token de recuperação de PIN ficava órfão até o
  // TTL de 1h — mesmo tratamento do PasswordResetToken na exclusão.
  it('exclusão apaga o ParentalPinResetToken pendente do usuário (nenhum resíduo)', async () => {
    const ParentalPinResetToken = require('../../models/ParentalPinResetToken');
    const dono = await criarUsuarioLocal('Delete Apaga Token Pin');
    await postPin(dono.token, { novoPin: '4433' });
    await ParentalPinResetToken.create({ userId: dono.id, token: `tok-orfao-${Date.now()}-${Math.random()}` });
    expect(await ParentalPinResetToken.countDocuments({ userId: dono.id })).toBe(1);

    const res = await excluirConta(dono.token, { password: SENHA_PADRAO, pin: '4433' });
    expect(res.status).toBe(200);
    expect(await ParentalPinResetToken.countDocuments({ userId: dono.id })).toBe(0);
  });

  it('sem PIN definido: comportamento atual intacto (só senha, contas locais)', async () => {
    const dono = await criarUsuarioLocal('Delete Sem Pin Nenhum');
    const res = await excluirConta(dono.token, { password: SENHA_PADRAO });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// services/parentalPinService — fórmula pura do backoff (datas injetadas)
// ═══════════════════════════════════════════════════════════════════════════

describe('services/parentalPinService — fórmula do backoff (datas injetadas, não redondas)', () => {
  const AGORA = new Date('2026-05-11T08:17:53.000Z');

  it('1º lote (tentativas 4→5): 15min de bloqueio', () => {
    const userFake = { parental: { pinTentativas: 4, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinTentativas).toBe(5);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 15 * 60 * 1000);
    expect(r.tentativasRestantesNoLote).toBe(0);
  });

  it('2º lote (tentativas 9→10): DOBRA para 30min', () => {
    const userFake = { parental: { pinTentativas: 9, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinTentativas).toBe(10);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 30 * 60 * 1000);
  });

  it('3º lote (tentativas 14→15): 60min', () => {
    const userFake = { parental: { pinTentativas: 14, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 60 * 60 * 1000);
  });

  it('teto de 24h aplicado em lotes altos (não cresce pra sempre)', () => {
    const userFake = { parental: { pinTentativas: 49, pinBloqueadoAte: null } }; // → lote 10: 15min×2^9 ≫ 24h
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 24 * 60 * 60 * 1000);
  });

  // Dívida T3 (#8) — Fase 5 Bloco 2, Task 8: fronteira EXATA do teto (a
  // fórmula já estava certa desde a T3 — só faltava o teste). Lote 7
  // (tentativas 34→35): 15min×2^6 = 960min = 16h, AINDA sem cortar pelo
  // teto. Lote 8 (tentativas 39→40): a fórmula pediria 15min×2^7 = 1920min
  // = 32h, mas o teto CORTA para 24h — é a primeira vez que Math.min entra
  // em ação (lotes 1-7 nunca ultrapassam 24h).
  it('fronteira do teto: lote 7 (tentativas 34→35) = 16h, ainda SEM cortar', () => {
    const userFake = { parental: { pinTentativas: 34, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinTentativas).toBe(35);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 16 * 60 * 60 * 1000);
  });

  it('fronteira do teto: lote 8 (tentativas 39→40) pediria 32h, mas o teto CORTA para 24h', () => {
    const userFake = { parental: { pinTentativas: 39, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinTentativas).toBe(40);
    expect(r.pinBloqueadoAte.getTime()).toBe(AGORA.getTime() + 24 * 60 * 60 * 1000);
  });

  it('fora do múltiplo de 5 não seta bloqueio; tentativasRestantesNoLote conta certo', () => {
    const userFake = { parental: { pinTentativas: 1, pinBloqueadoAte: null } };
    const r = parentalPinService.proximoAposErro(userFake, AGORA);
    expect(r.pinTentativas).toBe(2);
    expect(r.pinBloqueadoAte).toBeNull();
    expect(r.tentativasRestantesNoLote).toBe(3);
  });

  it('estaBloqueado/minutosRestantes: futuro é bloqueio, passado não', () => {
    const bloqueadoFuturo = { parental: { pinBloqueadoAte: new Date(AGORA.getTime() + 7 * 60 * 1000 + 12000) } };
    expect(parentalPinService.estaBloqueado(bloqueadoFuturo, AGORA)).toBe(true);
    expect(parentalPinService.minutosRestantes(bloqueadoFuturo, AGORA)).toBe(8); // ceil(7min12s)

    const jaPassou = { parental: { pinBloqueadoAte: new Date(AGORA.getTime() - 1000) } };
    expect(parentalPinService.estaBloqueado(jaPassou, AGORA)).toBe(false);
  });

  it('resultadoAcerto zera tudo', () => {
    expect(parentalPinService.resultadoAcerto()).toEqual({ pinTentativas: 0, pinBloqueadoAte: null });
  });

  it('paraUpdateParental prefixa as chaves para uso direto em $set', () => {
    expect(parentalPinService.paraUpdateParental({ pinTentativas: 3, pinBloqueadoAte: null })).toEqual({
      'parental.pinTentativas': 3,
      'parental.pinBloqueadoAte': null,
    });
  });
});
