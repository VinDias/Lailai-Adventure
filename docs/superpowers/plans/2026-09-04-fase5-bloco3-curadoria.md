# Fase 5 · Bloco 3 — Curadoria Semiautomática — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leitores logados sinalizam obras publicadas; sinalizações válidas acumulam por obra e, ao atingir limiares proporcionais ao alcance, abrem um CASO na Fila de Revisão do admin, avisando o artista por MensagemPortal; o curador decide (aprovar / reclassificar / solicitar correção / remover = despublicar). Nada é automático; números e identidades nunca chegam a leitor ou artista.

**Architecture:** Dois models novos (`Sinalizacao`, `CasoCuradoria`), um serviço puro-ish (`services/curadoriaService.js`) com a avaliação fire-and-forget, constantes num único módulo (`utils/curadoriaLimiares.js`), dois routers novos (`routes/sinalizacao.js` montado em `/api/content`; `routes/adminCuradoria.js` montado em `/api/admin`), toques cirúrgicos em `GET /admin/aprovacoes`, `DELETE /content/series/:id`, export/exclusão LGPD. Frontend: `SinalizarButton.tsx` nos 3 modais de feed; `CuradoriaPanel.tsx` no admin (molde `AprovacoesPanel`).

**Tech Stack:** Express 4 + Mongoose 8 (CommonJS), Vitest + Supertest + mongodb-memory-server 11 (backend), React 19 + TS + Vitest/RTL (frontend). i18n em `i18n/translations.ts` (4 idiomas, `en/es/zh: Record<keyof typeof pt, string>` — chave faltando quebra o `tsc`).

**Spec:** `docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md` (rev.2). A spec é o contrato; este plano argumenta a partir dela. Em conflito, a spec vence e o implementador registra a divergência no relatório.

## Global Constraints

- Regras do Vin (spec, topo): sem remoção automática; 1 conta = 1 sinalização por obra; dislike/popularidade NUNCA entram; números e identidades NUNCA saem para leitor/artista.
- Vocabulário FECHADO de 6 motivos: `conteudo_inadequado_faixa`, `discurso_de_odio`, `spam_ou_enganoso`, `direitos_autorais`, `conteudo_proibido`, `outro`. Graves: `direitos_autorais`, `conteudo_proibido`.
- `limiarPara(V)` NÃO-DECRESCENTE: V < 10.000 → `max(20, min(ceil(30% de V), 100))`; < 50.000 → 200; < 100.000 → 300; senão 500. Grave: 5. Idade mínima da conta: 3 dias (7 para graves), aplicada NA AVALIAÇÃO.
- Consumo real = SÓ `EngagementEvent` `{seriesId, userId, type ∈ view/read, flagged:false}`. `ReadingProgress` NÃO é evidência.
- `royaltyReportService.js` NÃO muda. `EngagementEvent` é append-only: só se ADICIONA índice, nunca se edita documento.
- `content_type` interno (`hqcine`/`vcine`/`hiqua`) nunca renomeado. Nenhum campo novo no shape público de `Series` nem no `GET /portal/series`.
- 404 para recurso inexistente/invisível/não publicado (nunca confirmar existência); 403 só "área não existe pra você"; 409 caso já fechado; 400 input inválido. CastError em `_id` → 404 via `utils/routeErrors.js` `responderCastError`.
- Testes com valores NÃO-redondos e `agora` injetável. Todo texto ao artista: SEM dígitos fora do título da obra (teste: `texto.split(series.title).join('')` não casa `/\d/`).
- Commits: título em PT SEM acento, `tipo(escopo): ...`, rodapé `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. NUNCA commitar `scripts/devMock.js`.
- Suite backend: `npx vitest run --config vitest.backend.config.ts tests/backend/<arquivo>` durante a task (o `vite.config.ts` padrão só inclui `tests/frontend/**` — sem a flag o vitest não acha o arquivo); suite completa antes do commit final da task: `npx vitest run --config vitest.backend.config.ts tests/backend`. Onde este plano escreve `npx vitest run tests/backend/...`, leia com a flag. Suite frontend SEMPRE via PowerShell: `npx vitest run tests/frontend/<arquivo>`; `npx tsc --noEmit` antes de commitar frontend. "Worker exited unexpectedly" na suite completa = infra de RAM — critério: 1 passe limpo OU vítimas re-rodadas isoladas verdes.
- Comentários no código explicam RESTRIÇÕES que o código não mostra (por que 404 e não 403, por que sem índice X), nunca "o que a próxima linha faz". Docs/relatórios: toda afirmação com `file:linha` VERIFICADA (anti-fabricação).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `utils/curadoriaLimiares.js` (novo) | Constantes + `limiarPara(V)`, `tipoGatilho(V)`, `ehGrave(motivo)` — zero I/O |
| `utils/primeiroAdmin.js` (novo) | `primeiroAdmin()` — critério extraído de `routes/account.js:275` |
| `models/Sinalizacao.js` (novo) | Sinalização do leitor; unique `{userId, seriesId}`; índice `{seriesId, revisadaEm, valida}` |
| `models/CasoCuradoria.js` (novo) | Caso da fila; índice ÚNICO parcial `{seriesId}` com `emAberto:true` |
| `models/EngagementEvent.js` | += índice `{seriesId, userId, type, flagged}` |
| `services/curadoriaService.js` (novo) | `contarConsumidoresUnicos`, `contarSinalizacoes`, `avaliarObra`, `dispararAvaliacao`, `flushForTests`, `enviarAvisoArtista`, `fecharCaso`, `TEXTOS`, `ROTULO_MOTIVO`, `ROTULO_RATING` |
| `middlewares/sinalizacaoLimiter.js` (novo) | 30/h por usuário; no-op em test (molde `middlewares/accountLimiter.js`) |
| `routes/sinalizacao.js` (novo, `/api/content`) | `POST /series/:id/sinalizar`, `GET /series/:id/sinalizacao` |
| `routes/adminCuradoria.js` (novo, `/api/admin`) | `GET /curadoria`, 4 ações `POST /curadoria/:casoId/...` |
| `routes/adminPortal.js` | `GET /aprovacoes` += `curadoria: {abertos, graves}` e `removidaPelaCuradoria` por série |
| `routes/content.js` | `DELETE /series/:id` += limpeza de `Sinalizacao`/`CasoCuradoria` |
| `routes/account.js` | usa `primeiroAdmin()`; export += `sinalizacoes`; `DELETE /me` += `Sinalizacao.deleteMany` |
| `server.js` | monta os 2 routers novos |
| `components/SinalizarButton.tsx` (novo) | Botão + painel inline nos 3 modais (molde `components/SuperReaderButton.tsx`) |
| `components/HQCine.tsx`, `VFilm.tsx`, `HiQua.tsx` | += `<SinalizarButton />` após `<SuperReaderButton />` |
| `components/Admin/CuradoriaPanel.tsx` (novo) | Fila de Revisão (molde `components/Admin/AprovacoesPanel.tsx`) |
| `components/Admin/AdminDashboard.tsx`, `AprovacoesPanel.tsx`, `types.ts` | aba + badge "Curadoria"; card com `removidaPelaCuradoria` |
| `services/api.ts` | métodos novos + `error.code` |
| `i18n/translations.ts` | chaves `sinalizar.*` ×4 idiomas |
| Testes | `tests/backend/curadoriaLimiares.test.js`, `curadoriaModels.test.js`, `curadoriaService.test.js`, `curadoriaSinalizar.test.js`, `adminCuradoria.test.js`, `curadoriaLgpd.test.js`; `tests/frontend/sinalizarButton.test.tsx`, `adminCuradoriaPanel.test.tsx`; re-pino de `adminAprovacoes.test.js`, `adminDashboardAprovacoesBadge.test.tsx`, `adminAprovacoesPanel.test.tsx` |

Padrões de teste do repo (copiar, não inventar): `tests/helpers/db.js` (`connect/closeDatabase`), `tests/helpers/auth.js` (`createUsers(app)`, `getToken('admin'|'user'|'premium')`, `getId`), `app = require('../../server')` no `beforeAll` DEPOIS de `db.connect()`. Eventos de engajamento SEMPRE via `services/engagementLogger.logEvent({ type, seriesId, episodeId, userId?, ip, ua })` + `await engagementLogger.flushForTests()` (nunca `EngagementEvent.create` — a cadeia de hash exige seq/prevHash). Índices únicos: `await Model.init()` no `beforeAll` (molde `tests/backend/superReader.test.js:35-41`).

---

### Task 1: Fundações — constantes, models, índice, `primeiroAdmin`

**Files:**
- Create: `utils/curadoriaLimiares.js`
- Create: `utils/primeiroAdmin.js`
- Create: `models/Sinalizacao.js`
- Create: `models/CasoCuradoria.js`
- Modify: `models/EngagementEvent.js:31-34` (+1 índice)
- Modify: `routes/account.js:272-280` (usar `primeiroAdmin()`)
- Test: `tests/backend/curadoriaLimiares.test.js`, `tests/backend/curadoriaModels.test.js`

**Interfaces:**
- Produces: `utils/curadoriaLimiares.js` exporta `{ PISO_PEQUENA, PERCENTUAL_PEQUENA, TETO_PEQUENA, LIMITE_PEQUENA_V, PATAMARES, GRAVE, IDADE_MINIMA_CONTA_DIAS, IDADE_MINIMA_CONTA_GRAVE_DIAS, MOTIVOS, MOTIVOS_GRAVES, MOTIVOS_COM_DESCRICAO_OBRIGATORIA, DESCRICAO_MAX, TEXTO_ADMIN_MAX, limiarPara(V): number, tipoGatilho(V): 'pequena'|'normal', ehGrave(motivo): boolean }`.
- Produces: `utils/primeiroAdmin.js` exporta `{ primeiroAdmin(): Promise<UserDoc|null> }`.
- Produces: `models/Sinalizacao` (campos: `seriesId, userId, motivo, grave, descricao, valida, invalidaMotivo, contaCriadaEm, ipHash, revisadaEm, createdAt`); `models/CasoCuradoria` (campos: `seriesId, emAberto, status, prioridade, abertoEm, gatilho{tipo,S,V,limiar}, resumoMotivos, mensagemAvisoId, avisoArtista, decisao, motivoDecisao, sinalizacoesAbusivas, decididoPor, decisaoEm, observacao, createdAt, updatedAt`) com statics `STATUS_ABERTOS`, `DECISOES`.

- [ ] **Step 1: Teste das constantes/limiares (falha: módulo não existe)**

`tests/backend/curadoriaLimiares.test.js`:
```js
/**
 * Fase 5 Bloco 3, Task 1 — utils/curadoriaLimiares.js. Fixtures NÃO-redondas
 * e a PROPRIEDADE da spec rev.2: limiarPara é não-decrescente em V (a rev.1
 * caía de 300 em V=999 para 100 em V=1.000 — achado ALTO do painel).
 */
const L = require('../../utils/curadoriaLimiares');

describe('curadoriaLimiares.limiarPara', () => {
  it.each([
    [0, 20], [1, 20], [47, 20], [66, 20],
    [67, 21], [90, 27], [200, 60], [333, 100],
    [334, 100], [999, 100], [9999, 100],
    [10000, 200], [49999, 200],
    [50000, 300], [99999, 300],
    [100000, 500], [250000, 500],
  ])('V=%i -> limiar %i', (V, esperado) => {
    expect(L.limiarPara(V)).toBe(esperado);
  });

  it('é NÃO-DECRESCENTE em todo V de 0 a 120.000 (propriedade da spec rev.2)', () => {
    let anterior = L.limiarPara(0);
    for (let V = 1; V <= 120000; V++) {
      const atual = L.limiarPara(V);
      if (atual < anterior) throw new Error(`limiar caiu de ${anterior} (V=${V - 1}) para ${atual} (V=${V})`);
      anterior = atual;
    }
  });

  it('30% é calculado em inteiros (sem ponto flutuante): V=10 -> 20 (piso), V=100 -> 30, V=250 -> 75', () => {
    expect(L.limiarPara(10)).toBe(20);
    expect(L.limiarPara(100)).toBe(30);
    expect(L.limiarPara(250)).toBe(75);
  });

  it('rejeita V inválido', () => {
    expect(() => L.limiarPara(-1)).toThrow(TypeError);
    expect(() => L.limiarPara(1.5)).toThrow(TypeError);
    expect(() => L.limiarPara('10')).toThrow(TypeError);
  });
});

