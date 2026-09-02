const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const Vote = require('../models/Vote');
const SeriesVote = require('../models/SeriesVote');
const verifyToken = require('../middlewares/verifyToken');
const requireAdmin = require('../middlewares/requireAdmin');
const optionalAuth = require('../middlewares/optionalAuth');
const getIdentity = require('../utils/requestIdentity');
const logger = require('../utils/logger');
const pick = require('../utils/pick');
const { podeVerRascunho } = require('../utils/ownership');

const SERIES_FIELDS = ['title', 'genre', 'description', 'cover_image', 'isPremium', 'content_type', 'order_index', 'isPublished', 'channelId', 'releaseDay', 'tags'];
const EPISODE_FIELDS = ['seriesId', 'episode_number', 'title', 'description', 'video_url', 'bunnyVideoId', 'thumbnail', 'duration', 'isPremium', 'order_index', 'status', 'hlsAudioLabels',
  'audioTrack1Url', 'audioTrack1Lang', 'audioTrack2Url', 'audioTrack2Lang', 'audioTrack3Url', 'audioTrack3Lang', 'audioTrack4Url', 'audioTrack4Lang'];

// ─── SEARCH GLOBAL ──────────────────────────────────────────────────────────

// GET /api/content/search?q=... — busca séries e episódios
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const raw = String(req.query.q || '').trim();
    if (raw.length < 2) return res.json({ series: [], episodes: [] });

    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const seriesFilter = {
      isPublished: true,
      $or: [{ title: regex }, { genre: regex }, { description: regex }]
    };

    // Conteúdo premium aparece para todos — free vê anúncio antes de consumir (gate no cliente).
    // status: 'published' — Fase 5 Bloco 1, Task 2 ("Drafts invisíveis ao
    // público"): capítulo draft não deve aparecer na busca, mesmo que a série
    // já esteja publicada.
    const episodeFilter = { title: regex, status: 'published' };

    const [series, episodes] = await Promise.all([
      Series.find(seriesFilter).limit(20).lean(),
      Episode.find(episodeFilter)
        .limit(20)
        .populate('seriesId', 'title content_type cover_image isPublished')
        .lean()
    ]);

    const visibleEpisodes = episodes
      .filter(ep => ep.seriesId && ep.seriesId.isPublished !== false)
      .map(ep => ({
        _id: ep._id,
        title: ep.title,
        episode_number: ep.episode_number,
        thumbnail: ep.thumbnail,
        isPremium: ep.isPremium,
        seriesId: ep.seriesId?._id,
        seriesTitle: ep.seriesId?.title,
        content_type: ep.seriesId?.content_type
      }));

    res.json({ series, episodes: visibleEpisodes });
  } catch (err) {
    logger.error('[Content] GET /search', err);
    res.status(500).json({ error: 'Erro ao buscar conteúdo.' });
  }
});

// ─── AGENDA ─────────────────────────────────────────────────────────────────

// GET /api/content/agenda — público. Séries publicadas com dia de lançamento
// definido, agrupadas por dia da semana (0=domingo..6=sábado, Date.getDay()).
// Posicionada antes de /series/:id — "agenda" não colide com nenhum padrão
// de rota deste router (sem catch-all de segmento único aqui).
router.get('/agenda', async (req, res) => {
  try {
    const series = await Series.find({ isPublished: true, releaseDay: { $ne: null } })
      .select('title cover_image content_type releaseDay order_index')
      .sort({ order_index: 1, title: 1 })
      .lean();

    // Todos os 7 grupos presentes, mesmo vazios — o front não precisa checar existência.
    const agenda = { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
    for (const serie of series) {
      agenda[String(serie.releaseDay)].push({
        _id: serie._id,
        title: serie.title,
        cover_image: serie.cover_image,
        content_type: serie.content_type,
        releaseDay: serie.releaseDay,
      });
    }

    res.json(agenda);
  } catch (err) {
    logger.error('[Content] GET /agenda', err);
    res.status(500).json({ error: 'Erro ao buscar agenda de lançamentos.' });
  }
});

// ─── SERIES ────────────────────────────────────────────────────────────────

// GET /api/content/series — listar séries publicadas
router.get('/series', async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { isPublished: true };
    if (type) filter.content_type = type;

    const series = await Series.find(filter)
      .sort({ order_index: 1, createdAt: -1 })
      .lean();

    res.json(series);
  } catch (err) {
    logger.error('[Content] GET /series', err);
    res.status(500).json({ error: 'Erro ao buscar séries.' });
  }
});

