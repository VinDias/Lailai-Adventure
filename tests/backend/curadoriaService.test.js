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

/**
 * Plano VENCEDOR de um explain, em JSON — tolerante às duas formas (query
 * simples traz `queryPlanner` na raiz; aggregate embrulha em
 * `stages[0].$cursor`). Usado pelos pinos de índice: COLLSCAN numa query que
 * roda a cada abertura da fila é regressão de custo, não de comportamento —
 * nenhum teste funcional pegaria.
 */
function planoVencedor(explain) {
  const qp = explain.queryPlanner
    || (explain.stages && explain.stages[0] && explain.stages[0].$cursor && explain.stages[0].$cursor.queryPlanner);
  return JSON.stringify(qp.winningPlan);
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
  it('S só conta válidas, pendentes, de contas com >= 3 dias; S_grave exige 7; semConsumo/contasRecentes/ipsDistintos; fronteira EXATA do corte conta (<=)', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 7, idadeDias: 30 });                    // contam
    await sinalizar(serie._id, { quantas: 3, idadeDias: 1 });                     // recentes
    await sinalizar(serie._id, { quantas: 2, idadeDias: 30, valida: false, invalidaMotivo: 'sem_consumo' });
    await sinalizar(serie._id, { quantas: 2, motivo: 'direitos_autorais', idadeDias: 5 });  // contam em S, NÃO em S_grave
    await sinalizar(serie._id, { quantas: 1, motivo: 'conteudo_proibido', idadeDias: 9 });  // conta em S e S_grave
    // fronteira exata (prova a comparação <=, não <): idadeDias igual ao
    // corte em dias inteiros cai exatamente em corteNormal/corteGrave.
    await sinalizar(serie._id, { quantas: 1, idadeDias: 3 });                     // exatamente no corte normal — CONTA
    await sinalizar(serie._id, { quantas: 1, motivo: 'conteudo_proibido', idadeDias: 7 }); // exatamente no corte grave — conta em S e S_grave
    await Sinalizacao.create({ seriesId: serie._id, userId: oid(), motivo: 'outro', descricao: 'ciclo anterior', grave: false, valida: true, contaCriadaEm: dias(60), revisadaEm: dias(2) });

    const c = await svc.contarSinalizacoes(serie._id, { agora: AGORA });
    expect(c.S).toBe(12);          // 7 + 2 graves(5d) + 1 grave(9d) + 1 no corte normal + 1 grave no corte grave
    expect(c.S_grave).toBe(2);     // grave(9d) + grave no corte exato (7d)
    expect(c.semConsumo).toBe(2);
    expect(c.contasRecentes).toBe(3);
    expect(c.ipsDistintos).toBe(15);  // válidas pendentes: 7+3+2+1+1+1, cada uma com ip próprio
    // resumoMotivos só das que contam em S (contas maduras) — ver comentário
    // em contarSinalizacoes (fix round T2, item 6)
    expect(c.resumoMotivos).toEqual({ spam_ou_enganoso: 8, direitos_autorais: 2, conteudo_proibido: 2 });
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
    // segunda rodada: obra com caso aberto NÃO é reavaliada de novo. Pino
    // REAL do filtro `comCaso` (não só o efeito, que avaliarObra devolveria
    // igual mesmo sem o filtro, por ser idempotente): o spy prova que a
    // série nem é CONSULTADA de novo.
    const spy = vi.spyOn(Series, 'findById');
    const abertos2 = await svc.reavaliarPendentes({ agora: new Date(AGORA.getTime() + 7 * 24 * 60 * 60 * 1000) });
    expect(spy.mock.calls.map(c => String(c[0]))).not.toContain(String(serie._id));
    spy.mockRestore();
    expect(abertos2).toBe(0);
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

    // relê do BANCO (não só o doc em memória devolvido por save()) e confere
    // o grep anti-identidade também no log de escalonamento.
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido.gatilho.S).toBe(25);
    expect(relido.resumoMotivos).toEqual({ spam_ou_enganoso: 20, direitos_autorais: 5 });
    expect(relido.prioridade).toBe('grave');
    const logEsc = await AdminLog.findOne({ action: 'CURADORIA_CASO_ESCALONADO', targetId: String(serie._id) }).lean();
    expect(JSON.stringify(logEsc.details)).not.toMatch(/userId|descricao/);
  });

  it('caso normal recebendo mais sinalizações normais NÃO escalona: prioridade continua normal, 0 logs ESCALONADO, gatilho.S atualizado', async () => {
    const { serie, ep } = await criarObra();
    await views(serie, ep, { quantas: 20, prefixo: '45.0' });
    await sinalizar(serie._id, { quantas: 20 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.prioridade).toBe('normal');
    await sinalizar(serie._id, { quantas: 5 }); // mais spam_ou_enganoso — não grave
    const mesmo = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(mesmo.prioridade).toBe('normal');
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido.gatilho.S).toBe(25);
    expect(relido.prioridade).toBe('normal');
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ESCALONADO', targetId: String(serie._id) })).toBe(0);
  });

  it('caso já grave (escalonado) recebendo mais graves continua com 1 único log ESCALONADO (nenhum 2º)', async () => {
    const { serie, ep } = await criarObra();
    await views(serie, ep, { quantas: 20, prefixo: '46.0' });
    await sinalizar(serie._id, { quantas: 20 });
    await svc.avaliarObra(serie._id, { agora: AGORA }); // abre normal
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 10 });
    const grave = await svc.avaliarObra(serie._id, { agora: AGORA }); // escalona -> 1º (e único) log
    expect(grave.prioridade).toBe('grave');
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ESCALONADO', targetId: String(serie._id) })).toBe(1);
    await sinalizar(serie._id, { quantas: 3, motivo: 'direitos_autorais', idadeDias: 10 });
    const mesmo = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(mesmo.prioridade).toBe('grave');
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

