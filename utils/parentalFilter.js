// Fonte ÚNICA do filtro parental (Fase 5, Bloco 2, Task 4). Spec:
// docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
// (rev.3, seções "Semântica etária (FORMA da query pinada)", "Filtro
// pessoal (tags)", "Fonte única do filtro", "Exceções ao filtro").
// Ledger: .superpowers/sdd/2026-09-03-fase5-bloco2/progress.md, rulings
// P3 (semântica POSITIVA é LEI — $in nunca $ne/$nin pro content_rating),
// P4 (serieVisivelPara/passaFiltroParental LANÇAM sem doc completo — não
// engole em silêncio) e P5 (exceções admin/dono vivem AQUI, nunca por
// superfície individual).
//
// TRÊS peças:
//   - passaFiltroParental(parental, serie): predicado PURO, sem exceção
//     nenhuma (nem admin, nem dono) — usado pelo push (T5, audiência) e
//     internamente por serieVisivelPara.
//   - getFiltroParental(user): fragmento Mongo para QUERIES DE LISTA
//     (semântica POSITIVA — kids/teen usam $in; NUNCA $ne/$nin pro rating).
//   - serieVisivelPara(user, serie): pra DOC ÚNICO — admin e dono do canal
//     enxergam mesmo com a tag bloqueada; delega no predicado pra todo mundo.
const User = require('../models/User');
const Channel = require('../models/Channel');
const { isAdminUser } = require('./ownership');

// Escada de visibilidade por classificação do PERFIL (não da obra): kids só
// vê 'kids'; teen vê 'kids'/'teen'; young vê as três. content_rating null é
// tratado como 'young' (não classificada — só aparece pra quem vê tudo).
const ESCADA_VISIBILIDADE = {
  kids: ['kids'],
  teen: ['kids', 'teen'],
  young: ['kids', 'teen', 'young'],
};

// Valor fora do enum (só chega por escrita bruta/migração — o schema barra o
// resto) cai no degrau MAIS restritivo, nunca em young: falhar aberto aqui
// mostraria tudo a uma conta cuja restrição ficou corrompida (achado da
// revisão da T4). Ausente/null = young (conta que nunca gravou preferência).
function classificacaoEfetiva(valor) {
  if (valor === undefined || valor === null || valor === '') return 'young';
  return ESCADA_VISIBILIDADE[valor] ? valor : 'kids';
}

/**
 * Predicado PURO — sem exceções (admin/dono não entram aqui; isso é
 * serieVisivelPara). `parental` é o fragmento {classificacaoEtaria,
 * tagsBloqueadas} do usuário — `null`/`undefined` conta como "young sem
 * bloqueio nenhum" (guest, ou conta que nunca gravou preferências).
 *
 * `serie` PRECISA trazer `content_rating` e `tags` explicitamente — se
 * QUALQUER um dos dois vier `undefined` (select/populate estreito que
 * esqueceu de pedir o campo), LANÇA um erro claro em vez de deixar o filtro
 * falhar aberto em silêncio (ruling P4: fail-closed contra regressão
 * futura). `content_rating: null` é um valor VÁLIDO (= 'young', obra ainda
 * não classificada) — só `undefined` (campo ausente do doc) lança.
 */
function passaFiltroParental(parental, serie) {
  if (serie.content_rating === undefined || serie.tags === undefined) {
    throw new Error(
      'passaFiltroParental: a série precisa trazer content_rating e tags — select/populate estreito demais (fail-closed, ver ledger P4).'
    );
  }

  const classificacaoEtaria = classificacaoEfetiva(parental?.classificacaoEtaria);
  const tagsBloqueadas = parental?.tagsBloqueadas || [];

  const ratingEfetivo = serie.content_rating === null ? 'young' : serie.content_rating;
  if (!ESCADA_VISIBILIDADE[classificacaoEtaria].includes(ratingEfetivo)) return false;

  const tagsDaSerie = serie.tags || [];
  if (tagsBloqueadas.length > 0 && tagsDaSerie.some((t) => tagsBloqueadas.includes(t))) return false;

  return true;
}

