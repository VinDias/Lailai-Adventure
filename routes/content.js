const express = require('express');
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
const { getFiltroParental, serieVisivelPara } = require('../utils/parentalFilter');
const { addPanels } = require('../services/episodePanelService');
const { responderCastError } = require('../utils/routeErrors');

// content_rating (Fase 5 Bloco 2, Task 6): só o Master define — admin form
// (POST/PUT abaixo) e a Fila de Aprovação (routes/adminPortal.js, aprovar
// série). PORTAL SEGUE SEM o campo (PORTAL_SERIES_FIELDS não inclui —
// routes/portal.js, teste de allowlist em parentalFoundations.test.js).
const SERIES_FIELDS = ['title', 'genre', 'description', 'cover_image', 'isPremium', 'content_type', 'order_index', 'isPublished', 'channelId', 'releaseDay', 'tags', 'content_rating'];
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

    // Fase 5, Bloco 2, Task 4: fragmento do filtro parental (getFiltroParental
    // — {} pra anônimo/admin) mesclado no ramo SÉRIES.
    const filtroParental = await getFiltroParental(req.user);

    const seriesFilter = {
      isPublished: true,
      $or: [{ title: regex }, { genre: regex }, { description: regex }],
      ...filtroParental,
    };

    // Conteúdo premium aparece para todos — free vê anúncio antes de consumir (gate no cliente).
    // status: 'published' — Fase 5 Bloco 1, Task 2 ("Drafts invisíveis ao
    // público"): capítulo draft não deve aparecer na busca, mesmo que a série
    // já esteja publicada.
    const episodeFilter = { title: regex, status: 'published' };

    // Fase 5, Bloco 2, Task 5 (fix round): ramo EPISÓDIOS filtra QUERY-SIDE
    // — não mais post-filter com passaFiltroParental na série populada. O
    // post-filter anterior tinha DOIS problemas achados na revisão: (1) só
    // `isAdmin` pulava o predicado — visitante (sem `user`) caía direto em
    // passaFiltroParental(null, serie), que LANÇA se a série tiver
    // content_rating/tags genuinamente ausentes (doc legado), derrubando a
    // busca em 500 pra QUALQUER UM, inclusive anônimo; (2) o post-filter
    // rodava DEPOIS do `.limit(20)` do Episode.find — se os 20 episódios
    // mais recentes batendo no termo pertencessem todos a séries que o
    // perfil não vê, a resposta vinha vazia mesmo havendo episódios visíveis
    // fora da janela dos 20 (fome do limit).
    // idsVisiveis reusa o MESMO `filtroParental` já calculado pro ramo
    // SÉRIES acima (sem recomputar — 1 User.findById por request, não 2) —
    // query PRÓPRIA (sem o `$or` do termo de busca, sem limit): "quais
    // séries publicadas este perfil enxerga", igual às outras superfícies
    // de LISTA (T4). `{}` pra anônimo/admin → idsVisiveis = todas as
    // publicadas, sem tocar em content_rating/tags de doc nenhum — imune ao
    // throw do doc legado (o campo ausente nunca é lido aqui).
    const idsVisiveis = await Series.find({ isPublished: true, ...filtroParental }).distinct('_id');
    episodeFilter.seriesId = { $in: idsVisiveis };

    const [series, episodes] = await Promise.all([
      Series.find(seriesFilter).limit(20).lean(),
      Episode.find(episodeFilter)
        .limit(20)
        .populate('seriesId', 'title content_type cover_image')
        .lean()
    ]);

    const visibleEpisodes = episodes
      .filter(ep => ep.seriesId) // defesa contra a janela de corrida entre as duas queries (série apagada entre elas)
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
// optionalAuth (Fase 5, Bloco 2, Task 4): rota continua pública — só passa a
// enxergar `req.user` quando houver, pro filtro parental (getFiltroParental
// — {} pra anônimo/admin) entrar no Series.find.
router.get('/agenda', optionalAuth, async (req, res) => {
  try {
    const filtroParental = await getFiltroParental(req.user);
    const series = await Series.find({ isPublished: true, releaseDay: { $ne: null }, ...filtroParental })
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
// optionalAuth (Fase 5, Bloco 2, Task 4): rota continua pública — só passa a
// enxergar `req.user` quando houver, pro filtro parental entrar no filter.
router.get('/series', optionalAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const filtroParental = await getFiltroParental(req.user);
    const filter = { isPublished: true, ...filtroParental };
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
// Fase 5, Bloco 2, Task 5 (doc único): série PUBLICADA some pelo filtro
// parental (serieVisivelPara — admin e dono do canal enxergam mesmo com a
// própria tag bloqueada) com o MESMO 404 dos drafts — nunca confirma
// existência. O branch de rascunho continua INALTERADO (só podeVerRascunho,
// sem filtro parental) — composição pinada na spec. findById sem select traz
// content_rating/tags/channelId por padrão (doc completo), então o helper
// nunca vê campo undefined aqui.
router.get('/series/:id', optionalAuth, async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).lean();
    if (!series) return res.status(404).json({ error: 'Série não encontrada.' });

    if (!series.isPublished) {
      if (!(await podeVerRascunho(req.user, series.channelId))) {
        return res.status(404).json({ error: 'Série não encontrada.' });
      }
    } else if (!(await serieVisivelPara(req.user, series))) {
      return res.status(404).json({ error: 'Série não encontrada.' });
    }

    res.json(series);
  } catch (err) {
    // Fix round (Fase 5 Bloco 2, Task 8): id malformado (CastError no `_id`
    // do próprio findById) caía no catch genérico e virava 500 — pra
    // anônimo E logado, a rota é optionalAuth. Mesmo shape de "não
    // encontrada" que o id válido-mas-inexistente já usa acima.
    if (responderCastError(err, res, 'Série não encontrada.')) return;
    logger.error('[Content] GET /series/:id', err);
    res.status(500).json({ error: 'Erro ao buscar série.' });
  }
});

// POST /api/content/series — criar série (admin)
router.post('/series', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, genre, description, cover_image, isPremium, content_type, order_index, isPublished, channelId, releaseDay, tags, content_rating } = req.body;
    if (!title || !genre || !content_type) {
      return res.status(400).json({ error: 'title, genre e content_type são obrigatórios.' });
    }

    // Tradução automática de gênero/descrição (EN/ES/ZH). Não-crítico: falha
    // ou serviço indisponível não impedem o save (UI cai no PT).
    const translationService = require('../services/translationService');
    const translations = await translationService.buildTranslationsSafe({ genre, description }, `série "${title}"`);

    const series = await Series.create({
      title, genre, description, cover_image, isPremium, content_type, order_index, isPublished, releaseDay, tags, content_rating,
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

// PUT /api/content/series/:id — editar série (admin). A lógica de gênero
// required condicional/tradução/redisparo foi extraída para
// services/seriesPublishService.js (Fase 5 Bloco 1, Task 7) — a Fila de
// Aprovação (routes/adminPortal.js) reusa a MESMA função ao aprovar uma
// série do portal, em vez de duplicar estas regras.
router.put('/series/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const updates = pick(req.body, SERIES_FIELDS);
    const series = await require('../services/seriesPublishService').applySeriesUpdate(req.params.id, updates);
    res.json(series);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    // Mesmo tratamento de antes: gênero final ausente (400 com status
    // próprio) e tags inválidas (0 ou 5–15, ValidationError do runValidators
    // do findByIdAndUpdate) — sem isto cairia no catch genérico e viraria
    // 500 em vez de 400.
    if (err.status === 400 || err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    logger.error('[Content] PUT /series/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar série.' });
  }
});

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
      episodeIds.length ? Vote.deleteMany({ episodeId: { $in: episodeIds } }) : Promise.resolve(),
      // Fase 5 Bloco 3: sinalizações e casos da obra — sem isto, caso órfão
      // fica eterno na fila (obra null) e a sinalização vaza no export do
      // leitor apontando para série inexistente (o mesmo bug dos votos acima).
      require('../models/Sinalizacao').deleteMany({ seriesId: req.params.id }),
      require('../models/CasoCuradoria').deleteMany({ seriesId: req.params.id }),
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
// Fase 5, Bloco 2, Task 4: o fragmento do filtro parental é calculado UMA
// vez aqui e usado nos DOIS caminhos — candidatos (buildRecommendations,
// filtroExtra) E fallback cru logo abaixo — pro painel bloqueado nunca
// aparecer nem quando o serviço de recomendação degrada.
router.get('/recommendations', optionalAuth, async (req, res) => {
  const { type } = req.query;
  if (!RECOMMENDATION_CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type é obrigatório e deve ser um de: ${RECOMMENDATION_CONTENT_TYPES.join(', ')}.` });
  }

  const identity = getIdentity(req) || {};

  // Fail-CLOSED, e dentro de try: Express 4 não captura rejeição de handler
  // async — sem isto, uma falha ao ler o `parental` deixava a conexão
  // PENDURADA (nem 500). E não degrada para o fallback SEM filtro: isso
  // vazaria conteúdo para uma conta kids (achado da revisão da T4).
  let filtroParental;
  try {
    filtroParental = await getFiltroParental(req.user);
  } catch (err) {
    logger.error('[Content] GET /recommendations — filtro parental indisponível', err);
    return res.status(500).json({ error: 'Erro ao buscar recomendações.' });
  }

  try {
    const recomendadas = await require('../services/recommendationService').buildRecommendations({
      contentType: type,
      userId: identity.userId,
      anonymousId: identity.anonymousId,
      filtroExtra: filtroParental,
    });
    return res.json(recomendadas);
  } catch (err) {
    logger.error('[Content] GET /recommendations — degradando para a ordem manual', err);
    try {
      const fallback = await Series.find({ isPublished: true, content_type: type, ...filtroParental })
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
    // Fase 5, Bloco 2, Task 5: select += content_rating tags (o helper
    // serieVisivelPara LANÇA sem os dois — fail-closed contra select
    // estreito, ver utils/parentalFilter.js).
    const series = await Series.findById(req.params.id).select('isPublished channelId content_rating tags').lean();
    const podeVerRascunhos = series ? await podeVerRascunho(req.user, series.channelId) : false;

    if (!series || (!series.isPublished && !podeVerRascunhos)) {
      return res.json([]);
    }

    // Série PUBLICADA invisível pelo filtro parental: mesmo contrato de
    // "inexistente" que a T2/B1 já escolheu para esta rota — [] com 200,
    // não 404 (a rota nunca confirmou existência de rascunho por status
    // diferente, e aqui segue o mesmo molde). admin/dono já voltam `true`
    // de serieVisivelPara, então não perdem os próprios episódios.
    if (series.isPublished && !(await serieVisivelPara(req.user, series))) {
      return res.json([]);
    }

    const filter = { seriesId: req.params.id };
    if (!podeVerRascunhos) filter.status = 'published';

    const episodes = await Episode.find(filter)
      .sort({ order_index: 1, episode_number: 1 })
      .lean();
    res.json(episodes);
  } catch (err) {
    // Fix round (Fase 5 Bloco 2, Task 8): id malformado (CastError no `_id`
    // do findById acima) caía no catch genérico e virava 500 — pra anônimo E
    // logado (optionalAuth). Nota: id válido-mas-inexistente continua `[]`
    // com 200 (contrato antigo preservado, ver acima) — só o id GENUINAMENTE
    // malformado vira 404 aqui.
    if (responderCastError(err, res, 'Série não encontrada.')) return;
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
    // Fase 5, Bloco 2, Task 5: populate += content_rating tags (o helper
    // serieVisivelPara LANÇA sem os dois — fail-closed).
    const episode = await Episode.findById(req.params.id)
      .populate('seriesId', 'title content_type isPublished channelId content_rating tags')
      .lean();
    if (!episode) return res.status(404).json({ error: 'Episódio não encontrado.' });

    const serieDoEpisodio = episode.seriesId; // populate — pode vir null (série apagada)
    const publicado = episode.status === 'published' && !!serieDoEpisodio && serieDoEpisodio.isPublished === true;

    if (!publicado) {
      const podeVer = serieDoEpisodio && await podeVerRascunho(req.user, serieDoEpisodio.channelId);
      if (!podeVer) return res.status(404).json({ error: 'Episódio não encontrado.' });
    } else if (!(await serieVisivelPara(req.user, serieDoEpisodio))) {
      // Episódio PUBLICADO de série que o filtro parental esconde: 404 SEM
      // nenhum dos efeitos abaixo (increment de views, EngagementEvent) — a
      // checagem entra ANTES do `if (publicado)` de telemetria, nunca depois.
      return res.status(404).json({ error: 'Episódio não encontrado.' });
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
    // Fix round (Fase 5 Bloco 2, Task 8): id malformado (CastError no `_id`
    // do findById acima) caía no catch genérico e virava 500 — pra anônimo E
    // logado (optionalAuth).
    if (responderCastError(err, res, 'Episódio não encontrado.')) return;
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

    // episode_number duplicado na MESMA série → 400 (Fase 5 Bloco 2, Task 8
    // — higiene do Bloco 1). Validação NA ROTA, não índice único no schema:
    // séries antigas podem já ter duplicatas de antes desta task, e um
    // índice único quebraria a LEITURA delas. Mesma checagem do lado do
    // portal (routes/portal.js POST /series/:id/episodios).
    const jaExiste = await Episode.exists({ seriesId, episode_number });
    if (jaExiste) {
      return res.status(400).json({ error: `Já existe um episódio com o número ${episode_number} nesta série.` });
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
    // Fix round (Fase 5 Bloco 2, Task 8): episode_number não-numérico (ex.
    // 'abc') faz o Episode.exists({seriesId, episode_number}) acima lançar
    // CastError com path 'episode_number' (não '_id') — responderCastError
    // já distingue: 400 legível aqui, nunca 404 (não há id malformado nesta
    // rota — não recebe :id).
    if (responderCastError(err, res, 'Série ou episódio não encontrado.')) return;
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
// Lógica extraída para services/episodePanelService.js (Fase 5 Bloco 1, Task
// 4) — o portal do ilustrador (POST /api/portal/episodios/:id/paineis) reusa
// a MESMA função, sem duplicar validação.
router.post('/episodes/:id/panels', verifyToken, requireAdmin, async (req, res) => {
  try {
    const episode = await addPanels(req.params.id, req.body.panels);
    res.json({ success: true, panelCount: episode.panels.length, episode });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
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
// Fase 5, Bloco 2, Task 5: busca o episódio (com a série, via serieVisivelPara)
// ANTES do upsert — vote não buscava a série nenhuma até esta task. Obra
// invisível pelo filtro parental → 404 e NADA é gravado (mesmo shape do
// detalhe/favoritos). Admin/dono: serieVisivelPara já devolve true.
router.post('/episodes/:id/vote', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ error: 'type deve ser "like" ou "dislike".' });
    }

    const episodeAlvo = await Episode.findById(req.params.id)
      .select('seriesId')
      .populate('seriesId', 'content_rating tags channelId')
      .lean();
    if (!episodeAlvo || !episodeAlvo.seriesId) {
      return res.status(404).json({ error: 'Episódio não encontrado.' });
    }
    if (!(await serieVisivelPara(req.user, episodeAlvo.seriesId))) {
      return res.status(404).json({ error: 'Episódio não encontrado.' });
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
// Fase 5, Bloco 2, Task 5: busca a série (com content_rating/tags/channelId
// — já vem completo do findById sem select) ANTES do upsert — a rota não
// buscava a série nenhuma até esta task. Obra invisível pelo filtro parental
// → 404 e NADA é gravado. Admin/dono: serieVisivelPara já devolve true.
router.post('/series/:id/vote', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ error: 'type deve ser "like" ou "dislike".' });
    }

    const serieAlvo = await Series.findById(req.params.id).lean();
    if (!serieAlvo) return res.status(404).json({ error: 'Série não encontrada.' });
    if (!(await serieVisivelPara(req.user, serieAlvo))) {
      return res.status(404).json({ error: 'Série não encontrada.' });
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