/**
 * Fix round de CONSOLIDAÇÃO do backend: defeitos de concorrência/custo
 * confirmados por sondas de execução no motor da avaliação.
 */
describe('consolidação: avaliação sob concorrência e custo da reavaliação', () => {
  it('item 3: contagem que zera entre a apuração e o create NÃO abre caso novo nem manda 2º aviso', async () => {
    const { serie } = await criarObra({ title: 'Zerou na Janela 4' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const EngagementEvent = require('../../models/EngagementEvent');
    const original = EngagementEvent.aggregate.bind(EngagementEvent);
    // O aggregate de V é o await mais caro entre a contagem e o create — é
    // nele que a sonda encaixou o `aprovar` concorrente (revisadaEm em todas
    // as pendentes). Sem a reconferência, o caso nascia com gatilho.S=5 e o
    // artista levava um aviso de ABERTURA logo após o de fechamento.
    const spy = vi.spyOn(EngagementEvent, 'aggregate').mockImplementationOnce(async (pipeline) => {
      await Sinalizacao.updateMany({ seriesId: serie._id, revisadaEm: null }, { $set: { revisadaEm: AGORA } });
      return original(pipeline);
    });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    spy.mockRestore();
    expect(caso).toBeNull();
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(0);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(0);
  });

  it('item 3: caso fechado entre a contagem e o escalonamento não é regravado nem gera log ESCALONADO', async () => {
    const { serie, ep } = await criarObra({ title: 'Escalona Tarde 8' });
    await views(serie, ep, { quantas: 20, prefixo: '47.0' });
    await sinalizar(serie._id, { quantas: 20 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(caso.prioridade).toBe('normal');
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 10 });

    const original = CasoCuradoria.findOne.bind(CasoCuradoria);
    const spy = vi.spyOn(CasoCuradoria, 'findOne').mockImplementationOnce(async (filtro) => {
      const doc = await original(filtro);
      await svc.fecharCaso(await CasoCuradoria.findById(caso._id), { decisao: 'aprovar', adminId: 'outro-curador', agora: AGORA });
      return doc;
    });
    await svc.avaliarObra(serie._id, { agora: AGORA });
    spy.mockRestore();

    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ status: 'fechado', decisao: 'aprovar', prioridade: 'normal' });
    expect(relido.gatilho.S).toBe(20);
    expect(await AdminLog.countDocuments({ action: 'CURADORIA_CASO_ESCALONADO', targetId: String(serie._id) })).toBe(0);
  });

  it('rodada 2 (c): a reivindicação EXPIRA — processo derrubado no meio de uma ação não prende o caso', async () => {
    const { serie } = await criarObra({ title: 'Reivindicacao Expira 5' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    const t0 = new Date();
    // devolve o TOKEN de posse (a data gravada), não um booleano
    expect(await svc.reivindicarCaso(caso._id, { agora: t0 })).toEqual(t0);
    expect(await svc.reivindicarCaso(caso._id, { agora: new Date(t0.getTime() + 60 * 1000) })).toBeNull();
    // 6 minutos depois (> RECLAMACAO_VALIDADE_MS) o caso destrava sozinho,
    // sem job de saneamento e sem intervenção no banco.
    const t6 = new Date(t0.getTime() + 6 * 60 * 1000);
    expect(await svc.reivindicarCaso(caso._id, { agora: t6 })).toEqual(t6);
  });

  it('rodada 2 (d): caso REIVINDICADO continua barrando um caso IRMÃO da mesma obra (o índice único parcial segue valendo)', async () => {
    const { serie } = await criarObra({ title: 'Sem Irmao 7' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(await svc.reivindicarCaso(caso._id)).toBeTruthy();
    // Reivindicar NÃO pode mexer em `emAberto`: era isso que liberava o
    // índice único {seriesId, emAberto:true} e deixava esta avaliação abrir
    // um 2º caso para a mesma obra (com 2º aviso ao artista).
    await sinalizar(serie._id, { quantas: 5, motivo: 'direitos_autorais', idadeDias: 10 });
    const mesmo = await svc.avaliarObra(serie._id, { agora: AGORA });
    expect(String(mesmo._id)).toBe(String(caso._id));
    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id })).toBe(1);
    expect(await MensagemPortal.countDocuments({ refId: serie._id })).toBe(1);
  });

  it('rodada 3 (b): devolver a reivindicação de TERCEIRO não derruba o mutex do dono atual', async () => {
    const { serie } = await criarObra({ title: 'Devolucao de Terceiro 6' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    const t0 = new Date();
    const tokenA = await svc.reivindicarCaso(caso._id, { agora: t0 });
    // A expira e B toma o caso
    const t6 = new Date(t0.getTime() + 6 * 60 * 1000);
    const tokenB = await svc.reivindicarCaso(caso._id, { agora: t6 });
    expect(tokenB).toBeTruthy();
    expect(await svc.reivindicarCaso(caso._id, { agora: new Date(t6.getTime() + 1000) })).toBeNull();
    // o catch TARDIO de A devolve a reivindicação: sem o token no filtro,
    // isso destravava o caso que B está decidindo AGORA.
    await svc.devolverReivindicacao(caso._id, tokenA);
    expect(await svc.reivindicarCaso(caso._id, { agora: new Date(t6.getTime() + 2000) })).toBeNull();
    // e o dono de verdade continua conseguindo devolver
    await svc.devolverReivindicacao(caso._id, tokenB);
    expect(await svc.reivindicarCaso(caso._id, { agora: new Date(t6.getTime() + 3000) })).toBeTruthy();
  });

  it('rodada 3 (c): fecharCaso com token que não é o do dono NÃO fecha o caso', async () => {
    const { serie } = await criarObra({ title: 'Token Errado 4' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    const token = await svc.reivindicarCaso(caso._id);
    await expect(svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin'), token: new Date(token.getTime() - 1000), agora: AGORA }))
      .rejects.toMatchObject({ status: 409 });
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ emAberto: true, status: 'aberto', decisao: null });
    expect(relido.reivindicadoEm).toEqual(token);
    // com o token certo, fecha e libera o mutex
    const fechado = await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin'), token, agora: AGORA });
    expect(fechado.status).toBe('fechado');
    expect(fechado.reivindicadoEm).toBeNull();
  });

  it('item 4: reavaliarPendentes só consulta as obras que já podem disparar (curto-circuito no banco)', async () => {
    const pequenas = [];
    for (let i = 0; i < 3; i++) {
      const { serie } = await criarObra({ title: `Uma Pendente ${i}` });
      await sinalizar(serie._id, { quantas: 1 });
      pequenas.push(String(serie._id));
    }
    const { serie: grande } = await criarObra({ title: 'Vinte Pendentes 9' });
    await sinalizar(grande._id, { quantas: 20 });
    const idsDoTeste = new Set([...pequenas, String(grande._id)]);

    const spy = vi.spyOn(Series, 'findById');
    await svc.reavaliarPendentes({ agora: AGORA });
    const consultadas = spy.mock.calls.map(c => String(c[0])).filter(id => idsDoTeste.has(id));
    spy.mockRestore();
    // As 3 com UMA pendente nem chegam a virar candidata (o $match do
    // aggregate as descarta); antes cada uma custava um findById + duas
    // contagens para terminar em null.
    expect(consultadas).toEqual([String(grande._id)]);
    expect(await CasoCuradoria.countDocuments({ seriesId: grande._id, emAberto: true })).toBe(1);
    for (const id of pequenas) expect(await CasoCuradoria.countDocuments({ seriesId: id })).toBe(0);
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

  it('enviarAvisoArtista com autorUserId explícito usa o admin passado (não chama primeiroAdmin)', async () => {
    const { serie } = await criarObra();
    const r = await svc.enviarAvisoArtista(serie.toObject(), 'x', { autorUserId: auth.getId('admin') });
    expect(r.status).toBe('enviado');
    const msg = await MensagemPortal.findById(r.mensagemId).lean();
    expect(String(msg.autorUserId)).toBe(String(auth.getId('admin')));
    expect(msg.autorTipo).toBe('editor');
  });

  it('enviarAvisoArtista corta texto que excede o maxlength:2000 de MensagemPortal.texto', async () => {
    const { serie } = await criarObra();
    const textoGigante = 'x'.repeat(2500);
    const r = await svc.enviarAvisoArtista(serie.toObject(), textoGigante);
    const msg = await MensagemPortal.findById(r.mensagemId).lean();
    expect(msg.texto.length).toBe(2000);
    expect(msg.texto.endsWith('…')).toBe(true);
  });

  it('fecharCaso com decisao=remover grava motivoDecisao e observacao; sinalizacoesAbusivas false sem abuso', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    await svc.fecharCaso(caso, { decisao: 'remover', adminId: auth.getId('admin'), observacao: 'interna', motivoDecisao: 'Cópia.', agora: AGORA });
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ decisao: 'remover', motivoDecisao: 'Cópia.', observacao: 'interna', sinalizacoesAbusivas: false, emAberto: false });
  });

  it('consolidação (item 5): falha no updateMany de revisadaEm deixa o caso DECIDIDO e coerente, nunca preso', async () => {
    const { serie } = await criarObra({ title: 'Parcial no Servico 5' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    const spy = vi.spyOn(Sinalizacao, 'updateMany').mockRejectedValueOnce(new Error('mongo off'));
    await expect(svc.fecharCaso(caso, { decisao: 'remover', adminId: auth.getId('admin'), motivoDecisao: 'Cópia.', agora: AGORA }))
      .rejects.toThrow('mongo off');
    spy.mockRestore();
    // A decisão inteira já está gravada (um único findOneAndUpdate): o caso
    // não fica `emAberto:false + status:'aberto' + decisao:null`, que era
    // invisível na fila E no histórico e respondia 409 para sempre.
    const relido = await CasoCuradoria.findById(caso._id).lean();
    expect(relido).toMatchObject({ emAberto: false, status: 'fechado', decisao: 'remover', motivoDecisao: 'Cópia.' });
    // As sinalizações continuam pendentes — o pior caso é um ciclo novo.
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: null })).toBe(5);
  });

  it('fix round T4 (item 4): lock otimista — fecharCaso 2x no mesmo caso: a 2ª rejeita 409 e NÃO regrava revisadaEm', async () => {
    const { serie } = await criarObra();
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 8 });
    const caso = await svc.avaliarObra(serie._id, { agora: AGORA });
    await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin'), agora: AGORA });
    const revisadaEmDoFechamento = (await Sinalizacao.findOne({ seriesId: serie._id }).lean()).revisadaEm;
    expect(revisadaEmDoFechamento).toEqual(AGORA);

    const maisTarde = new Date(AGORA.getTime() + 60 * 60 * 1000);
    await expect(svc.fecharCaso(caso, { decisao: 'aprovar', adminId: auth.getId('admin'), agora: maisTarde }))
      .rejects.toMatchObject({ status: 409 });
    // Nenhuma sinalização foi regravada com o `agora` da 2ª chamada — o claim
    // falhou ANTES do updateMany de revisadaEm.
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: maisTarde })).toBe(0);
    expect(await Sinalizacao.countDocuments({ seriesId: serie._id, revisadaEm: AGORA })).toBe(5);
  });
});

