# Bloco 1 — Progresso de leitura e "Continuar" — Plano de Implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa.
> Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** Registrar onde o usuário parou em cada episódio — inclusive sem conta — e
devolvê-lo àquele ponto, com carrossel "Continuar" no topo das abas e barra de progresso
nos cards.

**Arquitetura:** Uma coleção `ReadingProgress` com um documento por (identidade, episódio),
onde identidade é `userId` **ou** `anonymousId`. O front grava com folga (debounce e limiar)
por um hook único, e o backend concentra as regras do carrossel numa camada de serviço
testável isoladamente. Ao criar conta, os documentos do visitante são reatribuídos à conta.

**Stack:** Node + Express + Mongoose no backend; React 19 + TypeScript no front; Vitest +
Supertest + mongodb-memory-server nos testes.

**Spec:** `docs/superpowers/specs/2026-08-12-progresso-continuar-lendo-design.md`

## Restrições globais

- Comentários e mensagens de commit em **português**, seguindo o padrão do repositório.
- Commits no formato `tipo(escopo): descrição` — ex.: `feat(progresso): ...`.
- `completed` é verdadeiro a partir de **`percent >= 0.9`**.
- Carrossel: teto de **20 obras**, poda de **90 dias** sem toque.
- VCine só entra no carrossel com `percent` entre **0.1 e 0.9**.
- Progresso de visitante expira em **180 dias** sem uso.
- Rotas de progresso aceitam conta **ou** visitante, via `optionalAuth`.
- O identificador do visitante viaja no cabeçalho **`X-Anonymous-Id`** e é um **UUID v4**.
- Testes de backend rodam com `npm run test:backend`; a suíte inteira precisa continuar
  verde (158 testes hoje).
- Nunca gravar `userId` e `anonymousId` no mesmo documento.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `models/ReadingProgress.js` | Schema, índices e a regra "um ou outro identificador" |
| `utils/requestIdentity.js` | Extrai `{ userId }` ou `{ anonymousId }` do request |
| `services/progressService.js` | Regras do carrossel e da migração — sem Express |
| `routes/progress.js` | As três rotas HTTP, finas, delegando ao serviço |
| `services/api.ts` | Cabeçalho `X-Anonymous-Id` e os métodos de progresso |
| `hooks/useProgress.ts` | Gravação com debounce e limiar, do lado do cliente |
| `components/ContinueCarousel.tsx` | O carrossel |
| `components/ProgressBar.tsx` | A barrinha dos cards |

As regras ficam em `services/progressService.js`, e não dentro das rotas, porque o carrossel
tem seis regras de negócio que precisam de teste direto — sem subir HTTP a cada caso.

---

### Task 1: Modelo `ReadingProgress`

**Arquivos:**
- Criar: `models/ReadingProgress.js`
- Testar: `tests/backend/progress.test.js`

**Interfaces:**
- Consome: nada
- Produz: modelo `ReadingProgress` com campos `userId?`, `anonymousId?`, `seriesId`,
  `episodeId`, `contentType`, `position`, `percent`, `completed`, `updatedAt`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/backend/progress.test.js`:

```js
/**
 * Testes: Fase 4, Bloco 1 — progresso de leitura e "Continuar".
 * Cobre modelo, gravação, carrossel, migração do visitante e LGPD.
 */
const request = require('supertest');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  await auth.createUsers(app);
});

afterAll(() => db.closeDatabase());

const ANON = '11111111-2222-4333-8444-555555555555';

