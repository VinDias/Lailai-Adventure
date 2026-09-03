/**
 * Portal do Ilustrador — lado do EDITOR (Fase 5 Bloco 1). Task 6: mensagens
 * por canal (thread vigente + arquivadas — o admin vê tudo). Task 7: Fila de
 * Aprovação — `GET /admin/aprovacoes` (pendentes com preview), `POST
 * /admin/aprovacoes/series/:id/aprovar` e `/episodes/:id/aprovar` (rotas
 * separadas por tipo — cada uma tem sua própria regra de publicação) e
 * `POST /admin/aprovacoes/:tipo/:id/devolver` (genérica — devolver não
 * publica nada, o efeito é o mesmo nos dois tipos). Montado em `/api/admin`
 * (server.js), NÃO em `/api/admin/mensagens`.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const logger = require('../utils/logger');
const pick = require('../utils/pick');

const Channel = require('../models/Channel');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const MensagemPortal = require('../models/MensagemPortal');
const AdminLog = require('../models/AdminLog');

const REF_TIPOS = ['series', 'episode'];

/**
 * Valida refTipo/refId do POST admin (item 4 da Task 6): os dois são
 * opcionais, mas só como PAR (um sem o outro é erro); refTipo precisa estar
 * no enum; refId precisa ser um ObjectId válido; e o recurso referenciado
 * precisa PERTENCER ao canal informado — senão o editor apontaria a mensagem
 * (e, na Task 7, a devolução) para a obra errada, mesmo sem querer.
 * Devolve { refTipo, refId } prontos para gravar, ou { error }.
 */
async function validarRef(refTipo, refId, canalId) {
  if (refTipo === undefined && refId === undefined) {
    return { refTipo: null, refId: null };
  }
  if (!refTipo || !refId) {
    return { error: 'refTipo e refId devem ser enviados juntos.' };
  }
  if (!REF_TIPOS.includes(refTipo)) {
    return { error: 'refTipo deve ser "series" ou "episode".' };
  }
  if (!mongoose.Types.ObjectId.isValid(refId)) {
    return { error: 'refId inválido.' };
  }

  if (refTipo === 'series') {
    const series = await Series.findById(refId).select('channelId').lean();
    if (!series || !series.channelId || String(series.channelId) !== String(canalId)) {
      return { error: 'refId não corresponde a uma série deste canal.' };
    }
  } else {
    const episode = await Episode.findById(refId).select('seriesId').lean();
    if (!episode) return { error: 'refId não corresponde a um episódio deste canal.' };
    const series = await Series.findById(episode.seriesId).select('channelId').lean();
    if (!series || !series.channelId || String(series.channelId) !== String(canalId)) {
      return { error: 'refId não corresponde a um episódio deste canal.' };
    }
  }

  return { refTipo, refId };
}

// GET /api/admin/mensagens/:canalId — TODAS as threads do canal (vigente +
// arquivadas — o admin vê tudo, diferente do dono comum que só vê a
// vigente). Shape: agrupado por thread { ownerUserId, arquivadaEm } — vigente
// primeiro (no máximo uma), depois as arquivadas da transferência mais
// recente para a mais antiga; mensagens de cada thread em ordem ASC.
//
// DECISÃO (lidaEm simétrico — espelha GET /api/portal/mensagens): abrir esta
// tela marca como lida TODA mensagem do ILUSTRADOR ainda não lida NO CANAL
// INTEIRO — vigente E arquivadas. Não faz sentido manter uma thread arquivada
// eternamente "não lida": o admin já está vendo o histórico completo aqui.
// Mensagens do PRÓPRIO editor nunca são tocadas.
router.get('/mensagens/:canalId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const canal = await Channel.findById(req.params.canalId).lean();
    if (!canal) return res.status(404).json({ error: 'Canal não encontrado.' });

    await MensagemPortal.updateMany(
      { canalId: canal._id, autorTipo: 'ilustrador', lidaEm: null },
      { $set: { lidaEm: new Date() } }
    );

    const mensagens = await MensagemPortal.find({ canalId: canal._id }).sort({ createdAt: 1 }).lean();

    const threadsPorChave = new Map();
    for (const msg of mensagens) {
      const chave = `${msg.ownerUserId}:${msg.arquivadaEm ? new Date(msg.arquivadaEm).toISOString() : 'vigente'}`;
      if (!threadsPorChave.has(chave)) {
        threadsPorChave.set(chave, {
          ownerUserId: msg.ownerUserId,
          vigente: !msg.arquivadaEm,
          arquivadaEm: msg.arquivadaEm || null,
          mensagens: [],
        });
      }
      threadsPorChave.get(chave).mensagens.push(msg);
    }

    const threads = [...threadsPorChave.values()].sort((a, b) => {
      if (a.vigente !== b.vigente) return a.vigente ? -1 : 1;
      if (a.vigente) return 0; // só pode haver uma thread vigente por canal
      return new Date(b.arquivadaEm) - new Date(a.arquivadaEm);
    });

    res.json({ canalId: canal._id, threads });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Canal não encontrado.' });
    logger.error('[AdminPortal] GET /mensagens/:canalId', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens do canal.' });
  }
});

