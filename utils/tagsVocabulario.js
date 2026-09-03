// Fonte ÚNICA dos slugs do vocabulário fechado de tags (Fase 5, Bloco 2 —
// letra do PDF "Sistema de tags dos autores e do usuário", 31/08). O
// backend importa este wrapper (require); o FRONTEND importa o MESMO
// tagsVocabulario.json (Vite importa JSON nativamente) — nenhuma lista é
// duplicada em código, então drift de slug entre camadas é impossível por
// construção. Ver spec, seção "O vocabulário".
//
// Duas funções independentes usam este vocabulário (T2 em diante):
// descoberta/recomendação (autor escolhe até 8 tags que representam a obra)
// e filtro pessoal (usuário bloqueia tags para a própria experiência).
const VOCABULARIO = require('./tagsVocabulario.json');

const SLUGS = new Set(VOCABULARIO.map((v) => v.slug));

function isSlugValido(slug) {
  return typeof slug === 'string' && SLUGS.has(slug);
}

module.exports = { VOCABULARIO, SLUGS, isSlugValido };