// Consolidação (item 8): a varredura de BOOT de iniciarReavaliacaoPeriodica.
// Roda por ÚLTIMO no arquivo e restaura NODE_ENV/require.cache no afterAll —
// mesmo padrão do teste do limiter em curadoriaSinalizar.test.js:337-396:
// este repo carrega tudo por require() (CJS) e vi.resetModules() gerencia o
// registro do próprio vitest (ESM), não o require.cache do Node; sem o delete
// explícito o require abaixo devolveria a instância já cacheada em
// NODE_ENV=test, presa no ramo no-op.
describe('iniciarReavaliacaoPeriodica — varredura de boot (fora de NODE_ENV=test)', () => {
  const NODE_ENV_ORIGINAL = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = NODE_ENV_ORIGINAL;
    delete require.cache[require.resolve('../../services/curadoriaService')];
    require('../../services/curadoriaService');
  });

  it('abre o caso das graves já maduras no BOOT, sem esperar as 24h do timer', async () => {
    const { serie } = await criarObra({ title: 'Boot Grave 6' });
    await sinalizar(serie._id, { quantas: 5, motivo: 'conteudo_proibido', idadeDias: 30 });

    delete require.cache[require.resolve('../../services/curadoriaService')];
    process.env.NODE_ENV = 'development';
    const svcBoot = require('../../services/curadoriaService');
    svcBoot.iniciarReavaliacaoPeriodica();
    // A varredura é fire-and-forget mas fica registrada em `pendentes` — o
    // mesmo flushForTests que espera as avaliações disparadas por sinalização.
    await svcBoot.flushForTests();
    svcBoot.pararReavaliacaoPeriodica();

    expect(await CasoCuradoria.countDocuments({ seriesId: serie._id, emAberto: true })).toBe(1);
  });
});

