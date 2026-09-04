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
