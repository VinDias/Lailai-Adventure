/**
 * Backfill idempotente dos campos do filtro parental em `Series` (Fase 5,
 * Bloco 2 — spec rev.4, "Migração do acervo"). Achado do fix round da Task
 * 5: séries que nasceram ANTES da Task 1 deste bloco não têm
 * `content_rating` gravado no DOCUMENTO — o campo entrou no schema com
 * `default: null`, mas o Mongoose só aplica defaults em create()/save(),
 * nunca retroativamente aos docs já existentes no banco; séries de antes da
 * Fase 3/4 também podem não ter `tags`. Sem isso, o helper de DOC ÚNICO
 * (utils/parentalFilter.js — `serieVisivelPara`/`passaFiltroParental`) LANÇA
 * fail-closed por design (ruling P4 do ledger) sempre que o campo vier
 * `undefined` — 500 no detalhe/episódios/leitor/signed-url/writes de
 * engajamento para QUALQUER usuário logado não-admin/não-dono, até rodar.
 * As superfícies de LISTA (T4) nunca tiveram esse problema — o filtro delas
 * é um fragmento Mongo (`getFiltroParental`), que trata campo ausente da
 * MESMA forma que `null` por semântica de query ($in nunca casa nem um nem
 * outro); só o doc único LÊ o campo do documento já carregado, daí o throw.
 *
 * Idempotente por construção: `{$exists:false}` só casa documentos que AINDA
 * não têm o campo — uma 2ª chamada (reiniciar o servidor, rodar o script de
 * novo) sempre devolve `{ contentRatingAtualizados: 0, tagsAtualizados: 0 }`.
 * Os dois campos são corrigidos em `updateMany`s INDEPENDENTES: um doc com
 * `tags` já presente mas `content_rating` ausente (acervo entre a Fase 3/4 e
 * este Bloco 2) só leva o primeiro update — o segundo não casa nada nele,
 * `tags` já gravado NUNCA é sobrescrito.
 *
 * Chamada em DOIS lugares (mesma função, lógica não duplicada):
 *   1. server.js, dentro do `.then()` de `mongoose.connect` — CONDIÇÃO DURA
 *      do fix round: `app.listen` só roda DEPOIS do backfill terminar
 *      (nunca existe uma janela onde o servidor aceita conexão com o acervo
 *      ainda sem os campos); falha aqui derruba o boot (`process.exit(1)`)
 *      em vez de subir servindo 500 silencioso.
 *   2. scripts/migrarTagsVocabulario.js (Task 9, migração do acervo) — o
 *      script chama esta MESMA função em vez de reimplementar o backfill.
 *
 * NÃO envolve `User.parental` (classificacaoEtaria/tagsBloqueadas): esses
 * têm `default: 'young'`/`[]` desde a Task 1 e são subdocumento SEMPRE
 * aplicado no `create()` de usuário — só `Series`, que já existia muito
 * antes do Bloco 2, tem documentos genuinamente sem os campos.
 *
 * Lança se qualquer `updateMany` falhar (ex.: banco fora do ar) — quem
 * chama decide o que fazer; NUNCA engole o erro em silêncio (server.js loga
 * e sai do processo; o script de migração aborta e não marca sucesso).
 *
 * @returns {Promise<{contentRatingAtualizados: number, tagsAtualizados: number}>}
 */
const Series = require('../models/Series');
const logger = require('../utils/logger');

async function backfillCamposParental() {
  try {
    const resultadoContentRating = await Series.updateMany(
      { content_rating: { $exists: false } },
      { $set: { content_rating: null } },
    );
    const resultadoTags = await Series.updateMany(
      { tags: { $exists: false } },
      { $set: { tags: [] } },
    );

    const resultado = {
      contentRatingAtualizados: resultadoContentRating.modifiedCount,
      tagsAtualizados: resultadoTags.modifiedCount,
    };
    logger.info('[ParentalBackfill] Backfill de content_rating/tags concluído', resultado);
    return resultado;
  } catch (err) {
    logger.error('[ParentalBackfill] Falha ao rodar o backfill de content_rating/tags', err);
    throw err;
  }
}

module.exports = { backfillCamposParental };
