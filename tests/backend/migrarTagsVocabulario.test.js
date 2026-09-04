/**
 * Testes: script de migração do acervo para o vocabulário fechado de tags
 * (Fase 5, Bloco 2, Task 9). Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, seção "Migração do acervo"). Plano:
 * docs/superpowers/plans/2026-09-03-fase5-bloco2-parental.md (Task 9).
 *
 * Cobre a lógica exposta por scripts/migrarTagsVocabulario.js —
 * `planejarMigracao` (pura, em memória) e `aplicarMigracao` (orquestra
 * leitura + escrita + backfill). NÃO cobre a CLI (`if (require.main ===
 * module)`, que só faz parse de --apply e imprime — sem lógica própria) nem
 * o mapa de produção em si além de um teste de sanidade das entradas.
 *
 * Isolamento: só Series é limpa entre testes (beforeEach) — este arquivo não
 * usa User/app/auth, então não há necessidade do padrão de
 * parentalListSurfaces.test.js de preservar usuários entre testes.
 */
const db = require('../helpers/db');
const { isSlugValido } = require('../../utils/tagsVocabulario');

let Series;
let planejarMigracao, aplicarMigracao, normalizarChaveTag;
let MAPA;

beforeAll(async () => {
  await db.connect();
  Series = require('../../models/Series');
  ({ planejarMigracao, aplicarMigracao, normalizarChaveTag } = require('../../scripts/migrarTagsVocabulario'));
  MAPA = require('../../scripts/mapaTagsVocabulario');
});

afterAll(() => db.closeDatabase());

beforeEach(async () => {
  await Series.deleteMany({});
});

let contador = 0;
function unico(prefixo) {
  contador += 1;
  return `${prefixo}-${contador}-${Date.now()}`;
}

/** Cria a série via Series.create (setter/validator ativos — content_type,
 *  genre etc. saem normais) e então grava `tags` livres via driver CRU
 *  (Series.collection, bypassa setter/validator inteiro), reproduzindo
 *  fielmente o estado real do acervo pré-migração: tags gravadas ANTES do
 *  validator 0-8-do-vocabulário (T2) existir, quando qualquer string
 *  passava. `Series.create()`/`save()` rejeitariam essas tags hoje — por
 *  isso o bypass é necessário para simular o cenário que o script existe
 *  para resolver. */
async function criarSerieComTagsLivres(tituloBase, tagsLivres, overrides = {}) {
  const serie = await Series.create({
    title: `${tituloBase} ${unico('x')}`,
    genre: 'Teste',
    content_type: 'hiqua',
    isPublished: true,
    ...overrides,
  });
  await Series.collection.updateOne({ _id: serie._id }, { $set: { tags: tagsLivres } });
  return Series.findById(serie._id).lean();
}

/** Doc legado: nunca teve `tags` nem `content_rating` gravados (campo
 *  ausente de verdade, não `null`/`[]`) — mesmo molde de
 *  tests/backend/parentalDocSurfaces.test.js `criarSerieLegadaCrua`. */
async function criarSerieSemTagsNemContentRating(tituloBase) {
  const serie = await Series.create({
    title: `${tituloBase} ${unico('x')}`,
    genre: 'Teste',
    content_type: 'hiqua',
    isPublished: true,
  });
  await Series.collection.updateOne({ _id: serie._id }, { $unset: { tags: '', content_rating: '' } });
  return Series.findById(serie._id).lean();
}

// ═══════════════════════════════════════════════════════════════════════════
// Sanidade do mapa (scripts/mapaTagsVocabulario.js)
// ═══════════════════════════════════════════════════════════════════════════