// GET /api/content/series/:id — detalhes de uma série
// optionalAuth: rascunho (isPublished:false) é 404 pra qualquer viewer que
// não seja admin ou dono do canal da série (Fase 5 Bloco 1, Task 2 — "Drafts
// invisíveis ao público"). 404, nunca 403: não confirma a existência do
// rascunho a quem não tem acesso.
router.get('/series/:id', optionalAuth, async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).lean();
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    if (!series.isPublished && !(await podeVerRascunho(req.user, series.channelId))) {
      return res.status(404).json({ error: 'Série não encontrada.' });
    }

    res.json(series);
  } catch (err) {
    logger.error('[Content] GET /series/:id', err);
    res.status(500).json({ error: 'Erro ao buscar série.' });
  }
});

// POST /api/content/series — criar série (admin)
router.post('/series', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, cover_image, isPremium, content_type, order_index, isPublished, channelId, releaseDay, tags } = req.body;
    if (!title || !genre || !content_type) {
      return res.status(400).json({ error: 'title, genre e content_type são obrigatórios.' });
    }

    // Tradução automática de gênero/descrição (EN/ES/ZH). Não-crítico: falha
    // ou serviço indisponível não impedem o save (UI cai no PT).
    const translationService = require('../services/translationService');
    const translations = await translationService.buildTranslationsSafe({ genre, description }, `série "${title}"`);

    const series = await Series.create({
      title, genre, description, cover_image, isPremium, content_type, order_index, isPublished, releaseDay, tags,
      ...(channelId ? { channelId } : {}),
      ...(translations ? { translations } : {})
    });
    logger.info(`[Admin] Série criada: ${title}`);
    res.status(201).json(series);
  } catch (err) {
    // tags (Bloco 4) tem validação no schema (0 ou 5–15, ver models/Series.js)
    // — sem este tratamento, ValidationError cairia no catch genérico e
    // viraria 500 em vez de 400.
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Content] POST /series', err);
    res.status(500).json({ error: 'Erro ao criar série.' });
  }
});

