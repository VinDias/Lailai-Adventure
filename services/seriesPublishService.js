/**
 * Publicação de série — extraído de routes/content.js (PUT /series/:id,
 * admin) na Fase 5 Bloco 1, Task 7, para a Fila de Aprovação reusar a MESMA
 * lógica (gênero required condicional ao estado final, tradução ao mudar
 * genre/description, redisparo de push/recálculo quando isPublished
 * transiciona falso→verdadeiro) sem duplicá-la — a rota admin PUT continua
 * chamando esta função (ver routes/content.js) e seu comportamento não
 * mudou, só mudou de arquivo.
 */
const mongoose = require('mongoose');
const Series = require('../models/Series');
const Episode = require('../models/Episode');
const logger = require('../utils/logger');

/**
 * Série volta a ser publicada (isPublished falso→verdadeiro): re-dispara o
 * push dos capítulos que já estavam `status: 'published'` mas ficaram sem
 * notificar enquanto a obra estava despublicada (notifyEpisodePublished
 * desfaz o claim nesse caso — ver services/notificationService.js). Episódios
 * já notificados (notificationSentAt preenchido) ficam naturalmente de fora
 * do filtro. Fire-and-forget e SEQUENCIAL (sem Promise.all) — pode haver
 * muitos episódios e publicar a série nunca deve esperar o envio.
 *
 * Também é o caminho de uma série NASCENDO publicada pela 1ª vez (aprovação
 * do portal, Task 7): não há episódios já `published` para redisparar, mas
 * o gatilho de recálculo do algoritmo dispara igual — é o mesmo evento
 * ("obra passou a existir no ar") pelo mesmo ponto único.
 */
function redispararNotificacoesDaSerie(seriesId) {
  // Gatilho de recálculo (Etapa 11 do PDF, ledger Task 5): a série voltou a
  // publicar — mesmo ponto de disparo do push acima, 3º dos 6 "capítulo
  // publicado" (a republicação de série é o que reativa capítulos que
  // ficaram represados). Fire-and-forget, molde do Bloco 2.
  require('./recommendationService').dispararRecalculo(seriesId, 'capitulo_publicado');

  (async () => {
    const notificationService = require('./notificationService');
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

/**
 * Aplica `updates` (allowlist já resolvida pelo chamador) a uma série,
 * reproduzindo a MESMA lógica de PUT /api/content/series/:id: gênero
 * required condicional ao ESTADO FINAL (documento atual mesclado ao update
 * — `required: function()` do Mongoose não enxerga o doc persistido no
 * caminho de update), tradução quando genre/description mudam, e redisparo
 * de push/recálculo quando isPublished transiciona falso→verdadeiro.
 *
 * Lança erros com `err.status` (400/404) — mesmo padrão de
 * services/episodePanelService.js `addPanels`; ValidationError do Mongoose
 * (tags inválidas, por exemplo) atravessa sem `status` — quem chama trata
 * via `err.name === 'ValidationError'`, igual ao catch já existente no PUT.
 */
async function applySeriesUpdate(seriesId, updates) {
  const current = await Series.findById(seriesId).select('genre description isPublished').lean();
  if (!current) {
    const err = new Error('Série não encontrada.');
    err.status = 404;
    throw err;
  }

  const generoFinal = 'genre' in updates ? updates.genre : current.genre;
  // A comparação precisa reconhecer TODOS os formatos que o cast de Boolean
  // do Mongoose converte para true no update ('true', 1, '1', 'yes', ...) —
  // fonte única: o Set convertToTrue do próprio Mongoose (mesmo raciocínio
  // do PUT original).
  const publicadoFinal = 'isPublished' in updates
    ? mongoose.Schema.Types.Boolean.convertToTrue.has(updates.isPublished)
    : current.isPublished;
  if (publicadoFinal === true && (!generoFinal || !String(generoFinal).trim())) {
    const err = new Error('Série publicada precisa de gênero preenchido.');
    err.status = 400;
    throw err;
  }

  // Gênero/descrição mudaram → refaz as traduções com os valores mesclados
  // (o campo não enviado mantém o valor atual do documento).
  if ('genre' in updates || 'description' in updates) {
    const translationService = require('./translationService');
    const translations = await translationService.buildTranslationsSafe({
      genre: updates.genre ?? current.genre,
      description: updates.description ?? current.description,
    }, `série ${seriesId}`);
    if (translations) updates.translations = translations;
  }

  // Precisamos do valor ANTERIOR (antes do update) para detectar a
  // transição falso→verdadeiro.
  const estavaDespublicada = !current.isPublished;

  const series = await Series.findByIdAndUpdate(seriesId, { $set: updates }, { new: true, runValidators: true });
  if (!series) {
    const err = new Error('Série não encontrada.');
    err.status = 404;
    throw err;
  }

  // publicadoFinal (e não === true estrito) para o redisparo acompanhar o
  // mesmo critério do gate: qualquer formato que o cast publica, redispara.
  if (estavaDespublicada && 'isPublished' in updates && publicadoFinal) {
    redispararNotificacoesDaSerie(series._id);
  }

  return series;
}

module.exports = { applySeriesUpdate, redispararNotificacoesDaSerie };