// POST /api/admin/mensagens/:canalId — cria mensagem do EDITOR na thread do
// DONO ATUAL do canal. ownerUserId é SEMPRE resolvido aqui a partir do
// channel.ownerId — nunca vem do body (ownerId é required no schema de
// Channel; mesmo um canal sem ilustrador "de verdade" vinculado tem um
// ownerId válido — a mensagem cai na thread desse dono, o que é o
// comportamento correto). refTipo/refId opcionais e validados por validarRef.
router.post('/mensagens/:canalId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const canal = await Channel.findById(req.params.canalId).lean();
    if (!canal) return res.status(404).json({ error: 'Canal não encontrado.' });

    const texto = req.body.texto;
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ error: 'texto é obrigatório.' });
    }

    const refResolvido = await validarRef(req.body.refTipo, req.body.refId, canal._id);
    if (refResolvido.error) {
      return res.status(400).json({ error: refResolvido.error });
    }

    const mensagem = await MensagemPortal.create({
      canalId: canal._id,
      ownerUserId: canal.ownerId,
      autorTipo: 'editor',
      autorUserId: req.user.id,
      texto,
      refTipo: refResolvido.refTipo,
      refId: refResolvido.refId,
    });

    res.status(201).json(mensagem);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'CastError') return res.status(404).json({ error: 'Canal não encontrado.' });
    logger.error('[AdminPortal] POST /mensagens/:canalId', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Fila de Aprovação (Task 7). Pendentes = submetidos pelo portal do
// ilustrador (submittedAt preenchido) e ainda não publicados — draft do
// próprio admin (fluxo atual: cria draft, publica depois pelo PUT normal)
// NUNCA teve submittedAt preenchido, então fica fora por construção (mesmo
// marcador que routes/portal.js usa para decidir "Enviar para aprovação").
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/aprovacoes — fila de pendentes. Shape FLAT com `tipo:
// 'series'|'episode'` (decisão desta task, não pinada pela spec): um card
// por item, todos ordenados juntos por antiguidade — a UI da T10 não
// precisa intercalar dois arrays de novo. Cada item traz o preview que o
// Master precisa pra decidir sem abrir a obra (spec, "Aprovação").
router.get('/aprovacoes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const [seriesPendentes, episodiosPendentes] = await Promise.all([
      Series.find({ submittedAt: { $ne: null }, isPublished: false })
        .select('title description cover_image content_rating_sugerida genre tags channelId submittedAt')
        .lean(),
      Episode.find({ submittedAt: { $ne: null }, status: { $ne: 'published' } })
        .select('title description thumbnail panels seriesId submittedAt')
        .lean(),
    ]);

    // Séries dos episódios pendentes (o preview do episódio precisa de
    // título + isPublished da série-mãe — é o que a T10 usa pra saber se
    // deve orientar "aprove a série primeiro"). Uma query só, sem N+1.
    const seriesIdsDosEpisodios = [...new Set(episodiosPendentes.map(e => String(e.seriesId)))];
    const seriesDosEpisodios = seriesIdsDosEpisodios.length
      ? await Series.find({ _id: { $in: seriesIdsDosEpisodios } }).select('title isPublished channelId').lean()
      : [];
    const seriePorId = new Map(seriesDosEpisodios.map(s => [String(s._id), s]));

    const canalIds = new Set();
    seriesPendentes.forEach(s => s.channelId && canalIds.add(String(s.channelId)));
    seriesDosEpisodios.forEach(s => s.channelId && canalIds.add(String(s.channelId)));
    const canais = canalIds.size
      ? await Channel.find({ _id: { $in: [...canalIds] } }).select('name').lean()
      : [];
    const canalPorId = new Map(canais.map(c => [String(c._id), c]));

    const previewCanal = (channelId) => {
      if (!channelId) return null;
      const canal = canalPorId.get(String(channelId));
      return { id: channelId, name: canal ? canal.name : null };
    };

    const itensSerie = seriesPendentes.map(s => ({
      tipo: 'series',
      id: s._id,
      title: s.title,
      description: s.description ?? null,
      cover_image: s.cover_image ?? null,
      content_rating_sugerida: s.content_rating_sugerida ?? null,
      genre: s.genre ?? null,
      tags: s.tags ?? [],
      canal: previewCanal(s.channelId),
      submittedAt: s.submittedAt,
    }));

    const itensEpisodio = episodiosPendentes.map(e => {
      const serie = seriePorId.get(String(e.seriesId));
      return {
        tipo: 'episode',
        id: e._id,
        title: e.title,
        description: e.description ?? null,
        thumbnail: e.thumbnail ?? null,
        panelCount: (e.panels || []).length,
        serie: serie ? { id: serie._id, title: serie.title, isPublished: !!serie.isPublished } : null,
        canal: previewCanal(serie && serie.channelId),
        submittedAt: e.submittedAt,
      };
    });

    const itens = [...itensSerie, ...itensEpisodio]
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

    res.json({ itens });
  } catch (err) {
    logger.error('[AdminPortal] GET /aprovacoes', err);
    res.status(500).json({ error: 'Erro ao montar a fila de aprovação.' });
  }
});