// Consolidação (item 10): o índice {seriesId,userId,type,flagged} nasceu SEM
// filtro parcial e indexava também ad_impression/ad_click, que não têm
// seriesId. O filtro parcial só pode entrar se as TRÊS queries consumidoras
// continuarem elegíveis ao índice — daí o pino por explain (equality em
// seriesId implica $exists:true, mas isso é comportamento do planner e
// precisa ser verificado, não presumido).
describe('índice de EngagementEvent — parcial em seriesId (consolidação, item 10)', () => {
  it('é PARCIAL (evento de anúncio, sem seriesId, fica fora) e as TRÊS queries consumidoras continuam em IXSCAN', async () => {
    const EngagementEvent = require('../../models/EngagementEvent');
    await EngagementEvent.init();
    const indices = await EngagementEvent.collection.indexes();
    const idx = indices.find(i => i.name === 'seriesId_1_userId_1_type_1_flagged_1');
    expect(idx.partialFilterExpression).toEqual({ seriesId: { $exists: true } });

    const sid = oid(); const uid = oid();
    const planos = [
      // (1) V da curadoria — contarConsumidoresUnicos (services/curadoriaService.js)
      planoVencedor(await EngagementEvent.aggregate([
        { $match: { seriesId: sid, type: { $in: ['view', 'read'] }, flagged: false } },
        { $group: { _id: null, consumers: { $addToSet: { $ifNull: ['$userId', '$ipHash'] } } } },
        { $project: { _id: 0, total: { $size: '$consumers' } } },
      ]).explain()),
      // (2) consumo real do sinalizador — EngagementEvent.exists de routes/sinalizacao.js
      planoVencedor(await EngagementEvent.findOne({ seriesId: sid, userId: uid, type: { $in: ['view', 'read'] }, flagged: false }).select('_id').explain()),
      // (3) engajamento recente do algoritmo — services/recommendationService.js coletarSinaisInatividade
      planoVencedor(await EngagementEvent.findOne({ seriesId: sid, flagged: false }).select('_id').explain()),
    ];
    for (const plano of planos) {
      expect(plano).toMatch(/IXSCAN/);
      expect(plano).toMatch(/"indexName":"seriesId_1_userId_1_type_1_flagged_1"/);
      expect(plano).not.toMatch(/COLLSCAN/);
    }
  });
});

// Rodada 2 (f): o aggregate de candidatas do reavaliarPendentes rodava em
// COLLSCAN — nenhum dos índices de Sinalizacao serve a um $match sem
// seriesId. Roda a cada abertura da fila do admin, no boot e uma vez por dia.
describe('índice do aggregate de candidatas (rodada 2, item 4)', () => {
  it('o $match {revisadaEm:null, valida:true} + $group por seriesId roda em IXSCAN', async () => {
    await Sinalizacao.init();
    const explain = await Sinalizacao.aggregate([
      { $match: { valida: true, revisadaEm: null } },
      { $group: { _id: '$seriesId', total: { $sum: 1 }, graves: { $sum: { $cond: ['$grave', 1, 0] } } } },
      { $match: { $or: [{ total: { $gte: L.PISO_PEQUENA } }, { graves: { $gte: L.GRAVE } }] } },
      { $project: { _id: 1 } },
    ]).explain();
    const plano = planoVencedor(explain);
    expect(plano).toMatch(/IXSCAN/);
    expect(plano).not.toMatch(/COLLSCAN/);
    expect(plano).toMatch(/"indexName":"revisadaEm_1_valida_1_seriesId_1_grave_1"/);
  });
});