describe('scripts/mapaTagsVocabulario — sanidade do mapa manual', () => {
  it('todo VALOR do mapa é um slug válido do vocabulário oficial', () => {
    for (const [chave, slug] of Object.entries(MAPA)) {
      expect(isSlugValido(slug)).toBe(true);
    }
  });

  it('toda CHAVE do mapa já está normalizada (senão nunca bateria — a busca normaliza antes de consultar)', () => {
    for (const chave of Object.keys(MAPA)) {
      expect(normalizarChaveTag(chave)).toBe(chave);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// planejarMigracao — lógica pura, por cenário
// ═══════════════════════════════════════════════════════════════════════════

describe('planejarMigracao — cenários da spec (rev.4, "Migração do acervo")', () => {
  it('(a) tags livres mapeáveis viram os slugs certos, ordenadas por prioridade do mapa', async () => {
    const serie = await criarSerieComTagsLivres(unico('MapeavelSimples'), ['suspense', 'policial']);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual(['thriller', 'crime']); // thriller (prio 17) antes de crime (prio 20)
    expect(plano.removidas).toEqual([]);
    expect(plano.capadas).toEqual([]);
    expect(plano.mudou).toBe(true);
  });

  it('(b) mistura mapeável + não mapeável: a não mapeável é removida e listada', async () => {
    const serie = await criarSerieComTagsLivres(unico('Mistura'), ['drama', 'vampiros', 'sci-fi']);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual(['drama', 'ficcao-cientifica']);
    expect(plano.removidas).toEqual(['vampiros']);
    expect(plano.capadas).toEqual([]);
    expect(plano.mudou).toBe(true);
  });

  it('(c) 10 tags mapeáveis → cap em 8 pela prioridade do mapa (as 8 certas ficam, as 2 de menor prioridade são capadas)', async () => {
    const tags = [
      'romance', 'drama', 'comedia', 'acao', 'aventura', 'fantasia',
      'fantasia sombria', // → dark-fantasy
      'sci-fi',            // → ficcao-cientifica
      'terror', 'suspense', // → thriller — as duas de MENOR prioridade do lote
    ];
    const serie = await criarSerieComTagsLivres(unico('CapOito'), tags);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual([
      'romance', 'drama', 'comedia', 'acao', 'aventura', 'fantasia', 'dark-fantasy', 'ficcao-cientifica',
    ]);
    expect(plano.tagsFinais.length).toBe(8);
    expect(plano.capadas).toEqual(['terror', 'thriller']);
    expect(plano.removidas).toEqual([]);
    expect(plano.mudou).toBe(true);
  });

  it('(d) duas tags livres diferentes → mesmo slug: dedupe mantém só uma ocorrência', async () => {
    const serie = await criarSerieComTagsLivres(unico('DuasMesmoSlug'), ['crime', 'policial']);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual(['crime']);
    expect(plano.removidas).toEqual([]);
    expect(plano.capadas).toEqual([]);
    expect(plano.mudou).toBe(true);
  });

  it('(e) já migrada (tags já são slugs válidos, já na ordem de prioridade): no-op', async () => {
    const serie = await criarSerieComTagsLivres(unico('JaMigrada'), ['romance', 'drama']);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual(['romance', 'drama']);
    expect(plano.mudou).toBe(false);
    expect(plano.removidas).toEqual([]);
    expect(plano.capadas).toEqual([]);
  });

  it('(k) tag com acento/maiúscula casa o mapa ("Ação", "FICÇÃO CIENTÍFICA")', async () => {
    const serie = await criarSerieComTagsLivres(unico('AcentoMaiuscula'), ['Ação', 'FICÇÃO CIENTÍFICA']);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.tagsFinais).toEqual(['acao', 'ficcao-cientifica']);
    expect(plano.removidas).toEqual([]);
    expect(plano.mudou).toBe(true);
  });

  it('doc sem `tags` no documento (Array.isArray falso): plano marca semTagsNoDocumento, não tenta migrar nada', () => {
    const [plano] = planejarMigracao([{ _id: 'x', title: 'Sem Tags', tags: undefined }], MAPA);
    expect(plano.semTagsNoDocumento).toBe(true);
    expect(plano.mudou).toBe(false);
  });

  it('série com tags: [] permanece [] (no-op) — não é "sem tags no documento"', async () => {
    const serie = await criarSerieComTagsLivres(unico('TagsVazias'), []);
    const [plano] = planejarMigracao([serie], MAPA);

    expect(plano.semTagsNoDocumento).toBe(false);
    expect(plano.tagsFinais).toEqual([]);
    expect(plano.mudou).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// aplicarMigracao — orquestração (leitura + escrita + backfill)
// ═══════════════════════════════════════════════════════════════════════════

describe('aplicarMigracao — orquestração ponta a ponta', () => {
  it('(f) migra série DRAFT e série DESPUBLICADA (Series.find() não filtra por isPublished/submittedAt)', async () => {
    const draft = await criarSerieComTagsLivres(unico('Draft'), ['suspense'], {
      isPublished: false, genre: undefined, submittedAt: null,
    });
    const despublicada = await criarSerieComTagsLivres(unico('Despublicada'), ['policial'], {
      isPublished: false,
    });

    await aplicarMigracao({ dryRun: false, mapa: MAPA });

    const draftDepois = await Series.findById(draft._id).lean();
    const despublicadaDepois = await Series.findById(despublicada._id).lean();
    expect(draftDepois.tags).toEqual(['thriller']);
    expect(despublicadaDepois.tags).toEqual(['crime']);
  });

  it('(g) doc legado sem tags/content_rating: a migração não quebra e o backfill preenche tags:[] e content_rating:null', async () => {
    const legado = await criarSerieSemTagsNemContentRating(unico('Legado'));
    expect(legado.tags).toBeUndefined();
    expect(legado.content_rating).toBeUndefined();

    const resultado = await aplicarMigracao({ dryRun: false, mapa: MAPA });

    const depois = await Series.findById(legado._id).lean();
    expect(depois.tags).toEqual([]);
    expect(depois.content_rating).toBeNull();
    expect(resultado.backfill).not.toBeNull();
    expect(resultado.backfill.tagsAtualizados).toBeGreaterThanOrEqual(1);
    expect(resultado.backfill.contentRatingAtualizados).toBeGreaterThanOrEqual(1);
  });

  it('(h) dry-run NÃO escreve nada — banco idêntico antes/depois, backfill não roda', async () => {
    const serie = await criarSerieComTagsLivres(unico('DryRun'), ['suspense', 'vampiros']);
    const antes = await Series.findById(serie._id).lean();

    const resultado = await aplicarMigracao({ dryRun: true, mapa: MAPA });

    const depois = await Series.findById(serie._id).lean();
    expect(depois).toEqual(antes);
    expect(resultado.backfill).toBeNull();
    // prova que o dry-run de fato DETECTOU a mudança sem escrevê-la —
    // senão o teste passaria trivialmente por não ter nada pra mudar.
    expect(resultado.resumo.modificadas).toBeGreaterThanOrEqual(1);
  });

  it('(i) idempotência: 2ª rodada --apply em sequência não modifica nada', async () => {
    await criarSerieComTagsLivres(unico('Idem1'), ['suspense', 'policial']);
    await criarSerieComTagsLivres(unico('Idem2'), ['drama', 'vampiros', 'sci-fi']);
    await criarSerieSemTagsNemContentRating(unico('Idem3'));

    const primeira = await aplicarMigracao({ dryRun: false, mapa: MAPA });
    expect(primeira.resumo.modificadas).toBeGreaterThanOrEqual(2);

    const segunda = await aplicarMigracao({ dryRun: false, mapa: MAPA });
    expect(segunda.resumo.modificadas).toBe(0);
    expect(segunda.resumo.semTagsNoDocumento).toBe(0); // o backfill da 1ª rodada já preencheu
    expect(segunda.backfill).toEqual({ contentRatingAtualizados: 0, tagsAtualizados: 0 });
  });

  it('(j) mapa que produziria um slug inválido: aborta SEM escrever nada — nem as obras que estavam corretas (atomicidade)', async () => {
    const boa = await criarSerieComTagsLivres(unico('AtomicidadeBoa'), ['suspense']);
    const ruim = await criarSerieComTagsLivres(unico('AtomicidadeRuim'), ['furry']);
    const mapaRuim = { ...MAPA, furry: 'nao-existe-no-vocabulario' };

    await expect(aplicarMigracao({ dryRun: false, mapa: mapaRuim })).rejects.toThrow();

    const boaDepois = await Series.findById(boa._id).lean();
    const ruimDepois = await Series.findById(ruim._id).lean();
    // "boa" teria virado ['thriller'] se a migração tivesse rodado — continua
    // como estava, provando que a escrita nunca começou.
    expect(boaDepois.tags).toEqual(['suspense']);
    expect(ruimDepois.tags).toEqual(['furry']);
  });
});