// POST /api/admin/aprovacoes/series/:id/aprovar — publica uma série
// submetida. genre/tags no body são OPCIONAIS: o Master pode preenchê-los
// na mesma ação (a série do portal nasce sem gênero — T1/T4). Reusa
// services/seriesPublishService.applySeriesUpdate — a MESMA função que
// PUT /api/content/series/:id chama — para o gênero final obrigatório, a
// tradução e o redisparo de push/recálculo seguirem exatamente a mesma
// regra dos dois caminhos, sem duplicar lógica que poderia divergir.
router.post('/aprovacoes/series/:id/aprovar', verifyToken, requireAdmin, async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).select('submittedAt isPublished').lean();
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });
    if (!series.submittedAt) {
      return res.status(400).json({ error: 'Esta série não está aguardando aprovação (nada a aprovar).' });
    }
    if (series.isPublished) {
      return res.status(400).json({ error: 'Série já publicada.' });
    }

    const updates = pick(req.body, ['genre', 'tags']);
    updates.isPublished = true;
    updates.submittedAt = null;

    const { applySeriesUpdate } = require('../services/seriesPublishService');
    let publicada;
    try {
      publicada = await applySeriesUpdate(req.params.id, updates);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
      throw err;
    }

    await AdminLog.create({
      adminId: req.user.id,
      action: 'APROVAR_SERIE_PORTAL',
      targetId: String(publicada._id),
      details: { title: publicada.title, genre: publicada.genre, tags: publicada.tags },
    });

    res.json(publicada);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Série não encontrada.' });
    logger.error('[AdminPortal] POST /aprovacoes/series/:id/aprovar', err);
    res.status(500).json({ error: 'Erro ao aprovar série.' });
  }
});