describe('curadoriaLimiares.tipoGatilho / ehGrave / vocabulário', () => {
  it('LIMITE_PEQUENA_V é o primeiro V em que 30% alcança o teto 100 (334)', () => {
    expect(L.LIMITE_PEQUENA_V).toBe(334);
    expect(L.tipoGatilho(333)).toBe('pequena');
    expect(L.tipoGatilho(334)).toBe('normal');
    expect(L.tipoGatilho(0)).toBe('pequena');
  });

  it('vocabulário fechado de 6 motivos; graves = direitos_autorais e conteudo_proibido; outro exige descrição', () => {
    expect(L.MOTIVOS).toEqual(['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro']);
    expect(L.MOTIVOS_GRAVES).toEqual(['direitos_autorais', 'conteudo_proibido']);
    expect(L.MOTIVOS).not.toContain('violencia_excessiva');
    expect(L.MOTIVOS).not.toContain('conteudo_sexual');
    expect(L.ehGrave('direitos_autorais')).toBe(true);
    expect(L.ehGrave('outro')).toBe(false);
    expect(L.MOTIVOS_COM_DESCRICAO_OBRIGATORIA).toEqual(['outro']);
  });

  it('constantes da spec', () => {
    expect(L.GRAVE).toBe(5);
    expect(L.PISO_PEQUENA).toBe(20);
    expect(L.IDADE_MINIMA_CONTA_DIAS).toBe(3);
    expect(L.IDADE_MINIMA_CONTA_GRAVE_DIAS).toBe(7);
    expect(L.DESCRICAO_MAX).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar com "Cannot find module"**

Run: `npx vitest run tests/backend/curadoriaLimiares.test.js`

- [ ] **Step 3: Implementar `utils/curadoriaLimiares.js`**

```js
/**
 * Fase 5 Bloco 3 — constantes da curadoria semiautomática (spec rev.2,
 * decisão "Faixas dos gatilhos"). O Vin deu os patamares 100/200/300/500 e
 * "20 + 30%" para obras pequenas SEM mapear volumes; as faixas de V abaixo
 * são decisão nossa (ledger P1) e ficam aqui, num único objeto, para ajuste
 * por deploy sem tocar em lógica.
 *
 * PROPRIEDADE OBRIGATÓRIA: limiarPara é não-decrescente em V. A rev.1 da
 * spec tinha "20 E 30%" até V<1.000 e 100 fixo a partir de 1.000 — o limiar
 * caía de 300 (V=999) para 100 (V=1.000). Qualquer mudança nas constantes
 * precisa manter o teste de propriedade verde.
 */
const PISO_PEQUENA = 20;          // regra 3 do Vin: "mínimo de 20"
const PERCENTUAL_PEQUENA = 30;    // regra 3: "30% das visualizações únicas" (inteiro — sem float)
const TETO_PEQUENA = 100;         // a partir daqui vale o 1º patamar normal do Vin

// Patamares do Vin (100/200/300/500) por faixa de V. `ateV` é EXCLUSIVO.
// O 1º patamar (100) é também o teto da fórmula "pequena" — a escada é
// contínua por construção: 30% de V cruza 100 em V=334 e fica em 100 até
// 9.999.
const PATAMARES = [
  { ateV: 10000, limiar: 100 },
  { ateV: 50000, limiar: 200 },
  { ateV: 100000, limiar: 300 },
  { ateV: Infinity, limiar: 500 },
];

const GRAVE = 5;                  // regra 4: 5 sinalizações graves em qualquer V

// Antibrigada (spec rev.2): cadastro não exige verificação de e-mail e o
// accountLimiter dá 10 contas/15min por IP — contas recém-criadas não
// contam até "amadurecer". Aplicado NA AVALIAÇÃO (não na escrita).
const IDADE_MINIMA_CONTA_DIAS = 3;
const IDADE_MINIMA_CONTA_GRAVE_DIAS = 7;

const MOTIVOS = [
  'conteudo_inadequado_faixa',
  'discurso_de_odio',
  'spam_ou_enganoso',
  'direitos_autorais',
  'conteudo_proibido',
  'outro',
];
const MOTIVOS_GRAVES = ['direitos_autorais', 'conteudo_proibido'];
const MOTIVOS_COM_DESCRICAO_OBRIGATORIA = ['outro'];
const DESCRICAO_MAX = 500;
const TEXTO_ADMIN_MAX = 1500;     // texto do curador vai dentro de uma MensagemPortal (maxlength 2000) junto do template

// Primeiro V em que 30% alcança o teto: ceil(100 / 0,30) = 334.
const LIMITE_PEQUENA_V = Math.ceil((TETO_PEQUENA * 100) / PERCENTUAL_PEQUENA);

function validarV(V) {
  if (!Number.isInteger(V) || V < 0) {
    throw new TypeError(`V deve ser um inteiro >= 0 (recebido: ${V})`);
  }
}

// ceil(V * 30 / 100) em aritmética inteira — evita ceil(0.3*V) dar N+1 por
// erro de ponto flutuante numa fronteira exata.
function trintaPorCento(V) {
  return Math.floor((V * PERCENTUAL_PEQUENA + 99) / 100);
}

function limiarPara(V) {
  validarV(V);
  const faixa = PATAMARES.find(p => V < p.ateV);
  if (faixa === PATAMARES[0]) {
    return Math.max(PISO_PEQUENA, Math.min(trintaPorCento(V), faixa.limiar));
  }
  return faixa.limiar;
}

function tipoGatilho(V) {
  validarV(V);
  return V < LIMITE_PEQUENA_V ? 'pequena' : 'normal';
}

function ehGrave(motivo) {
  return MOTIVOS_GRAVES.includes(motivo);
}

module.exports = {
  PISO_PEQUENA, PERCENTUAL_PEQUENA, TETO_PEQUENA, LIMITE_PEQUENA_V, PATAMARES, GRAVE,
  IDADE_MINIMA_CONTA_DIAS, IDADE_MINIMA_CONTA_GRAVE_DIAS,
  MOTIVOS, MOTIVOS_GRAVES, MOTIVOS_COM_DESCRICAO_OBRIGATORIA, DESCRICAO_MAX, TEXTO_ADMIN_MAX,
  limiarPara, tipoGatilho, ehGrave,
};
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npx vitest run tests/backend/curadoriaLimiares.test.js` — Expected: PASS (todos).

- [ ] **Step 5: Teste dos models + primeiroAdmin (falha: models não existem)**

`tests/backend/curadoriaModels.test.js`:
```js
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
```

- [ ] **Step 6: Rodar — deve falhar (models ausentes)**

Run: `npx vitest run tests/backend/curadoriaModels.test.js`

- [ ] **Step 7: Implementar `models/Sinalizacao.js`**

```js
const mongoose = require('mongoose');
const { MOTIVOS, DESCRICAO_MAX } = require('../utils/curadoriaLimiares');

/**
 * Sinalização de um leitor sobre uma OBRA (Fase 5 Bloco 3). Regra 5 do Vin:
 * uma conta = uma sinalização por obra (unique abaixo). `valida` é decidido
 * na escrita (consumo real p/ motivo normal; graves sempre válidas);
 * `contaCriadaEm` é snapshot de User.createdAt para a idade mínima ser
 * aplicada NA AVALIAÇÃO sem join. `ipHash` é o mesmo pseudonymize do
 * engagementLogger — só vira contagem agregada (ipsDistintos) na fila do
 * admin, nunca sai de lá. `revisadaEm` fecha o ciclo: sinalização revisada
 * não conta mais (a obra volta a acumular do zero).
 */
const SinalizacaoSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  motivo: { type: String, enum: MOTIVOS, required: true },
  grave: { type: Boolean, required: true },
  descricao: { type: String, maxlength: DESCRICAO_MAX, default: null },
  valida: { type: Boolean, required: true },
  invalidaMotivo: { type: String, enum: ['sem_consumo', 'abuso', null], default: null },
  contaCriadaEm: { type: Date, required: true },
  ipHash: { type: String, default: '' },
  revisadaEm: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

SinalizacaoSchema.index({ userId: 1, seriesId: 1 }, { unique: true });
// Contagens por obra (S, S_grave, semConsumo) e o updateMany de revisadaEm
// ao fechar um caso — sem isto cada avaliação varreria a coleção inteira.
SinalizacaoSchema.index({ seriesId: 1, revisadaEm: 1, valida: 1 });

module.exports = mongoose.model('Sinalizacao', SinalizacaoSchema);
```

- [ ] **Step 8: Implementar `models/CasoCuradoria.js`**

```js
const mongoose = require('mongoose');
const { MOTIVOS } = require('../utils/curadoriaLimiares');

const STATUS = ['aberto', 'aguardando_artista', 'fechado'];
const STATUS_ABERTOS = ['aberto', 'aguardando_artista'];
const DECISOES = ['aprovar', 'reclassificar', 'solicitar_correcao', 'remover'];

/**
 * Caso da Fila de Revisão (Fase 5 Bloco 3). Guarda SÓ agregados — nunca
 * userId de leitor nem descrições (regra 8 do Vin; as descrições ficam em
 * Sinalizacao e só o admin as lê, anonimizadas).
 *
 * "1 caso aberto por obra" é garantido pelo BANCO: índice único parcial em
 * {seriesId} filtrado por emAberto:true. `emAberto` é um booleano derivado
 * (true em aberto/aguardando_artista, false em fechado) porque
 * partialFilterExpression com $in/$ne exige MongoDB >= 6 e a versão da VPS
 * não está confirmada — igualdade booleana funciona em qualquer versão
 * (molde: models/ReadingProgress.js:38-45 usa $exists pela mesma razão).
 */
const CasoCuradoriaSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  emAberto: { type: Boolean, default: true },
  status: { type: String, enum: STATUS, default: 'aberto' },
  prioridade: { type: String, enum: ['normal', 'grave'], default: 'normal' },
  abertoEm: { type: Date, required: true },
  gatilho: {
    tipo: { type: String, enum: ['pequena', 'normal', 'grave'], required: true },
    S: { type: Number, required: true },
    V: { type: Number, required: true },
    limiar: { type: Number, required: true },
  },
  // { motivo: contagem } só das sinalizações válidas pendentes — Mixed
  // porque as chaves são os slugs do vocabulário.
  resumoMotivos: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  mensagemAvisoId: { type: mongoose.Schema.Types.ObjectId, ref: 'MensagemPortal', default: null },
  avisoArtista: { type: String, enum: ['pendente', 'enviado', 'sem_canal', 'falhou'], default: 'pendente' },
  decisao: { type: String, enum: [...DECISOES, null], default: null },
  // Texto do curador que acompanha a decisão (motivo do "remover", pedido
  // do "solicitar correção") — vai ao artista via MensagemPortal.
  motivoDecisao: { type: String, maxlength: 1500, default: null },
  sinalizacoesAbusivas: { type: Boolean, default: false },
  decididoPor: { type: String, default: null },
  decisaoEm: { type: Date, default: null },
  observacao: { type: String, maxlength: 2000, default: null },
}, { timestamps: true });

CasoCuradoriaSchema.index(
  { seriesId: 1 },
  { unique: true, partialFilterExpression: { emAberto: true } },
);
CasoCuradoriaSchema.index({ emAberto: 1, prioridade: 1, abertoEm: 1 });
// removidaPelaCuradoria em GET /admin/aprovacoes: último caso da obra com
// decisao 'remover'.
CasoCuradoriaSchema.index({ seriesId: 1, decisao: 1, decisaoEm: -1 });

CasoCuradoriaSchema.statics.STATUS_ABERTOS = STATUS_ABERTOS;
CasoCuradoriaSchema.statics.DECISOES = DECISOES;

// Sanidade: um caso não pode nascer com resumoMotivos fora do vocabulário.
CasoCuradoriaSchema.pre('validate', function (next) {
  const chaves = Object.keys(this.resumoMotivos || {});
  const invalida = chaves.find(k => !MOTIVOS.includes(k));
  if (invalida) return next(new mongoose.Error.ValidationError(new Error(`resumoMotivos: motivo desconhecido "${invalida}"`)));
  next();
});

module.exports = mongoose.model('CasoCuradoria', CasoCuradoriaSchema);
```

- [ ] **Step 9: Índice em `models/EngagementEvent.js` e `utils/primeiroAdmin.js`; `routes/account.js` usa o helper**

Em `models/EngagementEvent.js`, após a linha 34:
```js
// Fase 5 Bloco 3 (curadoria): consumidores únicos por OBRA (vida toda) e
// "consumo real" do sinalizador ({seriesId, userId}). Só ÍNDICE — nenhum
// documento é tocado (append-only + cadeia de hash intactos). Também serve
// às queries por seriesId de services/recommendationService.js.
EngagementEventSchema.index({ seriesId: 1, userId: 1, type: 1, flagged: 1 });
```

`utils/primeiroAdmin.js`:
```js
const User = require('../models/User');

/**
 * Admin "guarda-chuva": o usuário admin/superadmin de createdAt mais antigo.
 * Critério nascido em routes/account.js (Fase 5 Bloco 1 — recebe canais
 * inativos na exclusão de conta) e reutilizado pela curadoria (Bloco 3) como
 * autor do aviso automático ao artista: MensagemPortal exige autorUserId
 * real e autorTipo do enum — não existe conta "sistema". Devolve null se não
 * houver admin (o chamador decide o que fazer).
 */
async function primeiroAdmin() {
  return User.findOne({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 });
}

module.exports = { primeiroAdmin };
```

Em `routes/account.js`, adicionar o require no topo (junto dos demais requires) `const { primeiroAdmin: buscarPrimeiroAdmin } = require('../utils/primeiroAdmin');` e trocar a linha 275:
```js
      primeiroAdmin = await buscarPrimeiroAdmin();
```
(mantém o nome da variável local e todo o resto do bloco 272-280 inalterado).

- [ ] **Step 10: Rodar os dois testes + suites vizinhas**

Run: `npx vitest run tests/backend/curadoriaLimiares.test.js tests/backend/curadoriaModels.test.js tests/backend/accountPortalLgpd.test.js tests/backend/engagement.test.js tests/backend/royalties.test.js` — Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add utils/curadoriaLimiares.js utils/primeiroAdmin.js models/Sinalizacao.js models/CasoCuradoria.js models/EngagementEvent.js routes/account.js tests/backend/curadoriaLimiares.test.js tests/backend/curadoriaModels.test.js
git commit -m "feat(curadoria): fundacoes do Bloco 3 - limiares, models Sinalizacao/CasoCuradoria, indice e primeiroAdmin" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `services/curadoriaService.js` — contagens, avaliação, aviso, fechamento, maturação

**Files:**
- Create: `services/curadoriaService.js`
- Modify: `server.js:33-35` (+ `iniciarReavaliacaoPeriodica()` ao lado de `iniciarVarreduraPeriodica()`)
- Test: `tests/backend/curadoriaService.test.js`

**Interfaces:**
- Consumes: Task 1 (`utils/curadoriaLimiares`, `models/Sinalizacao`, `models/CasoCuradoria`, `utils/primeiroAdmin`).
- Produces (usado pelas Tasks 3, 4, 5):
  - `contarConsumidoresUnicos(seriesId): Promise<number>`
  - `contarSinalizacoes(seriesId, { agora }): Promise<{ S, S_grave, semConsumo, contasRecentes, ipsDistintos, resumoMotivos }>` — escopo `revisadaEm:null`
  - `avaliarObra(seriesId, { agora }): Promise<CasoDoc|null>` — LANÇA erros (para os testes); `dispararAvaliacao(seriesId): Promise<CasoDoc|null>` — absorve em `logger.error`, registra a promise; `flushForTests(): Promise<void>`
  - `reavaliarPendentes({ agora }): Promise<number>` (casos abertos nesta rodada); `iniciarReavaliacaoPeriodica(): void`; `pararReavaliacaoPeriodica(): void`
  - `enviarAvisoArtista(series, texto, { autorUserId? }): Promise<{ status: 'enviado'|'sem_canal'|'falhou', mensagemId }>` — LANÇA se o `create` falhar (o chamador decide)
  - `fecharCaso(caso, { decisao, adminId, observacao, motivoDecisao, abuso, agora }): Promise<CasoDoc>`
  - `TEXTOS = { abertura(titulo, rotulos[]), aprovar(titulo), reclassificar(titulo, rotuloRating), solicitarCorrecao(titulo, texto), remover(titulo, motivo) }`, `ROTULO_MOTIVO`, `ROTULO_RATING`

- [ ] **Step 1: Testes do serviço (falham: módulo não existe)**

`tests/backend/curadoriaService.test.js`:
```js
/**
 * Fase 5 Bloco 3, Task 2 — services/curadoriaService.js. Eventos de
 * engajamento SEMPRE via engagementLogger.logEvent (cadeia de hash). Datas
 * injetadas (`agora`) para idade mínima e maturação.
 */
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Sinalizacao, CasoCuradoria, MensagemPortal, AdminLog, SeriesVote;
let engagementLogger, svc, L;

const AGORA = new Date('2026-09-10T12:00:00.000Z');
const dias = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode');
  Channel = require('../../models/Channel'); User = require('../../models/User');
  Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  MensagemPortal = require('../../models/MensagemPortal'); AdminLog = require('../../models/AdminLog');
  SeriesVote = require('../../models/SeriesVote');
  engagementLogger = require('../../services/engagementLogger');
  svc = require('../../services/curadoriaService');
  L = require('../../utils/curadoriaLimiares');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

let n = 0;
async function criarObra({ comCanal = true, title = 'Obra Teste 7' } = {}) {
  n += 1;
  let canal = null;
  if (comCanal) {
    const dono = await User.create({ email: `dono-${n}-${Date.now()}@lorflux.test`, passwordHash: 'x', nome: `Dono ${n}`, role: 'user' });
    canal = await Channel.create({ ownerId: dono._id, name: `Canal ${n} ${Date.now()}` });
  }
  const serie = await Series.create({ title, genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', ...(canal ? { channelId: canal._id } : {}) });
  const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, ep, canal };
}

/** Grava N sinalizações válidas pendentes de contas com `idadeDias`. */
async function sinalizar(serieId, { quantas, motivo = 'spam_ou_enganoso', idadeDias = 30, valida = true, invalidaMotivo = null, ip = null }) {
  const docs = [];
  for (let i = 0; i < quantas; i++) {
    docs.push({ seriesId: serieId, userId: oid(), motivo, grave: L.ehGrave(motivo), valida, invalidaMotivo, contaCriadaEm: dias(idadeDias), ipHash: ip ? `${ip}` : `ip-${i}-${Math.random()}` });
  }
  return Sinalizacao.insertMany(docs);
}

async function views(serie, ep, { quantas, prefixo }) {
  for (let i = 0; i < quantas; i++) {
    await engagementLogger.logEvent({ type: 'view', seriesId: serie._id, episodeId: ep._id, ip: `${prefixo}.${Math.floor(i / 250)}.${i % 250}`, ua: 'x' });
  }
  await engagementLogger.flushForTests();
}

describe('contarConsumidoresUnicos', () => {
  it('logado em 2 IPs = 1; anônimo em 2 IPs = 2; flagged = 0; evento antigo (13 meses) CONTA', async () => {
    const { serie, ep } = await criarObra();
    const uid = oid();
    await engagementLogger.logEvent({ type: 'view', seriesId: serie._id, episodeId: ep._id, userId: uid, ip: '40.0.0.1', ua: 'x' });
    await engagementLogger.logEvent({ type: 'read', seriesId: serie._id, episodeId: ep._id, userId: uid, ip: '40.0.0.2', ua: 'x' });
    await engagementLogger.logEvent({ type: 'view', seriesId: serie._id, episodeId: ep._id, ip: '40.0.0.3', ua: 'x' });
    await engagementLogger.logEvent({ type: 'view', seriesId: serie._id, episodeId: ep._id, ip: '40.0.0.4', ua: 'x' });
    // duplicado do mesmo IP na janela de 6h -> flagged:'dedupe' -> não conta
    await engagementLogger.logEvent({ type: 'view', seriesId: serie._id, episodeId: ep._id, ip: '40.0.0.4', ua: 'x' });
    await engagementLogger.flushForTests();
    expect(await svc.contarConsumidoresUnicos(serie._id)).toBe(3);

    // janela = vida toda: envelhecer um evento NÃO o tira da conta (só em
    // teste — quebra a cadeia de hash, irrelevante aqui)
    const EngagementEvent = require('../../models/EngagementEvent');
    await EngagementEvent.updateOne({ seriesId: serie._id, ipHash: engagementLogger.pseudonymize('40.0.0.3') }, { $set: { createdAt: new Date('2025-08-01T00:00:00Z') } });
    expect(await svc.contarConsumidoresUnicos(serie._id)).toBe(3);
  });

  it('obra sem eventos -> 0', async () => {
    expect(await svc.contarConsumidoresUnicos(oid())).toBe(0);
  });
});

describe('contarSinalizacoes (escopo do ciclo + idade mínima)', () => {
  it('S só conta válidas, pendentes, de contas com >= 3 dias; S_grave exige 7; semConsumo/contasRecentes/ipsDistintos', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 7, idadeDias: 30 });                    // contam
    await sinalizar(serie._id, { quantas: 3, idadeDias: 1 });                     // recentes
    await sinalizar(serie._id, { quantas: 2, idadeDias: 30, valida: false, invalidaMotivo: 'sem_consumo' });
    await sinalizar(serie._id, { quantas: 2, motivo: 'direitos_autorais', idadeDias: 5 });  // contam em S, NÃO em S_grave
    await sinalizar(serie._id, { quantas: 1, motivo: 'conteudo_proibido', idadeDias: 9 });  // conta em S e S_grave
    await Sinalizacao.create({ seriesId: serie._id, userId: oid(), motivo: 'outro', descricao: 'ciclo anterior', grave: false, valida: true, contaCriadaEm: dias(60), revisadaEm: dias(2) });

    const c = await svc.contarSinalizacoes(serie._id, { agora: AGORA });
    expect(c.S).toBe(10);          // 7 + 2 graves(5d) + 1 grave(9d)
    expect(c.S_grave).toBe(1);
    expect(c.semConsumo).toBe(2);
    expect(c.contasRecentes).toBe(3);
    expect(c.ipsDistintos).toBe(13);  // válidas pendentes: 7+3+2+1, cada uma com ip próprio
    expect(c.resumoMotivos).toEqual({ spam_ou_enganoso: 10, direitos_autorais: 2, conteudo_proibido: 1 });
  });
});

describe('avaliarObra — gatilhos', () => {
  it('obra pequena V=47: 19 válidas não abrem; a 20ª abre caso tipo pequena, limiar 20, aviso ao artista SEM dígitos fora do título, AdminLog sistema', async () => {
    const { serie, ep, canal } = await criarObra({ title: 'Lorflux 2' });
    await views(serie, ep, { quantas: 47, prefixo: '41.0' });
    await sinalizar(serie._id, { quantas: 19 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(0);

    await sinalizar(serie._id, { quantas: 1, motivo: 'outro' });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso).toBeTruthy();
    expect(caso.gatilho).toMatchObject({ tipo: 'pequena', S: 20, V: 47, limiar: 20 });
    expect(caso.prioridade).toBe('normal');
    expect(caso.avisoArtista).toBe('enviado');

    const msg = await MensagemPortal.findById(caso.mensagemAvisoId).lean();
    expect(msg).toMatchObject({ canalId: canal._id, ownerUserId: canal.ownerId, autorTipo: 'editor', refTipo: 'series', refId: serie._id });
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: 1 }).lean();
    expect(String(msg.autorUserId)).toBe(String(admins[0]._id));
    expect(msg.texto).toContain('Lorflux 2');
    expect(/\d/.test(msg.texto.split(serie.title).join(''))).toBe(false);
    expect(msg.texto).toContain('spam ou conteúdo enganoso');

    const log = await AdminLog.findOne({ action: 'CURADORIA_CASO_ABERTO', targetId: String(serie._id) }).lean();
    expect(log.adminId).toBe('sistema');
    expect(log.details).toMatchObject({ tipo: 'pequena', S: 20, V: 47, limiar: 20, avisoArtista: 'enviado' });
    expect(JSON.stringify(log.details)).not.toMatch(/userId|descricao/);
  });

  it('V=90: 26 não abre, 27 abre (30% em inteiros)', async () => {
    const { serie, ep } = await criarObra();
    await views(serie, ep, { quantas: 90, prefixo: '42.0' });
    await sinalizar(serie._id, { quantas: 26 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
    await sinalizar(serie._id, { quantas: 1 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.gatilho).toMatchObject({ tipo: 'pequena', S: 27, limiar: 27 });
  });

  it('curto-circuito: com S<20 e S_grave<5 o aggregate de V NÃO roda', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 19 });
    const EngagementEvent = require('../../models/EngagementEvent');
    const spy = vi.spyOn(EngagementEvent, 'aggregate');
    await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('grave: 4 graves maduras (>=7d) não abrem; 5 abrem com prioridade grave em QUALQUER V (V=0)', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 4, motivo: 'direitos_autorais', idadeDias: 8 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
    await sinalizar(serie._id, { quantas: 1, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.prioridade).toBe('grave');
    expect(caso.gatilho).toMatchObject({ tipo: 'grave', S: 5, V: 0, limiar: 5 });
  });

  it('5 graves de contas com 2 dias NÃO abrem (idade mínima 7d) — e abrem em D+7 via reavaliarPendentes', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 2 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
    const abertos = await svc.reavaliarPendentes({ agora: new Date(AGORA.getTime() + 6 * 24 * 60 * 60 * 1000) });
    expect(abertos).toBeGreaterThanOrEqual(1);
    const caso = await CasoCuradoria.findOne({ seriesId: serie._id, emAberto: true }).lean();
    expect(caso.prioridade).toBe('grave');
    // segunda rodada: obra com caso aberto NÃO é reavaliada de novo (1 caso, 1 aviso)
    await svc.reavaliarPendentes({ agora: new Date(AGORA.getTime() + 7 * 24 * 60 * 60 * 1000) });
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(1);
  });

  it('maturação de obra pequena: 20 válidas de contas D-1 -> 0 casos; reavaliarPendentes em D+3 -> 1 caso', async () => {
    const { serie, ep } = await criarObra();
    await views(serie, ep, { quantas: 30, prefixo: '43.0' });
    await sinalizar(serie._id, { quantas: 20, idadeDias: 1 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
    await svc.reavaliarPendentes({ agora: new Date(AGORA.getTime() + 3 * 24 * 60 * 60 * 1000) });
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id, emAberto: true })).toBe(1);
  });

  it('escalonamento: caso normal aberto que atinge 5 graves vira grave (AdminLog ESCALONADO), sem 2º caso nem 2º aviso; resumoMotivos atualizado', async () => {
    const { serie, ep } = await criarObra();
    await views(serie, ep, { quantas: 20, prefixo: '44.0' });
    await sinalizar(serie._id, { quantas: 20 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.prioridade).toBe('normal');
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 10 });
    const mesmo = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(String(mesmo._id)).toBe(String(caso._id));
    expect(mesmo.prioridade).toBe('grave');
    expect(mesmo.resumoMotivos.direitos_autorais).toBe(5);
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(1);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ESCALONADO', targetId: String(serie._id) })).toBe(1);
  });

  it('dislikes NUNCA contam: 1.000 dislikes e 0 sinalizações -> 0 casos', async () => {
    const { serie } = await criarObra();
    await SeriesVote.insertMany(Array.from({ length: 1000 }, () => ({ userId: oid(), seriesId: serie._id, type: 'dislike' })));
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
  });

  it('sai cedo para obra inexistente ou não publicada', async () => {
    expect(await svc.avaliarObra(oid(), { agora: AGORA })).toBeNull();
    const { serie } = await criarObra();
    await Series.updateOne({ _id: serie._id }, { $set: { isPublished: false } });
    await sinalizar(serie._id, { quantas: 25 });
    expect(await svc.avaliarObra(serie._id, { agora: AGORA })).toBeNull();
  });

  it('obra SEM canal: caso abre com avisoArtista sem_canal, sem MensagemPortal, sem 500', async () => {
    const { serie } = await criarObra({ comCanal: false });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.avisoArtista).toBe('sem_canal');
    expect(caso.mensagemAvisoId).toBeNull();
  });

  it('falha no aviso (MensagemPortal.create lança) -> caso aberto com avisoArtista falhou', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const spy = vi.spyOn(MensagemPortal, 'create').mockRejectedValueOnce(new Error('boom'));
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    spy.mockRestore();
    expect(caso.avisoArtista).toBe('falhou');
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ABERTO', targetId: String(serie._id) })).toBe(1);
  });

  it('concorrência real: 2 avaliarObra em Promise.all -> 1 caso, 1 aviso, 1 AdminLog', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 8 });
    const [a, b] = await Promise.all([svc.avaliarObra(serie._id, { agora: AGORA }), svc.avaliarObra(serie._id, { agora: AGORA })]);
    expect(String(a._id)).toBe(String(b._id));
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(1);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ABERTO', targetId: String(serie._id) })).toBe(1);
  });

  it('dispararAvaliacao absorve o erro (nunca rejeita) e flushForTests espera', async () => {
    const spy = vi.spyOn(Series, 'findById').mockImplementationOnce(() => { throw new Error('db off'); });
    await expect(svc.dispararAvaliacao(oid())).resolves.toBeNull();
    await svc.flushForTests();
    spy.mockRestore();
  });
});

describe('fecharCaso + TEXTOS', () => {
  it('aprovar: revisadaEm em TODAS as pendentes (válidas e inválidas), emAberto false, S zera; abuso só flipa valida:true', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    await sinalizar(serie._id, { quantas: 2, valida: false, invalidaMotivo: 'sem_consumo' });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin'), abuso: true, agora: AGORA });
    const fechado = await CasoCuradoria.findById(caso._id).lean();
    expect(fechado).toMatchObject({ emAberto: false, status: 'fechado', decisao: 'aprovar', sinalizacoesAbusivas: true, decididoPor: auth.getId('admin') });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: null })).toBe(0);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'abuso' })).toBe(5);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'sem_consumo' })).toBe(2);
    const c = await svc.contarSinalizacoes(serie._id, { agora: AGORA });
    expect(c).toMatchObject({ S: 0, S_grave: 0, semConsumo: 0, contasRecentes: 0, ipsDistintos: 0 });
    // novo ciclo: outra conta sinaliza e o caso reabre do zero
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const novo = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(String(novo._id)).not.toBe(String(caso._id));
  });

  it('os 5 templates: sem dígitos fora do título; reclassificar usa Kids/Teen/Young; solicitar correção diz que o editor aplica', () => {
    const t = 'Saga 3000';
    const limpo = (s) => s.split(t).join('');
    const textos = [
      svc.TEXTOS.abertura(t, ['direitos autorais', 'outro']),
      svc.TEXTOS.aprovar(t),
      svc.TEXTOS.reclassificar(t, svc.ROTULO_RATING.teen),
      svc.TEXTOS.solicitarCorrecao(t, 'Ajuste a capa.'),
      svc.TEXTOS.remover(t, 'Cópia de obra de terceiro.'),
    ];
    for (const x of textos) { expect(x).toContain(t); expect(/\d/.test(limpo(x))).toBe(false); }
    expect(textos[2]).toContain('Teen');
    expect(textos[3]).toMatch(/editor/i);
    expect(textos[4]).toMatch(/retirada do ar/);
    expect(svc.ROTULO_RATING).toEqual({ kids: 'Kids', teen: 'Teen', young: 'Young' });
    expect(Object.keys(svc.ROTULO_MOTIVO)).toEqual(L.MOTIVOS);
  });

  it('enviarAvisoArtista: canal inexistente -> sem_canal; primeiroAdmin null -> falhou (sem lançar)', async () => {
    const { serie } = await criarObra();
    await Channel.deleteOne({ _id: serie.channelId });
    expect(await svc.enviarAvisoArtista(serie.toObject(), 'x')).toEqual({ status: 'sem_canal', mensagemId: null });

    const { serie: s2 } = await criarObra();
    const spy = vi.spyOn(require('../../utils/primeiroAdmin'), 'primeiroAdmin').mockResolvedValueOnce(null);
    expect(await svc.enviarAvisoArtista(s2.toObject(), 'x')).toEqual({ status: 'falhou', mensagemId: null });
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (módulo ausente)**

Run: `npx vitest run tests/backend/curadoriaService.test.js`

- [ ] **Step 3: Implementar `services/curadoriaService.js`**

```js
/**
 * Fase 5 Bloco 3 — motor da curadoria semiautomática (spec rev.3).
 *
 * O que este serviço NUNCA faz: remover obra (regra 1 do Vin — só o curador,
 * pelas rotas de routes/adminCuradoria.js), contar dislike/popularidade
 * (regra 8), expor userId ou descrição de leitor em CasoCuradoria/AdminLog
 * (regra 8 — só agregados saem daqui).
 *
 * Volume V = consumidores únicos NÃO-flagged da obra, vida toda. MESMA FORMA
 * da agregação de services/royaltyReportService.js:57-69 ($match type
 * view/read + flagged:false, $addToSet $ifNull [userId, ipHash]) — sem o
 * filtro de createdAt de lá (:62), que é por período de royalty. Função
 * PRÓPRIA de propósito: royaltyReportService é código de dinheiro, pinado
 * por 2 suítes, e agrega multi-série por período; extrair dele viraria N+1
 * ou mudaria o relatório.
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const L = require('../utils/curadoriaLimiares');

const DIA_MS = 24 * 60 * 60 * 1000;
const REAVALIACAO_INTERVALO_MS = 24 * 60 * 60 * 1000;

const ROTULO_MOTIVO = {
  conteudo_inadequado_faixa: 'conteúdo que não condiz com a classificação etária',
  discurso_de_odio: 'discurso de ódio',
  spam_ou_enganoso: 'spam ou conteúdo enganoso',
  direitos_autorais: 'direitos autorais',
  conteudo_proibido: 'conteúdo proibido',
  outro: 'outro',
};
// Mesmos rótulos de components/Admin/AprovacoesPanel.tsx (RATING_LABEL) — o
// artista vê no aviso o que vê no portal; nunca "12+" ou outro número.
const ROTULO_RATING = { kids: 'Kids', teen: 'Teen', young: 'Young' };

// Templates ao artista (regra 7). SEM números em nenhum deles — o único
// dígito possível é o do próprio título da obra (teste pina isso).
const TEXTOS = {
  abertura: (titulo, rotulos) => `Sua obra "${titulo}" recebeu sinalizações de leitores nas categorias: ${rotulos.join(', ')}. O editor vai revisar. Você pode responder por aqui.`,
  aprovar: (titulo) => `A revisão da sua obra "${titulo}" foi concluída: a obra foi mantida sem alterações.`,
  reclassificar: (titulo, rotuloRating) => `A revisão da sua obra "${titulo}" foi concluída: a classificação etária passou a ser ${rotuloRating}.`,
  solicitarCorrecao: (titulo, texto) => `Sobre a sua obra "${titulo}", o editor pede um ajuste: ${texto} Responda por aqui descrevendo o ajuste; alterações em obra publicada são feitas pelo editor.`,
  remover: (titulo, motivo) => `A revisão da sua obra "${titulo}" foi concluída: a obra foi retirada do ar. Motivo: ${motivo} Você pode ajustar a obra no seu estúdio e enviá-la novamente para aprovação, ou responder por aqui.`,
};

async function contarConsumidoresUnicos(seriesId) {
  const EngagementEvent = require('../models/EngagementEvent');
  const [r] = await EngagementEvent.aggregate([
    { $match: { seriesId: new mongoose.Types.ObjectId(String(seriesId)), type: { $in: ['view', 'read'] }, flagged: false } },
    { $group: { _id: null, consumers: { $addToSet: { $ifNull: ['$userId', '$ipHash'] } } } },
    { $project: { _id: 0, total: { $size: '$consumers' } } },
  ]);
  return r ? r.total : 0;
}

/**
 * Contagens do CICLO atual (revisadaEm:null). Idade mínima aplicada aqui,
 * não na escrita: a sinalização de uma conta nova fica gravada e passa a
 * contar quando a conta amadurece (reavaliarPendentes cuida do gatilho).
 */
async function contarSinalizacoes(seriesId, { agora = new Date() } = {}) {
  const Sinalizacao = require('../models/Sinalizacao');
  const corteNormal = new Date(agora.getTime() - L.IDADE_MINIMA_CONTA_DIAS * DIA_MS);
  const corteGrave = new Date(agora.getTime() - L.IDADE_MINIMA_CONTA_GRAVE_DIAS * DIA_MS);
  const pendentes = await Sinalizacao.find({ seriesId, revisadaEm: null })
    .select('motivo grave valida invalidaMotivo contaCriadaEm ipHash').lean();

  let S = 0, S_grave = 0, semConsumo = 0, contasRecentes = 0;
  const ips = new Set();
  const resumoMotivos = {};
  for (const s of pendentes) {
    if (!s.valida) {
      if (s.invalidaMotivo === 'sem_consumo') semConsumo += 1;
      continue;
    }
    resumoMotivos[s.motivo] = (resumoMotivos[s.motivo] || 0) + 1;
    if (s.ipHash) ips.add(s.ipHash);
    if (s.contaCriadaEm <= corteNormal) S += 1; else contasRecentes += 1;
    if (s.grave && s.contaCriadaEm <= corteGrave) S_grave += 1;
  }
  return { S, S_grave, semConsumo, contasRecentes, ipsDistintos: ips.size, resumoMotivos };
}

/**
 * Aviso privado ao artista. autorTipo 'editor' + autorUserId = primeiro
 * admin: MensagemPortal exige autor real e o render do B1 trata qualquer
 * autorTipo != 'editor' como fala do ilustrador. Devolve o status em vez de
 * lançar nos casos previstos (sem canal, sem admin); erro do create SOBE —
 * quem chama decide (avaliarObra absorve; as rotas admin também).
 */
async function enviarAvisoArtista(series, texto, { autorUserId = null } = {}) {
  const Channel = require('../models/Channel');
  const MensagemPortal = require('../models/MensagemPortal');
  if (!series.channelId) return { status: 'sem_canal', mensagemId: null };
  const canal = await Channel.findById(series.channelId).select('ownerId').lean();
  if (!canal) return { status: 'sem_canal', mensagemId: null };

  let autor = autorUserId;
  if (!autor) {
    const admin = await require('../utils/primeiroAdmin').primeiroAdmin();
    if (!admin) {
      logger.error('[Curadoria] nenhum admin disponível para autorar o aviso ao artista');
      return { status: 'falhou', mensagemId: null };
    }
    autor = admin._id;
  }
  const msg = await MensagemPortal.create({
    canalId: series.channelId, ownerUserId: canal.ownerId,
    autorTipo: 'editor', autorUserId: autor,
    refTipo: 'series', refId: series._id, texto,
  });
  return { status: 'enviado', mensagemId: msg._id };
}

async function logSistema(action, seriesId, details) {
  const AdminLog = require('../models/AdminLog');
  try {
    await AdminLog.create({ adminId: 'sistema', action, targetId: String(seriesId), details });
  } catch (err) {
    logger.error(`[Curadoria] AdminLog ${action} falhou`, err && err.message);
  }
}

/**
 * Avalia UMA obra. Lança para o chamador (testes); dispararAvaliacao absorve.
 * Ordem (spec): contagens baratas → curto-circuito → V só se necessário →
 * caso (índice único parcial decide a corrida) → aviso em try/catch próprio
 * → 2º write no caso → AdminLog. Retorna o caso (novo ou já aberto) ou null.
 */
async function avaliarObra(seriesId, { agora = new Date() } = {}) {
  const Series = require('../models/Series');
  const CasoCuradoria = require('../models/CasoCuradoria');

  const series = await Series.findById(seriesId).select('title channelId isPublished').lean();
  if (!series || !series.isPublished) return null;

  const contagem = await contarSinalizacoes(seriesId, { agora });
  const { S, S_grave, resumoMotivos } = contagem;
  // Nenhum gatilho é possível abaixo do piso: V (aggregate na coleção mais
  // volumosa do app) não é calculado.
  if (S < L.PISO_PEQUENA && S_grave < L.GRAVE) return null;

  const atingiuGrave = S_grave >= L.GRAVE;
  const casoAberto = await CasoCuradoria.findOne({ seriesId, emAberto: true });
  if (casoAberto) {
    casoAberto.resumoMotivos = resumoMotivos;
    casoAberto.gatilho.S = S;
    const escalona = atingiuGrave && casoAberto.prioridade !== 'grave';
    if (escalona) casoAberto.prioridade = 'grave';
    await casoAberto.save();
    if (escalona) await logSistema('CURADORIA_CASO_ESCALONADO', seriesId, { casoId: String(casoAberto._id), S, S_grave });
    return casoAberto;
  }

  const V = await contarConsumidoresUnicos(seriesId);
  let tipo, limiar;
  if (atingiuGrave) {
    tipo = 'grave'; limiar = L.GRAVE;
  } else {
    limiar = L.limiarPara(V);
    if (S < limiar) return null;
    tipo = L.tipoGatilho(V);
  }

  let caso;
  try {
    caso = await CasoCuradoria.create({
      seriesId, emAberto: true, status: 'aberto',
      prioridade: atingiuGrave ? 'grave' : 'normal',
      abertoEm: agora, gatilho: { tipo, S, V, limiar }, resumoMotivos,
    });
  } catch (err) {
    // Outro fluxo abriu o caso entre o findOne e o create: ele avisa e loga.
    if (err && err.code === 11000) {
      return CasoCuradoria.findOne({ seriesId, emAberto: true });
    }
    throw err;
  }

  let aviso = { status: 'falhou', mensagemId: null };
  try {
    const rotulos = Object.keys(resumoMotivos).map(m => ROTULO_MOTIVO[m] || m);
    aviso = await enviarAvisoArtista(series, TEXTOS.abertura(series.title, rotulos));
  } catch (err) {
    logger.error('[Curadoria] aviso ao artista falhou', err && err.message);
  }
  caso.avisoArtista = aviso.status;
  caso.mensagemAvisoId = aviso.mensagemId;
  await caso.save();

  await logSistema('CURADORIA_CASO_ABERTO', seriesId, { casoId: String(caso._id), tipo, S, S_grave, V, limiar, avisoArtista: aviso.status });
  return caso;
}

// Fire-and-forget (padrão dispararRecalculo de recommendationService.js:855):
// nunca rejeita; a promise fica registrada para flushForTests().
const pendentes = new Set();
function dispararAvaliacao(seriesId) {
  const p = avaliarObra(seriesId)
    .catch((err) => { logger.error(`[Curadoria] avaliação falhou (${seriesId})`, err && err.message); return null; })
    .finally(() => pendentes.delete(p));
  pendentes.add(p);
  return p;
}
function flushForTests() {
  return Promise.all([...pendentes]).then(() => undefined);
}

/**
 * Gatilho de maturação (spec rev.3): sinalizações de contas que completaram a
 * idade mínima só passam a contar quando ALGUÉM avalia a obra — e a única
 * outra avaliação é uma sinalização nova. Roda ao abrir a fila do admin e
 * uma vez por dia. Só obras com válidas pendentes e SEM caso aberto.
 */
async function reavaliarPendentes({ agora = new Date() } = {}) {
  const Sinalizacao = require('../models/Sinalizacao');
  const CasoCuradoria = require('../models/CasoCuradoria');
  const candidatas = await Sinalizacao.distinct('seriesId', { valida: true, revisadaEm: null });
  if (!candidatas.length) return 0;
  const comCaso = new Set((await CasoCuradoria.distinct('seriesId', { seriesId: { $in: candidatas }, emAberto: true })).map(String));
  let abertos = 0;
  for (const seriesId of candidatas) {
    if (comCaso.has(String(seriesId))) continue;
    try {
      const caso = await avaliarObra(seriesId, { agora });
      if (caso) abertos += 1;
    } catch (err) {
      logger.error(`[Curadoria] reavaliação falhou (${seriesId})`, err && err.message);
    }
  }
  return abertos;
}

// Mesmas guardas de iniciarVarreduraPeriodica (recommendationService.js:914-921):
// no-op em test, idempotente, unref.
let timerReavaliacao = null;
function iniciarReavaliacaoPeriodica() {
  if (process.env.NODE_ENV === 'test') return;
  if (timerReavaliacao) return;
  timerReavaliacao = setInterval(() => {
    reavaliarPendentes().catch((err) => logger.error('[Curadoria] reavaliação periódica falhou', err && err.message));
  }, REAVALIACAO_INTERVALO_MS);
  if (typeof timerReavaliacao.unref === 'function') timerReavaliacao.unref();
}
function pararReavaliacaoPeriodica() {
  if (timerReavaliacao) { clearInterval(timerReavaliacao); timerReavaliacao = null; }
}

/**
 * Fecha o ciclo: TODAS as pendentes da obra ganham revisadaEm (S zera);
 * `abuso` marca só as que eram válidas (as 'sem_consumo' mantêm o motivo).
 * `motivoDecisao` é o texto que VAI ao artista; `observacao` é interna.
 */
async function fecharCaso(caso, { decisao, adminId, observacao = null, motivoDecisao = null, abuso = false, agora = new Date() }) {
  const Sinalizacao = require('../models/Sinalizacao');
  if (abuso) {
    await Sinalizacao.updateMany({ seriesId: caso.seriesId, revisadaEm: null, valida: true }, { $set: { valida: false, invalidaMotivo: 'abuso' } });
  }
  await Sinalizacao.updateMany({ seriesId: caso.seriesId, revisadaEm: null }, { $set: { revisadaEm: agora } });
  caso.emAberto = false;
  caso.status = 'fechado';
  caso.decisao = decisao;
  caso.decididoPor = String(adminId);
  caso.decisaoEm = agora;
  caso.observacao = observacao;
  if (motivoDecisao !== null) caso.motivoDecisao = motivoDecisao;
  caso.sinalizacoesAbusivas = !!abuso;
  await caso.save();
  return caso;
}

module.exports = {
  contarConsumidoresUnicos, contarSinalizacoes, avaliarObra, dispararAvaliacao, flushForTests,
  reavaliarPendentes, iniciarReavaliacaoPeriodica, pararReavaliacaoPeriodica,
  enviarAvisoArtista, fecharCaso, TEXTOS, ROTULO_MOTIVO, ROTULO_RATING,
};
```

Em `server.js`, logo após o bloco das linhas 33-35 (`iniciarVarreduraPeriodica`), dentro do mesmo `.then`:
```js
    // Fase 5 Bloco 3: reavaliação diária das sinalizações pendentes (contas
    // que completaram a idade mínima) — mesmas guardas da varredura acima.
    require('./services/curadoriaService').iniciarReavaliacaoPeriodica();
```

- [ ] **Step 4: Rodar — deve passar**

Run: `npx vitest run tests/backend/curadoriaService.test.js` — Expected: PASS. Se o teste de `ipsDistintos` divergir, confira que `sinalizar()` gera ip único por doc (o `Math.random()` no helper) — a asserção 13 = 7+3+2+1 válidas pendentes.

- [ ] **Step 5: Suite completa + commit**

Run: `npx vitest run tests/backend` — Expected: verde (critério de RAM do Global Constraints).
```bash
git add services/curadoriaService.js server.js tests/backend/curadoriaService.test.js
git commit -m "feat(curadoria): servico de avaliacao - contagens, gatilhos, aviso ao artista, maturacao e fechamento" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rotas do leitor — `POST /content/series/:id/sinalizar`, `GET /content/series/:id/sinalizacao`, limiter

**Files:**
- Create: `middlewares/sinalizacaoLimiter.js`
- Create: `routes/sinalizacao.js`
- Modify: `server.js:262` (montar o router em `/api/content`, logo após `routes/content`)
- Test: `tests/backend/curadoriaSinalizar.test.js`

**Interfaces:**
- Consumes: Task 1 (`Sinalizacao`, `curadoriaLimiares`), Task 2 (`dispararAvaliacao`, `flushForTests`), `utils/parentalFilter.serieVisivelPara`, `utils/routeErrors.responderCastError`, `services/engagementLogger.pseudonymize`.
- Produces: `POST /api/content/series/:id/sinalizar` body `{ motivo, descricao? }` → 201 `{ jaSinalizada:false }` | 200 `{ jaSinalizada:true }` | 400 `{ error, code?:'propria_obra' }` | 401 | 404; `GET /api/content/series/:id/sinalizacao` → `{ jaSinalizada: boolean, motivo: string|null }` | 401 | 404. (Task 6 consome.)

- [ ] **Step 1: Testes da rota (falham: 404 da rota inexistente)**

`tests/backend/curadoriaSinalizar.test.js`:
```js
/**
 * Fase 5 Bloco 3, Task 3 — rotas do leitor. Composição de visibilidade igual
 * à de GET /content/series/:id (content.js:173-186) + isPublished obrigatório
 * para TODOS; dono -> 400 propria_obra; validade decidida na escrita.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Sinalizacao, CasoCuradoria, engagementLogger, svc;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode');
  Channel = require('../../models/Channel'); User = require('../../models/User');
  Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  engagementLogger = require('../../services/engagementLogger');
  svc = require('../../services/curadoriaService');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

const USER = () => `Bearer ${auth.getToken('user')}`;
const PREMIUM = () => `Bearer ${auth.getToken('premium')}`;

let n = 0;
async function criarLeitor({ createdAt } = {}) {
  n += 1;
  const email = `leitor-${n}-${Date.now()}@lorflux.test`;
  const senha = 'Senha@123';
  const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: `Leitor ${n}`, role: 'user' });
  if (createdAt) await User.collection.updateOne({ _id: user._id }, { $set: { createdAt } });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { id: String(user._id), token: `Bearer ${login.body.accessToken}` };
}

async function criarObra(overrides = {}) {
  n += 1;
  const dono = await User.create({ email: `dono-${n}-${Date.now()}@lorflux.test`, passwordHash: 'x', nome: 'Dono', role: 'user' });
  const canal = await Channel.create({ ownerId: dono._id, name: `Canal ${n} ${Date.now()}` });
  const serie = await Series.create({ title: 'Obra Sinalizavel 9', genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', tags: [], channelId: canal._id, ...overrides });
  const ep = await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, ep, canal, dono };
}

/** Consumo real: abre o episódio logado (gera EngagementEvent com userId). */
async function consumir(token, ep) {
  await request(app).get(`/api/content/episodes/${ep._id}`).set('Authorization', token).set('X-Forwarded-For', `50.0.${n}.${Math.floor(Math.random() * 250)}`);
  await engagementLogger.flushForTests();
}

describe('POST /api/content/series/:id/sinalizar', () => {
  it('guest -> 401 e nada gravado', async () => {
    const { serie } = await criarObra();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(401);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('com consumo real -> 201 valida; 2ª do mesmo usuário -> 200 jaSinalizada sem write; motivo não muda', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await consumir(leitor.token, ep);
    const r1 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r1.status).toBe(201);
    expect(r1.body).toEqual({ jaSinalizada: false });
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc).toMatchObject({ valida: true, invalidaMotivo: null, grave: false, motivo: 'spam_ou_enganoso' });
    expect(doc.contaCriadaEm).toBeInstanceOf(Date);
    expect(doc.ipHash).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'outro', descricao: 'mudei de ideia' });
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ jaSinalizada: true });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, userId: leitor.id })).toBe(1);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean()).motivo).toBe('spam_ou_enganoso');
    await svc.flushForTests();
  });

  it('sem consumo (motivo normal) -> 201 igual, mas gravada valida:false sem_consumo; só ReadingProgress NÃO é consumo', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    await request(app).put('/api/me/progress').set('Authorization', leitor.token).send({ seriesId: String(serie._id), episodeId: String(ep._id), contentType: 'hiqua', percent: 80, position: 3 });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'discurso_de_odio' });
    expect(r.status).toBe(201);
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc).toMatchObject({ valida: false, invalidaMotivo: 'sem_consumo' });
  });

  it('só evento FLAGGED não é consumo (2ª abertura do mesmo episódio pelo mesmo IP em 6h)', async () => {
    const { serie, ep } = await criarObra();
    const leitor = await criarLeitor();
    // 1ª abertura anônima do IP X -> evento válido do anônimo; 2ª abertura
    // logada do MESMO IP e episódio -> flagged:'dedupe' (engagementLogger.js:69-84)
    await request(app).get(`/api/content/episodes/${ep._id}`).set('X-Forwarded-For', '51.0.0.7');
    await request(app).get(`/api/content/episodes/${ep._id}`).set('Authorization', leitor.token).set('X-Forwarded-For', '51.0.0.7');
    await engagementLogger.flushForTests();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(201);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean()).valida).toBe(false);
  });

  it('grave sem consumo -> valida:true (titular de direitos não precisa ler)', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'Arte copiada da minha HQ.' });
    expect(r.status).toBe(201);
    expect((await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean())).toMatchObject({ valida: true, grave: true });
    await svc.flushForTests();
  });

  it('validação do body: motivo fora do enum (inclusive violencia_excessiva) 400; outro sem descrição 400; descrição > 500 400', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    for (const body of [{ motivo: 'violencia_excessiva' }, { motivo: 'x' }, {}, { motivo: 'outro' }, { motivo: 'outro', descricao: '   ' }, { motivo: 'spam_ou_enganoso', descricao: 'a'.repeat(501) }]) {
      const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('rascunho -> 404 sem write (inclusive admin); despublicada -> 404; id malformado -> 404; inexistente -> 404', async () => {
    const { serie } = await criarObra({ isPublished: false });
    const leitor = await criarLeitor();
    for (const token of [leitor.token, `Bearer ${auth.getToken('admin')}`]) {
      const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', token).send({ motivo: 'spam_ou_enganoso' });
      expect(r.status).toBe(404);
    }
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
    expect((await request(app).post('/api/content/series/abc/sinalizar').set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' })).status).toBe(404);
    expect((await request(app).post(`/api/content/series/${new mongoose.Types.ObjectId()}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' })).status).toBe(404);
  });

  it('obra invisível pelo filtro parental -> 404 sem write', async () => {
    const { serie } = await criarObra({ content_rating: 'young', tags: ['terror'] });
    const leitor = await criarLeitor();
    await User.updateOne({ _id: leitor.id }, { $set: { 'parental.classificacaoEtaria': 'kids' } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(404);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('dono do canal -> 400 code propria_obra, sem write', async () => {
    const { serie, dono } = await criarObra();
    const senha = 'Senha@123';
    await User.updateOne({ _id: dono._id }, { $set: { passwordHash: await bcrypt.hash(senha, 10) } });
    const login = await request(app).post('/api/auth/login').send({ email: dono.email, password: senha });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', `Bearer ${login.body.accessToken}`).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('propria_obra');
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
  });

  it('conta desativada -> 403 herdado do middleware global (nenhuma lógica na rota)', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await User.updateOne({ _id: leitor.id }, { $set: { isActive: false } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(403);
  });

  it('contaCriadaEm cai em _id.getTimestamp() para User sem createdAt', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(leitor.id) }, { $unset: { createdAt: 1 } });
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'x' });
    expect(r.status).toBe(201);
    const doc = await Sinalizacao.findOne({ seriesId: serie._id, userId: leitor.id }).lean();
    expect(doc.contaCriadaEm.getTime()).toBe(new mongoose.Types.ObjectId(leitor.id).getTimestamp().getTime());
    await svc.flushForTests();
  });

  it('sinalização VÁLIDA dispara a avaliação; inválida NÃO; falha na avaliação não afeta o 201', async () => {
    const { serie, ep } = await criarObra();
    const spy = vi.spyOn(svc, 'dispararAvaliacao');
    const semConsumo = await criarLeitor();
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', semConsumo.token).send({ motivo: 'spam_ou_enganoso' });
    expect(spy).not.toHaveBeenCalled();

    const comConsumo = await criarLeitor();
    await consumir(comConsumo.token, ep);
    spy.mockImplementationOnce(() => Promise.reject(new Error('boom')).catch(() => null));
    const r = await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', comConsumo.token).send({ motivo: 'spam_ou_enganoso' });
    expect(r.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe(String(serie._id));
    spy.mockRestore();
  });
});

describe('GET /api/content/series/:id/sinalizacao', () => {
  it('guest 401; logado sem sinalização {jaSinalizada:false, motivo:null}; com -> motivo; rascunho 404; NUNCA contagens', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    expect((await request(app).get(`/api/content/series/${serie._id}/sinalizacao`)).status).toBe(401);
    const r0 = await request(app).get(`/api/content/series/${serie._id}/sinalizacao`).set('Authorization', leitor.token);
    expect(r0.body).toEqual({ jaSinalizada: false, motivo: null });
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const r1 = await request(app).get(`/api/content/series/${serie._id}/sinalizacao`).set('Authorization', leitor.token);
    expect(r1.body).toEqual({ jaSinalizada: true, motivo: 'conteudo_proibido' });
    expect(Object.keys(r1.body).sort()).toEqual(['jaSinalizada', 'motivo']);

    const { serie: draft } = await criarObra({ isPublished: false });
    expect((await request(app).get(`/api/content/series/${draft._id}/sinalizacao`).set('Authorization', leitor.token)).status).toBe(404);
  });
});