describe('modelo ReadingProgress', () => {
  it('exige exatamente um identificador: userId ou anonymousId', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    };

    await expect(ReadingProgress.create({ ...base })).rejects.toThrow();
    await expect(
      ReadingProgress.create({ ...base, userId: auth.getId('user'), anonymousId: ANON }),
    ).rejects.toThrow();

    const soUsuario = await ReadingProgress.create({ ...base, userId: auth.getId('user') });
    expect(soUsuario.userId).toBeTruthy();

    const soVisitante = await ReadingProgress.create({ ...base, anonymousId: ANON });
    expect(soVisitante.anonymousId).toBe(ANON);
  });

  it('marca completed a partir de 90% e recusa percent fora de 0..1', async () => {
    const ReadingProgress = require('../../models/ReadingProgress');
    const mongoose = require('mongoose');
    const base = {
      userId: auth.getId('user'),
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
    };

    const quase = await ReadingProgress.create({ ...base, percent: 0.89 });
    expect(quase.completed).toBe(false);

    const fim = await ReadingProgress.create({
      ...base,
      episodeId: new mongoose.Types.ObjectId(),
      percent: 0.9,
    });
    expect(fim.completed).toBe(true);

    await expect(
      ReadingProgress.create({ ...base, episodeId: new mongoose.Types.ObjectId(), percent: 1.5 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA com `Cannot find module '../../models/ReadingProgress'`

- [ ] **Passo 3: Escrever o modelo**

Criar `models/ReadingProgress.js`:

```js
const mongoose = require('mongoose');

/** Acima disso o episódio conta como concluído (créditos e rodapé fazem quase
 *  ninguém chegar aos 100%). */
const COMPLETED_THRESHOLD = 0.9;

/**
 * Progresso de leitura/reprodução — um documento por (identidade, episódio).
 *
 * Identidade é `userId` OU `anonymousId`, nunca os dois: o visitante sem conta
 * também acumula progresso, e no cadastro esses documentos são reatribuídos à
 * conta (ver services/progressService.claimAnonymousProgress).
 */
const ReadingProgressSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  anonymousId: { type: String },
  seriesId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  episodeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Episode', required: true },
  contentType: { type: String, enum: ['hqcine', 'vcine', 'hiqua'], required: true },
  position:    { type: Number, default: 0, min: 0 },
  percent:     { type: Number, required: true, min: 0, max: 1 },
  completed:   { type: Boolean, default: false },
}, { timestamps: true });

ReadingProgressSchema.pre('validate', function (next) {
  const temUsuario = Boolean(this.userId);
  const temVisitante = Boolean(this.anonymousId);
  if (temUsuario === temVisitante) {
    return next(new Error('Informe userId OU anonymousId — nunca os dois, nunca nenhum.'));
  }
  this.completed = this.percent >= COMPLETED_THRESHOLD;
  next();
});

// Um registro por episódio para cada identidade. partialFilterExpression (e não
// sparse) porque o índice é composto: sparse só ignoraria o documento sem
// nenhum dos dois campos.
ReadingProgressSchema.index(
  { userId: 1, episodeId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
ReadingProgressSchema.index(
  { anonymousId: 1, episodeId: 1 },
  { unique: true, partialFilterExpression: { anonymousId: { $exists: true } } },
);

// Carrossel
ReadingProgressSchema.index({ userId: 1, updatedAt: -1 });
ReadingProgressSchema.index({ anonymousId: 1, updatedAt: -1 });
ReadingProgressSchema.index({ userId: 1, seriesId: 1, updatedAt: -1 });

// LGPD: progresso de visitante expira em 180 dias sem uso. Conta não expira —
// quem apaga é o usuário, pelo Centro de Privacidade.
ReadingProgressSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 180 * 24 * 60 * 60,
    partialFilterExpression: { anonymousId: { $exists: true } },
  },
);

module.exports = mongoose.model('ReadingProgress', ReadingProgressSchema);
module.exports.COMPLETED_THRESHOLD = COMPLETED_THRESHOLD;
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: 2 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add models/ReadingProgress.js tests/backend/progress.test.js
git commit -m "feat(progresso): modelo ReadingProgress com identidade de conta ou visitante"
```

---

### Task 2: Identidade do request

**Arquivos:**
- Criar: `utils/requestIdentity.js`
- Testar: `tests/backend/progress.test.js` (acrescentar bloco)

**Interfaces:**
- Consome: nada
- Produz: `getIdentity(req)` → `{ userId }` | `{ anonymousId }` | `null`

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar ao fim de `tests/backend/progress.test.js`:

```js
describe('identidade do request', () => {
  const getIdentity = require('../../utils/requestIdentity');

  it('prefere a conta quando há token válido', () => {
    const req = { user: { id: 'abc123' }, headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ userId: 'abc123' });
  });

  it('cai para o visitante quando não há conta', () => {
    const req = { headers: { 'x-anonymous-id': ANON } };
    expect(getIdentity(req)).toEqual({ anonymousId: ANON });
  });

  it('recusa identificador de visitante fora do formato UUID', () => {
    expect(getIdentity({ headers: { 'x-anonymous-id': 'nao-e-uuid' } })).toBeNull();
    expect(getIdentity({ headers: {} })).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA com `Cannot find module '../../utils/requestIdentity'`

- [ ] **Passo 3: Escrever o utilitário**

Criar `utils/requestIdentity.js`:

```js
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Descobre de quem é a requisição: da conta logada ou de um visitante.
 *
 * A conta sempre vence — se o usuário logou, o progresso é dele, mesmo que o
 * aparelho ainda mande o identificador antigo no cabeçalho.
 *
 * O formato do identificador é validado para não deixar entrar lixo (ou tentativa
 * de injeção) num campo que vai para consulta no banco.
 */
module.exports = function getIdentity(req) {
  if (req.user?.id) return { userId: req.user.id };

  const anon = req.headers?.['x-anonymous-id'];
  if (typeof anon === 'string' && UUID_V4.test(anon)) return { anonymousId: anon };

  return null;
};
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: 5 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add utils/requestIdentity.js tests/backend/progress.test.js
git commit -m "feat(progresso): identifica requisicao por conta ou visitante"
```

---

### Task 3: Gravação do progresso

**Arquivos:**
- Criar: `services/progressService.js`, `routes/progress.js`
- Modificar: `server.js` (registrar a rota junto das demais, por volta da linha 239)
- Testar: `tests/backend/progress.test.js`

**Interfaces:**
- Consome: `ReadingProgress` (Task 1), `getIdentity` (Task 2)
- Produz: `saveProgress(identity, dados)` → documento salvo;
  rota `PUT /api/me/progress`

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/backend/progress.test.js`:

```js
describe('PUT /api/me/progress', () => {
  let serie, episodio;

  beforeAll(async () => {
    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Obra do Progresso', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body;

    const e = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId: serie._id || serie.id, episode_number: 1, title: 'Capitulo 1' });
    episodio = e.body;
  });

  const corpo = (extra = {}) => ({
    seriesId: serie._id || serie.id,
    episodeId: episodio._id || episodio.id,
    contentType: 'hiqua',
    percent: 0.4,
    position: 0,
    ...extra,
  });

  it('grava o progresso de quem tem conta', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo());

    expect(res.status).toBe(200);
    expect(res.body.percent).toBeCloseTo(0.4);
    expect(res.body.completed).toBe(false);
  });

  it('atualiza em vez de duplicar quando o mesmo episodio volta', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 0.7 }));

    const ReadingProgress = require('../../models/ReadingProgress');
    const docs = await ReadingProgress.find({
      userId: auth.getId('user'),
      episodeId: episodio._id || episodio.id,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].percent).toBeCloseTo(0.7);
  });

  it('grava o progresso do visitante pelo cabecalho', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send(corpo({ percent: 0.25 }));

    expect(res.status).toBe(200);
    expect(res.body.anonymousId).toBe(ANON);
    expect(res.body.userId).toBeUndefined();
  });

  it('recusa quem nao traz conta nem identificador de visitante', async () => {
    const res = await request(app).put('/api/me/progress').send(corpo());
    expect(res.status).toBe(400);
  });

  it('recusa percent fora de 0..1', async () => {
    const res = await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send(corpo({ percent: 2 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA — 404 nas rotas (`PUT /api/me/progress` não existe)

- [ ] **Passo 3: Escrever serviço, rota e registro**

Criar `services/progressService.js`:

```js
const ReadingProgress = require('../models/ReadingProgress');

/**
 * Regras de progresso e do carrossel "Continuar", isoladas do Express para
 * poderem ser testadas direto.
 */

/** Salva (ou atualiza) o progresso de um episódio para a identidade dada. */
async function saveProgress(identity, dados) {
  const { seriesId, episodeId, contentType, percent, position = 0 } = dados;

  if (typeof percent !== 'number' || percent < 0 || percent > 1) {
    const err = new Error('percent deve ser um número entre 0 e 1.');
    err.status = 400;
    throw err;
  }
  if (!seriesId || !episodeId || !contentType) {
    const err = new Error('seriesId, episodeId e contentType são obrigatórios.');
    err.status = 400;
    throw err;
  }

  // upsert manual: precisamos do hook de validação, que roda no save() e é quem
  // calcula `completed` e garante a regra de identidade única.
  const doc = await ReadingProgress.findOne({ ...identity, episodeId });
  if (doc) {
    doc.seriesId = seriesId;
    doc.contentType = contentType;
    doc.percent = percent;
    doc.position = position;
    await doc.save();
    return doc;
  }
  return ReadingProgress.create({ ...identity, seriesId, episodeId, contentType, percent, position });
}

module.exports = { saveProgress };
```

Criar `routes/progress.js`:

```js
const express = require('express');
const optionalAuth = require('../middlewares/optionalAuth');
const getIdentity = require('../utils/requestIdentity');
const progressService = require('../services/progressService');
const logger = require('../utils/logger');

const router = express.Router();

// Todas as rotas aceitam conta OU visitante.
router.use(optionalAuth);

function exigirIdentidade(req, res) {
  const identity = getIdentity(req);
  if (!identity) {
    res.status(400).json({ error: 'Envie um token de conta ou o cabeçalho X-Anonymous-Id.' });
    return null;
  }
  return identity;
}

// PUT /api/me/progress — salva onde o usuário parou
router.put('/progress', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  try {
    const doc = await progressService.saveProgress(identity, req.body);
    res.json(doc);
  } catch (err) {
    if (err.status === 400 || err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Progresso] PUT /progress', err);
    res.status(500).json({ error: 'Erro ao salvar o progresso.' });
  }
});

module.exports = router;
```

Modificar `server.js` — acrescentar junto dos outros `app.use` de rotas (perto da
linha 239, depois de `/api/admin/royalties`):

```js
app.use("/api/me", require("./routes/progress"));
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: 10 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add services/progressService.js routes/progress.js server.js tests/backend/progress.test.js
git commit -m "feat(progresso): rota que grava onde o usuario parou"
```

---

### Task 4: Carrossel "Continuar"

**Arquivos:**
- Modificar: `services/progressService.js`, `routes/progress.js`
- Testar: `tests/backend/progress.test.js`

**Interfaces:**
- Consome: `saveProgress` (Task 3)
- Produz: `buildContinueList(identity)` → `Array<{ ...progresso, series }>`;
  rota `GET /api/me/continue`

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/backend/progress.test.js`:

```js
describe('GET /api/me/continue', () => {
  const ReadingProgress = require('../../models/ReadingProgress');
  const mongoose = require('mongoose');
  let serieA, epA1, epA2;

  async function criarSerie(titulo, tipo) {
    const r = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: titulo, genre: 'Teste', content_type: tipo, isPublished: true });
    return r.body._id || r.body.id;
  }

  async function criarEpisodio(seriesId, n) {
    const r = await request(app)
      .post('/api/content/episodes')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ seriesId, episode_number: n, title: `Capitulo ${n}` });
    return r.body._id || r.body.id;
  }

  beforeAll(async () => {
    await ReadingProgress.deleteMany({ userId: auth.getId('premium') });
    serieA = await criarSerie('Serie Carrossel', 'hiqua');
    epA1 = await criarEpisodio(serieA, 1);
    epA2 = await criarEpisodio(serieA, 2);
  });

  const salvar = (episodeId, percent, seriesId = serieA, contentType = 'hiqua') =>
    request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`)
      .send({ seriesId, episodeId, contentType, percent });

  it('devolve uma linha por obra, com a serie embutida', async () => {
    await salvar(epA1, 0.5);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].series.title).toBe('Serie Carrossel');
    expect(res.body[0].percent).toBeCloseTo(0.5);
  });

  it('mostra o episodio mais recente quando ha varios da mesma obra', async () => {
    await salvar(epA2, 0.3);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(1);
    expect(String(res.body[0].episodeId)).toBe(String(epA2));
  });

  it('tira a obra do carrossel quando o ultimo episodio publicado termina', async () => {
    await salvar(epA2, 0.95); // conclui o episódio 2, que é o último
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(0);
  });

  it('traz a obra de volta quando sai capitulo novo', async () => {
    await criarEpisodio(serieA, 3);
    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);

    expect(res.body).toHaveLength(1);
  });

  it('no VCine so mostra o que esta entre 10% e 90%', async () => {
    const serieV = await criarSerie('Curta Vertical', 'vcine');
    const epV = await criarEpisodio(serieV, 1);

    await salvar(epV, 0.05, serieV, 'vcine');
    let res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieV))).toBe(false);

    await salvar(epV, 0.5, serieV, 'vcine');
    res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body.some(r => String(r.seriesId) === String(serieV))).toBe(true);
  });

  it('ignora progresso parado ha mais de 90 dias', async () => {
    const antigo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await ReadingProgress.updateMany({ userId: auth.getId('premium') }, { $set: { updatedAt: antigo } });

    const res = await request(app)
      .get('/api/me/continue')
      .set('Authorization', `Bearer ${auth.getToken('premium')}`);
    expect(res.body).toHaveLength(0);
  });

  it('nunca mistura o progresso de identidades diferentes', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', ANON)
      .send({ seriesId: serieA, episodeId: epA1, contentType: 'hiqua', percent: 0.6 });

    const doVisitante = await request(app).get('/api/me/continue').set('X-Anonymous-Id', ANON);
    const deOutroVisitante = await request(app)
      .get('/api/me/continue')
      .set('X-Anonymous-Id', '99999999-8888-4777-8666-555555555555');

    expect(doVisitante.body.length).toBeGreaterThan(0);
    expect(deOutroVisitante.body).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA — 404 em `GET /api/me/continue`

- [ ] **Passo 3: Implementar as regras do carrossel**

Acrescentar a `services/progressService.js` (antes do `module.exports`):

```js
const mongoose = require('mongoose');
const Episode = require('../models/Episode');
const Series = require('../models/Series');

const DIAS_DE_PODA = 90;
const TETO_DO_CARROSSEL = 20;
const VCINE_MIN = 0.1;
const VCINE_MAX = 0.9;

/**
 * Monta o carrossel "Continuar" aplicando, nesta ordem:
 *  1. descarta o que está parado há mais de 90 dias
 *  2. mantém uma linha por obra — a de atualização mais recente
 *  3. no VCine, só o que está entre 10% e 90% (vídeo curto é consumo de rolagem)
 *  4. remove a obra cujo último episódio publicado já foi concluído
 *  5. corta em 20 obras
 */
async function buildContinueList(identity) {
  const corte = new Date(Date.now() - DIAS_DE_PODA * 24 * 60 * 60 * 1000);

  const linhas = await ReadingProgress.find({ ...identity, updatedAt: { $gte: corte } })
    .sort({ updatedAt: -1 })
    .limit(200) // teto de segurança antes do agrupamento
    .lean();

  const porObra = new Map();
  for (const linha of linhas) {
    const chave = String(linha.seriesId);
    if (!porObra.has(chave)) porObra.set(chave, linha);
  }

  const candidatas = [...porObra.values()].filter(linha => {
    if (linha.contentType !== 'vcine') return true;
    return linha.percent >= VCINE_MIN && linha.percent <= VCINE_MAX;
  });
  if (candidatas.length === 0) return [];

  const idsDasObras = candidatas.map(l => new mongoose.Types.ObjectId(String(l.seriesId)));

  // Último episódio de cada obra, em uma consulta só (evita N+1).
  const ultimos = await Episode.aggregate([
    { $match: { seriesId: { $in: idsDasObras } } },
    { $sort: { episode_number: -1 } },
    { $group: { _id: '$seriesId', ultimoId: { $first: '$_id' } } },
  ]);
  const ultimoPorObra = new Map(ultimos.map(u => [String(u._id), String(u.ultimoId)]));

  const series = await Series.find({ _id: { $in: idsDasObras } })
    .select('title cover_image content_type')
    .lean();
  const obraPorId = new Map(series.map(s => [String(s._id), s]));

  const resultado = [];
  for (const linha of candidatas) {
    const chave = String(linha.seriesId);
    const terminouOUltimo = linha.completed && ultimoPorObra.get(chave) === String(linha.episodeId);
    if (terminouOUltimo) continue;

    const obra = obraPorId.get(chave);
    if (!obra) continue; // obra removida do catálogo

    resultado.push({ ...linha, series: obra });
    if (resultado.length >= TETO_DO_CARROSSEL) break;
  }

  return resultado;
}
```

Ajustar o `module.exports` do mesmo arquivo:

```js
module.exports = { saveProgress, buildContinueList };
```

Acrescentar a rota em `routes/progress.js`, antes do `module.exports`:

```js
// GET /api/me/continue — o carrossel "Continuar"
router.get('/continue', async (req, res) => {
  const identity = exigirIdentidade(req, res);
  if (!identity) return;

  try {
    res.json(await progressService.buildContinueList(identity));
  } catch (err) {
    logger.error('[Progresso] GET /continue', err);
    res.status(500).json({ error: 'Erro ao montar a lista de continuar.' });
  }
});
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: 17 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add services/progressService.js routes/progress.js tests/backend/progress.test.js
git commit -m "feat(progresso): carrossel Continuar com as seis regras do spec"
```

---

### Task 5: Migração do visitante para a conta

**Arquivos:**
- Modificar: `services/progressService.js`, `routes/progress.js`
- Testar: `tests/backend/progress.test.js`

**Interfaces:**
- Consome: `ReadingProgress` (Task 1)
- Produz: `claimAnonymousProgress(userId, anonymousId)` →
  `{ movidos: number, fundidos: number }`; rota `POST /api/me/progress/claim`

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/backend/progress.test.js`:

```js
describe('POST /api/me/progress/claim', () => {
  const ReadingProgress = require('../../models/ReadingProgress');
  const VISITANTE = '22222222-3333-4444-8555-666666666666';
  let serie, ep1, ep2;

  beforeAll(async () => {
    await ReadingProgress.deleteMany({ userId: auth.getId('user') });
    await ReadingProgress.deleteMany({ anonymousId: VISITANTE });

    const s = await request(app)
      .post('/api/content/series')
      .set('Authorization', `Bearer ${auth.getToken('admin')}`)
      .send({ title: 'Serie da Migracao', genre: 'Teste', content_type: 'hiqua', isPublished: true });
    serie = s.body._id || s.body.id;

    for (const n of [1, 2]) {
      const e = await request(app)
        .post('/api/content/episodes')
        .set('Authorization', `Bearer ${auth.getToken('admin')}`)
        .send({ seriesId: serie, episode_number: n, title: `Capitulo ${n}` });
      if (n === 1) ep1 = e.body._id || e.body.id;
      else ep2 = e.body._id || e.body.id;
    }
  });

  it('move o progresso do visitante para a conta', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: ep1, contentType: 'hiqua', percent: 0.6 });

    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.movidos).toBe(1);

    const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: ep1 });
    expect(naConta.percent).toBeCloseTo(0.6);

    const sobrou = await ReadingProgress.findOne({ anonymousId: VISITANTE, episodeId: ep1 });
    expect(sobrou).toBeNull();
  });

  it('quando os dois lados tem o mesmo episodio, vence o maior percentual', async () => {
    await request(app)
      .put('/api/me/progress')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ seriesId: serie, episodeId: ep2, contentType: 'hiqua', percent: 0.8 });

    await request(app)
      .put('/api/me/progress')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ seriesId: serie, episodeId: ep2, contentType: 'hiqua', percent: 0.3 });

    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.fundidos).toBe(1);

    const naConta = await ReadingProgress.findOne({ userId: auth.getId('user'), episodeId: ep2 });
    expect(naConta.percent).toBeCloseTo(0.8); // o da conta era maior e prevalece
  });

  it('e idempotente: chamar de novo nao duplica nem regride', async () => {
    const antes = await ReadingProgress.countDocuments({ userId: auth.getId('user') });
    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('Authorization', `Bearer ${auth.getToken('user')}`)
      .send({ anonymousId: VISITANTE });

    expect(res.status).toBe(200);
    expect(res.body.movidos).toBe(0);
    expect(await ReadingProgress.countDocuments({ userId: auth.getId('user') })).toBe(antes);
  });

  it('exige conta: visitante nao pode reivindicar', async () => {
    const res = await request(app)
      .post('/api/me/progress/claim')
      .set('X-Anonymous-Id', VISITANTE)
      .send({ anonymousId: VISITANTE });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA — 404 em `POST /api/me/progress/claim`

- [ ] **Passo 3: Implementar a migração**

Acrescentar a `services/progressService.js`:

```js
/**
 * Transfere o histórico do visitante para a conta, no cadastro ou no login.
 *
 * Episódio que só o visitante tem é reatribuído (não duplicado). Episódio que os
 * dois têm é fundido pelo MAIOR percentual — e não pela data mais recente: quem
 * leu bastante no celular ontem e abriu o app no computador hoje sem ler nada não
 * pode perder o avanço.
 *
 * Idempotente: rodar de novo com o mesmo identificador não muda mais nada.
 */
async function claimAnonymousProgress(userId, anonymousId) {
  const doVisitante = await ReadingProgress.find({ anonymousId }).lean();
  if (doVisitante.length === 0) return { movidos: 0, fundidos: 0 };

  const daConta = await ReadingProgress.find({
    userId,
    episodeId: { $in: doVisitante.map(d => d.episodeId) },
  });
  const contaPorEpisodio = new Map(daConta.map(d => [String(d.episodeId), d]));

  let movidos = 0;
  let fundidos = 0;

  for (const visitante of doVisitante) {
    const existente = contaPorEpisodio.get(String(visitante.episodeId));

    if (!existente) {
      await ReadingProgress.updateOne(
        { _id: visitante._id },
        { $set: { userId }, $unset: { anonymousId: '' } },
      );
      movidos++;
      continue;
    }

    if (visitante.percent > existente.percent) {
      existente.percent = visitante.percent;
      existente.position = visitante.position;
      await existente.save(); // recalcula `completed` no hook
    }
    await ReadingProgress.deleteOne({ _id: visitante._id });
    fundidos++;
  }

  return { movidos, fundidos };
}
```

Ajustar o `module.exports`:

```js
module.exports = { saveProgress, buildContinueList, claimAnonymousProgress };
```

Acrescentar a rota em `routes/progress.js`:

```js
// POST /api/me/progress/claim — leva o histórico do visitante para a conta
router.post('/progress/claim', async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Só uma conta pode reivindicar progresso.' });
  }

  const { anonymousId } = req.body || {};
  const identidadeVisitante = getIdentity({ headers: { 'x-anonymous-id': anonymousId } });
  if (!identidadeVisitante) {
    return res.status(400).json({ error: 'anonymousId inválido.' });
  }

  try {
    const resumo = await progressService.claimAnonymousProgress(req.user.id, anonymousId);
    res.json(resumo);
  } catch (err) {
    logger.error('[Progresso] POST /progress/claim', err);
    res.status(500).json({ error: 'Erro ao migrar o progresso.' });
  }
});
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: 21 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add services/progressService.js routes/progress.js tests/backend/progress.test.js
git commit -m "feat(progresso): migra historico do visitante ao criar conta"
```

---

### Task 6: LGPD — exportação e exclusão

**Arquivos:**
- Modificar: `routes/account.js` (rotas de export e de exclusão de conta)
- Modificar: `components/LegalPolicy.tsx` (parágrafo do visitante)
- Testar: `tests/backend/progress.test.js`

**Interfaces:**
- Consome: `ReadingProgress` (Task 1)
- Produz: progresso incluído no export e apagado junto da conta

- [ ] **Passo 1: Localizar as rotas atuais**

Rodar: `grep -n "readingProgress\|Favorite\|deleteMany\|export" routes/account.js | head -20`

Anotar o nome da função que monta o export e a que apaga a conta.

- [ ] **Passo 2: Escrever o teste que falha**

Acrescentar a `tests/backend/progress.test.js`:

```js
describe('LGPD do progresso', () => {
  const ReadingProgress = require('../../models/ReadingProgress');

  it('o export do titular inclui o progresso de leitura', async () => {
    const res = await request(app)
      .get('/api/account/me/export')
      .set('Authorization', `Bearer ${auth.getToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('readingProgress');
    expect(Array.isArray(res.body.readingProgress)).toBe(true);
  });

  it('excluir a conta apaga o progresso junto', async () => {
    const bcrypt = require('bcrypt');
    const User = require('../../models/User');
    const descartavel = await User.create({
      email: 'progresso-lgpd@lorflux.test',
      passwordHash: await bcrypt.hash('Descartavel@123', 10),
      nome: 'Conta Descartavel',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'progresso-lgpd@lorflux.test', password: 'Descartavel@123' });
    const token = login.body.accessToken;

    const mongoose = require('mongoose');
    await ReadingProgress.create({
      userId: descartavel._id,
      seriesId: new mongoose.Types.ObjectId(),
      episodeId: new mongoose.Types.ObjectId(),
      contentType: 'hiqua',
      percent: 0.5,
    });

    await request(app)
      .delete('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Descartavel@123' });

    expect(await ReadingProgress.countDocuments({ userId: descartavel._id })).toBe(0);
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

Rodar: `npx vitest run tests/backend/progress.test.js --config vitest.backend.config.ts`
Esperado: FALHA — `readingProgress` ausente no export e contagem diferente de zero

- [ ] **Passo 4: Incluir o progresso nas duas rotas**

Em `routes/account.js`, no trecho que monta o export, acrescentar a busca junto das
outras coleções do titular:

```js
const ReadingProgress = require('../models/ReadingProgress');
// ...
const readingProgress = await ReadingProgress.find({ userId: req.user.id })
  .select('seriesId episodeId contentType percent completed updatedAt -_id')
  .lean();
```

e incluir `readingProgress` no objeto devolvido.

No trecho que apaga a conta, acrescentar junto dos outros `deleteMany`:

```js
await ReadingProgress.deleteMany({ userId: req.user.id });
```

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `npm run test:backend`
Esperado: toda a suíte PASSA (158 antigos + os novos)

- [ ] **Passo 6: Documentar na política de privacidade**

Em `components/LegalPolicy.tsx`, na seção de dados coletados, acrescentar:

```tsx
<p>
  <strong>Progresso de leitura.</strong> Guardamos em que ponto você parou em cada
  capítulo ou episódio para permitir que continue de onde parou. Se você ainda não
  tem conta, esse registro fica ligado a um identificador do seu navegador, é
  apagado quando você limpa os dados do navegador e expira após 180 dias sem uso.
  Ao criar uma conta, o histórico passa a ser vinculado a ela.
</p>
```

- [ ] **Passo 7: Commitar**

```bash
git add routes/account.js components/LegalPolicy.tsx tests/backend/progress.test.js
git commit -m "feat(progresso): progresso entra no export e na exclusao de conta (LGPD)"
```

---

### Task 7: Cliente — identificador do visitante e chamadas

**Arquivos:**
- Criar: `utils/anonymousId.ts`
- Modificar: `services/api.ts` (método `request`, por volta da linha 132)
- Testar: `tests/frontend/anonymousId.test.ts`

**Interfaces:**
- Consome: nada
- Produz: `getAnonymousId()` → `string`; `api.saveProgress(dados)`,
  `api.getContinueList()`, `api.claimProgress(anonymousId)`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/frontend/anonymousId.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getAnonymousId, ANON_STORAGE_KEY } from '../../utils/anonymousId';

describe('identificador do visitante', () => {
  beforeEach(() => localStorage.clear());

  it('gera um UUID v4 no primeiro acesso', () => {
    const id = getAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('reaproveita o mesmo identificador nas chamadas seguintes', () => {
    const primeiro = getAnonymousId();
    expect(getAnonymousId()).toBe(primeiro);
    expect(localStorage.getItem(ANON_STORAGE_KEY)).toBe(primeiro);
  });

  it('descarta valor corrompido e gera outro', () => {
    localStorage.setItem(ANON_STORAGE_KEY, 'lixo');
    const id = getAnonymousId();
    expect(id).not.toBe('lixo');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/frontend/anonymousId.test.ts`
Esperado: FALHA com `Cannot find module '../../utils/anonymousId'`

- [ ] **Passo 3: Escrever o utilitário**

Criar `utils/anonymousId.ts`:

```ts
export const ANON_STORAGE_KEY = 'lorflux_anonymous_id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identificador do visitante sem conta, usado para guardar o progresso de leitura
 * no servidor antes do cadastro.
 *
 * É um UUID sorteado, guardado no navegador — de propósito, e não uma impressão
 * digital de dispositivo: assim o usuário se livra dele limpando os dados do
 * navegador, o que mantém a coleta dentro do que a LGPD espera.
 */
export function getAnonymousId(): string {
  try {
    const guardado = localStorage.getItem(ANON_STORAGE_KEY);
    if (guardado && UUID_V4.test(guardado)) return guardado;

    const novo = crypto.randomUUID();
    localStorage.setItem(ANON_STORAGE_KEY, novo);
    return novo;
  } catch {
    // Navegação privada com storage bloqueado: identificador só desta sessão.
    return crypto.randomUUID();
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/frontend/anonymousId.test.ts`
Esperado: 3 testes PASSAM

- [ ] **Passo 5: Ligar no cliente HTTP**

Em `services/api.ts`, importar no topo:

```ts
import { getAnonymousId } from '../utils/anonymousId';
```

No método `request`, acrescentar o cabeçalho junto dos outros (linha ~132):

```ts
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
          'X-Anonymous-Id': getAnonymousId(),
          ...options.headers,
        },
```

Acrescentar os métodos ao final da classe, antes do fechamento:

```ts
  // ─── Fase 4: progresso de leitura ───────────────────────────────────────────
  async saveProgress(dados: {
    seriesId: string; episodeId: string;
    contentType: 'hqcine' | 'vcine' | 'hiqua';
    percent: number; position?: number;
  }) {
    return this.request('/me/progress', { method: 'PUT', body: JSON.stringify(dados) });
  }

  async getContinueList() {
    return this.request<any[]>('/me/continue');
  }

  /** Chamado logo após login/cadastro para levar o histórico do visitante à conta. */
  async claimProgress(anonymousId: string) {
    return this.request<{ movidos: number; fundidos: number }>('/me/progress/claim', {
      method: 'POST',
      body: JSON.stringify({ anonymousId }),
    });
  }
```

- [ ] **Passo 6: Conferir tipos e commitar**

Rodar: `npx tsc --noEmit -p tsconfig.json`
Esperado: sem erros

```bash
git add utils/anonymousId.ts services/api.ts tests/frontend/anonymousId.test.ts
git commit -m "feat(progresso): identificador de visitante e chamadas de progresso no cliente"
```

---

### Task 8: Hook `useProgress`

**Arquivos:**
- Criar: `hooks/useProgress.ts`
- Testar: `tests/frontend/useProgress.test.ts`

**Interfaces:**
- Consome: `api.saveProgress` (Task 7)
- Produz: `useProgress({ seriesId, episodeId, contentType })` →
  `{ report(percent, position) }`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/frontend/useProgress.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from '../../hooks/useProgress';
import { api } from '../../services/api';

describe('useProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'saveProgress').mockResolvedValue({} as any);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const args = { seriesId: 's1', episodeId: 'e1', contentType: 'hiqua' as const };

  it('nao grava antes do intervalo combinado', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.2, 0); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('grava depois do intervalo', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.2, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 's1', episodeId: 'e1', percent: 0.2 }),
    );
  });

  it('ignora mudanca menor que o limiar', () => {
    const { result } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.20, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    act(() => { result.current.report(0.21, 0); });
    act(() => { vi.advanceTimersByTime(3500); });
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
  });

  it('grava o que estiver pendente ao desmontar', () => {
    const { result, unmount } = renderHook(() => useProgress(args));
    act(() => { result.current.report(0.5, 0); });
    unmount();
    expect(api.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 0.5 }),
    );
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/frontend/useProgress.test.ts`
Esperado: FALHA com `Cannot find module '../../hooks/useProgress'`

- [ ] **Passo 3: Escrever o hook**

Criar `hooks/useProgress.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';

/** Espera o leitor/player sossegar antes de gravar. */
const INTERVALO_MS = 3000;
/** Abaixo disso não vale uma escrita no banco. */
const LIMIAR_PERCENT = 0.02;

type Args = {
  seriesId: string;
  episodeId: string;
  contentType: 'hqcine' | 'vcine' | 'hiqua';
};

/**
 * Registra onde o usuário parou, sem inundar o servidor.
 *
 * Grava no máximo uma vez a cada 3 segundos e só quando o avanço passa de 2% —
 * e sempre descarrega o que estiver pendente ao sair da tela, que é justamente
 * quando o dado importa.
 */
export function useProgress({ seriesId, episodeId, contentType }: Args) {
  const pendente = useRef<{ percent: number; position: number } | null>(null);
  const ultimoGravado = useRef<number>(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gravar = useCallback(() => {
    const dados = pendente.current;
    if (!dados || !seriesId || !episodeId) return;
    if (Math.abs(dados.percent - ultimoGravado.current) < LIMIAR_PERCENT) return;

    ultimoGravado.current = dados.percent;
    pendente.current = null;
    api.saveProgress({ seriesId, episodeId, contentType, ...dados }).catch(() => {
      // Falha de rede não pode atrapalhar a leitura: tenta de novo no próximo report.
      ultimoGravado.current = -1;
    });
  }, [seriesId, episodeId, contentType]);

  const report = useCallback((percent: number, position = 0) => {
    pendente.current = { percent: Math.min(1, Math.max(0, percent)), position };
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      gravar();
    }, INTERVALO_MS);
  }, [gravar]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    gravar(); // descarrega o pendente ao sair
  }, [gravar]);

  return { report };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/frontend/useProgress.test.ts`
Esperado: 4 testes PASSAM

- [ ] **Passo 5: Commitar**

```bash
git add hooks/useProgress.ts tests/frontend/useProgress.test.ts
git commit -m "feat(progresso): hook que grava com folga e descarrega ao sair"
```

---

### Task 9: Restauração no leitor e no player

**Arquivos:**
- Modificar: `components/WebtoonReader.tsx` (usa `scrollRef` e `handleScroll`, linhas ~54-60)
- Modificar: `components/VerticalPlayer.tsx` (usa `videoRef` e `timeupdate`, linhas ~79-101)
- Testar: `tests/frontend/progressRestore.test.tsx`

**Interfaces:**
- Consome: `useProgress` (Task 8), `api.getContinueList` (Task 7)
- Produz: leitor e player que gravam e restauram posição

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/frontend/progressRestore.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { posicaoDeVolta } from '../../utils/progressPosition';

describe('posição de volta', () => {
  it('converte percentual em pixels usando a altura atual', () => {
    expect(posicaoDeVolta(0.5, 2000, 800)).toBe(600); // (2000-800) * 0.5
  });

  it('cai no mesmo ponto relativo em telas de alturas diferentes', () => {
    const emTelaPequena = posicaoDeVolta(0.25, 4000, 600) / (4000 - 600);
    const emTelaGrande = posicaoDeVolta(0.25, 4000, 1200) / (4000 - 1200);
    expect(emTelaPequena).toBeCloseTo(emTelaGrande);
  });

  it('nao volta antes do inicio nem passa do fim', () => {
    expect(posicaoDeVolta(-1, 2000, 800)).toBe(0);
    expect(posicaoDeVolta(2, 2000, 800)).toBe(1200);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/frontend/progressRestore.test.tsx`
Esperado: FALHA com `Cannot find module '../../utils/progressPosition'`

- [ ] **Passo 3: Escrever o utilitário de posição**

Criar `utils/progressPosition.ts`:

```ts
/**
 * Converte o percentual guardado na posição de scroll da tela atual.
 *
 * Guardamos percentual, e não pixels, porque pixel depende da largura da tela:
 * quem lê no celular e continua no tablet cairia no lugar errado.
 */
export function posicaoDeVolta(percent: number, alturaTotal: number, alturaVisivel: number): number {
  const rolavel = Math.max(0, alturaTotal - alturaVisivel);
  const seguro = Math.min(1, Math.max(0, percent));
  return Math.round(rolavel * seguro);
}

/** O inverso: quanto do capítulo já foi percorrido. */
export function percentualLido(scrollTop: number, alturaTotal: number, alturaVisivel: number): number {
  const rolavel = Math.max(1, alturaTotal - alturaVisivel);
  return Math.min(1, Math.max(0, scrollTop / rolavel));
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/frontend/progressRestore.test.tsx`
Esperado: 3 testes PASSAM

- [ ] **Passo 5: Ligar no `WebtoonReader`**

Em `components/WebtoonReader.tsx`, importar:

```tsx
import { useProgress } from '../hooks/useProgress';
import { posicaoDeVolta, percentualLido } from '../utils/progressPosition';
import { api } from '../services/api';
```

Dentro do componente, junto dos outros hooks:

```tsx
  const { report } = useProgress({
    seriesId: String(webtoon?.id ?? ''),
    episodeId: String(webtoon?.episodeId ?? ''),
    contentType: 'hiqua',
  });
  const jaRestaurou = useRef(false);
```

No `handleScroll` existente (que já lê `el.scrollTop` na linha ~60), acrescentar ao final:

```tsx
    report(percentualLido(el.scrollTop, el.scrollHeight, el.clientHeight));
```

E um efeito que restaura assim que os painéis terminam de carregar:

```tsx
  useEffect(() => {
    if (jaRestaurou.current || loading || paineis.length === 0) return;
    jaRestaurou.current = true;

    (async () => {
      try {
        const lista = await api.getContinueList();
        const meu = lista.find((l: any) => String(l.episodeId) === String(webtoon?.episodeId));
        const el = scrollRef.current;
        if (!meu || !el || meu.percent < 0.02) return;
        el.scrollTop = posicaoDeVolta(meu.percent, el.scrollHeight, el.clientHeight);
      } catch { /* sem progresso salvo: começa do início mesmo */ }
    })();
  }, [loading, paineis.length, webtoon?.episodeId]);
```

- [ ] **Passo 6: Ligar no `VerticalPlayer`**

Em `components/VerticalPlayer.tsx`, importar `useProgress` e `api` do mesmo modo.
No listener `onTimeUpdate` já existente (linha ~85), acrescentar:

```tsx
      if (v.duration > 0) report(v.currentTime / v.duration, v.currentTime);
```

E, ao carregar o vídeo, retomar do segundo salvo:

```tsx
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await api.getContinueList();
        const meu = lista.find((l: any) => String(l.episodeId) === String(episodeId));
        const v = videoRef.current;
        // Perto do fim, recomeça: ninguém quer voltar nos créditos.
        if (cancelado || !meu || !v || meu.percent >= 0.95) return;
        v.currentTime = meu.position || 0;
      } catch { /* sem progresso salvo */ }
    })();
    return () => { cancelado = true; };
  }, [episodeId]);
```

- [ ] **Passo 7: Conferir tipos, rodar tudo e commitar**

Rodar: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Esperado: sem erros de tipo, todos os testes passam

```bash
git add components/WebtoonReader.tsx components/VerticalPlayer.tsx utils/progressPosition.ts tests/frontend/progressRestore.test.tsx
git commit -m "feat(progresso): leitor e player gravam e voltam de onde parou"
```

---

### Task 10: Carrossel e barra nos cards

**Arquivos:**
- Criar: `components/ContinueCarousel.tsx`, `components/ProgressBar.tsx`
- Modificar: `components/HiQua.tsx` (grade na linha ~146), `components/HQCine.tsx`,
  `components/VFilm.tsx`
- Testar: `tests/frontend/continueCarousel.test.tsx`

**Interfaces:**
- Consome: `api.getContinueList` (Task 7)
- Produz: `<ContinueCarousel contentType onOpen />`, `<ProgressBar percent />`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/frontend/continueCarousel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContinueCarousel from '../../components/ContinueCarousel';
import { api } from '../../services/api';

const item = {
  seriesId: 's1',
  episodeId: 'e1',
  contentType: 'hiqua',
  percent: 0.62,
  series: { title: 'The Near Ones', cover_image: '/capa.jpg' },
};

describe('ContinueCarousel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('nao renderiza nada quando nao ha progresso', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([]);
    const { container } = render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    await waitFor(() => expect(api.getContinueList).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('mostra a obra em andamento com o percentual', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([item] as any);
    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
  });

  it('mostra so o conteudo da aba em que esta', async () => {
    vi.spyOn(api, 'getContinueList').mockResolvedValue([
      item,
      { ...item, seriesId: 's2', contentType: 'vcine', series: { title: 'Curta Vertical' } },
    ] as any);

    render(<ContinueCarousel contentType="hiqua" onOpen={() => {}} />);
    expect(await screen.findByText('The Near Ones')).toBeInTheDocument();
    expect(screen.queryByText('Curta Vertical')).not.toBeInTheDocument();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/frontend/continueCarousel.test.tsx`
Esperado: FALHA com `Cannot find module '../../components/ContinueCarousel'`

- [ ] **Passo 3: Escrever a barrinha**

Criar `components/ProgressBar.tsx`:

```tsx
import React from 'react';

/** Barra fina de progresso — some quando a obra ainda não foi começada. */
const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  if (!percent || percent <= 0) return null;
  const largura = Math.min(100, Math.max(0, percent * 100));

  return (
    <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden" aria-hidden="true">
      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${largura}%` }} />
    </div>
  );
};

export default ProgressBar;
```

- [ ] **Passo 4: Escrever o carrossel**

Criar `components/ContinueCarousel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import ImageWithFallback from './ImageWithFallback';
import ProgressBar from './ProgressBar';

type Props = {
  contentType: 'hqcine' | 'vcine' | 'hiqua';
  onOpen: (seriesId: string, episodeId: string) => void;
};

/**
 * Carrossel "Continuar" no topo da aba: o que o usuário deixou pela metade.
 * O backend já aplica as regras de ordenação, poda e saída — aqui só filtramos
 * pelo tipo da aba em que estamos.
 */
const ContinueCarousel: React.FC<Props> = ({ contentType, onOpen }) => {
  const [itens, setItens] = useState<any[]>([]);
  const t = useT();

  useEffect(() => {
    let cancelado = false;
    api.getContinueList()
      .then(lista => { if (!cancelado) setItens(lista.filter((l: any) => l.contentType === contentType)); })
      .catch(() => { /* sem progresso: o carrossel simplesmente não aparece */ });
    return () => { cancelado = true; };
  }, [contentType]);

  if (itens.length === 0) return null;

  return (
    <section className="px-8 mb-8">
      <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">
        {t('continue_reading')}
      </h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {itens.map(item => (
          <button
            key={String(item.episodeId)}
            onClick={() => onOpen(String(item.seriesId), String(item.episodeId))}
            className="shrink-0 w-32 text-left group"
          >
            <div className="rounded-2xl overflow-hidden mb-2 aspect-[2/3] bg-zinc-900">
              <ImageWithFallback
                src={item.series?.cover_image}
                alt={item.series?.title || ''}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <p className="text-xs font-bold truncate">{item.series?.title}</p>
            <p className="text-[10px] text-zinc-500 font-bold mb-1">
              {Math.round(item.percent * 100)}%
            </p>
            <ProgressBar percent={item.percent} />
          </button>
        ))}
      </div>
    </section>
  );
};

export default ContinueCarousel;
```

- [ ] **Passo 5: Acrescentar a chave de tradução**

Em `i18n/translations.ts`, acrescentar a cada um dos quatro dicionários:

```ts
  continue_reading: 'Continuar',        // pt
  continue_reading: 'Continue',         // en
  continue_reading: 'Continuar',        // es
  continue_reading: '继续观看',          // zh
```

- [ ] **Passo 6: Rodar e ver passar**

Rodar: `npx vitest run tests/frontend/continueCarousel.test.tsx`
Esperado: 3 testes PASSAM

- [ ] **Passo 7: Encaixar nas três abas**

Em `components/HiQua.tsx`, logo antes da grade de obras (linha ~146):

```tsx
      <ContinueCarousel contentType="hiqua" onOpen={handleContinuar} />
```

Repetir em `components/HQCine.tsx` com `contentType="hqcine"` e em
`components/VFilm.tsx` com `contentType="vcine"`, cada um com o próprio handler que
abre a obra no episódio indicado.

- [ ] **Passo 8: Conferir tudo e commitar**

Rodar: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run test:backend`
Esperado: tudo verde

```bash
git add components/ContinueCarousel.tsx components/ProgressBar.tsx components/HiQua.tsx components/HQCine.tsx components/VFilm.tsx i18n/translations.ts tests/frontend/continueCarousel.test.tsx
git commit -m "feat(progresso): carrossel Continuar e barra de progresso nas abas"
```

---

### Task 11: Migração no login e no cadastro

**Arquivos:**
- Modificar: `App.tsx` (fluxo pós-login) ou `components/Auth.tsx`
- Testar: `tests/frontend/claimOnLogin.test.ts`

**Interfaces:**
- Consome: `api.claimProgress` (Task 7), `getAnonymousId` (Task 7)
- Produz: histórico do visitante indo para a conta assim que ela existe

- [ ] **Passo 1: Localizar o ponto de entrada**

Rodar: `grep -n "setUser\|onLogin\|handleLogin\|bootstrapSession" App.tsx components/Auth.tsx | head -15`

Anotar a função que roda logo depois de autenticar.

- [ ] **Passo 2: Escrever o teste que falha**

Criar `tests/frontend/claimOnLogin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrarProgressoDoVisitante } from '../../utils/claimProgress';
import { api } from '../../services/api';
import { ANON_STORAGE_KEY } from '../../utils/anonymousId';

describe('migração do progresso ao entrar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('leva o histórico do visitante para a conta', async () => {
    localStorage.setItem(ANON_STORAGE_KEY, '11111111-2222-4333-8444-555555555555');
    const spy = vi.spyOn(api, 'claimProgress').mockResolvedValue({ movidos: 2, fundidos: 0 });

    await migrarProgressoDoVisitante();

    expect(spy).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555');
  });

  it('nao chama nada quando o aparelho ainda nao tem identificador', async () => {
    const spy = vi.spyOn(api, 'claimProgress');
    await migrarProgressoDoVisitante();
    expect(spy).not.toHaveBeenCalled();
  });

  it('falha silenciosa: erro de rede nao atrapalha o login', async () => {
    localStorage.setItem(ANON_STORAGE_KEY, '11111111-2222-4333-8444-555555555555');
    vi.spyOn(api, 'claimProgress').mockRejectedValue(new Error('rede'));
    await expect(migrarProgressoDoVisitante()).resolves.toBeUndefined();
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

Rodar: `npx vitest run tests/frontend/claimOnLogin.test.ts`
Esperado: FALHA com `Cannot find module '../../utils/claimProgress'`

- [ ] **Passo 4: Escrever o utilitário**

Criar `utils/claimProgress.ts`:

```ts
import { api } from '../services/api';
import { ANON_STORAGE_KEY } from './anonymousId';

/**
 * Leva para a conta o que o usuário leu antes de se cadastrar.
 *
 * Chamado logo depois do login/cadastro. Falha em silêncio de propósito: se a
 * rede cair aqui, o pior que acontece é o histórico anônimo continuar de lado —
 * e o login não pode quebrar por causa disso.
 */
export async function migrarProgressoDoVisitante(): Promise<void> {
  try {
    const anonymousId = localStorage.getItem(ANON_STORAGE_KEY);
    if (!anonymousId) return;
    await api.claimProgress(anonymousId);
  } catch { /* silencioso por decisão de projeto */ }
}
```

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `npx vitest run tests/frontend/claimOnLogin.test.ts`
Esperado: 3 testes PASSAM

- [ ] **Passo 6: Chamar no fluxo de autenticação**

No ponto localizado no Passo 1 (logo após o usuário ser definido no estado),
acrescentar:

```tsx
      await migrarProgressoDoVisitante();
```

com o import correspondente.

- [ ] **Passo 7: Rodar tudo e commitar**

Rodar: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run test:backend`
Esperado: tudo verde

```bash
git add utils/claimProgress.ts App.tsx components/Auth.tsx tests/frontend/claimOnLogin.test.ts
git commit -m "feat(progresso): historico do visitante migra ao entrar na conta"
```

---

## Autorrevisão do plano

**Cobertura do spec:**

| Requisito do spec | Tarefa |
|---|---|
| Modelo com identidade dupla, índices, `completed` a 90% | 1 |
| Identificação por conta ou visitante | 2 |
| `PUT /api/me/progress`, limiares e validação | 3 |
| `GET /api/me/continue` com as seis regras (ordem, uma por obra, VCine, saída, teto, poda) | 4 |
| `POST /api/me/progress/claim`, idempotente, maior percentual vence | 5 |
| LGPD: export, exclusão, política de privacidade, expiração de 180 dias | 1 (índice TTL) e 6 |
| Cabeçalho `X-Anonymous-Id`, UUID apagável | 7 |
| Gravação com folga (intervalo e limiar), descarga ao sair | 8 |
| Restauração no leitor (por percentual) e no player (por segundo) | 9 |
| Carrossel e barra nos cards, nas três abas | 10 |
| Migração ao criar conta/entrar | 11 |

**Consistência de nomes:** `saveProgress`, `buildContinueList`,
`claimAnonymousProgress` no serviço; `getIdentity` no utilitário;
`getAnonymousId`/`ANON_STORAGE_KEY` no cliente; `posicaoDeVolta`/`percentualLido`
na conversão; `report` como retorno do hook. Conferidos entre as tarefas.

**Ordem de dependência:** 1 → 2 → 3 → 4 → 5 → 6 no backend; 7 → 8 → 9 → 10 → 11 no
front. A Task 7 depende apenas do backend da Task 3 estar de pé.

**Ponto de atenção conhecido:** as Tasks 6 e 11 começam com um passo de localização
(`grep`) porque dependem de trechos de `routes/account.js`, `App.tsx` e
`components/Auth.tsx` que variam conforme o estado do arquivo. É intencional: melhor
localizar na hora do que fixar um número de linha que pode estar desatualizado.