// PUT /api/content/series/:id — editar série (admin)
router.put('/series/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const updates = pick(req.body, SERIES_FIELDS);

    // Busca única do documento atual — reaproveitada pela validação de
    // genre abaixo, pelas traduções e pela detecção de republicação.
    const current = await Series.findById(req.params.id).select('genre description isPublished').lean();
    if (!current) return res.status(404).json({ error: 'Série não encontrada.' });

    // genre é required condicional a isPublished (ver models/Series.js),
    // mas required: function() do Mongoose não enxerga o documento
    // persistido no caminho de update — findByIdAndUpdate roda o validator
    // no contexto da query, não do doc, então nada barraria publicar sem
    // gênero ou apagar o gênero de uma série já publicada. Calculamos o
    // ESTADO FINAL (doc atual mesclado com o payload) e barramos aqui.
    const generoFinal = 'genre' in updates ? updates.genre : current.genre;
    // A comparação precisa reconhecer TODOS os formatos que o cast de
    // Boolean do Mongoose converte para true no update ('true', 1, '1',
    // 'yes', ...) — lista manual divergiria do cast real (foi o caso:
    // 'yes' escapava). Fonte única: o Set convertToTrue do próprio Mongoose.
    const publicadoFinal = 'isPublished' in updates
      ? mongoose.Schema.Types.Boolean.convertToTrue.has(updates.isPublished)
      : current.isPublished;
    if (publicadoFinal === true && (!generoFinal || !String(generoFinal).trim())) {
      return res.status(400).json({ error: 'Série publicada precisa de gênero preenchido.' });
    }

    // Gênero/descrição mudaram → refaz as traduções com os valores mesclados
    // (o campo não enviado mantém o valor atual do documento).
    if ('genre' in updates || 'description' in updates) {
      const translationService = require('../services/translationService');
      const translations = await translationService.buildTranslationsSafe({
        genre: updates.genre ?? current.genre,
        description: updates.description ?? current.description,
      }, `série ${req.params.id}`);
      if (translations) updates.translations = translations;
    }

    // isPublished está no body → precisamos do valor ANTERIOR (antes do
    // update) para detectar a transição falso→verdadeiro: série que volta a
    // publicar "destrava" capítulos que ficaram sem notificar enquanto ela
    // estava despublicada (o claim de notifyEpisodePublished os poupou).
    const estavaDespublicada = !current.isPublished;

    const series = await Series.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    // publicadoFinal (e não === true estrito) para o redisparo acompanhar o
    // mesmo critério do gate: qualquer formato que o cast publica, redispara.
    if (estavaDespublicada && 'isPublished' in updates && publicadoFinal) {
      redispararNotificacoesDaSerie(series._id);
    }

    res.json(series);
  } catch (err) {
    // Mesmo tratamento do POST: tags inválidas (0 ou 5–15, ver models/Series.js)
    // geram ValidationError no runValidators do findByIdAndUpdate — sem isto
    // cairia no catch genérico e viraria 500 em vez de 400.
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Content] PUT /series/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar série.' });
  }
});

/**
 * Série volta a ser publicada (isPublished falso→verdadeiro): re-dispara o
 * push dos capítulos que já estavam `status: 'published'` mas ficaram sem
 * notificar enquanto a obra estava despublicada (notifyEpisodePublished
 * desfaz o claim nesse caso — ver services/notificationService.js). Episódios
 * já notificados (notificationSentAt preenchido) ficam naturalmente de fora
 * do filtro. Fire-and-forget e SEQUENCIAL (sem Promise.all) — pode haver
 * muitos episódios e publicar a série nunca deve esperar o envio.
 */
function redispararNotificacoesDaSerie(seriesId) {
  // Gatilho de recálculo (Etapa 11 do PDF, ledger Task 5): a série voltou a
  // publicar — mesmo ponto de disparo do push acima, 3º dos 6 "capítulo
  // publicado" (a republicação de série é o que reativa capítulos que
  // ficaram represados). Fire-and-forget, molde do Bloco 2.
  require('../services/recommendationService').dispararRecalculo(seriesId, 'capitulo_publicado');

  (async () => {
    const notificationService = require('../services/notificationService');
    const episodios = await Episode.find({
      seriesId, status: 'published', notificationSentAt: null,
    }).select('_id').lean();

    for (const episode of episodios) {
      await notificationService
        .notifyEpisodePublished(episode._id)
        .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));
    }
  })().catch(err => logger.error('[Push] Falha ao redisparar notificações da série', err));
}

// DELETE /api/content/series/:id — remover série (admin)
router.delete('/series/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });
    // Remove episódios e todo o engajamento associado — sem isso, favoritos,
    // curtidas de obra e votos de episódio ficam órfãos no banco (e os órfãos
    // vazam no export LGPD apontando para séries inexistentes).
    // A série é apagada por ÚLTIMO: se alguma limpeza falhar, o DELETE pode
    // ser repetido (a série ainda existe); apagando primeiro, o retry daria
    // 404 e os órfãos ficariam permanentes.
    const Favorite = require('../models/Favorite');
    const SeriesVote = require('../models/SeriesVote');
    const episodes = await Episode.find({ seriesId: req.params.id }).select('_id').lean();
    const episodeIds = episodes.map(e => e._id);
    await Promise.all([
      Episode.deleteMany({ seriesId: req.params.id }),
      Favorite.deleteMany({ seriesId: req.params.id }),
      SeriesVote.deleteMany({ seriesId: req.params.id }),
      episodeIds.length ? Vote.deleteMany({ episodeId: { $in: episodeIds } }) : Promise.resolve()
    ]);
    await Series.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Série e episódios removidos.' });
  } catch (err) {
    logger.error('[Content] DELETE /series/:id', err);
    res.status(500).json({ error: 'Erro ao remover série.' });
  }
});

