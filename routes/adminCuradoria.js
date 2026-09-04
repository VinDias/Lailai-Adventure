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
      // contas que completaram a idade mínima. Fix round T4 (item 6): um
      // erro aqui (ex. o aggregate de candidatas de Sinalizacao fora do ar)
      // não pode derrubar a fila inteira — a listagem em si não depende do
      // resultado.
      try {
        await svc.reavaliarPendentes();
      } catch (err) {
        logger.error('[AdminCuradoria] reavaliarPendentes falhou ao abrir a fila', err && err.message);
      }
    }
    // O histórico filtra por `status:'fechado'`, NÃO por `emAberto:false`
    // (consolidação, item 6): um caso que ficou meio-fechado por falha
    // parcial não pode se disfarçar de decidido no histórico — só o `status`
    // diz que houve decisão. A fila continua sendo `emAberto:true` (o índice
    // {emAberto, prioridade, abertoEm} serve esse ramo); caso REIVINDICADO
    // continua aberto e continua listado — o mutex vive em `reivindicadoEm`.
    const casos = await CasoCuradoria.find(historico ? { status: 'fechado' } : { emAberto: true })
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

// `observacao` é OPCIONAL e interna (nunca vai ao artista — fecharCaso grava
// em CasoCuradoria.observacao). Fix round T4 (item 3): antes o valor era
// coagido com String(...).slice(0, 2000) — um objeto/array virava
// "[object Object]" salvo silenciosamente, igual ao bug já corrigido para
// `descricao` em routes/sinalizacao.js (fix round T3, item 6). Aqui o campo é
// 400 explícito, não truncamento silencioso.
function observacaoDe(req) {
  const v = req.body.observacao;
  if (v === undefined || v === null) return { observacao: null };
  if (typeof v !== 'string') return { error: 'observacao deve ser texto.' };
  if (v.length > 2000) return { error: 'observacao deve ter no máximo 2000 caracteres.' };
  return { observacao: v };
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

// Mutex das 4 ações (svc.reivindicarCaso). 409 com mensagem PRÓPRIA: "já
// fechado" (de carregarCasoAberto) e "outro curador decidindo agora" são
// situações diferentes para quem está na tela. Devolve true se pode seguir.
const EM_DISPUTA = 'Este caso está sendo decidido por outro curador. Recarregue a fila.';
async function reivindicar(caso, res) {
  if (await svc.reivindicarCaso(caso._id)) return true;
  res.status(409).json({ error: EM_DISPUTA });
  return false;
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
    const obs = observacaoDe(req);
    if (obs.error) return res.status(400).json({ error: obs.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    // `aprovar` não altera a obra, mas reivindica pelo mesmo motivo que as
    // outras três: sem passar pelo mutex ela venceria o fechamento de um
    // `remover` que JÁ despublicou a obra — o artista receberia "obra mantida
    // sem alterações" com a obra fora do ar (rodada 2).
    if (!await reivindicar(caso, res)) return;
    try {
      const abuso = req.body.abuso === true;
      const fechado = await svc.fecharCaso(caso, { decisao: 'aprovar', adminId: req.user.id, observacao: obs.observacao, abuso });
      const series = await Series.findById(caso.seriesId).select('title channelId').lean();
      const aviso = await avisar(series, series ? svc.TEXTOS.aprovar(series.title) : '', req.user.id);
      await logAdmin(req, 'CURADORIA_APROVAR', caso, { abuso, avisoArtista: aviso.status });
      res.json({ caso: fechado });
    } catch (err) {
      await svc.devolverReivindicacao(caso._id);
      throw err;
    }
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/aprovar'); }
});

router.post('/curadoria/:casoId/reclassificar', async (req, res) => {
  try {
    const { content_rating } = req.body;
    if (!RATINGS.includes(content_rating)) {
      return res.status(400).json({ error: 'content_rating deve ser kids, teen ou young.' });
    }
    const obs = observacaoDe(req);
    if (obs.error) return res.status(400).json({ error: obs.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    // REIVINDICA antes de tocar na obra — ver svc.reivindicarCaso. Quem perde
    // a corrida responde 409 sem ter reclassificado nada; qualquer falha
    // daqui em diante devolve o mutex e o caso volta inteiro para a fila.
    if (!await reivindicar(caso, res)) return;
    try {
      const { applySeriesUpdate } = require('../services/seriesPublishService');
      await applySeriesUpdate(caso.seriesId, { content_rating });
      const fechado = await svc.fecharCaso(caso, { decisao: 'reclassificar', adminId: req.user.id, observacao: obs.observacao, motivoDecisao: content_rating });
      const series = await Series.findById(caso.seriesId).select('title channelId').lean();
      const aviso = await avisar(series, series ? svc.TEXTOS.reclassificar(series.title, svc.ROTULO_RATING[content_rating]) : '', req.user.id);
      await logAdmin(req, 'CURADORIA_RECLASSIFICAR', caso, { content_rating, avisoArtista: aviso.status });
      res.json({ caso: fechado });
    } catch (err) {
      await svc.devolverReivindicacao(caso._id);
      // A obra pode JÁ ter sido reclassificada com o caso ainda aberto: a
      // ordem (reivindicar -> alterar obra -> fechar) é a única que garante
      // que ninguém mais mexe na obra deste caso. Repetir a ação é
      // idempotente (applySeriesUpdate com o mesmo valor é no-op).
      logger.error(`[AdminCuradoria] reclassificar falhou APÓS alterar a obra ${caso.seriesId} — caso ${caso._id} continua aberto`, err && err.message);
      throw err;
    }
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/reclassificar'); }
});

router.post('/curadoria/:casoId/solicitar-correcao', async (req, res) => {
  try {
    const t = textoAdmin(req.body.texto, 'texto');
    if (t.error) return res.status(400).json({ error: t.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    const series = await Series.findById(caso.seriesId).select('title channelId').lean();
    // 'sem_canal' é entrada inválida do curador (não há artista para pedir a
    // correção — nada muda no caso, use outra ação), então é conferido ANTES
    // de qualquer escrita e antes até de reivindicar; 'falhou' é falha NOSSA
    // e vira 500 (fix round T4, item 2) — as duas caíam no mesmo
    // `!== 'enviado'` e escondiam a diferença.
    const canal = series && series.channelId
      ? await Channel.findById(series.channelId).select('_id').lean()
      : null;
    if (!canal) {
      return res.status(400).json({ error: 'Obra sem canal: não há artista para avisar. Use aprovar, reclassificar ou remover.' });
    }
    if (!await reivindicar(caso, res)) return;
    try {
      // Update CONDICIONAL a `emAberto:true`, ANTES de enviar a mensagem
      // (consolidação, item 2): o `caso.save()` de antes escrevia sobre um
      // documento lido dois awaits atrás — um `aprovar` concorrente fechava o
      // caso e este save gravava `status:'aguardando_artista'` por cima,
      // deixando o caso fora da fila, no histórico e em 409 para sempre. Se o
      // envio falhar DEPOIS, o caso fica em aguardando_artista sem mensagem e
      // o curador repete a ação (nenhum dado fica inconsistente). Dois
      // curadores pedindo correção ao mesmo tempo não passam mais os dois
      // (mutex), mas o mesmo curador repetindo gera 2 mensagens — aceito.
      // Esta é a única ação que NÃO fecha o caso, então ela mesma libera o
      // mutex no próprio $set.
      const atualizado = await CasoCuradoria.updateOne(
        { _id: caso._id, emAberto: true },
        { $set: { status: 'aguardando_artista', motivoDecisao: t.texto, reivindicadoEm: null } },
      );
      if (atualizado.matchedCount === 0) {
        await svc.devolverReivindicacao(caso._id);
        return res.status(409).json({ error: 'Caso já fechado.' });
      }
      caso.status = 'aguardando_artista';
      caso.motivoDecisao = t.texto;
      const aviso = await avisar(series, svc.TEXTOS.solicitarCorrecao(series.title, t.texto), req.user.id);
      if (aviso.status !== 'enviado') {
        return res.status(500).json({ error: 'Não foi possível enviar a mensagem ao artista.' });
      }
      await logAdmin(req, 'CURADORIA_SOLICITAR_CORRECAO', caso, { mensagemId: String(aviso.mensagemId) });
      res.json({ caso });
    } catch (err) {
      await svc.devolverReivindicacao(caso._id);
      throw err;
    }
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/solicitar-correcao'); }
});

router.post('/curadoria/:casoId/remover', async (req, res) => {
  try {
    const t = textoAdmin(req.body.motivo, 'motivo');
    if (t.error) return res.status(400).json({ error: t.error });
    const obs = observacaoDe(req);
    if (obs.error) return res.status(400).json({ error: obs.error });
    const caso = await carregarCasoAberto(req, res);
    if (!caso) return;
    // REIVINDICA o caso ANTES de despublicar. Sem isto, um curador que
    // perdesse a corrida na hora de fechar já teria tirado a obra do ar —
    // 409 na resposta, obra despublicada, ZERO AdminLog e o artista recebendo
    // "obra mantida sem alterações" do vencedor (viola a regra 1 do Vin:
    // quem muda a obra é quem decide o caso).
    if (!await reivindicar(caso, res)) return;
    try {
      // DESPUBLICAR, nunca DELETE (regra 1): episódios, favoritos e votos de
      // terceiros ficam; o artista pode corrigir e reenviar. Obra já
      // despublicada por fora -> no-op do update, o caso fecha normalmente.
      // Fix round T4 (item 1): submittedAt:null junto — uma obra publicada
      // pelo PUT genérico do admin pode ainda ter submittedAt preenchido; sem
      // limpar aqui ela cairia direto em GET /aprovacoes (filtro
      // submittedAt!=null && !isPublished) antes do artista sequer reenviar.
      const { applySeriesUpdate } = require('../services/seriesPublishService');
      await applySeriesUpdate(caso.seriesId, { isPublished: false, submittedAt: null });
      const fechado = await svc.fecharCaso(caso, { decisao: 'remover', adminId: req.user.id, observacao: obs.observacao, motivoDecisao: t.texto });
      const series = await Series.findById(caso.seriesId).select('title channelId').lean();
      const aviso = await avisar(series, series ? svc.TEXTOS.remover(series.title, t.texto) : '', req.user.id);
      await logAdmin(req, 'CURADORIA_REMOVER', caso, { motivo: t.texto, avisoArtista: aviso.status });
      res.json({ caso: fechado });
    } catch (err) {
      await svc.devolverReivindicacao(caso._id);
      // LIMITAÇÃO DECLARADA: se a falha veio DEPOIS do applySeriesUpdate, a
      // obra já está fora do ar com o caso ainda aberto na fila. Inverter a
      // ordem não resolve (aí a obra ficaria no ar com o caso fechado, que é
      // pior: some da fila). O caso volta destravado e repetir a ação é
      // idempotente — este log é o que liga uma coisa à outra na apuração.
      logger.error(`[AdminCuradoria] remover falhou APÓS alterar a obra ${caso.seriesId} — caso ${caso._id} continua aberto`, err && err.message);
      throw err;
    }
  } catch (err) { tratarErro(err, res, 'POST /curadoria/:casoId/remover'); }
});

module.exports = router;