describe('shape público inalterado', () => {
  it('GET /content/series/:id e /content/series não trazem nenhuma chave de curadoria', async () => {
    const { serie } = await criarObra();
    const leitor = await criarLeitor();
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const doc = await request(app).get(`/api/content/series/${serie._id}`).set('Authorization', USER());
    const lista = await request(app).get('/api/content/series').set('Authorization', PREMIUM());
    for (const corpo of [JSON.stringify(doc.body), JSON.stringify(lista.body)]) {
      expect(corpo).not.toMatch(/sinalizac|casoId|gatilho|"S"|"V"|prioridade|curadoria/i);
    }
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (404 nas rotas)**

Run: `npx vitest run tests/backend/curadoriaSinalizar.test.js`

- [ ] **Step 3: Implementar `middlewares/sinalizacaoLimiter.js`**

```js
const rateLimit = require('express-rate-limit');

// Fase 5 Bloco 3: teto por USUÁRIO em POST /content/series/:id/sinalizar.
// Válidas já são limitadas por unique+consumo; inválidas (sem consumo) eram
// gravadas sem teto — uma conta podia escrever 1 sinalização em cada obra do
// catálogo em minutos (achado do painel). Fica DEPOIS de verifyToken na
// rota: req.user sempre existe, a chave nunca cai em IP. No-op em test,
// mesmo padrão de middlewares/accountLimiter.js.
const sinalizacaoLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 30,
      keyGenerator: (req) => String(req.user.id),
      message: { error: 'Muitas sinalizações em pouco tempo. Tente novamente mais tarde.' },
    });

module.exports = sinalizacaoLimiter;
```

- [ ] **Step 4: Implementar `routes/sinalizacao.js`**

```js
/**
 * Fase 5 Bloco 3 — sinalização de conteúdo pelo LEITOR (montado em
 * /api/content, ao lado de routes/content.js). Regra 5 do Vin: uma conta =
 * uma sinalização por obra (unique do model; para sempre, mesmo após o caso
 * ser revisado). Regra 8: esta rota nunca devolve contagem nem existência
 * de caso — só o estado do PRÓPRIO usuário.
 *
 * Visibilidade: mesma composição de GET /content/series/:id
 * (content.js:173-186), mas isPublished é exigido para TODOS (inclusive
 * admin/dono): rascunho e obra despublicada pela curadoria não podem
 * acumular sinal nem confirmar existência -> 404 sem write.
 */
const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const User = require('../models/User');
const Sinalizacao = require('../models/Sinalizacao');
const EngagementEvent = require('../models/EngagementEvent');
const verifyToken = require('../middlewares/verifyToken');
const sinalizacaoLimiter = require('../middlewares/sinalizacaoLimiter');
const { serieVisivelPara } = require('../utils/parentalFilter');
const { responderCastError } = require('../utils/routeErrors');
const { pseudonymize } = require('../services/engagementLogger');
const curadoriaService = require('../services/curadoriaService');
const L = require('../utils/curadoriaLimiares');
const logger = require('../utils/logger');

const NAO_ENCONTRADA = 'Série não encontrada.';

// Devolve a série publicada e visível, ou responde 404 e devolve null.
async function serieSinalizavel(req, res) {
  const series = await Series.findById(req.params.id).lean();
  if (!series || !series.isPublished || !(await serieVisivelPara(req.user, series))) {
    res.status(404).json({ error: NAO_ENCONTRADA });
    return null;
  }
  return series;
}

router.post('/series/:id/sinalizar', verifyToken, sinalizacaoLimiter, async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!L.MOTIVOS.includes(motivo)) {
      return res.status(400).json({ error: 'motivo inválido.' });
    }
    const descricao = req.body.descricao === undefined || req.body.descricao === null ? null : String(req.body.descricao).trim() || null;
    if (descricao && descricao.length > L.DESCRICAO_MAX) {
      return res.status(400).json({ error: `descricao deve ter no máximo ${L.DESCRICAO_MAX} caracteres.` });
    }
    if (L.MOTIVOS_COM_DESCRICAO_OBRIGATORIA.includes(motivo) && !descricao) {
      return res.status(400).json({ error: 'Descreva o motivo da sinalização.' });
    }

    const series = await serieSinalizavel(req, res);
    if (!series) return;

    if (series.channelId) {
      const canal = await Channel.findById(series.channelId).select('ownerId').lean();
      if (canal && String(canal.ownerId) === String(req.user.id)) {
        return res.status(400).json({ error: 'Você não pode sinalizar a própria obra.', code: 'propria_obra' });
      }
    }

    const existente = await Sinalizacao.findOne({ userId: req.user.id, seriesId: series._id }).select('_id').lean();
    if (existente) return res.json({ jaSinalizada: true });

    const usuario = await User.findById(req.user.id).select('createdAt').lean();
    if (!usuario) return res.status(401).json({ error: 'Sessão inválida.' });

    // Graves não exigem consumo (o titular de direitos reconhece a cópia
    // pela capa); motivo normal exige consumo REAL = evento não-flagged do
    // próprio usuário na obra. ReadingProgress não vale: PUT /me/progress
    // aceita ids arbitrários sem barreira.
    const grave = L.ehGrave(motivo);
    let valida = true;
    let invalidaMotivo = null;
    if (!grave) {
      const consumo = await EngagementEvent.exists({ seriesId: series._id, userId: usuario._id, type: { $in: ['view', 'read'] }, flagged: false });
      if (!consumo) { valida = false; invalidaMotivo = 'sem_consumo'; }
    }

    try {
      await Sinalizacao.create({
        seriesId: series._id, userId: usuario._id, motivo, grave, descricao, valida, invalidaMotivo,
        // Contas anteriores ao `timestamps` do schema de User não têm createdAt.
        contaCriadaEm: usuario.createdAt || usuario._id.getTimestamp(),
        ipHash: pseudonymize(req.ip),
      });
    } catch (err) {
      // Corrida de duplo clique: a outra requisição gravou — mesmo 200.
      if (err && err.code === 11000) return res.json({ jaSinalizada: true });
      throw err;
    }

    res.status(201).json({ jaSinalizada: false });
    if (valida) curadoriaService.dispararAvaliacao(series._id);
  } catch (err) {
    if (responderCastError(err, res, NAO_ENCONTRADA)) return;
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    logger.error('[Sinalizacao] POST /series/:id/sinalizar', err);
    res.status(500).json({ error: 'Erro ao registrar sinalização.' });
  }
});

router.get('/series/:id/sinalizacao', verifyToken, async (req, res) => {
  try {
    const series = await serieSinalizavel(req, res);
    if (!series) return;
    const minha = await Sinalizacao.findOne({ userId: req.user.id, seriesId: series._id }).select('motivo').lean();
    res.json({ jaSinalizada: !!minha, motivo: minha ? minha.motivo : null });
  } catch (err) {
    if (responderCastError(err, res, NAO_ENCONTRADA)) return;
    logger.error('[Sinalizacao] GET /series/:id/sinalizacao', err);
    res.status(500).json({ error: 'Erro ao buscar sinalização.' });
  }
});

module.exports = router;
```

Em `server.js`, logo após a linha 262 (`app.use("/api/content", require("./routes/content"));`):
```js
app.use("/api/content", require("./routes/sinalizacao")); // Fase 5 Bloco 3: sinalizar conteúdo (leitor)
```

- [ ] **Step 5: Rodar — deve passar; depois `content.test.js` e `parentalDocSurfaces.test.js` (vizinhos)**

Run: `npx vitest run tests/backend/curadoriaSinalizar.test.js tests/backend/content.test.js tests/backend/parentalDocSurfaces.test.js` — Expected: PASS. Se o teste "só evento FLAGGED" falhar por `req.ip` não refletir `X-Forwarded-For`, confira `app.set('trust proxy', ...)` em `server.js` — se não houver, troque os dois `set('X-Forwarded-For', ...)` desse teste por chamadas ao `engagementLogger.logEvent` direto (anônimo ip 51.0.0.7 e depois logado ip 51.0.0.7) e mantenha a asserção.

- [ ] **Step 6: Suite completa + commit**

```bash
git add middlewares/sinalizacaoLimiter.js routes/sinalizacao.js server.js tests/backend/curadoriaSinalizar.test.js
git commit -m "feat(curadoria): rotas do leitor - sinalizar conteudo e consultar a propria sinalizacao" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Fila de Revisão (admin) — `GET /admin/curadoria`, 4 ações, badge e `removidaPelaCuradoria` em `/admin/aprovacoes`

**Files:**
- Create: `routes/adminCuradoria.js`
- Modify: `routes/adminPortal.js:181-253` (`GET /aprovacoes` += `curadoria` e `removidaPelaCuradoria`)
- Modify: `server.js:258` (montar `routes/adminCuradoria` em `/api/admin`, logo após `routes/adminPortal`)
- Test: `tests/backend/adminCuradoria.test.js`; += casos em `tests/backend/adminAprovacoes.test.js`

**Interfaces:**
- Consumes: Task 2 (`contarSinalizacoes`, `reavaliarPendentes`, `enviarAvisoArtista`, `fecharCaso`, `TEXTOS`, `ROTULO_RATING`), `services/seriesPublishService.applySeriesUpdate(seriesId, updates)` (lança `{status:404}`/`{status:400}`/ValidationError), `utils/routeErrors.responderCastError`.
- Produces (Task 7 consome):
  - `GET /api/admin/curadoria?status=abertos|fechado` → `{ casos: ItemCaso[], total, graves }`
  - `ItemCaso = { casoId, status, prioridade, abertoEm, obra: {id,title,cover_image,content_type,content_rating,tags,isPublished}|null, canal: {id,name}|null, gatilho, resumoMotivos, contagem: {S,S_grave,V,limiar,semConsumo,contasRecentes,ipsDistintos}, descricoes: [{motivo,descricao,createdAt}], thread: [{autorTipo,texto,refId,createdAt}], avisoArtista, decisao, motivoDecisao, observacao, decididoPor, decisaoEm, sinalizacoesAbusivas }`
  - `POST /api/admin/curadoria/:casoId/aprovar {observacao?, abuso?}` · `/reclassificar {content_rating, observacao?}` · `/solicitar-correcao {texto}` · `/remover {motivo, observacao?}` → 200 `{ caso }` | 400 | 404 | 409
  - `GET /api/admin/aprovacoes` → `{ itens, naoClassificadas, curadoria: {abertos, graves} }`, cada item série com `removidaPelaCuradoria: {decisaoEm, motivo}|null`

- [ ] **Step 1: Testes (falham: rotas inexistentes)**

`tests/backend/adminCuradoria.test.js`:
```js
/**
 * Fase 5 Bloco 3, Task 4 — Fila de Revisão do admin e as 4 decisões. Regra
 * 8: o admin vê NÚMEROS, nunca identidades (nenhum userId/e-mail de leitor na
 * resposta); regra 1: "remover" = despublicar, nunca DELETE.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Favorite, Sinalizacao, CasoCuradoria, MensagemPortal, AdminLog, svc, L;
const AGORA = new Date('2026-09-12T09:00:00.000Z');
const dias = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);
const oid = () => new mongoose.Types.ObjectId();
const ADMIN = () => `Bearer ${auth.getToken('admin')}`;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode'); Channel = require('../../models/Channel');
  User = require('../../models/User'); Favorite = require('../../models/Favorite');
  Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  MensagemPortal = require('../../models/MensagemPortal'); AdminLog = require('../../models/AdminLog');
  svc = require('../../services/curadoriaService'); L = require('../../utils/curadoriaLimiares');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

let n = 0;
async function criarObra({ comCanal = true, title = 'Obra da Fila 4' } = {}) {
  n += 1;
  let canal = null, dono = null;
  if (comCanal) {
    dono = await User.create({ email: `dono-fila-${n}-${Date.now()}@lorflux.test`, passwordHash: 'x', nome: `Dono ${n}`, role: 'user' });
    canal = await Channel.create({ ownerId: dono._id, name: `Canal ${n} ${Date.now()}` });
  }
  const serie = await Series.create({ title, genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', cover_image: 'https://cdn.exemplo/c.jpg', ...(canal ? { channelId: canal._id } : {}) });
  await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap 1', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, canal, dono };
}
async function sinalizar(serieId, { quantas, motivo = 'spam_ou_enganoso', idadeDias = 30, valida = true, invalidaMotivo = null, descricao = null }) {
  return Sinalizacao.insertMany(Array.from({ length: quantas }, (_, i) => ({
    seriesId: serieId, userId: oid(), motivo, grave: L.ehGrave(motivo), valida, invalidaMotivo, descricao,
    contaCriadaEm: dias(idadeDias), ipHash: `ip-${n}-${i}`,
  })));
}
/** Abre um caso grave (5 graves maduras; V=0 basta). */
async function abrirCasoGrave(serie) {
  await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 9, descricao: 'descrição do leitor' });
  return svc.avaliarObra(serie._id, { agora: AGORA });
}
async function abrirCasoNormal(serie) {
  // V=0 -> limiar 20; 20 válidas maduras abrem caso 'pequena'
  await sinalizar(serie._id, { quantas: 20 });
  return svc.avaliarObra(serie._id, { agora: AGORA });
}

describe('GET /api/admin/curadoria', () => {
  it('401 sem token; 403 não-admin', async () => {
    expect((await request(app).get('/api/admin/curadoria')).status).toBe(401);
    expect((await request(app).get('/api/admin/curadoria').set('Authorization', `Bearer ${auth.getToken('user')}`)).status).toBe(403);
  });

  it('lista abertos: graves primeiro, depois S/limiar desc; item com obra/canal/contagem/descrições anonimizadas/thread vigente; sem identidades', async () => {
    const { serie: normal, canal } = await criarObra({ title: 'Normal 12' });
    await abrirCasoNormal(normal);
    const { serie: grave } = await criarObra({ title: 'Grave 34' });
    await abrirCasoGrave(grave);
    // resposta do ilustrador na thread vigente (sem refId — portal.js:606-628)
    await MensagemPortal.create({ canalId: canal._id, ownerUserId: canal.ownerId, autorTipo: 'ilustrador', autorUserId: canal.ownerId, texto: 'Minha defesa aqui.' });

    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(r.status).toBe(200);
    const ids = r.body.casos.map(c => c.obra.id);
    expect(ids.indexOf(String(grave._id))).toBeLessThan(ids.indexOf(String(normal._id)));
    expect(r.body.graves).toBeGreaterThanOrEqual(1);
    expect(r.body.total).toBe(r.body.casos.length);

    const itemNormal = r.body.casos.find(c => c.obra.id === String(normal._id));
    expect(itemNormal).toMatchObject({ status: 'aberto', prioridade: 'normal', avisoArtista: 'enviado' });
    expect(itemNormal.obra).toMatchObject({ title: 'Normal 12', content_type: 'hiqua', content_rating: 'young', isPublished: true });
    expect(itemNormal.canal).toEqual({ id: String(canal._id), name: canal.name });
    expect(itemNormal.contagem).toMatchObject({ S: 20, S_grave: 0, V: 0, limiar: 20, semConsumo: 0, contasRecentes: 0, ipsDistintos: 20 });
    expect(itemNormal.thread.map(m => m.texto)).toContain('Minha defesa aqui.');
    expect(itemNormal.thread.every(m => Object.keys(m).sort().join() === ['autorTipo', 'createdAt', 'refId', 'texto'].join())).toBe(true);

    const itemGrave = r.body.casos.find(c => c.obra.id === String(grave._id));
    expect(itemGrave.descricoes).toHaveLength(5);
    expect(itemGrave.descricoes[0]).toEqual(expect.objectContaining({ motivo: 'conteudo_proibido', descricao: 'descrição do leitor' }));
    expect(Object.keys(itemGrave.descricoes[0]).sort()).toEqual(['createdAt', 'descricao', 'motivo']);
    expect(JSON.stringify(r.body)).not.toMatch(/userId|@lorflux\.test|ipHash|contaCriadaEm/);
  });

  it('roda reavaliarPendentes antes de listar: contas que amadureceram abrem caso ao abrir a fila', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 30 });
    // nada avaliou ainda (insertMany direto) -> a fila precisa abrir o caso
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(r.body.casos.some(c => c.obra && c.obra.id === String(serie._id))).toBe(true);
  });

  it('?status=fechado lista histórico com decisao/motivoDecisao/decididoPor; obra apagada -> obra null sem 500', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia de terceiro.' });
    await Series.deleteOne({ _id: serie._id });
    const r = await request(app).get('/api/admin/curadoria?status=fechado').set('Authorization', ADMIN());
    const item = r.body.casos.find(c => c.casoId === String(caso._id));
    expect(item).toMatchObject({ status: 'fechado', decisao: 'remover', motivoDecisao: 'Cópia de terceiro.', decididoPor: auth.getId('admin'), obra: null });
  });

  it('troca de dono do canal com caso aberto: caso continua listado, thread vazia, sem 500', async () => {
    const { serie, canal } = await criarObra();
    await abrirCasoGrave(serie);
    await MensagemPortal.arquivarThreadDoCanal(canal._id);
    await Channel.updateOne({ _id: canal._id }, { $set: { ownerId: oid() } });
    const r = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    const item = r.body.casos.find(c => c.obra && c.obra.id === String(serie._id));
    expect(item.thread).toEqual([]);
  });
});

