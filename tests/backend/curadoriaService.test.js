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