// POST /api/admin/aprovacoes/episodes/:id/aprovar — publica um episódio
// submetido. Regra da spec: só aprova se a SÉRIE já está publicada — se a
// série também está na fila, o Master aprova a série primeiro (a UI da T10
// ordena os cards nesse sentido; 400 orienta quem tentar fora de ordem).
// Dispara o MESMO par push+recálculo dos outros pontos de publicação de
// episódio (routes/content.js POST/PUT /episodes, services/
// episodePanelService.js, routes/bunnyWebhook.js×2) — mesmo padrão
// fire-and-forget, sem depender de nenhuma dessas rotas.
router.post('/aprovacoes/episodes/:id/aprovar', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    if (!episode.submittedAt) {
      return res.status(400).json({ error: 'Este episódio não está aguardando aprovação (nada a aprovar).' });
    }
    if (episode.status === 'published') {
      return res.status(400).json({ error: 'Episódio já publicado.' });
    }

    const series = await Series.findById(episode.seriesId).select('isPublished').lean();
    if (!series || !series.isPublished) {
      return res.status(400).json({ error: 'Aprove a série primeiro — este episódio pertence a uma série ainda não publicada.' });
    }

    episode.status = 'published';
    episode.submittedAt = null;
    await episode.save();

    require('../services/notificationService')
      .notifyEpisodePublished(episode._id)
      .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));
    require('../services/recommendationService').dispararRecalculo(episode.seriesId, 'capitulo_publicado');

    await AdminLog.create({
      adminId: req.user.id,
      action: 'APROVAR_EPISODIO_PORTAL',
      targetId: String(episode._id),
      details: { title: episode.title, seriesId: String(episode.seriesId) },
    });

    res.json(episode);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Episódio não encontrado.' });
    logger.error('[AdminPortal] POST /aprovacoes/episodes/:id/aprovar', err);
    res.status(500).json({ error: 'Erro ao aprovar episódio.' });
  }
});

// POST /api/admin/aprovacoes/:tipo/:id/devolver — devolve uma série ou
// episódio submetido: limpa submittedAt (volta a rascunho editável/reenviável
// pelo portal — routes/portal.js já trata submittedAt:null dessa forma) e
// cria a MensagemPortal do editor com refTipo/refId apontando o recurso,
// reusando o MESMO shape de POST /api/admin/mensagens/:canalId (Task 6).
// NÃO toca isPublished/status — só a aprovação publica. Devolver uma série
// NÃO devolve os episódios dela em cascata (spec, INFO da T4): cada
// capítulo é aprovado/devolvido um a um pelo Master.
router.post('/aprovacoes/:tipo/:id/devolver', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { tipo, id } = req.params;
    if (!REF_TIPOS.includes(tipo)) {
      return res.status(404).json({ error: 'Tipo inválido — use "series" ou "episode".' });
    }

    const texto = req.body.texto;
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ error: 'texto é obrigatório.' });
    }

    let resource, canalId;
    if (tipo === 'series') {
      resource = await Series.findById(id);
      if (!resource) return res.status(404).json({ error: 'Série não encontrada.' });
      canalId = resource.channelId;
    } else {
      resource = await Episode.findById(id);
      if (!resource) return res.status(404).json({ error: 'Episódio não encontrado.' });
      const serieDoEpisodio = await Series.findById(resource.seriesId).select('channelId').lean();
      canalId = serieDoEpisodio && serieDoEpisodio.channelId;
    }

    if (!resource.submittedAt) {
      return res.status(400).json({ error: 'Este item não está aguardando aprovação (nada a devolver).' });
    }
    if (!canalId) {
      return res.status(404).json({ error: 'Canal do recurso não encontrado.' });
    }

    const canal = await Channel.findById(canalId).lean();
    if (!canal) return res.status(404).json({ error: 'Canal não encontrado.' });

    resource.submittedAt = null;
    await resource.save();

    const mensagem = await MensagemPortal.create({
      canalId: canal._id,
      ownerUserId: canal.ownerId,
      autorTipo: 'editor',
      autorUserId: req.user.id,
      texto,
      refTipo: tipo,
      refId: resource._id,
    });

    await AdminLog.create({
      adminId: req.user.id,
      action: tipo === 'series' ? 'DEVOLVER_SERIE_PORTAL' : 'DEVOLVER_EPISODIO_PORTAL',
      targetId: String(resource._id),
      details: { texto, canalId: String(canal._id) },
    });

    res.json({ success: true, mensagem });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Recurso não encontrado.' });
    logger.error('[AdminPortal] POST /aprovacoes/:tipo/:id/devolver', err);
    res.status(500).json({ error: 'Erro ao devolver.' });
  }
});

module.exports = router;