// ─── RECOMMENDATIONS ────────────────────────────────────────────────────────

const RECOMMENDATION_CONTENT_TYPES = ['hqcine', 'vcine', 'hiqua'];

// GET /api/content/recommendations?type=hqcine|vcine|hiqua — Fase 4, Bloco 4
// (Etapa 10 do PDF): lista de séries publicadas do tipo, na ordem da
// recomendação 50/30/20 (services/recommendationService.buildRecommendations).
// `optionalAuth` + a MESMA identidade anônima do progresso (Bloco 1,
// utils/requestIdentity — header X-Anonymous-Id, ver routes/progress.js)
// alimentam a Afinidade do leitor. QUALQUER falha do serviço (score ausente,
// agregação, o que for) NUNCA vira 500 — degrada para a MESMA query manual
// do GET /series acima (spec, seção "Rotas": "NUNCA 500 por falha de score —
// degrada para a ordem manual"; ledger P3).
router.get('/recommendations', optionalAuth, async (req, res) => {
  const { type } = req.query;
  if (!RECOMMENDATION_CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type é obrigatório e deve ser um de: ${RECOMMENDATION_CONTENT_TYPES.join(', ')}.` });
  }

  const identity = getIdentity(req) || {};

  try {
    const recomendadas = await require('../services/recommendationService').buildRecommendations({
      contentType: type,
      userId: identity.userId,
      anonymousId: identity.anonymousId,
    });
    return res.json(recomendadas);
  } catch (err) {
    logger.error('[Content] GET /recommendations — degradando para a ordem manual', err);
    try {
      const fallback = await Series.find({ isPublished: true, content_type: type })
        .sort({ order_index: 1, createdAt: -1 })
        .lean();
      return res.json(fallback);
    } catch (fallbackErr) {
      // A própria query de fallback falhou (ex.: banco fora do ar) — aí sim
      // não há mais degradação possível.
      logger.error('[Content] GET /recommendations — fallback também falhou', fallbackErr);
      return res.status(500).json({ error: 'Erro ao buscar recomendações.' });
    }
  }
});

// ─── EPISODES ───────────────────────────────────────────────────────────────

// GET /api/content/series/:id/episodes — episódios de uma série
// Todos os episódios PUBLICADOS aparecem para todos os usuários (isPremium
// vai no JSON pro cliente exibir badge e decidir o anúncio pra usuários
// free) — sem paywall na listagem. Episódio draft/processing só aparece pro
// admin ou pro dono do canal da série (Fase 5 Bloco 1, Task 2 — "Drafts
// invisíveis ao público"; o portal do ilustrador, Task 4, precisa ver o
// status dos próprios rascunhos). Série inexistente OU rascunho (isPublished
// false) fora do alcance do viewer: [] com 200 — mantém o contrato já
// existente pra série inexistente, sem confirmar a existência do rascunho.
router.get('/series/:id/episodes', optionalAuth, async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).select('isPublished channelId').lean();
    const podeVerRascunhos = series ? await podeVerRascunho(req.user, series.channelId) : false;

    if (!series || (!series.isPublished && !podeVerRascunhos)) {
      return res.json([]);
    }

    const filter = { seriesId: req.params.id };
    if (!podeVerRascunhos) filter.status = 'published';

    const episodes = await Episode.find(filter)
      .sort({ order_index: 1, episode_number: 1 })
      .lean();
    res.json(episodes);
  } catch (err) {
    logger.error('[Content] GET /series/:id/episodes', err);
    res.status(500).json({ error: 'Erro ao buscar episódios.' });
  }
});

// GET /api/content/episodes/:id — detalhes de um episódio
// Episódio draft/processing (ou publicado numa série ainda não publicada) só
// é visível pro admin ou pro dono do canal da série (Fase 5 Bloco 1, Task 2
// — "Drafts invisíveis ao público"); qualquer outro viewer leva 404 — nunca
// 403, pra não confirmar a existência do rascunho. Views/telemetria de
// royalties só incrementam quando o episódio É de fato público: um admin/
// dono revisando o próprio rascunho (QA/preview) não deve inflar contador
// nem gerar EngagementEvent.
router.get('/episodes/:id', optionalAuth, async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id)
      .populate('seriesId', 'title content_type isPublished channelId')
      .lean();
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    const serieDoEpisodio = episode.seriesId; // populate — pode vir null (série apagada)
    const publicado = episode.status === 'published' && !!serieDoEpisodio && serieDoEpisodio.isPublished === true;

    if (!publicado) {
      const podeVer = serieDoEpisodio && await podeVerRascunho(req.user, serieDoEpisodio.channelId);
      if (!podeVer) return res.status(404).json({ error: 'Episódio não encontrado.' });
    }

    // Conteúdo premium é entregue completo para qualquer usuário — quem decide
    // exibir anúncio antes é o cliente, com base em user.isPremium.

    if (publicado) {
      // Incrementa views de forma não bloqueante
      Episode.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } })
        .exec()
        .catch(err => logger.error(`[Content] Erro ao incrementar views do episódio ${req.params.id}`, err));

      // Telemetria de royalties (fire-and-forget): webtoon conta como leitura,
      // vídeo como view. Dedupe/anti-fraude ficam no engagementLogger.
      //
      // DECISÃO (Task 5, ledger — gatilho de recálculo "view/read" da Etapa 11
      // do PDF): NÃO dispara recommendationService.dispararRecalculo aqui. Esta
      // é a rota de MAIOR volume do backend inteiro — toda abertura de
      // episódio passa por ela — e computeSeriesScore refaz o contexto de
      // normalização varrendo o catálogo publicado do MESMO content_type,
      // custo real O(catálogo do tipo) por gatilho (CORRIGIDO na revisão da T8
      // e de novo no fix round da revisão final, Item 4 — a estimativa antiga
      // deste comentário, "~10 agregações", estava errada; ver nota completa
      // em services/progressService.js, dispararSeConcluido). Mesmo um cheque
      // barato de "computedAt > 1h" antes de decidir ainda seria uma query
      // extra na rota mais quente do app, por um ganho marginal: o efeito de
      // UMA view isolada no score é minúsculo, e nenhum dado se perde (o
      // EngagementEvent é gravado de qualquer jeito, logo abaixo — a
      // releitura fica disponível para o próximo cálculo). Os outros 5
      // gatilhos (voto, favorito, Super Reader, conclusão de leitura, capítulo
      // publicado) cobrem os sinais fortes de imediato; a varredura periódica
      // de 24h (services/recommendationService.iniciarVarreduraPeriodica)
      // absorve a deriva orgânica de views/releituras ao longo do tempo.
      const engagementLogger = require('../services/engagementLogger');
      engagementLogger.logEvent({
        type: serieDoEpisodio.content_type === 'hiqua' ? 'read' : 'view',
        seriesId: serieDoEpisodio._id,
        episodeId: episode._id,
        userId: req.user?.id,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
    }

    res.json(episode);
  } catch (err) {
    logger.error('[Content] GET /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao buscar episódio.' });
  }
});

// POST /api/content/episodes — criar episódio (admin)
router.post('/episodes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { seriesId, episode_number, title, description, video_url, bunnyVideoId, thumbnail, duration, isPremium, order_index, status } = req.body;
    if (!seriesId || !episode_number || !title) {
      return res.status(400).json({ error: 'seriesId, episode_number e title são obrigatórios.' });
    }

    // Tradução automática da descrição (título do episódio fica intacto).
    const translationService = require('../services/translationService');
    const translations = await translationService.buildTranslationsSafe({ description }, `episódio "${title}"`);

    const episode = await Episode.create({
      seriesId, episode_number, title, description, video_url, bunnyVideoId, thumbnail, duration, isPremium, order_index, status,
      ...(translations ? { translations } : {})
    });
    logger.info(`[Admin] Episódio criado: ${title} (série: ${seriesId})`);

    // Episódio já nasce publicado (ex.: import retroativo) → dispara o push de
    // capítulo novo. Fire-and-forget: a criação nunca espera o envio terminar.
    if (episode.status === 'published') {
      require('../services/notificationService')
        .notifyEpisodePublished(episode._id)
        .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));

      // 1º dos 6 pontos de disparo do push (Task 5, ledger): mesmo gatilho
      // de recálculo, mesmo molde fire-and-forget.
      require('../services/recommendationService').dispararRecalculo(episode.seriesId, 'capitulo_publicado');
    }

    res.status(201).json(episode);
  } catch (err) {
    logger.error('[Content] POST /episodes', err);
    res.status(500).json({ error: 'Erro ao criar episódio.' });
  }
});

// PUT /api/content/episodes/:id — editar episódio (admin)
router.put('/episodes/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const updates = pick(req.body, EPISODE_FIELDS);

    // Descrição mudou → refaz as traduções.
    if ('description' in updates) {
      const translationService = require('../services/translationService');
      const translations = await translationService.buildTranslationsSafe(
        { description: updates.description }, `episódio ${req.params.id}`
      );
      if (translations) updates.translations = translations;
    }

    const episode = await Episode.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    // Edição publicou o episódio (ou ele já estava publicado) → dispara o
    // push. notifyEpisodePublished tem claim próprio (notificationSentAt):
    // se já foi enviado, a chamada é um no-op — seguro repetir aqui sempre
    // que o status resultante for "published".
    if (episode.status === 'published') {
      require('../services/notificationService')
        .notifyEpisodePublished(episode._id)
        .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));

      // 2º dos 6 pontos de disparo do push (Task 5, ledger).
      require('../services/recommendationService').dispararRecalculo(episode.seriesId, 'capitulo_publicado');
    }

    res.json(episode);
  } catch (err) {
    logger.error('[Content] PUT /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar episódio.' });
  }
});

// DELETE /api/content/episodes/:id — remover episódio (admin)
router.delete('/episodes/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await Episode.findByIdAndDelete(req.params.id);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    res.json({ success: true, message: 'Episódio removido.' });
  } catch (err) {
    logger.error('[Content] DELETE /episodes/:id', err);
    res.status(500).json({ error: 'Erro ao remover episódio.' });
  }
});

// POST /api/content/episodes/:id/panels — adicionar painéis webtoon (admin)
router.post('/episodes/:id/panels', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { panels } = req.body; // [{ image_url, order, translationLayers? }]
    if (!Array.isArray(panels) || panels.length === 0) {
      return res.status(400).json({ error: 'panels deve ser um array não vazio.' });
    }

    const episode = await Episode.findByIdAndUpdate(
      req.params.id,
      { $push: { panels: { $each: panels } } },
      { new: true }
    );
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    // 5º caminho de disparo: episódio publicado sem conteúdo (esqueleto)
    // ganha o primeiro painel aqui. O claim + a guarda de conteúdo em
    // notifyEpisodePublished fazem o resto — este é o único anexo que de
    // fato envia; os seguintes são no-op (claim já consumido).
    if (episode.status === 'published') {
      require('../services/notificationService')
        .notifyEpisodePublished(episode._id)
        .catch(err => logger.error('[Push] Falha no envio de capitulo novo', err));

      // 4º dos 6 pontos de disparo do push (Task 5, ledger).
      require('../services/recommendationService').dispararRecalculo(episode.seriesId, 'capitulo_publicado');
    }

    res.json({ success: true, panelCount: episode.panels.length, episode });
  } catch (err) {
    logger.error('[Content] POST /episodes/:id/panels', err);
    res.status(500).json({ error: 'Erro ao adicionar painéis.' });
  }
});

// DELETE /api/content/episodes/:id/panels/:index — remover painel por índice (admin)
router.delete('/episodes/:id/panels/:index', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0 || index >= episode.panels.length) {
      return res.status(400).json({ error: 'Índice de painel inválido.' });
    }

    episode.panels.splice(index, 1);
    await episode.save();
    res.json({ success: true, panelCount: episode.panels.length });
  } catch (err) {
    logger.error('[Content] DELETE /episodes/:id/panels/:index', err);
    res.status(500).json({ error: 'Erro ao remover painel.' });
  }
});

// GET /api/content/ads — anúncios ativos (delegado ao ads router, mas mantemos compatibilidade)
router.get('/ads', async (req, res) => {
  try {
    const Ad = require('../models/Ad');
    // Respeita a janela de veiculação: startsAt/endsAt ausentes = sem restrição.
    // O admin salva as datas via <input type="date"> (meia-noite UTC), então
    // endsAt é comparado com o INÍCIO do dia atual para a data final ser
    // inclusiva — senão a campanha sumiria à 00:00 UTC do último dia,
    // perdendo o dia inteiro de veiculação.
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const ads = await Ad.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: startOfToday } }] }
      ]
    }).lean();
    res.json(ads);
  } catch (err) {
    res.json([]); // fallback vazio se modelo não existir ainda
  }
});

// ─── VOTES ───────────────────────────────────────────────────────────────────

// GET /api/content/episodes/:id/vote — voto atual do usuário
router.get('/episodes/:id/vote', verifyToken, async (req, res) => {
  try {
    const vote = await Vote.findOne({ userId: req.user.id, episodeId: req.params.id }).lean();
    res.json(vote ? { type: vote.type } : null);
  } catch (err) {
    logger.error('[Content] GET /episodes/:id/vote', err);
    res.status(500).json({ error: 'Erro ao buscar voto.' });
  }
});

// POST /api/content/episodes/:id/vote — criar ou atualizar voto
router.post('/episodes/:id/vote', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ error: 'type deve ser "like" ou "dislike".' });
    }

    const vote = await Vote.findOneAndUpdate(
      { userId: req.user.id, episodeId: req.params.id },
      { type },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, type: vote.type });
  } catch (err) {
    // Corrida de upsert (dois primeiros-votos simultâneos) gera E11000:
    // o voto foi gravado pela outra requisição — sucesso idempotente.
    if (err && err.code === 11000) return res.json({ success: true, type: req.body.type });
    logger.error('[Content] POST /episodes/:id/vote', err);
    res.status(500).json({ error: 'Erro ao registrar voto.' });
  }
});

// DELETE /api/content/episodes/:id/vote — remover voto
router.delete('/episodes/:id/vote', verifyToken, async (req, res) => {
  try {
    await Vote.findOneAndDelete({ userId: req.user.id, episodeId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('[Content] DELETE /episodes/:id/vote', err);
    res.status(500).json({ error: 'Erro ao remover voto.' });
  }
});

// GET /api/content/series/:id/vote — voto do usuário na série + total de likes
router.get('/series/:id/vote', optionalAuth, async (req, res) => {
  try {
    const [vote, likes] = await Promise.all([
      req.user ? SeriesVote.findOne({ userId: req.user.id, seriesId: req.params.id }).lean() : null,
      SeriesVote.countDocuments({ seriesId: req.params.id, type: 'like' })
    ]);
    res.json({ myVote: vote ? vote.type : null, likes });
  } catch (err) {
    logger.error('[Content] GET /series/:id/vote', err);
    res.status(500).json({ error: 'Erro ao buscar voto.' });
  }
});

// POST /api/content/series/:id/vote — criar ou atualizar voto na série
router.post('/series/:id/vote', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ error: 'type deve ser "like" ou "dislike".' });
    }

    const vote = await SeriesVote.findOneAndUpdate(
      { userId: req.user.id, seriesId: req.params.id },
      { type },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, type: vote.type });

    // Gatilho de recálculo (Etapa 11 do PDF, ledger Task 5): dispara SEMPRE.
    // O upsert acima não distingue "voto novo" de "voto repetido/trocado"
    // sem uma leitura extra antes de escrever — a spec autoriza "se a rota
    // não distingue, dispare sempre e documente" (barato e idempotente:
    // recalcular de novo com o mesmo voto não muda o resultado).
    require('../services/recommendationService').dispararRecalculo(req.params.id, 'voto_serie');
  } catch (err) {
    // Corrida de upsert (dois primeiros-votos simultâneos) gera E11000:
    // o voto foi gravado pela outra requisição — sucesso idempotente.
    if (err && err.code === 11000) {
      res.json({ success: true, type: req.body.type });
      require('../services/recommendationService').dispararRecalculo(req.params.id, 'voto_serie');
      return;
    }
    logger.error('[Content] POST /series/:id/vote', err);
    res.status(500).json({ error: 'Erro ao registrar voto.' });
  }
});

// DELETE /api/content/series/:id/vote — remover voto da série
router.delete('/series/:id/vote', verifyToken, async (req, res) => {
  try {
    await SeriesVote.findOneAndDelete({ userId: req.user.id, seriesId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('[Content] DELETE /series/:id/vote', err);
    res.status(500).json({ error: 'Erro ao remover voto.' });
  }
});

// ─── TRANSLATION LAYERS ───────────────────────────────────────────────────────

// PUT /api/content/episodes/:episodeId/panels/:panelIndex/translations — admin
router.put('/episodes/:episodeId/panels/:panelIndex/translations', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { language, imageUrl } = req.body;
    if (!language || !imageUrl) {
      return res.status(400).json({ error: 'language e imageUrl são obrigatórios.' });
    }

    const panelIndex = parseInt(req.params.panelIndex, 10);
    const episode = await Episode.findById(req.params.episodeId);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    if (!episode.panels[panelIndex]) return res.status(404).json({ error: 'Painel não encontrado.' });

    const panel = episode.panels[panelIndex];
    const existingLayerIndex = panel.translationLayers
      ? panel.translationLayers.findIndex(l => l.language === language)
      : -1;

    if (!panel.translationLayers) panel.translationLayers = [];

    if (existingLayerIndex >= 0) {
      panel.translationLayers[existingLayerIndex].imageUrl = imageUrl;
    } else {
      panel.translationLayers.push({ language, imageUrl });
    }

    episode.panels[panelIndex] = panel;
    episode.markModified('panels');
    await episode.save();

    res.json({ success: true, panel: episode.panels[panelIndex] });
  } catch (err) {
    logger.error('[Content] PUT /episodes/:episodeId/panels/:panelIndex/translations', err);
    res.status(500).json({ error: 'Erro ao atualizar camada de tradução.' });
  }
});

// DELETE /api/content/episodes/:episodeId/panels/:panelIndex/translations/:language — admin
router.delete('/episodes/:episodeId/panels/:panelIndex/translations/:language', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { language } = req.params;
    const panelIndex = parseInt(req.params.panelIndex, 10);
    const episode = await Episode.findById(req.params.episodeId);
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });
    if (!episode.panels[panelIndex]) return res.status(404).json({ error: 'Painel não encontrado.' });

    const panel = episode.panels[panelIndex];
    if (panel.translationLayers) {
      panel.translationLayers = panel.translationLayers.filter(l => l.language !== language);
    }

    episode.panels[panelIndex] = panel;
    episode.markModified('panels');
    await episode.save();

    res.json({ success: true, panel: episode.panels[panelIndex] });
  } catch (err) {
    logger.error('[Content] DELETE /episodes/:episodeId/panels/:panelIndex/translations/:language', err);
    res.status(500).json({ error: 'Erro ao remover camada de tradução.' });
  }
});

module.exports = router;