/**
 * Fragmento Mongo para QUERIES DE LISTA (spec: "Semântica etária (FORMA da
 * query pinada)" — POSITIVA, NUNCA por exclusão): kids → content_rating
 * 'kids'; teen → content_rating $in ['kids','teen']; young → SEM cláusula
 * de content_rating (vê tudo, inclusive não classificada). `$in` nunca
 * casa `null` nem campo ausente — o fail-safe "não classificada só pra
 * young" sai de graça, sem precisar migrar dado nenhum.
 *
 * tagsBloqueadas vira `tags: { $nin: [...] }` só quando há alguma —
 * cláusula ausente (não `$nin: []`) quando a lista está vazia.
 *
 * `{}` para anônimo (sem `user`) e para ADMIN (`isAdminUser` — exceção P5:
 * as listas compartilhadas do painel admin não podem sumir com obras).
 * Nenhuma exceção de "dono" aqui — essa é só de `serieVisivelPara` (doc
 * único); nas listas o filtro vale para todo mundo, inclusive pro próprio
 * dono da obra (ledger: "autoinfligido, aceito e registrado").
 *
 * Shape devolvido (exemplos):
 *   anônimo/admin        → {}
 *   kids sem tags         → { content_rating: 'kids' }
 *   kids com tags         → { content_rating: 'kids', tags: { $nin: [...] } }
 *   teen sem tags          → { content_rating: { $in: ['kids','teen'] } }
 *   teen com tags           → { content_rating: { $in: ['kids','teen'] }, tags: { $nin: [...] } }
 *   young sem tags          → {}
 *   young com tags           → { tags: { $nin: [...] } }
 */
async function getFiltroParental(user) {
  if (!user || isAdminUser(user)) return {};

  const doc = await User.findById(user.id).select('parental').lean();
  const parental = doc?.parental;
  const classificacaoEtaria = classificacaoEfetiva(parental?.classificacaoEtaria);
  const tagsBloqueadas = parental?.tagsBloqueadas || [];

  const filtro = {};
  if (classificacaoEtaria === 'kids') {
    filtro.content_rating = 'kids';
  } else if (classificacaoEtaria === 'teen') {
    filtro.content_rating = { $in: ['kids', 'teen'] };
  }
  // young: sem cláusula — semântica positiva, vê tudo inclusive não classificada.

  if (tagsBloqueadas.length > 0) {
    filtro.tags = { $nin: tagsBloqueadas };
  }

  return filtro;
}

/**
 * Visibilidade de DOC ÚNICO (T5 consome; implementado e testado aqui —
 * spec, "Fonte única do filtro"). Ordem de checagem:
 *   1. admin → true (senão o AdminDashboard quebra ao gerenciar episódios
 *      de uma obra "bloqueada" pela própria preferência dele).
 *   2. anônimo (sem `user`) → true — guest não tem parental, sem filtro.
 *   3. dono do canal da série (`serie.channelId` → `Channel.ownerId` ===
 *      `user.id`) → true, mesmo com a tag da PRÓPRIA obra bloqueada.
 *      `channelId` ausente/null é OPCIONAL: o dono-check simplesmente dá
 *      `false` SEM lançar (séries sem canal existem) — segue pro predicado
 *      normal.
 *   4. senão, carrega o `parental` do usuário e delega em
 *      `passaFiltroParental` — que LANÇA se `serie` não trouxer
 *      `content_rating`/`tags` (select/populate estreito).
 */
async function serieVisivelPara(user, serie) {
  if (isAdminUser(user)) return true;
  if (!user) return true;

  if (serie.channelId) {
    const canal = await Channel.findById(serie.channelId).select('ownerId').lean();
    if (canal && canal.ownerId && canal.ownerId.toString() === user.id) return true;
  }

  const doc = await User.findById(user.id).select('parental').lean();
  return passaFiltroParental(doc?.parental, serie);
}

module.exports = { passaFiltroParental, getFiltroParental, serieVisivelPara };
