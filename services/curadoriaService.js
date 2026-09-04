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
// Validade da reivindicação de um caso (mutex das ações do curador). Uma
// ação inteira é sub-segundo; 5 minutos é folga larga para um
// applySeriesUpdate lento e curto o bastante para o curador simplesmente
// recarregar a fila se o processo caiu no meio.
const RECLAMACAO_VALIDADE_MS = 5 * 60 * 1000;

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
    if (s.ipHash) ips.add(s.ipHash);
    if (s.contaCriadaEm <= corteNormal) {
      S += 1;
      // resumoMotivos só entra no aviso ao artista com categorias de contas
      // que já contam em S (maduras) — senão uma brigada de contas novas
      // (< 3 dias, ainda sem valer no gatilho) conseguiria injetar uma
      // categoria no aviso automático mesmo sem ter aberto o caso.
      resumoMotivos[s.motivo] = (resumoMotivos[s.motivo] || 0) + 1;
    } else {
      contasRecentes += 1;
    }
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
  // Guarda de tamanho: o template de abertura (~190 chars) somado a um
  // motivoDecisao do curador de até 1500 (TEXTO_ADMIN_MAX) e um título sem
  // limite de tamanho pode passar do maxlength:2000 de MensagemPortal.texto
  // (models/MensagemPortal.js:19) — sem isto o create lançaria
  // ValidationError e o caso ficaria com avisoArtista:'falhou' por um motivo
  // evitável (achado do fix round da T2).
  const TEXTO_MENSAGEM_MAX = 2000;
  const textoFinal = texto.length > TEXTO_MENSAGEM_MAX
    ? `${texto.slice(0, TEXTO_MENSAGEM_MAX - 1)}…`
    : texto;
  const msg = await MensagemPortal.create({
    canalId: series.channelId, ownerUserId: canal.ownerId,
    autorTipo: 'editor', autorUserId: autor,
    refTipo: 'series', refId: series._id, texto: textoFinal,
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
 * Traduz contagens vivas + V no gatilho a aplicar, ou null se nada dispara.
 * Existe para que a decisão seja tomada UMA vez, sobre a contagem mais nova
 * (ver a reconferência em avaliarObra) — sem duplicar a escada de limiares.
 */
function decidirGatilho({ S, S_grave }, V) {
  if (S_grave >= L.GRAVE) return { tipo: 'grave', limiar: L.GRAVE, prioridade: 'grave' };
  const limiar = L.limiarPara(V);
  if (S < limiar) return null;
  return { tipo: L.tipoGatilho(V), limiar, prioridade: 'normal' };
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
    const escalona = atingiuGrave && casoAberto.prioridade !== 'grave';
    // Update CONDICIONAL a `emAberto:true` (consolidação, item 3): o
    // `casoAberto.save()` de antes escrevia sobre um documento lido dois
    // awaits atrás — um curador fechando o caso nessa janela via
    // resumoMotivos/gatilho.S/prioridade do ciclo NOVO gravados por cima da
    // decisão dele, e um AdminLog de escalonamento de um caso já decidido.
    const r = await CasoCuradoria.updateOne(
      { _id: casoAberto._id, emAberto: true },
      { $set: { resumoMotivos, 'gatilho.S': S, ...(escalona ? { prioridade: 'grave' } : {}) } },
    );
    // Fechado na janela: não há caso aberto para devolver — devolver o
    // documento obsoleto faria `reavaliarPendentes` contar como "aberto" um
    // caso que já foi decidido (rodada 2, B-07).
    if (r.matchedCount === 0) return null;
    casoAberto.resumoMotivos = resumoMotivos;
    casoAberto.gatilho.S = S;
    if (escalona) casoAberto.prioridade = 'grave';
    if (escalona && r.modifiedCount === 1) await logSistema('CURADORIA_CASO_ESCALONADO', seriesId, { casoId: String(casoAberto._id), S, S_grave });
    return casoAberto;
  }

  const V = await contarConsumidoresUnicos(seriesId);
  // RECONFERÊNCIA antes de abrir (consolidação, item 3): entre a contagem
  // acima e este ponto houve o aggregate de V na coleção mais volumosa do
  // app — tempo de sobra para um `aprovar` concorrente marcar revisadaEm em
  // TODAS as pendentes. Sem reconferir, o caso novo nascia com um gatilho.S
  // que já não existia e o artista levava um 2º aviso de abertura logo depois
  // do aviso de fechamento. A query é barata (índice
  // {seriesId, revisadaEm, valida}) e só roda no caminho que ABRE caso.
  const conferida = await contarSinalizacoes(seriesId, { agora });
  const gatilho = decidirGatilho(conferida, V);
  if (!gatilho) return null;

  let caso;
  try {
    caso = await CasoCuradoria.create({
      seriesId, emAberto: true, status: 'aberto',
      prioridade: gatilho.prioridade,
      abertoEm: agora,
      gatilho: { tipo: gatilho.tipo, S: conferida.S, V, limiar: gatilho.limiar },
      resumoMotivos: conferida.resumoMotivos,
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
    const rotulos = Object.keys(conferida.resumoMotivos).map(m => ROTULO_MOTIVO[m] || m);
    aviso = await enviarAvisoArtista(series, TEXTOS.abertura(series.title, rotulos));
  } catch (err) {
    logger.error('[Curadoria] aviso ao artista falhou', err && err.message);
  }
  caso.avisoArtista = aviso.status;
  caso.mensagemAvisoId = aviso.mensagemId;
  await caso.save();

  await logSistema('CURADORIA_CASO_ABERTO', seriesId, { casoId: String(caso._id), tipo: gatilho.tipo, S: conferida.S, S_grave: conferida.S_grave, V, limiar: gatilho.limiar, avisoArtista: aviso.status });
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
  // O CURTO-CIRCUITO acontece no BANCO (consolidação, item 4): o `distinct`
  // de antes devolvia TODA obra com uma única sinalização pendente — o
  // conjunto só cresce (obra despublicada com pendente nunca sai dele) e cada
  // candidata custava um Series.findById + duas contagens para terminar em
  // null. Aqui só sobem as obras que já podem disparar alguma coisa: total
  // >= PISO_PEQUENA (o menor limiar possível) ou graves >= GRAVE. `grave` é
  // o campo derivado do motivo, gravado na sinalização.
  const grupos = await Sinalizacao.aggregate([
    { $match: { valida: true, revisadaEm: null } },
    { $group: { _id: '$seriesId', total: { $sum: 1 }, graves: { $sum: { $cond: ['$grave', 1, 0] } } } },
    { $match: { $or: [{ total: { $gte: L.PISO_PEQUENA } }, { graves: { $gte: L.GRAVE } }] } },
    { $project: { _id: 1 } },
  ]);
  const candidatas = grupos.map(g => g._id);
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
  // Varredura de BOOT (consolidação, item 8): só o setInterval significava
  // que um processo reiniciado pelo PM2 antes de completar 24h nunca rodava a
  // maturação — as contas que completaram a idade mínima ficavam esperando
  // alguém abrir a fila do admin. Fire-and-forget (a função continua
  // SÍNCRONA: server.js chama sem .catch), com a promise registrada em
  // `pendentes` para o flushForTests dos testes.
  const p = reavaliarPendentes()
    .catch((err) => logger.error('[Curadoria] varredura de boot da reavaliação falhou', err && err.message))
    .finally(() => pendentes.delete(p));
  pendentes.add(p);
}
function pararReavaliacaoPeriodica() {
  if (timerReavaliacao) { clearInterval(timerReavaliacao); timerReavaliacao = null; }
}

/**
 * MUTEX das 4 ações do curador. Reserva o caso em `reivindicadoEm` — um campo
 * PRÓPRIO, nunca `emAberto`: `emAberto` é a chave do índice único parcial que
 * garante "1 caso aberto por obra", e zerá-lo durante a ação liberava o índice
 * para `avaliarObra` abrir um caso IRMÃO da mesma obra (rodada 2 do fix
 * round). Com `emAberto` intacto, o índice continua protegendo e o
 * `findOneAndUpdate` de `fecharCaso` continua sendo o árbitro final.
 *
 * Existe porque `remover` e `reclassificar` ALTERAM A OBRA antes de fechar:
 * sem reivindicar primeiro, quem perdesse a corrida no fechamento já teria
 * despublicado/reclassificado a obra — 409 na resposta, obra fora do ar, zero
 * AdminLog e o artista recebendo "obra mantida sem alterações" do vencedor
 * (viola a regra 1 do Vin). `aprovar` e `solicitar-correcao` reivindicam pelo
 * mesmo motivo do outro lado: senão vencem uma ação que já mexeu na obra.
 *
 * A reivindicação EXPIRA em RECLAMACAO_VALIDADE_MS: processo derrubado no
 * meio de uma ação (deploy, OOM) libera o caso sozinho, sem job de
 * saneamento e sem intervenção no banco.
 *
 * Devolve o TOKEN de posse (a própria data gravada) ou `null` se o caso já
 * está com outro curador. O token é a PROVA de posse e tem de acompanhar
 * todas as escritas da ação: um lock com prazo mas sem token não é lock —
 * quando a expiração corre no meio da ação, o dono antigo continua achando
 * que manda e fecha/altera por cima de quem tomou o caso (rodada 3).
 */
async function reivindicarCaso(casoId, { agora = new Date() } = {}) {
  const CasoCuradoria = require('../models/CasoCuradoria');
  const expirada = new Date(agora.getTime() - RECLAMACAO_VALIDADE_MS);
  const r = await CasoCuradoria.updateOne(
    {
      _id: casoId,
      emAberto: true,
      $or: [{ reivindicadoEm: null }, { reivindicadoEm: { $lt: expirada } }],
    },
    { $set: { reivindicadoEm: agora } },
  );
  return r.modifiedCount === 1 ? agora : null;
}

/**
 * Libera o mutex quando a ação falhou no meio. SÓ O DONO libera: o filtro
 * casa `reivindicadoEm` com o token de quem está devolvendo — um catch
 * tardio de quem já perdeu o caso por expiração não pode destravar o curador
 * que está trabalhando nele agora (rodada 3). Sem token, no-op.
 *
 * Só toca `reivindicadoEm` — `emAberto` fica como está, então NÃO existe
 * E11000 possível aqui. Erro de banco é logado e não propaga: quem chama
 * está propagando o erro ORIGINAL, e a expiração cobre a liberação.
 */
async function devolverReivindicacao(casoId, token) {
  const CasoCuradoria = require('../models/CasoCuradoria');
  if (!token) {
    logger.debug(`[Curadoria] devolver reivindicação sem token (caso ${casoId}) — ignorado`);
    return;
  }
  try {
    await CasoCuradoria.updateOne({ _id: casoId, reivindicadoEm: token }, { $set: { reivindicadoEm: null } });
  } catch (err) {
    logger.error('[Curadoria] devolver reivindicação falhou', err && err.message);
  }
}

/**
 * Fecha o ciclo: TODAS as pendentes da obra ganham revisadaEm (S zera);
 * `abuso` marca só as que eram válidas (as 'sem_consumo' mantêm o motivo).
 * `motivoDecisao` é o texto que VAI ao artista; `observacao` é interna.
 *
 * LOCK OTIMISTA com a decisão INTEIRA num único `findOneAndUpdate` atômico —
 * dois curadores no mesmo caso (ex. 2 abas) dão 1 fechamento, 1 aviso, 1
 * AdminLog; o perdedor lança 409 ANTES de tocar em Sinalizacao (senão as
 * sinalizações já revisadas pelo vencedor seriam regravadas com outro
 * `agora`). Os dois `updateMany` vêm DEPOIS de propósito (consolidação, item
 * 5): quando o claim gravava só `emAberto:false` e a decisão ia num
 * `caso.save()` no fim, uma falha no meio deixava o caso `emAberto:false +
 * status:'aberto' + decisao:null` — fora da fila, fora do histórico e 409
 * para sempre. Nesta ordem o pior caso é sinalização pendente que abre um
 * ciclo novo, nunca um caso preso. `tratarErro` das rotas admin já mapeia
 * `err.status` para a resposta HTTP.
 *
 * O filtro é `emAberto:true` para TODOS os caminhos (rodada 2): o mutex das
 * rotas mora em `reivindicadoEm`, não mais em `emAberto`, então o caso
 * reivindicado continua aberto até ser realmente decidido aqui. O mesmo
 * `$set` LIBERA o mutex (`reivindicadoEm:null`) — caso fechado não fica
 * reivindicado.
 *
 * `token` (rodada 3) = a prova de posse devolvida por `reivindicarCaso`; o
 * filtro exige que o mutex AINDA seja deste curador. Sem ele, quem perdeu o
 * caso por expiração no meio da ação fechava por cima de quem tomou o lugar.
 * O default `null` casa exatamente com "caso não reivindicado", que é o
 * estado em que o serviço é chamado direto (fora das rotas).
 */
async function fecharCaso(caso, { decisao, adminId, observacao = null, motivoDecisao = null, abuso = false, agora = new Date(), token = null }) {
  const Sinalizacao = require('../models/Sinalizacao');
  const CasoCuradoria = require('../models/CasoCuradoria');
  const decidido = await CasoCuradoria.findOneAndUpdate(
    { _id: caso._id, emAberto: true, reivindicadoEm: token },
    {
      $set: {
        emAberto: false, status: 'fechado', decisao,
        decididoPor: String(adminId), decisaoEm: agora, observacao,
        // Grava SEMPRE, inclusive null (fix round T4, item 5) — um "solicitar
        // correção" anterior deixava motivoDecisao preenchido; sem sobrescrever
        // aqui, um "aprovar" logo depois herdaria esse texto e o histórico
        // mostraria um "motivo" numa aprovação que não teve motivo.
        motivoDecisao, sinalizacoesAbusivas: !!abuso, reivindicadoEm: null,
      },
    },
    { new: true },
  );
  if (!decidido) {
    throw Object.assign(new Error('Caso já fechado.'), { status: 409 });
  }
  if (abuso) {
    await Sinalizacao.updateMany({ seriesId: caso.seriesId, revisadaEm: null, valida: true }, { $set: { valida: false, invalidaMotivo: 'abuso' } });
  }
  await Sinalizacao.updateMany({ seriesId: caso.seriesId, revisadaEm: null }, { $set: { revisadaEm: agora } });
  return decidido;
}

module.exports = {
  contarConsumidoresUnicos, contarSinalizacoes, avaliarObra, dispararAvaliacao, flushForTests,
  reavaliarPendentes, iniciarReavaliacaoPeriodica, pararReavaliacaoPeriodica,
  enviarAvisoArtista, reivindicarCaso, devolverReivindicacao, fecharCaso,
  TEXTOS, ROTULO_MOTIVO, ROTULO_RATING,
};
