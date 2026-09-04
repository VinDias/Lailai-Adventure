/**
 * Mapa manual de migração do acervo: tag livre (normalizada) → slug do
 * vocabulário fechado (Fase 5, Bloco 2, Task 9). Consumido só por
 * `scripts/migrarTagsVocabulario.js` — NÃO é importado por nenhuma rota,
 * service ou componente; é puramente insumo do script de migração.
 *
 * Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, seção "Migração do acervo"). Vocabulário fonte: utils/tagsVocabulario.json.
 *
 * CHAVE: a MESMA normalização usada por `normalizarChaveTag` em
 * scripts/migrarTagsVocabulario.js — trim + minúsculas + remoção de acento
 * (NFD + strip de diacríticos). É a normalização do setter de
 * `models/Series.js` (trim + toLowerCase) ACRESCIDA da remoção de acento,
 * para "Ação"/"AÇÃO"/"ação " caírem todas na mesma chave "acao". Por isso
 * NENHUMA chave abaixo tem acento — uma chave acentuada aqui seria morta
 * (nunca bateria com nada, porque a busca já normaliza antes de consultar
 * o mapa). O teste de sanidade em tests/backend/migrarTagsVocabulario.test.js
 * confere isso (`normalizarChaveTag(chave) === chave` para toda chave).
 *
 * Tags que já são o slug (ex.: "acao", "romance") nem PRECISARIAM de uma
 * entrada aqui — o script trata "já é slug válido" como caso direto, antes
 * de consultar o mapa (`resolverTag`). Elas estão pré-populadas mesmo assim
 * porque a ORDEM DAS ENTRADAS DESTE OBJETO DEFINE A PRIORIDADE do corte em 8
 * tags (quando uma obra tem mais de 8 tags mapeáveis depois do dedupe, o
 * script mantém as 8 cujo SLUG aparece mais cedo aqui — busca pelo primeiro
 * entry cujo VALOR bate com o slug, não pela chave). Sem a entrada de
 * identidade, um slug "direto" (que nunca passa pelo mapa) ficaria sem
 * prioridade definida. A ordem abaixo segue a ordem OFICIAL do vocabulário
 * (utils/tagsVocabulario.json), com sinônimos agrupados logo depois do slug
 * que representam — ou seja, na prática, a prioridade final é "ordem do
 * vocabulário oficial", não uma escolha arbitrária por sinônimo.
 *
 * Fellipe: este é o mapa INICIAL, com o óbvio pré-populado (identidade,
 * rótulo PT normalizado, sinônimos evidentes). Eu não tenho acesso às tags
 * de produção — rode `node scripts/migrarTagsVocabulario.js` (dry-run, sem
 * --apply) na VPS primeiro; ele lista TODAS as tags livres distintas do
 * acervo real com contagem de obras e o mapeamento proposto. Qualquer tag
 * "NÃO MAPEADA" que devesse virar um slug entra aqui ANTES do --apply.
 */
module.exports = {
  // romance
  romance: 'romance',

  // drama
  drama: 'drama',

  // comedia
  comedia: 'comedia',
  comedy: 'comedia',

  // acao
  acao: 'acao',

  // aventura
  aventura: 'aventura',

  // fantasia
  fantasia: 'fantasia',

  // dark-fantasy
  'dark-fantasy': 'dark-fantasy',
  'dark fantasy': 'dark-fantasy',
  'fantasia sombria': 'dark-fantasy',

  // ficcao-cientifica
  'ficcao-cientifica': 'ficcao-cientifica',
  'ficcao cientifica': 'ficcao-cientifica',
  'sci-fi': 'ficcao-cientifica',
  scifi: 'ficcao-cientifica',
  'sci fi': 'ficcao-cientifica',

  // terror
  terror: 'terror',
  horror: 'terror',

  // thriller
  thriller: 'thriller',
  suspense: 'thriller',

  // misterio
  misterio: 'misterio',

  // crime
  crime: 'crime',
  policial: 'crime',

  // historico
  historico: 'historico',
  historia: 'historico',

  // sobrenatural
  sobrenatural: 'sobrenatural',
  paranormal: 'sobrenatural',

  // super-herois
  'super-herois': 'super-herois',
  'super herois': 'super-herois',
  herois: 'super-herois',
  'super heroi': 'super-herois',
  'super-heroi': 'super-herois',

  // slice-of-life
  'slice-of-life': 'slice-of-life',
  'slice of life': 'slice-of-life',
  cotidiano: 'slice-of-life',

  // high-school
  'high-school': 'high-school',
  'high school': 'high-school',
  escolar: 'high-school',
  colegial: 'high-school',

  // psicologico
  psicologico: 'psicologico',

  // lgbtqia+
  'lgbtqia+': 'lgbtqia+',
};