describe('ações do curador', () => {
  it('não-admin 403 nas 4; casoId malformado 404; inexistente 404', async () => {
    for (const acao of ['aprovar', 'reclassificar', 'solicitar-correcao', 'remover']) {
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', `Bearer ${auth.getToken('user')}`).send({})).status).toBe(403);
      expect((await request(app).post(`/api/admin/curadoria/abc/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
      expect((await request(app).post(`/api/admin/curadoria/${oid()}/${acao}`).set('Authorization', ADMIN()).send({ content_rating: 'teen', texto: 'x', motivo: 'x' })).status).toBe(404);
    }
  });

  it('aprovar: fecha, revisadaEm em todas, aviso curto sem dígitos fora do título, AdminLog do admin; 2ª ação -> 409', async () => {
    const { serie } = await criarObra({ title: 'Aprovada 77' });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({ observacao: 'ok' });
    expect(r.status).toBe(200);
    expect(r.body.caso).toMatchObject({ status: 'fechado', decisao: 'aprovar', observacao: 'ok', sinalizacoesAbusivas: false });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: null })).toBe(0);
    const avisos = await MensagemPortal.find({ refId: serie._id }).sort({ createdAt: 1 }).lean();
    expect(avisos).toHaveLength(2); // abertura + fechamento
    expect(avisos[1].texto).toMatch(/mantida sem alterações/);
    expect(/\d/.test(avisos[1].texto.split(serie.title).join(''))).toBe(false);
    expect(String(avisos[1].autorUserId)).toBe(auth.getId('admin'));
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_APROVAR', adminId: auth.getId('admin'), targetId: String(serie._id) })).toBe(1);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({})).status).toBe(409);
  });

  it('aprovar com abuso:true -> só as válidas viram abuso; sem_consumo preservada', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 2, valida: false, invalidaMotivo: 'sem_consumo' });
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/aprovar`).set('Authorization', ADMIN()).send({ abuso: true });
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'abuso' })).toBe(5);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, invalidaMotivo: 'sem_consumo' })).toBe(2);
    expect((await CasoCuradoria.findById(caso._id).lean()).sinalizacoesAbusivas).toBe(true);
  });

  it('reclassificar: rating fora do enum 400; válido grava content_rating, fecha, aviso com rótulo Teen', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: '12+' })).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/reclassificar`).set('Authorization', ADMIN()).send({ content_rating: 'teen' });
    expect(r.status).toBe(200);
    expect((await Series.findById(serie._id).lean()).content_rating).toBe('teen');
    expect(r.body.caso.decisao).toBe('reclassificar');
    const aviso = await MensagemPortal.findOne({ refId: serie._id, texto: /classificação etária/ }).lean();
    expect(aviso.texto).toContain('Teen');
    expect(/\d/.test(aviso.texto.split(serie.title).join(''))).toBe(false);
  });

  it('solicitar correção: texto obrigatório (400), caso -> aguardando_artista (continua aberto), obra CONTINUA publicada, mensagem com refId e texto do editor; depois aceita as 4 ações', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({})).status).toBe(400);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'a'.repeat(1501) })).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'Troque a capa.' });
    expect(r.status).toBe(200);
    expect(r.body.caso).toMatchObject({ status: 'aguardando_artista', emAberto: true, motivoDecisao: 'Troque a capa.' });
    expect((await Series.findById(serie._id).lean()).isPublished).toBe(true);
    const msg = await MensagemPortal.findOne({ refId: serie._id, texto: /Troque a capa/ }).lean();
    expect(msg.texto).toMatch(/editor/);
    // escalonamento/ações continuam válidas em aguardando_artista
    const r2 = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Sem resposta.' });
    expect(r2.status).toBe(200);
  });

  it('solicitar correção em obra sem canal -> 400 e nada muda', async () => {
    const { serie } = await criarObra({ comCanal: false });
    const caso = await abrirCasoGrave(serie);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/solicitar-correcao`).set('Authorization', ADMIN()).send({ texto: 'x' });
    expect(r.status).toBe(400);
    expect((await CasoCuradoria.findById(caso._id).lean()).status).toBe('aberto');
  });

  it('remover: motivo obrigatório; despublica (NÃO apaga: episódios/favoritos intactos), fecha, aviso com motivo, AdminLog; obra já despublicada -> fecha mesmo assim', async () => {
    const { serie } = await criarObra();
    await Favorite.create({ userId: auth.getId('premium'), seriesId: serie._id });
    const caso = await abrirCasoGrave(serie);
    expect((await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({})).status).toBe(400);
    const r = await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Conteúdo proibido confirmado.' });
    expect(r.status).toBe(200);
    const s = await Series.findById(serie._id).lean();
    expect(s.isPublished).toBe(false);
    expect(await Episode.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await Favorite.countDocuments({ seriesId: serie._id })).toBe(1);
    expect((await MensagemPortal.findOne({ refId: serie._id, texto: /retirada do ar/ }).lean()).texto).toContain('Conteúdo proibido confirmado.');
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_REMOVER', targetId: String(serie._id) })).toBe(1);

    const { serie: s2 } = await criarObra();
    const c2 = await abrirCasoGrave(s2);
    await Series.updateOne({ _id: s2._id }, { $set: { isPublished: false } });
    expect((await request(app).post(`/api/admin/curadoria/${c2._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'x' })).status).toBe(200);
  });
});

describe('GET /api/admin/aprovacoes += curadoria e removidaPelaCuradoria', () => {
  it('curadoria: {abertos, graves} reflete os casos abertos', async () => {
    const { serie } = await criarObra();
    await abrirCasoGrave(serie);
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(r.body.curadoria.abertos).toBeGreaterThanOrEqual(1);
    expect(r.body.curadoria.graves).toBeGreaterThanOrEqual(1);
    expect(r.body.curadoria.abertos).toBe(await CasoCuradoria.countDocuments({ emAberto: true }));
  });

  it('obra removida pela curadoria e reenviada pelo portal traz removidaPelaCuradoria no item; série nunca removida -> null', async () => {
    const { serie } = await criarObra();
    const caso = await abrirCasoGrave(serie);
    await request(app).post(`/api/admin/curadoria/${caso._id}/remover`).set('Authorization', ADMIN()).send({ motivo: 'Cópia.' });
    // reenvio: o estado pós-remover é {isPublished:false, submittedAt:null}; simula o POST /portal/series/:id/enviar
    await Series.updateOne({ _id: serie._id }, { $set: { submittedAt: new Date('2026-09-13T10:00:00Z') } });
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    const item = r.body.itens.find(i => i.tipo === 'series' && i.id === String(serie._id));
    expect(item.removidaPelaCuradoria).toEqual({ decisaoEm: expect.any(String), motivo: 'Cópia.' });

    const { serie: limpa } = await criarObra();
    await Series.updateOne({ _id: limpa._id }, { $set: { isPublished: false, submittedAt: new Date() } });
    const r2 = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(r2.body.itens.find(i => i.id === String(limpa._id)).removidaPelaCuradoria).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npx vitest run tests/backend/adminCuradoria.test.js`

- [ ] **Step 3: Implementar `routes/adminCuradoria.js`**

```js
/**
 * Fase 5 Bloco 3 — Fila de Revisão (lado do CURADOR). Montado em /api/admin,
 * ao lado de routes/adminPortal.js. Regra 1 do Vin: nada aqui é automático —
 * as 4 decisões são humanas; "remover" = despublicar (nunca DELETE). Regra
 * 8: o admin vê contagens (precisa delas para decidir), NUNCA identidades —
 * descrições saem sem userId, thread sem ids de autor.
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');
const Series = require('../models/Series');
const Channel = require('../models/Channel');
const Sinalizacao = require('../models/Sinalizacao');
const CasoCuradoria = require('../models/CasoCuradoria');
const MensagemPortal = require('../models/MensagemPortal');
const AdminLog = require('../models/AdminLog');
const { responderCastError } = require('../utils/routeErrors');
const svc = require('../services/curadoriaService');
const L = require('../utils/curadoriaLimiares');

const RATINGS = ['kids', 'teen', 'young'];
const NAO_ENCONTRADO = 'Caso não encontrado.';

router.use(verifyToken, requireAdmin);

function ordenar(itens) {
  const peso = (it) => (it.prioridade === 'grave' ? 1 : 0);
  return itens.sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(b) - peso(a);
    if (a.prioridade === 'grave') {
      if (a.contagem.S_grave !== b.contagem.S_grave) return b.contagem.S_grave - a.contagem.S_grave;
    } else {
      const ra = a.contagem.limiar ? a.contagem.S / a.contagem.limiar : 0;
      const rb = b.contagem.limiar ? b.contagem.S / b.contagem.limiar : 0;
      if (ra !== rb) return rb - ra;
    }
    return new Date(a.abertoEm) - new Date(b.abertoEm);
  });
}

// GET /api/admin/curadoria?status=abertos|fechado
router.get('/curadoria', async (req, res) => {
  try {
    const historico = req.query.status === 'fechado';
    if (!historico) {
      // Gatilho de maturação (spec rev.3): o Master abrir a fila reconta as
      // contas que completaram a idade mínima.
      await svc.reavaliarPendentes();
    }
    const casos = await CasoCuradoria.find({ emAberto: !historico })
      .sort(historico ? { decisaoEm: -1 } : { abertoEm: 1 })
      .limit(historico ? 100 : 500)
      .lean();

    const seriesIds = casos.map(c => c.seriesId);
    const series = await Series.find({ _id: { $in: seriesIds } })
      .select('title cover_image content_type content_rating tags channelId isPublished').lean();
    const seriePorId = new Map(series.map(s => [String(s._id), s]));
    const canalIds = [...new Set(series.filter(s => s.channelId).map(s => String(s.channelId)))];
    const canais = canalIds.length ? await Channel.find({ _id: { $in: canalIds } }).select('name').lean() : [];
    const canalPorId = new Map(canais.map(c => [String(c._id), c]));

    // Descrições do CICLO (revisadaEm:null) — só abertos; anonimizadas.
    const descricoesPorSerie = new Map();
    if (!historico && seriesIds.length) {
      const descs = await Sinalizacao.find({ seriesId: { $in: seriesIds }, revisadaEm: null, descricao: { $ne: null } })
        .select('seriesId motivo descricao createdAt').sort({ createdAt: -1 }).lean();
      for (const d of descs) {
        const k = String(d.seriesId);
        if (!descricoesPorSerie.has(k)) descricoesPorSerie.set(k, []);
        descricoesPorSerie.get(k).push({ motivo: d.motivo, descricao: d.descricao, createdAt: d.createdAt });
      }
    }

    const itens = await Promise.all(casos.map(async (c) => {
      const serie = seriePorId.get(String(c.seriesId)) || null;
      const canal = serie && serie.channelId ? canalPorId.get(String(serie.channelId)) : null;
      let contagem = { S: c.gatilho.S, S_grave: 0, V: c.gatilho.V, limiar: c.gatilho.limiar, semConsumo: 0, contasRecentes: 0, ipsDistintos: 0 };
      let thread = [];
      if (!historico) {
        const viva = await svc.contarSinalizacoes(c.seriesId);
        contagem = { S: viva.S, S_grave: viva.S_grave, V: c.gatilho.V, limiar: c.gatilho.limiar, semConsumo: viva.semConsumo, contasRecentes: viva.contasRecentes, ipsDistintos: viva.ipsDistintos };
        if (serie && serie.channelId) {
          // Thread VIGENTE do canal, sem filtro de refId (a resposta do artista
          // nasce com refId null — portal.js:606-628). Somente leitura: NÃO
          // marca lidaEm (isso é papel de GET /admin/mensagens/:canalId).
          const msgs = await MensagemPortal.find({ canalId: serie.channelId, arquivadaEm: null })
            .sort({ createdAt: -1 }).limit(10).select('autorTipo texto refId createdAt').lean();
          thread = msgs.reverse().map(m => ({ autorTipo: m.autorTipo, texto: m.texto, refId: m.refId, createdAt: m.createdAt }));
        }
      }
      return {
        casoId: String(c._id), status: c.status, prioridade: c.prioridade, abertoEm: c.abertoEm,
        obra: serie ? { id: String(serie._id), title: serie.title, cover_image: serie.cover_image ?? null, content_type: serie.content_type, content_rating: serie.content_rating ?? null, tags: serie.tags ?? [], isPublished: !!serie.isPublished } : null,
        canal: canal ? { id: String(serie.channelId), name: canal.name } : null,
        canalId: serie && serie.channelId ? String(serie.channelId) : null,
        gatilho: c.gatilho, resumoMotivos: c.resumoMotivos || {}, contagem,
        descricoes: descricoesPorSerie.get(String(c.seriesId)) || [],
        thread, avisoArtista: c.avisoArtista,
        decisao: c.decisao ?? null, motivoDecisao: c.motivoDecisao ?? null, observacao: c.observacao ?? null,
        decididoPor: c.decididoPor ?? null, decisaoEm: c.decisaoEm ?? null, sinalizacoesAbusivas: !!c.sinalizacoesAbusivas,
      };
    }));

    const lista = historico ? itens : ordenar(itens);
    res.json({ casos: lista, total: lista.length, graves: lista.filter(i => i.prioridade === 'grave').length });
  } catch (err) {
    logger.error('[AdminCuradoria] GET /curadoria', err);
    res.status(500).json({ error: 'Erro ao montar a fila de revisão.' });
  }
});

// Carrega o caso ABERTO ou responde (404 inexistente / 409 fechado) e devolve null.
async function carregarCasoAberto(req, res) {
  const caso = await CasoCuradoria.findById(req.params.casoId);
  if (!caso) { res.status(404).json({ error: NAO_ENCONTRADO }); return null; }
  if (!caso.emAberto) { res.status(409).json({ error: 'Caso já fechado.' }); return null; }
  return caso;
}

function textoAdmin(valor, campo) {
  const t = valor === undefined || valor === null ? '' : String(valor).trim();
  if (!t) return { error: `${campo} é obrigatório.` };
  if (t.length > L.TEXTO_ADMIN_MAX) return { error: `${campo} deve ter no máximo ${L.TEXTO_ADMIN_MAX} caracteres.` };
  return { texto: t };
}

async function avisar(series, texto, adminId) {
  if (!series) return { status: 'sem_canal', mensagemId: null };
  try {
    return await svc.enviarAvisoArtista(series, texto, { autorUserId: adminId });
  } catch (err) {
    logger.error('[AdminCuradoria] aviso ao artista falhou', err && err.message);
    return { status: 'falhou', mensagemId: null };
  }
}

async function logAdmin(req, action, caso, details) {
  await AdminLog.create({ adminId: req.user.id, action, targetId: String(caso.seriesId), details: { casoId: String(caso._id), ...details } });
}

function tratarErro(err, res, rota) {
  if (responderCastError(err, res, NAO_ENCONTRADO)) return;
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  if (err && err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  logger.error(`[AdminCuradoria] ${rota}`, err);
  res.status(500).json({ error: 'Erro ao aplicar a decisão.' });
}

router.post('/curadoria/:casoId/aprovar', async (req, res) => {
  try {
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    const abuso = req.body.abuso === true;
    const observacao = req.body.observacao ? String(req.body.observacao).slice(0, 2000) : null;
    await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: req.user.id, observacao, abuso });
    const series = await Series.findById(caso.seriesId).select('title channelId').lean();
    const aviso = await avisar(series, series ? svc.TEXTOS.aprovar(series.title) : '', req.user.id);
    await logAdmin(req, 'CURADORIA_APROVAR', caso, { abuso, avisoArtista: aviso.status });
    res.json({ caso });
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/aprovar'); }
});

router.post('/curadoria/:casoId/reclassificar', async (req, res) => {
  try {
    const { content_rating } = req.body;
    if (!RATINGS.includes(content_rating)) {
      return res.status(400).json({ error: 'content_rating deve ser kids, teen ou young.' });
    }
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    const { applySeriesUpdate } = require('../services/seriesPublishService');
    await applySeriesUpdate(caso.seriesId, { content_rating });
    const observacao = req.body.observacao ? String(req.body.observacao).slice(0, 2000) : null;
    await svc.fecharCaso(caso, { decisao: 'reclassificar', adminId: req.user.id, observacao, motivoDecisao: content_rating });
    const series = await Series.findById(caso.seriesId).select('title channelId').lean();
    const aviso = await avisar(series, series ? svc.TEXTOS.reclassificar(series.title, svc.ROTULO_RATING[content_rating]) : '', req.user.id);
    await logAdmin(req, 'CURADORIA_RECLASSIFICAR', caso, { content_rating, avisoArtista: aviso.status });
    res.json({ caso });
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/reclassificar'); }
});

router.post('/curadoria/:casoId/solicitar-correcao', async (req, res) => {
  try {
    const t = textoAdmin(req.body.texto, 'texto');
    if (t.error) return res.status(400).json({ error: t.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    const series = await Series.findById(caso.seriesId).select('title channelId').lean();
    // Sem canal não há artista para pedir a correção — nada muda no caso.
    const aviso = await avisar(series, series ? svc.TEXTOS.solicitarCorrecao(series.title, t.texto) : '', req.user.id);
    if (aviso.status !== 'enviado') {
      return res.status(400).json({ error: 'Obra sem canal: não há artista para avisar. Use aprovar, reclassificar ou remover.' });
    }
    caso.status = 'aguardando_artista';
    caso.motivoDecisao = t.texto;
    await caso.save();
    await logAdmin(req, 'CURADORIA_SOLICITAR_CORRECAO', caso, { mensagemId: String(aviso.mensagemId) });
    res.json({ caso });
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/solicitar-correcao'); }
});

router.post('/curadoria/:casoId/remover', async (req, res) => {
  try {
    const t = textoAdmin(req.body.motivo, 'motivo');
    if (t.error) return res.status(400).json({ error: t.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    // DESPUBLICAR, nunca DELETE (regra 1): episódios, favoritos e votos de
    // terceiros ficam; o artista pode corrigir e reenviar. Obra já
    // despublicada por fora -> no-op do update, o caso fecha normalmente.
    const { applySeriesUpdate } = require('../services/seriesPublishService');
    await applySeriesUpdate(caso.seriesId, { isPublished: false });
    const observacao = req.body.observacao ? String(req.body.observacao).slice(0, 2000) : null;
    await svc.fecharCaso(caso, { decisao: 'remover', adminId: req.user.id, observacao, motivoDecisao: t.texto });
    const series = await Series.findById(caso.seriesId).select('title channelId').lean();
    const aviso = await avisar(series, series ? svc.TEXTOS.remover(series.title, t.texto) : '', req.user.id);
    await logAdmin(req, 'CURADORIA_REMOVER', caso, { motivo: t.texto, avisoArtista: aviso.status });
    res.json({ caso });
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/remover'); }
});

module.exports = router;
```

Em `server.js`, logo após a linha 258 (`app.use("/api/admin", require("./routes/adminPortal"));`):
```js
app.use("/api/admin", require("./routes/adminCuradoria")); // Fase 5 Bloco 3: Fila de Revisão
```

- [ ] **Step 4: `GET /aprovacoes` em `routes/adminPortal.js` += `curadoria` e `removidaPelaCuradoria`**

Adicionar o require no topo (após `AdminLog`): `const CasoCuradoria = require('../models/CasoCuradoria');`

Trocar o `Promise.all` das linhas 183-191 por:
```js
    const [seriesPendentes, episodiosPendentes, naoClassificadas, casosAbertos] = await Promise.all([
      Series.find({ submittedAt: { $ne: null }, isPublished: false })
        .select('title description cover_image content_rating_sugerida content_rating genre tags channelId submittedAt')
        .lean(),
      Episode.find({ submittedAt: { $ne: null }, status: { $ne: 'published' } })
        .select('title description thumbnail panels seriesId submittedAt')
        .lean(),
      Series.countDocuments({ isPublished: true, content_rating: null }),
      // Fase 5 Bloco 3: badge "Curadoria N" — mesma request do badge de
      // Aprovações (AdminDashboard.tsx refetchAprovacoesBadges), sem rota nova.
      CasoCuradoria.find({ emAberto: true }).select('prioridade').lean(),
    ]);
    const curadoria = { abertos: casosAbertos.length, graves: casosAbertos.filter(c => c.prioridade === 'grave').length };

    // Fase 5 Bloco 3: obra removida pela curadoria e reenviada pelo artista —
    // o Master não deve aprovar às cegas. Último caso 'remover' por série,
    // uma query $in + Map (sem N+1).
    const removidos = seriesPendentes.length
      ? await CasoCuradoria.find({ seriesId: { $in: seriesPendentes.map(s => s._id) }, decisao: 'remover' })
          .sort({ decisaoEm: -1 }).select('seriesId decisaoEm motivoDecisao').lean()
      : [];
    const removidaPorSerie = new Map();
    for (const c of removidos) {
      const k = String(c.seriesId);
      if (!removidaPorSerie.has(k)) removidaPorSerie.set(k, { decisaoEm: c.decisaoEm, motivo: c.motivoDecisao ?? null });
    }
```
No `itensSerie` (linhas 216-228) acrescentar o campo:
```js
      removidaPelaCuradoria: removidaPorSerie.get(String(s._id)) ?? null,
```
E a resposta (linha 248): `res.json({ itens, naoClassificadas, curadoria });`

- [ ] **Step 5: Teste POSITIVO em `tests/backend/adminAprovacoes.test.js`**

Adicionar dentro do `describe('GET /api/admin/aprovacoes')` (o teste existente pina campo a campo, não o conjunto de chaves — nada quebra):
```js
  it('Fase 5 Bloco 3: resposta traz curadoria {abertos, graves} (0/0 sem casos) e removidaPelaCuradoria null em série nunca removida', async () => {
    const dono = await criarDono('Curadoria Badge');
    await serieSubmetida(dono, { title: 'Nunca Removida 5' });
    const r = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN_HEADER());
    expect(r.status).toBe(200);
    expect(r.body.curadoria).toEqual({ abertos: expect.any(Number), graves: expect.any(Number) });
    const item = r.body.itens.find(i => i.title === 'Nunca Removida 5');
    expect(item.removidaPelaCuradoria).toBeNull();
  });
```

- [ ] **Step 6: Rodar + suite completa + commit**

Run: `npx vitest run tests/backend/adminCuradoria.test.js tests/backend/adminAprovacoes.test.js` — Expected: PASS. Depois `npx vitest run tests/backend`.
```bash
git add routes/adminCuradoria.js routes/adminPortal.js server.js tests/backend/adminCuradoria.test.js tests/backend/adminAprovacoes.test.js
git commit -m "feat(curadoria): fila de revisao do admin com as 4 decisoes, badge e aviso de obra removida na fila de aprovacao" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Higiene e LGPD — órfãos em `DELETE /series/:id`, export/exclusão do titular, negativo do artista, vazamento no portal

**Files:**
- Modify: `routes/content.js:255-281` (`DELETE /series/:id`)
- Modify: `routes/account.js:92-110` (export) e `:299-329` (`DELETE /me`)
- Test: `tests/backend/curadoriaLgpd.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `GET /api/account/me/export` += `sinalizacoes: [{ seriesId, titulo, motivo, descricao, createdAt }]`; `DELETE /api/account/me` apaga `Sinalizacao` do titular; `DELETE /api/content/series/:id` apaga `Sinalizacao` e `CasoCuradoria` da obra.

- [ ] **Step 1: Testes (falham)**

`tests/backend/curadoriaLgpd.test.js`:
```js
/**
 * Fase 5 Bloco 3, Task 5 — fronteira LGPD e órfãos. A sinalização é dado do
 * LEITOR (export + exclusão dele); casos/sinalizações sobre a obra do ARTISTA
 * não são dado dele (nada no export dele além das MensagemPortal do B1).
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const auth = require('../helpers/auth');

let app, Series, Episode, Channel, User, Sinalizacao, CasoCuradoria, MensagemPortal, svc, L;
const oid = () => new mongoose.Types.ObjectId();
const ADMIN = () => `Bearer ${auth.getToken('admin')}`;

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series'); Episode = require('../../models/Episode'); Channel = require('../../models/Channel');
  User = require('../../models/User'); Sinalizacao = require('../../models/Sinalizacao'); CasoCuradoria = require('../../models/CasoCuradoria');
  MensagemPortal = require('../../models/MensagemPortal');
  svc = require('../../services/curadoriaService'); L = require('../../utils/curadoriaLimiares');
  await auth.createUsers(app);
  await Sinalizacao.init(); await CasoCuradoria.init();
});
afterAll(() => db.closeDatabase());

let n = 0;
async function criarConta(role = 'user') {
  n += 1;
  const email = `lgpd-${n}-${Date.now()}@lorflux.test`; const senha = 'Senha@123';
  const user = await User.create({ email, passwordHash: await bcrypt.hash(senha, 10), nome: `Conta ${n}`, role });
  const login = await request(app).post('/api/auth/login').send({ email, password: senha });
  return { user, id: String(user._id), token: `Bearer ${login.body.accessToken}`, senha };
}
async function criarObraDe(dono, title = 'Obra LGPD 8') {
  const canal = await Channel.create({ ownerId: dono.user._id, name: `Canal ${n} ${Date.now()}` });
  const serie = await Series.create({ title, genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young', channelId: canal._id });
  await Episode.create({ seriesId: serie._id, episode_number: 1, title: 'Cap', status: 'published', panels: [{ image_url: 'https://cdn.exemplo/p.jpg', order: 0 }] });
  return { serie, canal };
}
async function abrirCasoGrave(serieId) {
  await Sinalizacao.insertMany(Array.from({ length: 5 }, (_, i) => ({ seriesId: serieId, userId: oid(), motivo: 'conteudo_proibido', grave: true, valida: true, contaCriadaEm: new Date('2026-01-01T00:00:00Z'), ipHash: `ip${n}${i}` })));
  return svc.avaliarObra(serieId, { agora: new Date('2026-09-12T00:00:00Z') });
}

describe('export do TITULAR', () => {
  it('inclui sinalizacoes {seriesId, titulo, motivo, descricao, createdAt}; título null se a série foi apagada; nunca o caso', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista, 'Titulo Exportado 3');
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'direitos_autorais', descricao: 'minha arte' });
    await svc.flushForTests();
    const apagada = await Series.create({ title: 'Vai Sumir', genre: 'Aventura', content_type: 'hiqua', isPublished: true, content_rating: 'young' });
    await Sinalizacao.create({ seriesId: apagada._id, userId: leitor.id, motivo: 'outro', descricao: 'x', grave: false, valida: false, invalidaMotivo: 'sem_consumo', contaCriadaEm: new Date() });
    await Series.deleteOne({ _id: apagada._id }); // apagada por fora, sem limpeza

    const r = await request(app).get('/api/account/me/export').set('Authorization', leitor.token);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.text);
    expect(body.sinalizacoes).toHaveLength(2);
    const s1 = body.sinalizacoes.find(s => s.titulo === 'Titulo Exportado 3');
    expect(s1).toEqual({ seriesId: String(serie._id), titulo: 'Titulo Exportado 3', motivo: 'direitos_autorais', descricao: 'minha arte', createdAt: expect.any(String) });
    expect(body.sinalizacoes.find(s => s.seriesId === String(apagada._id)).titulo).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/casoId|gatilho|valida|ipHash|contaCriadaEm/);
  });

  it('export do ARTISTA não recebe nada de curadoria (só as MensagemPortal do B1)', async () => {
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista, 'Obra do Artista 6');
    await abrirCasoGrave(serie._id);
    const r = await request(app).get('/api/account/me/export').set('Authorization', artista.token);
    const body = JSON.parse(r.text);
    expect(body.sinalizacoes).toEqual([]);
    expect(body.portalMessages.some(m => String(m.refId) === String(serie._id))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/sinalizacoesRecebidas|casos|gatilho|"S"|prioridade/);
  });
});

describe('DELETE /api/account/me', () => {
  it('apaga as sinalizações do titular (descrições junto) e S cai na próxima avaliação', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'apagar comigo' });
    await svc.flushForTests();
    expect(await Sinalizacao.countDocuments({ userId: leitor.id })).toBe(1);
    const r = await request(app).delete('/api/account/me').set('Authorization', leitor.token).send({ password: leitor.senha });
    expect(r.status).toBe(200);
    expect(await Sinalizacao.countDocuments({ userId: leitor.id })).toBe(0);
  });
});

describe('DELETE /api/content/series/:id (admin)', () => {
  it('apaga Sinalizacao e CasoCuradoria da obra: fila fica sem o caso, badge cai, 0 órfãs no export do leitor', async () => {
    const leitor = await criarConta();
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await request(app).post(`/api/content/series/${serie._id}/sinalizar`).set('Authorization', leitor.token).send({ motivo: 'conteudo_proibido', descricao: 'x' });
    await svc.flushForTests();
    const caso = await abrirCasoGrave(serie._id);
    expect(caso).toBeTruthy();
    const antes = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());

    const r = await request(app).delete(`/api/content/series/${serie._id}`).set('Authorization', ADMIN());
    expect(r.status).toBe(200);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id })).toBe(0);
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(0);
    const fila = await request(app).get('/api/admin/curadoria').set('Authorization', ADMIN());
    expect(fila.body.casos.some(c => c.casoId === String(caso._id))).toBe(false);
    const depois = await request(app).get('/api/admin/aprovacoes').set('Authorization', ADMIN());
    expect(depois.body.curadoria.abertos).toBe(antes.body.curadoria.abertos - 1);
    const exp = JSON.parse((await request(app).get('/api/account/me/export').set('Authorization', leitor.token)).text);
    expect(exp.sinalizacoes.some(s => s.seriesId === String(serie._id))).toBe(false);
  });
});

describe('portal do artista sem vazamento', () => {
  it('GET /portal/series e /portal/meu-estudio não trazem nenhuma chave de curadoria; o aviso conta como não lida', async () => {
    const artista = await criarConta();
    const { serie } = await criarObraDe(artista);
    await abrirCasoGrave(serie._id);
    const series = await request(app).get('/api/portal/series').set('Authorization', artista.token);
    const estudio = await request(app).get('/api/portal/meu-estudio').set('Authorization', artista.token);
    for (const corpo of [JSON.stringify(series.body), JSON.stringify(estudio.body)]) {
      expect(corpo).not.toMatch(/sinalizac|casoId|gatilho|prioridade|curadoria|emRevisao/i);
    }
    // não lidas: a rota do estúdio expõe a contagem de mensagens do editor não lidas (routes/portal.js:68-74)
    expect(JSON.stringify(estudio.body)).toMatch(/aoLidas|naoLidas|unread/i);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (export sem `sinalizacoes`, órfãs sobrando)**

Run: `npx vitest run tests/backend/curadoriaLgpd.test.js`

- [ ] **Step 3: `routes/content.js` DELETE — limpeza**

No `Promise.all` das linhas 269-274, acrescentar duas entradas (a série continua sendo apagada por ÚLTIMO):
```js
      // Fase 5 Bloco 3: sinalizações e casos da obra — sem isto, caso órfão
      // fica eterno na fila (obra null) e a sinalização vaza no export do
      // leitor apontando para série inexistente (o mesmo bug dos votos acima).
      require('../models/Sinalizacao').deleteMany({ seriesId: req.params.id }),
      require('../models/CasoCuradoria').deleteMany({ seriesId: req.params.id }),
```

- [ ] **Step 4: `routes/account.js` — export e exclusão**

No topo, junto dos requires de models: `const Sinalizacao = require('../models/Sinalizacao');`

No `Promise.all` do export (linhas 92-110), acrescentar ao array destructurado `sinalizacoes` como último elemento e a query:
```js
      // Fase 5 Bloco 3 (LGPD): sinalizações do TITULAR — só as dele, nunca o
      // caso (o caso é da obra, não do leitor). populate de título: série
      // apagada vira null (padrão superReaderContributions acima).
      Sinalizacao.find({ userId: req.user.id }).select('seriesId motivo descricao createdAt').populate('seriesId', 'title').lean(),
```
No `payload`, após `portalMessages`:
```js
      sinalizacoes: sinalizacoes.map(s => ({
        seriesId: s.seriesId ? String(s.seriesId._id ?? s.seriesId) : null,
        titulo: s.seriesId?.title ?? null,
        motivo: s.motivo,
        descricao: s.descricao ?? null,
        createdAt: s.createdAt,
      })),
```
Atenção: `populate` de série apagada devolve `seriesId: null` — por isso o `seriesId` exportado nesse caso é `null`; para manter o id da série apagada (o teste exige `seriesId === String(apagada._id)` com `titulo null`), NÃO use populate: faça duas queries —
```js
      Sinalizacao.find({ userId: req.user.id }).select('seriesId motivo descricao createdAt').lean(),
```
e, depois do `Promise.all`:
```js
    const titulosSinalizadas = sinalizacoes.length
      ? new Map((await Series.find({ _id: { $in: sinalizacoes.map(s => s.seriesId) } }).select('title').lean()).map(s => [String(s._id), s.title]))
      : new Map();
```
com o mapeamento `seriesId: String(s.seriesId), titulo: titulosSinalizadas.get(String(s.seriesId)) ?? null`. (Confira que `Series` já é importado em `routes/account.js`; se não for, importe.)

No `Promise.all` do `DELETE /me` (linhas 299-329), acrescentar:
```js
      // Fase 5 Bloco 3 (LGPD): sinalizações são dado do leitor — apagadas com
      // a conta (descrição junto). S da obra recalcula na próxima avaliação.
      Sinalizacao.deleteMany({ userId }),
```

- [ ] **Step 5: Rodar + vizinhos + suite + commit**

Run: `npx vitest run tests/backend/curadoriaLgpd.test.js tests/backend/accountPortalLgpd.test.js tests/backend/content.test.js tests/backend/portalCrud.test.js` — Expected: PASS. Depois `npx vitest run tests/backend`.
```bash
git add routes/content.js routes/account.js tests/backend/curadoriaLgpd.test.js
git commit -m "feat(curadoria): limpeza de orfaos, export e exclusao LGPD das sinalizacoes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Frontend do leitor — `SinalizarButton` nos 3 modais, i18n ×4, `api.ts`

**Files:**
- Create: `components/SinalizarButton.tsx`
- Modify: `components/HQCine.tsx:277`, `components/VFilm.tsx` (linha do `<SuperReaderButton`), `components/HiQua.tsx` (idem) — inserir `<SinalizarButton user={user} seriesId={selectedSeries._id} />` logo APÓS `<SuperReaderButton .../>`
- Modify: `services/api.ts:209-214` (`construirErro` += `code`) e fim da classe (2 métodos novos)
- Modify: `i18n/translations.ts` (chaves `sinalizar.*` nos 4 blocos `pt`/`en`/`es`/`zh`)
- Test: `tests/frontend/sinalizarButton.test.tsx`

**Interfaces:**
- Consumes: Task 3 (rotas do leitor).
- Produces: `api.sinalizarSerie(id, { motivo, descricao? }): Promise<{ jaSinalizada: boolean }>`; `api.getMinhaSinalizacao(id): Promise<{ jaSinalizada: boolean; motivo: string|null }>`; erros da API carregam `error.code` quando o backend manda `code`.

- [ ] **Step 1: Teste do componente (falha: componente não existe)**

`tests/frontend/sinalizarButton.test.tsx`:
```tsx
/**
 * Fase 5 Bloco 3, Task 6 — SinalizarButton (modal de detalhe dos 3 feeds).
 * Mesma técnica de tests/frontend/superReaderButton.test.tsx (mock de
 * services/api). Regra 8: nenhuma contagem aparece em lugar nenhum.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { getMinhaSinalizacao: vi.fn(), sinalizarSerie: vi.fn() },
}));

import { api } from '../../services/api';
import SinalizarButton from '../../components/SinalizarButton';

const user: any = { id: 'u1', email: 'a@a.com', nome: 'Ana', isPremium: false, role: 'user', provider: 'local', criadoEm: '', followingChannelIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMinhaSinalizacao).mockResolvedValue({ jaSinalizada: false, motivo: null });
});
afterEach(() => cleanup());

describe('SinalizarButton', () => {
  it('guest: botão desabilitado e nenhuma consulta à API', () => {
    render(<SinalizarButton user={null} seriesId="s1" />);
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeDisabled();
    expect(api.getMinhaSinalizacao).not.toHaveBeenCalled();
  });

  it('logado: consulta o próprio estado ao montar; 404/erro = sem estado (botão habilitado, sem alerta)', async () => {
    vi.mocked(api.getMinhaSinalizacao).mockRejectedValue(Object.assign(new Error('Série não encontrada.'), { status: 404 }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    await waitFor(() => expect(api.getMinhaSinalizacao).toHaveBeenCalledWith('s1'));
    expect(screen.getByRole('button', { name: /SINALIZAR CONTEÚDO/ })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('já sinalizada: botão em estado "SINALIZADA", desabilitado, sem número algum', async () => {
    vi.mocked(api.getMinhaSinalizacao).mockResolvedValue({ jaSinalizada: true, motivo: 'spam_ou_enganoso' });
    render(<SinalizarButton user={user} seriesId="s1" />);
    const btn = await screen.findByRole('button', { name: /SINALIZADA/ });
    expect(btn).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/\d/);
  });

  it('abre o painel com os 6 motivos, texto de anonimato, e "outro" exige descrição antes de enviar', async () => {
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    expect(screen.getByText(/anônima para o autor/)).toBeInTheDocument();
    const select = screen.getByLabelText(/Motivo/) as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.value)).toEqual(['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro']);
    expect(Array.from(select.options).map(o => o.textContent)).not.toContain('Violência excessiva');

    fireEvent.change(select, { target: { value: 'outro' } });
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(api.sinalizarSerie).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Descreva/);
  });

  it('envia {motivo, descricao} e passa ao estado SINALIZADA com agradecimento (sem contagem)', async () => {
    vi.mocked(api.sinalizarSerie).mockResolvedValue({ jaSinalizada: false });
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'direitos_autorais' } });
    fireEvent.change(screen.getByPlaceholderText(/Descreva/), { target: { value: 'Arte copiada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    await waitFor(() => expect(api.sinalizarSerie).toHaveBeenCalledWith('s1', { motivo: 'direitos_autorais', descricao: 'Arte copiada.' }));
    expect(await screen.findByRole('button', { name: /SINALIZADA/ })).toBeDisabled();
    expect(screen.getByText(/Sinalização enviada/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d/);
  });

  it('erro code propria_obra mostra a mensagem própria; erro genérico mostra o fallback', async () => {
    vi.mocked(api.sinalizarSerie).mockRejectedValueOnce(Object.assign(new Error('Você não pode sinalizar a própria obra.'), { status: 400, code: 'propria_obra' }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/própria obra/);

    vi.mocked(api.sinalizarSerie).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível enviar/);
  });

  it('duplo clique não envia duas vezes', async () => {
    let resolver: (v: any) => void = () => {};
    vi.mocked(api.sinalizarSerie).mockImplementation(() => new Promise(r => { resolver = r; }));
    render(<SinalizarButton user={user} seriesId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: /SINALIZAR CONTEÚDO/ }));
    const enviar = screen.getByRole('button', { name: 'ENVIAR' });
    fireEvent.click(enviar); fireEvent.click(enviar);
    expect(api.sinalizarSerie).toHaveBeenCalledTimes(1);
    resolver({ jaSinalizada: false });
  });
});
```

- [ ] **Step 2: Rodar (PowerShell) — deve falhar**

Run: `npx vitest run tests/frontend/sinalizarButton.test.tsx`

- [ ] **Step 3: i18n — chaves `sinalizar.*` nos 4 blocos de `i18n/translations.ts`**

No bloco `pt` (após as chaves `superReader.*`, linha ~142):
```ts
  'sinalizar.cta': 'SINALIZAR CONTEÚDO',
  'sinalizar.done': 'SINALIZADA',
  'sinalizar.title': 'Sinalizar conteúdo',
  'sinalizar.explain': 'Sua sinalização é anônima para o autor e para outros leitores; o editor vai avaliar.',
  'sinalizar.motivoLabel': 'Motivo',
  'sinalizar.motivo.conteudo_inadequado_faixa': 'Conteúdo não condiz com a classificação etária',
  'sinalizar.motivo.discurso_de_odio': 'Discurso de ódio',
  'sinalizar.motivo.spam_ou_enganoso': 'Spam ou conteúdo enganoso',
  'sinalizar.motivo.direitos_autorais': 'Violação de direitos autorais',
  'sinalizar.motivo.conteudo_proibido': 'Conteúdo proibido',
  'sinalizar.motivo.outro': 'Outro',
  'sinalizar.descricaoPlaceholder': 'Descreva o problema (opcional)',
  'sinalizar.descricaoObrigatoria': 'Descreva o motivo para continuar.',
  'sinalizar.submit': 'ENVIAR',
  'sinalizar.cancel': 'CANCELAR',
  'sinalizar.thanks': 'Sinalização enviada. Obrigado por ajudar a cuidar do Lorflux.',
  'sinalizar.propriaObra': 'Você não pode sinalizar a própria obra.',
  'sinalizar.genericError': 'Não foi possível enviar sua sinalização agora. Tente novamente.',
```
No bloco `en`:
```ts
  'sinalizar.cta': 'FLAG CONTENT',
  'sinalizar.done': 'FLAGGED',
  'sinalizar.title': 'Flag content',
  'sinalizar.explain': 'Your flag is anonymous to the author and to other readers; the editor will review it.',
  'sinalizar.motivoLabel': 'Reason',
  'sinalizar.motivo.conteudo_inadequado_faixa': 'Content does not match the age rating',
  'sinalizar.motivo.discurso_de_odio': 'Hate speech',
  'sinalizar.motivo.spam_ou_enganoso': 'Spam or misleading content',
  'sinalizar.motivo.direitos_autorais': 'Copyright violation',
  'sinalizar.motivo.conteudo_proibido': 'Prohibited content',
  'sinalizar.motivo.outro': 'Other',
  'sinalizar.descricaoPlaceholder': 'Describe the problem (optional)',
  'sinalizar.descricaoObrigatoria': 'Describe the reason to continue.',
  'sinalizar.submit': 'SEND',
  'sinalizar.cancel': 'CANCEL',
  'sinalizar.thanks': 'Flag sent. Thanks for helping take care of Lorflux.',
  'sinalizar.propriaObra': 'You cannot flag your own work.',
  'sinalizar.genericError': 'Could not send your flag right now. Please try again.',
```
No bloco `es`:
```ts
  'sinalizar.cta': 'SEÑALAR CONTENIDO',
  'sinalizar.done': 'SEÑALADA',
  'sinalizar.title': 'Señalar contenido',
  'sinalizar.explain': 'Tu señalización es anónima para el autor y para otros lectores; el editor la evaluará.',
  'sinalizar.motivoLabel': 'Motivo',
  'sinalizar.motivo.conteudo_inadequado_faixa': 'El contenido no coincide con la clasificación por edad',
  'sinalizar.motivo.discurso_de_odio': 'Discurso de odio',
  'sinalizar.motivo.spam_ou_enganoso': 'Spam o contenido engañoso',
  'sinalizar.motivo.direitos_autorais': 'Violación de derechos de autor',
  'sinalizar.motivo.conteudo_proibido': 'Contenido prohibido',
  'sinalizar.motivo.outro': 'Otro',
  'sinalizar.descricaoPlaceholder': 'Describe el problema (opcional)',
  'sinalizar.descricaoObrigatoria': 'Describe el motivo para continuar.',
  'sinalizar.submit': 'ENVIAR',
  'sinalizar.cancel': 'CANCELAR',
  'sinalizar.thanks': 'Señalización enviada. Gracias por ayudar a cuidar Lorflux.',
  'sinalizar.propriaObra': 'No puedes señalar tu propia obra.',
  'sinalizar.genericError': 'No fue posible enviar tu señalización ahora. Inténtalo de nuevo.',
```
No bloco `zh`:
```ts
  'sinalizar.cta': '举报内容',
  'sinalizar.done': '已举报',
  'sinalizar.title': '举报内容',
  'sinalizar.explain': '你的举报对作者和其他读者匿名；编辑会进行审核。',
  'sinalizar.motivoLabel': '原因',
  'sinalizar.motivo.conteudo_inadequado_faixa': '内容与年龄分级不符',
  'sinalizar.motivo.discurso_de_odio': '仇恨言论',
  'sinalizar.motivo.spam_ou_enganoso': '垃圾或误导性内容',
  'sinalizar.motivo.direitos_autorais': '侵犯版权',
  'sinalizar.motivo.conteudo_proibido': '违禁内容',
  'sinalizar.motivo.outro': '其他',
  'sinalizar.descricaoPlaceholder': '描述问题（可选）',
  'sinalizar.descricaoObrigatoria': '请描述原因后再继续。',
  'sinalizar.submit': '发送',
  'sinalizar.cancel': '取消',
  'sinalizar.thanks': '举报已发送。感谢你帮助维护 Lorflux。',
  'sinalizar.propriaObra': '你不能举报自己的作品。',
  'sinalizar.genericError': '现在无法发送举报，请稍后再试。',
```
(`en/es/zh` são `Record<keyof typeof pt, string>` — chave faltando em qualquer bloco quebra o `tsc`.)

- [ ] **Step 4: `services/api.ts` — `code` no erro + 2 métodos**

Em `construirErro` (linha 209-214), após `error.status = status;`:
```ts
        // Fase 5 Bloco 3: código de negócio (ex.: 'propria_obra') — a UI
        // escolhe a mensagem i18n por ele, não pelo texto PT do servidor.
        if (body.code) error.code = body.code;
```
Antes do fechamento da classe (após `confirmarRecuperacaoPin`):
```ts
  // ─── Fase 5 Bloco 3: sinalização de conteúdo (leitor) ─────────────────────
  // Shapes reais de routes/sinalizacao.js. Nunca devolvem contagens (regra 8
  // do Vin) — só o estado do PRÓPRIO usuário.
  async getMinhaSinalizacao(seriesId: string) {
    return this.request<{ jaSinalizada: boolean; motivo: string | null }>(`/content/series/${seriesId}/sinalizacao`);
  }

  async sinalizarSerie(seriesId: string, data: { motivo: string; descricao?: string }) {
    return this.request<{ jaSinalizada: boolean }>(`/content/series/${seriesId}/sinalizar`, { method: 'POST', body: JSON.stringify(data) });
  }
```

- [ ] **Step 5: Implementar `components/SinalizarButton.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import { useCamadaVoltar } from '../utils/pilhaVoltar';
import { User } from '../types';

// Vocabulário FECHADO do backend (utils/curadoriaLimiares.js MOTIVOS) — a
// ordem é a do select. `outro` exige descrição (o backend devolve 400 sem ela;
// a UI barra antes para não gastar a chamada).
const MOTIVOS = ['conteudo_inadequado_faixa', 'discurso_de_odio', 'spam_ou_enganoso', 'direitos_autorais', 'conteudo_proibido', 'outro'] as const;
type Motivo = typeof MOTIVOS[number];
const DESCRICAO_MAX = 500;

interface SinalizarButtonProps {
  user: User | null;
  seriesId: string;
}

/**
 * "Sinalizar conteúdo" (Fase 5 Bloco 3) — ao lado do Super Reader no modal de
 * detalhe dos 3 feeds. Guest: botão desabilitado (padrão do favoritar/curtir
 * nesses modais — não o convite de login do SuperReaderButton). Regra 8 do
 * Vin: este componente NUNCA mostra quantas sinalizações a obra tem — só se
 * o próprio usuário já sinalizou. 404 ao consultar o estado (obra
 * despublicada/invisível) = sem estado, sem alerta.
 */
const SinalizarButton: React.FC<SinalizarButtonProps> = ({ user, seriesId }) => {
  const t = useT();
  const [jaSinalizada, setJaSinalizada] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<Motivo>(MOTIVOS[0]);
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  // Lock síncrono contra duplo clique — mesma técnica de SuperReaderButton.
  const lockRef = useRef(false);

  useCamadaVoltar(aberto, () => setAberto(false));

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    api.getMinhaSinalizacao(seriesId)
      .then(r => { if (!cancelado) setJaSinalizada(!!r.jaSinalizada); })
      .catch(() => { /* 404/erro: sem estado */ });
    return () => { cancelado = true; };
  }, [user, seriesId]);

  const handleEnviar = async () => {
    if (lockRef.current) return;
    const desc = descricao.trim();
    if (motivo === 'outro' && !desc) {
      setErro(t('sinalizar.descricaoObrigatoria'));
      return;
    }
    lockRef.current = true;
    setEnviando(true);
    setErro(null);
    try {
      await api.sinalizarSerie(seriesId, desc ? { motivo, descricao: desc } : { motivo });
      setJaSinalizada(true);
      setEnviada(true);
      setAberto(false);
    } catch (e: any) {
      setErro(e?.code === 'propria_obra' ? t('sinalizar.propriaObra') : t('sinalizar.genericError'));
    } finally {
      lockRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <div data-testid="sinalizar-button">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        disabled={!user || jaSinalizada}
        className={`px-5 py-5 rounded-2xl border transition-all flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50 ${jaSinalizada ? 'border-white/10 bg-white/5 text-zinc-400' : 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
      >
        <Flag size={18} fill={jaSinalizada ? 'currentColor' : 'none'} />
        {jaSinalizada ? t('sinalizar.done') : t('sinalizar.cta')}
      </button>

      {enviada && <p className="mt-3 max-w-md text-sm text-emerald-400">{t('sinalizar.thanks')}</p>}

      {aberto && user && !jaSinalizada && (
        <div className="mt-4 max-w-md bg-white/5 border border-white/10 rounded-3xl p-6">
          <p className="text-white font-black mb-1">{t('sinalizar.title')}</p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">{t('sinalizar.explain')}</p>

          <label htmlFor={`sinalizar-motivo-${seriesId}`} className="block text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-2">{t('sinalizar.motivoLabel')}</label>
          <select
            id={`sinalizar-motivo-${seriesId}`}
            value={motivo}
            onChange={e => { setMotivo(e.target.value as Motivo); setErro(null); }}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm mb-3 outline-none focus:border-rose-500/50"
          >
            {MOTIVOS.map(m => <option key={m} value={m}>{t(`sinalizar.motivo.${m}` as any)}</option>)}
          </select>

          <textarea
            value={descricao}
            maxLength={DESCRICAO_MAX}
            onChange={e => { setDescricao(e.target.value); setErro(null); }}
            placeholder={t('sinalizar.descricaoPlaceholder')}
            rows={3}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm mb-3 outline-none focus:border-rose-500/50"
          />

          {erro && <p role="alert" className="text-rose-500 text-xs mb-3">{erro}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => setAberto(false)} className="flex-1 py-4 bg-white/5 text-zinc-300 font-black rounded-2xl text-xs uppercase tracking-widest">{t('sinalizar.cancel')}</button>
            <button type="button" onClick={handleEnviar} disabled={enviando} className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest disabled:opacity-50">{t('sinalizar.submit')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SinalizarButton;
```

- [ ] **Step 6: Inserir nos 3 feeds**

Em `components/HQCine.tsx` (linha 277), `components/VFilm.tsx` e `components/HiQua.tsx` (mesma linha de ações do modal — localize `<SuperReaderButton user={user} seriesId={selectedSeries._id} />`): adicionar o import `import SinalizarButton from './SinalizarButton';` e, logo após o `<SuperReaderButton ... />`:
```tsx
                  <SinalizarButton user={user} seriesId={selectedSeries._id} />
```

- [ ] **Step 7: Rodar (PowerShell): teste novo + suíte frontend + tsc**

Run: `npx vitest run tests/frontend/sinalizarButton.test.tsx` → PASS; `npx tsc --noEmit` → limpo; `npx vitest run tests/frontend` → verde (os testes de feed `feedsRecommendations`/`feedChannelAndDescription` montam os 3 feeds — se algum quebrar por `api.getMinhaSinalizacao` não mockado, adicione `getMinhaSinalizacao: vi.fn().mockResolvedValue({ jaSinalizada: false, motivo: null })` ao mock de `api` DAQUELE teste — o componente também tolera rejeição).

- [ ] **Step 8: Commit**

```bash
git add components/SinalizarButton.tsx components/HQCine.tsx components/VFilm.tsx components/HiQua.tsx services/api.ts i18n/translations.ts tests/frontend/sinalizarButton.test.tsx
git commit -m "feat(curadoria): botao Sinalizar conteudo nos 3 modais de feed com i18n" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Frontend do admin — `CuradoriaPanel`, aba + badge "Curadoria", card de obra removida na Fila de Aprovação

**Files:**
- Create: `components/Admin/CuradoriaPanel.tsx`
- Modify: `types.ts:73-74` (+ `ADMIN_CURADORIA`)
- Modify: `components/Admin/AdminDashboard.tsx:15` (import), `:72` (state), `:301-306` (refetch), `:943` (SidebarLink), `:1581-1583` (render)
- Modify: `components/Admin/AprovacoesPanel.tsx:17-32` (interface) e `:185` (aviso no card)
- Modify: `services/api.ts:995-1000` (tipo de `getAdminAprovacoes`) e fim da classe (5 métodos)
- Test: `tests/frontend/adminCuradoriaPanel.test.tsx`; += casos em `tests/frontend/adminDashboardAprovacoesBadge.test.tsx` e `tests/frontend/adminAprovacoesPanel.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`GET /admin/curadoria`, 4 ações, `curadoria`/`removidaPelaCuradoria` em `/admin/aprovacoes`).
- Produces: `api.getAdminCuradoria(status?: 'abertos'|'fechado')`, `api.curadoriaAprovar(casoId, { observacao?, abuso? })`, `api.curadoriaReclassificar(casoId, { content_rating, observacao? })`, `api.curadoriaSolicitarCorrecao(casoId, { texto })`, `api.curadoriaRemover(casoId, { motivo, observacao? })`; `ViewMode.ADMIN_CURADORIA`; `CuradoriaPanel` com prop `onChange?: () => void` (chamado após cada ação para o dashboard refazer os badges).

- [ ] **Step 1: Testes (falham)**

`tests/frontend/adminCuradoriaPanel.test.tsx`:
```tsx
/**
 * Fase 5 Bloco 3, Task 7 — CuradoriaPanel (admin, PT fixo). Regra 8: o admin
 * vê números e descrições anonimizadas, nunca identidades; regra 1: as 4
 * ações são explícitas, "Remover" exige motivo e confirmação.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getAdminCuradoria: vi.fn(),
    curadoriaAprovar: vi.fn(),
    curadoriaReclassificar: vi.fn(),
    curadoriaSolicitarCorrecao: vi.fn(),
    curadoriaRemover: vi.fn(),
  },
}));

import { api } from '../../services/api';
import CuradoriaPanel from '../../components/Admin/CuradoriaPanel';

const caso = (over: any = {}) => ({
  casoId: 'c1', status: 'aberto', prioridade: 'normal', abertoEm: '2026-09-04T12:00:00.000Z',
  obra: { id: 's1', title: 'Obra Fila 7', cover_image: null, content_type: 'hiqua', content_rating: 'young', tags: ['romance'], isPublished: true },
  canal: { id: 'ch1', name: 'Canal Um' }, canalId: 'ch1',
  gatilho: { tipo: 'pequena', S: 23, V: 41, limiar: 20 }, resumoMotivos: { spam_ou_enganoso: 21, outro: 2 },
  contagem: { S: 23, S_grave: 0, V: 41, limiar: 20, semConsumo: 4, contasRecentes: 3, ipsDistintos: 19 },
  descricoes: [{ motivo: 'outro', descricao: 'Parece cópia.', createdAt: '2026-09-04T11:00:00.000Z' }],
  thread: [{ autorTipo: 'editor', texto: 'Sua obra recebeu sinalizações.', refId: 's1', createdAt: '2026-09-04T12:00:00.000Z' }, { autorTipo: 'ilustrador', texto: 'Minha defesa.', refId: null, createdAt: '2026-09-04T13:00:00.000Z' }],
  avisoArtista: 'enviado', decisao: null, motivoDecisao: null, observacao: null, decididoPor: null, decisaoEm: null, sinalizacoesAbusivas: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [caso({ casoId: 'g1', prioridade: 'grave', obra: { ...caso().obra, id: 'g', title: 'Grave Primeiro 9' }, contagem: { ...caso().contagem, S_grave: 6 } }), caso()], total: 2, graves: 1 } as any);
});
afterEach(() => cleanup());

describe('CuradoriaPanel', () => {
  it('lista os casos na ordem do backend (grave primeiro), com números, motivos, descrições e thread — sem identidades', async () => {
    render(<CuradoriaPanel />);
    const titulos = await screen.findAllByRole('heading', { level: 3 });
    expect(titulos[0]).toHaveTextContent('Grave Primeiro 9');
    expect(screen.getAllByText(/GRAVE/).length).toBeGreaterThan(0);
    const card = screen.getByText('Obra Fila 7').closest('[data-testid="caso-card"]') as HTMLElement;
    expect(within(card).getByText(/23 \/ 20/)).toBeInTheDocument();       // S / limiar
    expect(within(card).getByText(/41 visualizações únicas/)).toBeInTheDocument();
    expect(within(card).getByText(/4 sem consumo/)).toBeInTheDocument();
    expect(within(card).getByText(/3 contas recentes/)).toBeInTheDocument();
    expect(within(card).getByText(/19 IPs distintos/)).toBeInTheDocument();
    expect(within(card).getByText(/Spam ou conteúdo enganoso/)).toBeInTheDocument();
    expect(within(card).getByText('Parece cópia.')).toBeInTheDocument();
    expect(within(card).getByText('Minha defesa.')).toBeInTheDocument();
    expect(within(card).getByText(/Ilustrador/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/@|userId/);
  });

  it('Aprovar envia {abuso} conforme a checkbox e chama onChange + refetch', async () => {
    vi.mocked(api.curadoriaAprovar).mockResolvedValue({ caso: {} } as any);
    const onChange = vi.fn();
    render(<CuradoriaPanel onChange={onChange} />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByLabelText(/Sinalizações abusivas/));
    fireEvent.click(within(card).getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(api.curadoriaAprovar).toHaveBeenCalledWith('c1', { abuso: true }));
    expect(onChange).toHaveBeenCalled();
    expect(api.getAdminCuradoria).toHaveBeenCalledTimes(2);
  });

  it('Reclassificar exige escolher o rating e envia {content_rating}', async () => {
    vi.mocked(api.curadoriaReclassificar).mockResolvedValue({ caso: {} } as any);
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    const btn = within(card).getByRole('button', { name: /Reclassificar/ });
    expect(btn).toBeDisabled();
    fireEvent.change(within(card).getByLabelText(/Nova classificação/), { target: { value: 'teen' } });
    fireEvent.click(btn);
    await waitFor(() => expect(api.curadoriaReclassificar).toHaveBeenCalledWith('c1', { content_rating: 'teen' }));
  });

  it('Solicitar correção abre modal com textarea (aviso de não colar sinalizações) e envia {texto}', async () => {
    vi.mocked(api.curadoriaSolicitarCorrecao).mockResolvedValue({ caso: {} } as any);
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Solicitar correção/ }));
    expect(screen.getByText(/não cole trechos das sinalizações/i)).toBeInTheDocument();
    const confirmar = screen.getByRole('button', { name: /Enviar pedido/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/ajuste/i), { target: { value: 'Troque a capa.' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.curadoriaSolicitarCorrecao).toHaveBeenCalledWith('c1', { texto: 'Troque a capa.' }));
  });

  it('Remover exige motivo e confirmação; envia {motivo}; erro da API aparece no card', async () => {
    vi.mocked(api.curadoriaRemover).mockRejectedValueOnce(new Error('Caso já fechado.'));
    render(<CuradoriaPanel />);
    const card = (await screen.findByText('Obra Fila 7')).closest('[data-testid="caso-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Remover$/ }));
    const confirmar = screen.getByRole('button', { name: /Confirmar remoção/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Motivo/), { target: { value: 'Cópia confirmada.' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.curadoriaRemover).toHaveBeenCalledWith('c1', { motivo: 'Cópia confirmada.' }));
    expect(await screen.findByText('Caso já fechado.')).toBeInTheDocument();
  });

  it('aba Histórico chama getAdminCuradoria("fechado") e mostra decisão/motivo', async () => {
    render(<CuradoriaPanel />);
    await screen.findByText('Obra Fila 7');
    vi.mocked(api.getAdminCuradoria).mockResolvedValueOnce({ casos: [caso({ status: 'fechado', decisao: 'remover', motivoDecisao: 'Cópia.', decisaoEm: '2026-09-05T10:00:00.000Z' })], total: 1, graves: 0 } as any);
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    await waitFor(() => expect(api.getAdminCuradoria).toHaveBeenLastCalledWith('fechado'));
    expect(await screen.findByText(/Removida/)).toBeInTheDocument();
    expect(screen.getByText(/Cópia\./)).toBeInTheDocument();
  });

  it('fila vazia mostra o estado vazio', async () => {
    vi.mocked(api.getAdminCuradoria).mockResolvedValue({ casos: [], total: 0, graves: 0 } as any);
    render(<CuradoriaPanel />);
    expect(await screen.findByText(/Nenhum caso aberto/)).toBeInTheDocument();
  });
});
```

Em `tests/frontend/adminDashboardAprovacoesBadge.test.tsx`, dentro do `describe` existente:
```tsx
  it('Fase 5 Bloco 3: badge "Curadoria" vem de r.curadoria.abertos da MESMA resposta; sem o campo -> 0', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [], naoClassificadas: 0, curadoria: { abertos: 3, graves: 1 } } as any);
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={noop} />);
    const link = await screen.findByText('Curadoria');
    await waitFor(() => expect(link.closest('button')).toHaveTextContent('3'));
  });

  it('clicar em "Curadoria" navega para ADMIN_CURADORIA', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({ itens: [] } as any);
    const setSubView = vi.fn();
    render(<AdminDashboard onLogout={noop} currentSubView={ViewMode.ADMIN_DASHBOARD} setSubView={setSubView} />);
    fireEvent.click(await screen.findByText('Curadoria'));
    expect(setSubView).toHaveBeenCalledWith(ViewMode.ADMIN_CURADORIA);
  });
```

Em `tests/frontend/adminAprovacoesPanel.test.tsx` (use o mock/fixture de item de série já existente no arquivo):
```tsx
  it('Fase 5 Bloco 3: item com removidaPelaCuradoria mostra o aviso com data e motivo; sem ele, nada', async () => {
    vi.mocked(api.getAdminAprovacoes).mockResolvedValue({
      itens: [
        { tipo: 'series', id: 's-rem', title: 'Reenviada 2', tags: [], submittedAt: '2026-09-13T10:00:00.000Z', removidaPelaCuradoria: { decisaoEm: '2026-09-05T10:00:00.000Z', motivo: 'Cópia de terceiro.' } },
        { tipo: 'series', id: 's-ok', title: 'Limpa 1', tags: [], submittedAt: '2026-09-13T11:00:00.000Z', removidaPelaCuradoria: null },
      ],
      naoClassificadas: 0,
    } as any);
    render(<AprovacoesPanel />);
    const aviso = await screen.findByText(/Removida pela curadoria em/);
    expect(aviso).toHaveTextContent('Cópia de terceiro.');
    expect(screen.getAllByText(/Removida pela curadoria/)).toHaveLength(1);
  });
```

- [ ] **Step 2: Rodar (PowerShell) — devem falhar**

Run: `npx vitest run tests/frontend/adminCuradoriaPanel.test.tsx tests/frontend/adminDashboardAprovacoesBadge.test.tsx tests/frontend/adminAprovacoesPanel.test.tsx`

- [ ] **Step 3: `types.ts` e `services/api.ts`**

`types.ts` após a linha 74 (`ADMIN_CANAIS = 'ADMIN_CANAIS'` — acrescente a vírgula):
```ts
  ADMIN_CANAIS = 'ADMIN_CANAIS',
  // Fase 5 Bloco 3: Fila de Revisão da curadoria.
  ADMIN_CURADORIA = 'ADMIN_CURADORIA'
```

`services/api.ts`: no método `getAdminAprovacoes` (linha ~995), estenda o tipo de retorno com `curadoria?: { abertos: number; graves: number }` e, no tipo do item, `removidaPelaCuradoria?: { decisaoEm: string; motivo: string | null } | null`. Antes do fechamento da classe:
```ts
  // ─── Fase 5 Bloco 3: Fila de Revisão (admin) — shapes de routes/adminCuradoria.js
  async getAdminCuradoria(status: 'abertos' | 'fechado' = 'abertos') {
    return this.request<{ casos: any[]; total: number; graves: number }>(`/admin/curadoria?status=${status}`);
  }
  async curadoriaAprovar(casoId: string, data: { observacao?: string; abuso?: boolean } = {}) {
    return this.request<{ caso: any }>(`/admin/curadoria/${casoId}/aprovar`, { method: 'POST', body: JSON.stringify(data) });
  }
  async curadoriaReclassificar(casoId: string, data: { content_rating: 'kids' | 'teen' | 'young'; observacao?: string }) {
    return this.request<{ caso: any }>(`/admin/curadoria/${casoId}/reclassificar`, { method: 'POST', body: JSON.stringify(data) });
  }
  async curadoriaSolicitarCorrecao(casoId: string, data: { texto: string }) {
    return this.request<{ caso: any }>(`/admin/curadoria/${casoId}/solicitar-correcao`, { method: 'POST', body: JSON.stringify(data) });
  }
  async curadoriaRemover(casoId: string, data: { motivo: string; observacao?: string }) {
    return this.request<{ caso: any }>(`/admin/curadoria/${casoId}/remover`, { method: 'POST', body: JSON.stringify(data) });
  }
```

- [ ] **Step 4: `components/Admin/CuradoriaPanel.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, Tag, MessageSquare, EyeOff, X } from 'lucide-react';
import { api } from '../../services/api';
import ImageWithFallback from '../ImageWithFallback';

/**
 * Fila de Revisão da curadoria (Fase 5 Bloco 3) — admin, PT fixo (padrão do
 * AdminDashboard). Consome GET /admin/curadoria e as 4 ações de
 * routes/adminCuradoria.js. Regra 8 do Vin: o curador vê NÚMEROS e
 * descrições anonimizadas — nunca quem sinalizou. `onChange` avisa o
 * AdminDashboard para refazer os badges (mesmo papel do onCountChange do
 * AprovacoesPanel).
 */

interface Contagem { S: number; S_grave: number; V: number; limiar: number; semConsumo: number; contasRecentes: number; ipsDistintos: number }
interface ItemCaso {
  casoId: string; status: 'aberto' | 'aguardando_artista' | 'fechado'; prioridade: 'normal' | 'grave'; abertoEm: string;
  obra: { id: string; title: string; cover_image: string | null; content_type: string; content_rating: string | null; tags: string[]; isPublished: boolean } | null;
  canal: { id: string; name: string | null } | null; canalId: string | null;
  gatilho: { tipo: string; S: number; V: number; limiar: number }; resumoMotivos: Record<string, number>; contagem: Contagem;
  descricoes: { motivo: string; descricao: string; createdAt: string }[];
  thread: { autorTipo: 'editor' | 'ilustrador'; texto: string; refId: string | null; createdAt: string }[];
  avisoArtista: 'pendente' | 'enviado' | 'sem_canal' | 'falhou';
  decisao: string | null; motivoDecisao: string | null; observacao: string | null; decididoPor: string | null; decisaoEm: string | null; sinalizacoesAbusivas: boolean;
}

const ROTULO_MOTIVO: Record<string, string> = {
  conteudo_inadequado_faixa: 'Não condiz com a classificação etária', discurso_de_odio: 'Discurso de ódio', spam_ou_enganoso: 'Spam ou conteúdo enganoso',
  direitos_autorais: 'Direitos autorais', conteudo_proibido: 'Conteúdo proibido', outro: 'Outro',
};
const ROTULO_RATING: Record<string, string> = { kids: 'Kids', teen: 'Teen', young: 'Young' };
const ROTULO_DECISAO: Record<string, string> = { aprovar: 'Mantida', reclassificar: 'Reclassificada', solicitar_correcao: 'Correção solicitada', remover: 'Removida (despublicada)' };
const AVISO_TEXTAREA = 'Não cole trechos das sinalizações: o artista não pode identificar quem sinalizou.';

interface CuradoriaPanelProps { onChange?: () => void }

const CuradoriaPanel: React.FC<CuradoriaPanelProps> = ({ onChange }) => {
  const [aba, setAba] = useState<'abertos' | 'fechado'>('abertos');
  const [casos, setCasos] = useState<ItemCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [erroPorCaso, setErroPorCaso] = useState<Record<string, string>>({});
  const [abusoPorCaso, setAbusoPorCaso] = useState<Record<string, boolean>>({});
  const [ratingPorCaso, setRatingPorCaso] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ tipo: 'correcao' | 'remover'; caso: ItemCaso } | null>(null);
  const [textoModal, setTextoModal] = useState('');

  const load = async (qual = aba) => {
    setLoading(true);
    try {
      const r = await api.getAdminCuradoria(qual);
      setCasos(r.casos as ItemCaso[]);
    } catch {
      setCasos([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(aba); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [aba]);

  const executar = async (caso: ItemCaso, fn: () => Promise<any>) => {
    setBusy(caso.casoId);
    setErroPorCaso(prev => { const { [caso.casoId]: _x, ...resto } = prev; return resto; });
    try {
      await fn();
      setModal(null); setTextoModal('');
      await load();
      onChange?.();
    } catch (e: any) {
      setErroPorCaso(prev => ({ ...prev, [caso.casoId]: e?.message || 'Erro ao aplicar a decisão.' }));
    } finally {
      setBusy(null);
    }
  };

  const confirmarModal = () => {
    if (!modal) return;
    const texto = textoModal.trim();
    if (!texto) return;
    if (modal.tipo === 'correcao') executar(modal.caso, () => api.curadoriaSolicitarCorrecao(modal.caso.casoId, { texto }));
    else executar(modal.caso, () => api.curadoriaRemover(modal.caso.casoId, { motivo: texto }));
  };

  return (
    <div className="max-w-5xl animate-apple">
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <ShieldAlert size={28} className="text-rose-500" />
        <h2 className="text-3xl font-black tracking-tighter">Curadoria</h2>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setAba('abertos')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${aba === 'abertos' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Fila</button>
          <button onClick={() => setAba('fechado')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${aba === 'fechado' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Histórico</button>
        </div>
      </div>

      {loading && <p className="text-zinc-500 font-bold">Carregando...</p>}
      {!loading && casos.length === 0 && (
        <p className="text-zinc-500 font-bold">{aba === 'abertos' ? 'Nenhum caso aberto. As sinalizações dos leitores só chegam aqui quando atingem o gatilho da obra.' : 'Nenhum caso fechado ainda.'}</p>
      )}

      <div className="space-y-4">
        {casos.map(c => {
          const ocupado = busy === c.casoId;
          const grave = c.prioridade === 'grave';
          return (
            <div key={c.casoId} data-testid="caso-card" className={`bg-[var(--card-bg)] border rounded-3xl p-6 flex gap-6 ${grave ? 'border-rose-500/60' : 'border-[var(--border-color)]'}`}>
              <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0">
                <ImageWithFallback src={c.obra?.cover_image ?? undefined} className="w-full h-full object-cover" alt={c.obra?.title ?? 'Obra removida'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${grave ? 'bg-rose-600 text-white' : 'bg-rose-600/15 text-rose-400'}`}>{grave ? 'GRAVE' : 'Normal'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{c.status === 'aguardando_artista' ? 'Aguardando artista' : c.status === 'fechado' ? 'Fechado' : 'Aberto'}</span>
                  {c.canal?.name && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{c.canal.name}</span>}
                  {c.obra?.content_rating && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{ROTULO_RATING[c.obra.content_rating] ?? c.obra.content_rating}</span>}
                  {c.obra && !c.obra.isPublished && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Fora do ar</span>}
                  <span className="text-[10px] text-zinc-600 font-bold ml-auto">{new Date(c.abertoEm).toLocaleDateString('pt-BR')}</span>
                </div>
                <h3 className="text-lg font-black text-[var(--text-color)]">{c.obra?.title ?? 'Obra apagada'}</h3>

                <p className="text-xs text-zinc-500 font-bold mt-1">
                  Sinalizações válidas: {c.contagem.S} / {c.contagem.limiar} · {c.contagem.V} visualizações únicas
                  {grave || c.contagem.S_grave > 0 ? ` · ${c.contagem.S_grave} graves` : ''}
                </p>
                <p className="text-[10px] text-zinc-600 font-bold">{c.contagem.semConsumo} sem consumo · {c.contagem.contasRecentes} contas recentes · {c.contagem.ipsDistintos} IPs distintos</p>
                <p className="text-xs text-zinc-400 mt-2">{Object.entries(c.resumoMotivos).map(([m, q]) => `${ROTULO_MOTIVO[m] ?? m}: ${q}`).join(' · ')}</p>
                {c.avisoArtista !== 'enviado' && <p className="text-[10px] text-amber-500 font-bold mt-1">{c.avisoArtista === 'sem_canal' ? 'Obra sem canal — artista não avisado' : c.avisoArtista === 'falhou' ? 'Aviso ao artista falhou' : 'Aviso pendente'}</p>}

                {c.descricoes.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs font-black text-zinc-400 cursor-pointer">Descrições dos leitores ({c.descricoes.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {c.descricoes.map((d, i) => <li key={i} className="text-xs text-zinc-400"><span className="text-zinc-600">{ROTULO_MOTIVO[d.motivo] ?? d.motivo} — </span>{d.descricao}</li>)}
                    </ul>
                  </details>
                )}

                {c.thread.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs font-black text-zinc-400 cursor-pointer">Conversa com o artista ({c.thread.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {c.thread.map((m, i) => <li key={i} className="text-xs text-zinc-400"><span className="text-zinc-600">{m.autorTipo === 'editor' ? 'Editor' : 'Ilustrador'}: </span>{m.texto}</li>)}
                    </ul>
                  </details>
                )}

                {c.status === 'fechado' && (
                  <p className="text-xs text-zinc-400 font-bold mt-3">{ROTULO_DECISAO[c.decisao ?? ''] ?? c.decisao} em {c.decisaoEm ? new Date(c.decisaoEm).toLocaleDateString('pt-BR') : '—'}{c.motivoDecisao ? ` — ${c.motivoDecisao}` : ''}{c.sinalizacoesAbusivas ? ' · sinalizações marcadas como abuso' : ''}</p>
                )}

                {erroPorCaso[c.casoId] && <p className="text-rose-500 text-xs font-bold mt-3">{erroPorCaso[c.casoId]}</p>}

                {c.status !== 'fechado' && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 text-xs text-zinc-400 font-bold">
                        <input type="checkbox" checked={!!abusoPorCaso[c.casoId]} onChange={e => setAbusoPorCaso(prev => ({ ...prev, [c.casoId]: e.target.checked }))} />
                        Sinalizações abusivas (não contar como revisão de conteúdo)
                      </label>
                      <button onClick={() => executar(c, () => api.curadoriaAprovar(c.casoId, abusoPorCaso[c.casoId] ? { abuso: true } : {}))} disabled={ocupado} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-40"><Check size={14} /> Aprovar</button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select aria-label="Nova classificação" value={ratingPorCaso[c.casoId] ?? ''} onChange={e => setRatingPorCaso(prev => ({ ...prev, [c.casoId]: e.target.value }))} className="bg-black/5 dark:bg-zinc-900 border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs font-bold">
                        <option value="">— nova classificação —</option>
                        <option value="kids">Kids</option><option value="teen">Teen</option><option value="young">Young</option>
                      </select>
                      <button onClick={() => executar(c, () => api.curadoriaReclassificar(c.casoId, { content_rating: ratingPorCaso[c.casoId] as any }))} disabled={ocupado || !ratingPorCaso[c.casoId]} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"><Tag size={14} /> Reclassificar</button>
                      <button onClick={() => { setModal({ tipo: 'correcao', caso: c }); setTextoModal(''); }} disabled={ocupado || !c.canalId} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"><MessageSquare size={14} /> Solicitar correção</button>
                      <button onClick={() => { setModal({ tipo: 'remover', caso: c }); setTextoModal(''); }} disabled={ocupado} className="flex items-center gap-2 px-5 py-2.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600/30 disabled:opacity-40"><EyeOff size={14} /> Remover</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-black tracking-tighter">{modal.tipo === 'correcao' ? 'Solicitar correção' : 'Remover (tirar do ar)'} — {modal.caso.obra?.title ?? 'Obra'}</h3>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white"><X size={24} /></button>
            </div>
            <p className="text-xs text-amber-500 font-bold mb-4">{AVISO_TEXTAREA}</p>
            {modal.tipo === 'remover' && <p className="text-xs text-zinc-400 mb-4">A obra sai do ar, mas não é apagada: episódios e favoritos ficam; o artista pode corrigir e reenviar para aprovação.</p>}
            <textarea
              value={textoModal}
              onChange={e => setTextoModal(e.target.value)}
              maxLength={1500}
              placeholder={modal.tipo === 'correcao' ? 'Descreva o ajuste pedido (o editor aplica alterações em obra publicada)' : 'Motivo da remoção (vai ao artista)'}
              rows={5}
              className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 resize-none mb-6"
            />
            <button onClick={confirmarModal} disabled={!textoModal.trim() || busy === modal.caso.casoId} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modal.tipo === 'correcao' ? 'Enviar pedido' : 'Confirmar remoção'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CuradoriaPanel;
```

- [ ] **Step 5: Fiação no `AdminDashboard.tsx` e aviso no `AprovacoesPanel.tsx`**

`AdminDashboard.tsx`: linha 15 `import CuradoriaPanel from './CuradoriaPanel';`; junto de `ShieldAlert` no import do lucide (adicione ao import existente). Após a linha 72:
```tsx
  // Badge "Curadoria N" (Fase 5 Bloco 3) — MESMA resposta de GET /admin/aprovacoes
  // (`curadoria.abertos`); refeito após qualquer ação do CuradoriaPanel (onChange).
  const [curadoriaCount, setCuradoriaCount] = useState(0);
```
Em `refetchAprovacoesBadges` (linha 302-305), após `setNaoClassificadasCount(...)`: `setCuradoriaCount(r.curadoria?.abertos ?? 0);`
Sidebar (após a linha 943):
```tsx
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CURADORIA} onClick={() => setSubView(ViewMode.ADMIN_CURADORIA)} icon={<ShieldAlert size={18} />} label="Curadoria" badge={curadoriaCount} />
```
Render (após a linha 1583):
```tsx
        {currentSubView === ViewMode.ADMIN_CURADORIA && <CuradoriaPanel onChange={refetchAprovacoesBadges} />}
```

`AprovacoesPanel.tsx`: na interface `ItemAprovacao` (linha 31) acrescente `removidaPelaCuradoria?: { decisaoEm: string; motivo: string | null } | null;` e, logo após o `<h3>` da linha 185:
```tsx
                  {it.removidaPelaCuradoria && (
                    <p className="text-xs text-rose-400 font-bold mt-1">
                      Removida pela curadoria em {new Date(it.removidaPelaCuradoria.decisaoEm).toLocaleDateString('pt-BR')}{it.removidaPelaCuradoria.motivo ? ` — ${it.removidaPelaCuradoria.motivo}` : ''}
                    </p>
                  )}
```

- [ ] **Step 6: Rodar (PowerShell) + tsc + suíte + commit**

Run: `npx vitest run tests/frontend/adminCuradoriaPanel.test.tsx tests/frontend/adminDashboardAprovacoesBadge.test.tsx tests/frontend/adminAprovacoesPanel.test.tsx` → PASS; `npx tsc --noEmit` → limpo; `npx vitest run tests/frontend` → verde.
```bash
git add components/Admin/CuradoriaPanel.tsx components/Admin/AdminDashboard.tsx components/Admin/AprovacoesPanel.tsx types.ts services/api.ts tests/frontend/adminCuradoriaPanel.test.tsx tests/frontend/adminDashboardAprovacoesBadge.test.tsx tests/frontend/adminAprovacoesPanel.test.tsx
git commit -m "feat(curadoria): painel da Fila de Revisao no admin com badge e aviso de obra removida" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Documentação com file:linha verificada e roteiro de deploy

**Files:**
- Modify: `routes/CONTEXT.md`, `services/CONTEXT.md`, `models/CONTEXT.md`, `utils/CONTEXT.md`, `middlewares/CONTEXT.md`, `components/CONTEXT.md`, `i18n/CONTEXT.md` (seções novas do Bloco 3, no estilo já usado pelos Blocos 1 e 2 nesses arquivos)
- Modify: `docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md` — seção final "Deploy" (nova)
- Nenhum código muda nesta task.

**Interfaces:** Consumes Tasks 1–7 (o código final). Produces: docs.

- [ ] **Step 1: Ler cada CONTEXT.md alvo e a seção do Bloco 2 nele (para copiar o formato), depois ler os arquivos novos do Bloco 3 INTEIROS**

Anti-fabricação (regra do ledger, e a T8 do Bloco 2 teve fix round por isso): toda afirmação abaixo leva `arquivo:linha` conferida ABRINDO o arquivo na linha citada depois de escrever. Nenhuma linha "de memória".

- [ ] **Step 2: Escrever as seções**

Conteúdo mínimo por arquivo (uma subseção "Fase 5 Bloco 3 — Curadoria" em cada):
- `routes/CONTEXT.md`: `routes/sinalizacao.js` (2 rotas, composição 404 com `isPublished`, dono → 400 `propria_obra`, validade na escrita, `dispararAvaliacao` só se válida, limiter por usuário); `routes/adminCuradoria.js` (`GET /curadoria` com `reavaliarPendentes` antes de listar, ordenação, 4 ações, 409 fechado, `motivoDecisao` vs `observacao`); mudanças em `adminPortal.js` (`curadoria`, `removidaPelaCuradoria`), `content.js` (DELETE limpa), `account.js` (export/exclusão/`primeiroAdmin`).
- `services/CONTEXT.md`: `curadoriaService.js` — funções exportadas, ordem do `avaliarObra`, curto-circuito, E11000, aviso em try/catch próprio + 2º write, `reavaliarPendentes`/timer, `fecharCaso` e `abuso`, os 5 `TEXTOS`; por que a função de V é PRÓPRIA (não extraída do royalty).
- `models/CONTEXT.md`: `Sinalizacao` (campos, unique para sempre, índice), `CasoCuradoria` (índice único parcial com `emAberto`, por que booleano e não `$in`), índice novo do `EngagementEvent` (só índice; append-only intacto).
- `utils/CONTEXT.md`: `curadoriaLimiares.js` (escada, propriedade de não-decrescência, 30% em inteiros, `LIMITE_PEQUENA_V` derivado) e `primeiroAdmin.js`.
- `middlewares/CONTEXT.md`: `sinalizacaoLimiter.js` (30/h por usuário, no-op em test, chave `req.user.id`).
- `components/CONTEXT.md`: `SinalizarButton.tsx` (guest desabilitado, 404 = sem estado, `error.code`), `Admin/CuradoriaPanel.tsx`, mudanças em `AdminDashboard`/`AprovacoesPanel`.
- `i18n/CONTEXT.md`: namespace `sinalizar.*` (18 chaves × 4 idiomas; enum do backend como sufixo das chaves de motivo).

Seção "Deploy" ao fim da spec:
```markdown
## Deploy (Bloco 3)

1. `cd /var/www/lorflux && git pull origin main`
2. `npm run build && rm -rf frontend-dist && cp -r dist frontend-dist && pm2 restart all`
3. No primeiro boot, o `autoIndex` do Mongoose constrói os índices novos: `Sinalizacao` (2), `CasoCuradoria` (3) e **`EngagementEvent {seriesId, userId, type, flagged}` sobre a coleção mais volumosa do app** — em background, mas pode levar alguns minutos em acervo grande; o app sobe normalmente enquanto isso. Conferir em `pm2 logs` que não há erro de índice.
4. Smoke: logado como leitor, abrir uma obra e sinalizar (201); `GET /api/admin/aprovacoes` com token admin traz `curadoria: { abertos, graves }`; aba "Curadoria" no admin abre vazia sem erro.
5. Nenhum backfill: os models são novos e o acervo não precisa de migração.
```

- [ ] **Step 3: Conferir cada `file:linha` citada abrindo o arquivo; corrigir divergências**

- [ ] **Step 4: Commit**

```bash
git add routes/CONTEXT.md services/CONTEXT.md models/CONTEXT.md utils/CONTEXT.md middlewares/CONTEXT.md components/CONTEXT.md i18n/CONTEXT.md docs/superpowers/specs/2026-09-04-fase5-bloco3-curadoria-design.md
git commit -m "docs(curadoria): CONTEXT.md do Bloco 3 com file:linha conferida e roteiro de deploy" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review (feito ao fechar o plano)

**Cobertura da spec rev.3 → task:** quem sinaliza/404/400/limiter → T3 · modelo `Sinalizacao` + unique para sempre → T1/T3 · vocabulário 6 → T1 · validade normal/grave → T3 · idade mínima + maturação (`reavaliarPendentes`, timer, ao abrir a fila) → T2/T4 · V função própria + índice → T1/T2 · limitação S/V registrada → spec (sem código) · escada + propriedade → T1 · caso + índice único parcial + `motivoDecisao` + `avisoArtista:'pendente'` → T1/T2 · avaliação (ordem, curto-circuito, E11000, aviso, AdminLog sistema, `primeiroAdmin` null) → T2 · escalonamento em qualquer `emAberto` → T2 · fila (ordem, item, thread vigente somente leitura, badge embutido) → T4 · 4 ações (abuso só em válidas, reclassificar 400, solicitar correção sem canal 400, remover idempotente, `removidaPelaCuradoria`) → T4 · direito de resposta/troca de dono → T4 (teste) · dislikes → T2 · privacidade pública (shape) → T3/T5 · reabertura → T2 · limpeza DELETE série → T5 · LGPD export/exclusão/negativo do artista → T5 · frontend leitor (guest disabled, 404 sem estado, 6 motivos, `propria_obra`, `error.code`) → T6 · frontend admin (painel, badge, textarea com aviso, card removida) → T7 · portal sem tela nova (selo cortado) → T5 (teste negativo) · deploy/índices → T8.

**Placeholders:** nenhum "TBD/similar à Task N"; todo passo de código traz o código. O único passo condicional (T3 Step 5, `trust proxy`) diz exatamente o que fazer em cada ramo.

**Consistência de nomes entre tasks:** `contarSinalizacoes` (T2) usado em T4 · `dispararAvaliacao`/`flushForTests` (T2) usados em T3/T5 · `fecharCaso(caso, { decisao, adminId, observacao, motivoDecisao, abuso, agora })` (T2) usado em T4 com esses nomes · `TEXTOS.{abertura,aprovar,reclassificar,solicitarCorrecao,remover}` e `ROTULO_RATING` (T2) usados em T4 · `enviarAvisoArtista(series, texto, { autorUserId })` (T2) usado em T4 · `L.MOTIVOS/MOTIVOS_GRAVES/MOTIVOS_COM_DESCRICAO_OBRIGATORIA/DESCRICAO_MAX/TEXTO_ADMIN_MAX/ehGrave` (T1) usados em T2/T3/T4 · `CasoCuradoria.emAberto/motivoDecisao/avisoArtista` (T1) usados em T2/T4 · `api.getMinhaSinalizacao/sinalizarSerie` (T6) e `api.getAdminCuradoria/curadoria*` (T7) batem com as rotas de T3/T4 · `curadoria: {abertos, graves}` e `removidaPelaCuradoria: {decisaoEm, motivo}` (T4) consumidos em T7.

