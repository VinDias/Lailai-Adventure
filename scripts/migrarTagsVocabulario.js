/**
 * Migração do acervo para o vocabulário fechado de tags (Fase 5, Bloco 2,
 * Task 9). Spec: docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.4, seção "Migração do acervo"). Plano: docs/superpowers/plans/2026-09-03-fase5-bloco2-parental.md
 * (Task 9).
 *
 * Cobre TODOS os documentos de Series — publicadas, despublicadas e drafts
 * (`Series.find()` sem filtro nenhum: um draft ainda não publicado tem tags
 * livres tanto quanto uma série no ar, e a 1ª edição dele depois deste bloco
 * levaria 400 do validator 0-8-do-vocabulário se não migrado).
 *
 * REGRA por obra: cada tag livre atual é normalizada (trim + minúsculas +
 * remoção de acento — `normalizarChaveTag`) e resolvida (`resolverTag`):
 *   1. já é slug válido do vocabulário → passa direto;
 *   2. senão, consulta scripts/mapaTagsVocabulario.js pela chave normalizada;
 *   3. não mapeável → REMOVIDA (fica só no relatório, nunca escrita).
 * Os slugs resolvidos são DEDUPLICADOS (duas tags livres podem cair no mesmo
 * slug — ex.: "crime" e "policial") e, se sobrarem mais de 8, CAPADOS pela
 * PRIORIDADE do mapa (`prioridadeDoSlug` — ordem das entradas de
 * scripts/mapaTagsVocabulario.js; ver o comentário lá para o porquê). A obra
 * pode terminar com 0 tags (o neutro derivado do algoritmo de recomendação
 * cobre — DOCS.md "Curadoria de tags é opcional").
 *
 * ASSERT (fail loud, ANTES de qualquer escrita): depois do corte, se ainda
 * sobrarem mais de 8 tags OU algum slug produzido pelo mapa não existir no
 * vocabulário oficial, o script INTEIRO aborta sem gravar nada — nem as
 * obras que estavam corretas. `planejarMigracao` roda 100% em memória (só
 * lê, nunca escreve) e o loop de escrita só começa depois dela retornar sem
 * lançar: essa ordem (planejar tudo → só then escrever) é a atomicidade
 * prática do script — um mapa editado errado não deixa o acervo pela metade.
 *
 * ESCRITA — decisão: `updateOne({_id}, {$set:{tags}})` CRU (bypassa o
 * setter/validator de `models/Series.js`), NÃO `save()`. Justificativa: a
 * validação equivalente já roda em `planejarMigracao` linha por linha (0-8,
 * todo slug com `isSlugValido` — o MESMO `utils/tagsVocabulario.js` que o
 * validator do model usa) ANTES de qualquer escrita, então repetir a
 * validação do Mongoose em cada `save()` seria custo sem ganho — o acervo
 * pode ter milhares de séries e `updateOne` cru evita hidratar/revalidar um
 * documento inteiro por obra. Mesmo padrão de `services/parentalBackfill.js`
 * (`updateMany` cru). O preço dessa escolha, documentado: o array gravado
 * PRECISA sair de `planejarMigracao` já normalizado/deduplicado/capado — e
 * sai (é exatamente o que a função faz antes de devolver `tagsFinais`).
 *
 * IDEMPOTÊNCIA: numa 2ª rodada `--apply`, toda tag já é um slug válido do
 * vocabulário (gravada pela 1ª rodada) → resolve DIRETO (passo 1 acima, sem
 * tocar o mapa) → o array final é byte-a-byte igual ao já gravado (a saída é
 * sempre a forma canônica: deduplicada e ordenada por prioridade, então
 * reprocessar o resultado de uma rodada anterior reproduz o MESMO array) →
 * `mudou = false` → nenhum `updateOne` é emitido. `aplicarMigracao` também
 * chama `backfillCamposParental()` (services/parentalBackfill.js) depois de
 * escrever os `tags`, cobrindo os dois casos que a Task 5 (fix round, rev.4)
 * identificou: séries sem `content_rating` no documento (campo nasceu sem
 * `$set` na Task 1) e séries pré-Fase-3/4 sem `tags` — reusa a MESMA função
 * chamada no boot do servidor (server.js), sem duplicar a lógica.
 */
const mongoose = require('mongoose');
const Series = require('../models/Series');
const { isSlugValido } = require('../utils/tagsVocabulario');
const { backfillCamposParental } = require('../services/parentalBackfill');
const MAPA_PADRAO = require('./mapaTagsVocabulario');

/** trim + minúsculas + remoção de diacríticos (NFD). A mesma normalização
 *  do setter do model (trim + toLowerCase — models/Series.js:25-38) mais
 *  remoção de acento, para "Ação"/"AÇÃO"/" ação " casarem com a mesma chave
 *  "acao" — tanto para checar "já é slug válido" quanto para consultar o
 *  mapa (os slugs oficiais nunca têm acento, então deaccentuar um slug já
 *  válido é um no-op; a função serve os dois propósitos). */
function normalizarChaveTag(tag) {
  if (typeof tag !== 'string') return '';
  return tag
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
}

/** Resolve UMA tag livre bruta para {chave, slug}. `slug` é `null` quando a
 *  tag não é mapeável (nem já é um slug válido, nem está no mapa) — o
 *  chamador trata isso como "removida". */
function resolverTag(tagBruta, mapa) {
  const chave = normalizarChaveTag(tagBruta);
  if (!chave) return { chave, slug: null };
  if (isSlugValido(chave)) return { chave, slug: chave };
  if (Object.prototype.hasOwnProperty.call(mapa, chave)) {
    return { chave, slug: mapa[chave] };
  }
  return { chave, slug: null };
}

/** Prioridade de um slug para o corte em 8 = índice da PRIMEIRA entrada do
 *  mapa cujo VALOR é esse slug (não a chave — várias chaves/sinônimos podem
 *  apontar pro mesmo slug; a primeira que aparece no objeto define a
 *  prioridade dele). Slug sem nenhuma entrada correspondente no mapa (não
 *  deveria acontecer com o mapa padrão, que pré-popula todos os 19 por
 *  identidade — ver scripts/mapaTagsVocabulario.js) cai no fim, nunca quebra. */
function prioridadeDoSlug(slug, mapa) {
  const idx = Object.entries(mapa).findIndex(([, valor]) => valor === slug);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/**
 * Planeja a migração de UMA série (função pura, sem I/O) — usada por
 * `planejarMigracao` abaixo, uma por documento.
 */
function planejarUmaSerie(serie, mapa) {
  const id = serie._id;
  const titulo = serie.title;
  const tagsBrutas = serie.tags;

  // Doc legado que nunca teve o campo `tags` gravado — campo VERDADEIRAMENTE
  // ausente (`undefined`), distinto de presente-mas-do-tipo-errado (`null`,
  // um objeto, etc. — ver o `else` logo abaixo). Só o ausente de verdade fica
  // pro backfillCamposParental() (chamado por aplicarMigracao depois da
  // escrita dos tags), no mesmo padrão do content_rating ausente (spec
  // rev.4, achado da Task 5).
  if (tagsBrutas === undefined) {
    return {
      id, titulo, semTagsNoDocumento: true,
      tagsAtuais: undefined, tagsFinais: undefined,
      removidas: [], capadas: [], mudou: false, resolucoes: [],
    };
  }

  // Fix round (achado INFO 4): campo PRESENTE mas não-array (`null` de uma
  // escrita crua malformada, um objeto perdido, etc.) NÃO é "ausente" — não
  // entra no backfill (`Array.isArray(null)` é `false`, mas a query do
  // backfill é `{tags:{$exists:false}}`, que não casa `null`) e ficaria
  // órfão para sempre, rejeitado pelo validator do model (0-8 array) na
  // primeira edição futura. Tratado AQUI como "sem tags" (equivalente a
  // `[]`) — se `--apply`, grava `[]` de verdade (ver `mudou` abaixo:
  // `JSON.stringify(null) !== JSON.stringify([])` → dispara a escrita).
  const tagsAtuais = Array.isArray(tagsBrutas) ? tagsBrutas : [];

  const resolucoes = tagsAtuais.map((tagOriginal) => {
    const { chave, slug } = resolverTag(tagOriginal, mapa);
    return { tagOriginal, chave, slug };
  });

  const removidas = resolucoes.filter((r) => !r.slug).map((r) => r.tagOriginal);

  // Dedupe: duas tags livres podem resolver pro MESMO slug (ex.: "crime" e
  // "policial") — mantém só a primeira ocorrência.
  const candidatos = [];
  const vistos = new Set();
  for (const r of resolucoes) {
    if (!r.slug || vistos.has(r.slug)) continue;
    vistos.add(r.slug);
    candidatos.push(r.slug);
  }

  // Cap em 8 por prioridade do mapa (ordem das entradas — ver cabeçalho e
  // scripts/mapaTagsVocabulario.js).
  candidatos.sort((a, b) => prioridadeDoSlug(a, mapa) - prioridadeDoSlug(b, mapa));
  const tagsFinais = candidatos.slice(0, 8);
  const capadas = candidatos.slice(8);

  // ASSERT — aborta ANTES de qualquer escrita (ver aplicarMigracao) se o
  // pós-corte ainda violar o contrato do validator (0-8, todas do
  // vocabulário). Com o mapa correto isso nunca deveria disparar — é a
  // proteção contra um mapa editado com um slug errado (não existente).
  // (INFO 6, fix round: `candidatos.slice(0, 8)` logo acima já TORNA este
  // `length > 8` matematicamente inalcançável hoje — cinto-e-suspensórios
  // pela letra da spec ("ASSERT que falha alto se >8 sobrar"), mantido caso
  // um refactor futuro mexa no corte e o slice deixe de garantir o limite.)
  if (tagsFinais.length > 8) {
    throw new Error(
      `ASSERT migrarTagsVocabulario: série "${titulo}" (${id}) ficou com ${tagsFinais.length} tags depois do corte — esperado no máximo 8. Migração abortada, nada foi escrito.`
    );
  }
  for (const slug of tagsFinais) {
    if (!isSlugValido(slug)) {
      throw new Error(
        `ASSERT migrarTagsVocabulario: série "${titulo}" (${id}) — o mapa produziu o slug "${slug}", que NÃO existe no vocabulário oficial (utils/tagsVocabulario.json). Corrija scripts/mapaTagsVocabulario.js. Migração abortada, nada foi escrito.`
      );
    }
  }

  // Compara contra `tagsBrutas` (o valor CRU do doc), não o `tagsAtuais`
  // coagido — senão um `tags: null` cujas 0 tags resolvidas dão `tagsFinais
  // = []` pareceria "igual" (`[]` === `[]`) e NUNCA seria gravado, deixando
  // o `null` órfão pra sempre (achado INFO 4).
  const mudou = JSON.stringify(tagsBrutas) !== JSON.stringify(tagsFinais);

  return { id, titulo, semTagsNoDocumento: false, tagsAtuais: tagsBrutas, tagsFinais, removidas, capadas, mudou, resolucoes };
}

/**
 * Planeja a migração de uma lista de documentos Series (já carregados, ex.:
 * `Series.find().select('title tags').lean()`) — função PURA, sem I/O.
 * Lança (ver planejarUmaSerie) se qualquer doc violar o contrato pós-corte;
 * a exceção propaga pra fora de `.map()` ANTES de qualquer plano parcial ser
 * usado por quem chamou — é assim que `aplicarMigracao` garante que nada é
 * escrito quando o mapa está errado (atomicidade prática).
 *
 * @param {Array} series documentos Series (lean) com pelo menos {_id, title, tags}
 * @param {Object} mapa tag-livre-normalizada → slug (scripts/mapaTagsVocabulario.js)
 * @returns {Array} um plano por documento, na mesma ordem de entrada
 */
function planejarMigracao(series, mapa) {
  return series.map((serie) => planejarUmaSerie(serie, mapa));
}

/**
 * Orquestra a migração: lê TODA a coleção Series, planeja em memória
 * (`planejarMigracao` — lança e aborta ANTES de qualquer escrita se algum
 * doc violar o ASSERT), grava só quem mudou (`dryRun: false`) e roda o
 * backfill de content_rating/tags ausentes ao final (também só fora de
 * dry-run — dry-run não escreve NADA, nem o backfill).
 *
 * @param {Object} opcoes
 * @param {boolean} [opcoes.dryRun=true] sem --apply: só planeja, não escreve
 * @param {Object} [opcoes.mapa] mapa tag-livre → slug (default: scripts/mapaTagsVocabulario.js)
 * @returns {Promise<{resumo: Object, planos: Array, backfill: (Object|null), dryRun: boolean}>}
 */
async function aplicarMigracao({ dryRun = true, mapa = MAPA_PADRAO } = {}) {
  const seriesDocs = await Series.find().select('title tags').lean();

  // Roda 100% em memória — se QUALQUER doc violar o ASSERT, lança AQUI,
  // antes da primeira escrita da função (planos nem chega a existir).
  const planos = planejarMigracao(seriesDocs, mapa);

  const resumo = {
    totalSeries: seriesDocs.length,
    modificadas: 0,
    inalteradas: 0,
    comTagsRemovidas: 0,
    comCap: 0,
    semTagsNoDocumento: 0,
  };

  for (const plano of planos) {
    if (plano.semTagsNoDocumento) { resumo.semTagsNoDocumento++; continue; }
    if (plano.removidas.length > 0) resumo.comTagsRemovidas++;
    if (plano.capadas.length > 0) resumo.comCap++;
    if (plano.mudou) resumo.modificadas++; else resumo.inalteradas++;
  }

  if (!dryRun) {
    // Contador de escritas bem-sucedidas — se o loop parar no MEIO (ex.: o
    // Mongo cai depois de já ter gravado algumas obras), o erro carrega
    // `escritasFeitas` pendurado (fix round, achado BAIXA 3) pra quem
    // chamou (a CLI) saber que NÃO foi "0 escritas, nada gravado": algumas
    // obras já foram — o script é idempotente, então basta corrigir o
    // problema e rodar `--apply` de novo (as já gravadas viram no-op).
    let escritasFeitas = 0;
    try {
      for (const plano of planos) {
        if (!plano.semTagsNoDocumento && plano.mudou) {
          await Series.updateOne({ _id: plano.id }, { $set: { tags: plano.tagsFinais } });
          escritasFeitas++;
        }
      }
    } catch (err) {
      err.escritasFeitas = escritasFeitas;
      throw err;
    }
  }

  const backfill = dryRun ? null : await backfillCamposParental();

  return { resumo, planos, backfill, dryRun };
}

// ═══════════════════════════════════════════════════════════════════════════
// Impressão do relatório (só a CLI usa — sem lógica de migração aqui)
// ═══════════════════════════════════════════════════════════════════════════

function formatarLista(lista) {
  return lista && lista.length > 0 ? lista.join(', ') : '(nenhuma)';
}

function imprimirRelatorio({ resumo, planos, backfill, dryRun }) {
  console.log('');
  console.log(dryRun
    ? '=== Migração de tags para o vocabulário fechado — DRY-RUN (nada foi escrito) ==='
    : '=== Migração de tags para o vocabulário fechado — APLICANDO ===');
  console.log(`Total de séries no acervo: ${resumo.totalSeries}`);
  console.log('');

  // Tags livres distintas + mapeamento proposto (agregado de todas as obras)
  const contagem = new Map(); // tagOriginal -> { obras: Set<id>, slug }
  for (const plano of planos) {
    for (const r of plano.resolucoes || []) {
      if (!contagem.has(r.tagOriginal)) contagem.set(r.tagOriginal, { obras: new Set(), slug: r.slug });
      contagem.get(r.tagOriginal).obras.add(String(plano.id));
    }
  }
  const linhas = [...contagem.entries()].sort((a, b) => b[1].obras.size - a[1].obras.size);
  console.log(`--- Tags livres distintas encontradas: ${contagem.size} ---`);
  for (const [tag, info] of linhas) {
    const destino = info.slug ? `→ ${info.slug}` : '→ NÃO MAPEADA (será removida)';
    console.log(`  "${tag}" (${info.obras.size} obra${info.obras.size === 1 ? '' : 's'}) ${destino}`);
  }

  console.log('');
  console.log('--- Por obra ---');
  for (const plano of planos) {
    if (plano.semTagsNoDocumento) {
      console.log(`[${plano.titulo}] (${plano.id}) — SEM tags no documento (doc legado; backfill preenche com [] depois do --apply)`);
      continue;
    }
    console.log(`[${plano.titulo}] (${plano.id})`);
    console.log(`  antes:  [${formatarLista(plano.tagsAtuais)}]`);
    console.log(`  depois: [${formatarLista(plano.tagsFinais)}]`);
    if (plano.removidas.length > 0) {
      console.log(`  removidas (não mapeadas): [${formatarLista(plano.removidas)}]`);
    }
    if (plano.capadas.length > 0) {
      console.log(`  ⚠️  CAP: [${formatarLista(plano.capadas)}] cortada(s) por prioridade — mais de 8 tags mapeáveis`);
    }
    console.log(`  ${plano.mudou ? (dryRun ? 'MUDARIA' : 'MODIFICADA') : 'sem mudança'}`);
  }

  console.log('');
  console.log(dryRun ? '=== Resumo (dry-run) ===' : '=== Resumo ===');
  console.log(`Total de séries:                   ${resumo.totalSeries}`);
  console.log(`${dryRun ? 'Seriam modificadas' : 'Modificadas'}:${' '.repeat(Math.max(1, 20 - (dryRun ? 'Seriam modificadas' : 'Modificadas').length))}${resumo.modificadas}`);
  console.log(`Inalteradas:                        ${resumo.inalteradas}`);
  console.log(`Com tags removidas (não mapeadas):  ${resumo.comTagsRemovidas}`);
  console.log(`Com cap aplicado (>8 mapeáveis):    ${resumo.comCap}`);
  console.log(`Sem tags no documento:              ${resumo.semTagsNoDocumento}`);

  if (backfill) {
    console.log('');
    console.log('--- Backfill de content_rating/tags ausentes (services/parentalBackfill.js) ---');
    console.log(`content_rating preenchidos: ${backfill.contentRatingAtualizados}`);
    console.log(`tags preenchidos:            ${backfill.tagsAtualizados}`);
  }

  console.log('');
  if (dryRun) {
    console.log('Nada foi escrito. Revise o mapeamento acima — ajuste scripts/mapaTagsVocabulario.js se necessário — e rode de novo com --apply.');
  } else {
    console.log('Migração aplicada.');
  }
}

const USO = 'Uso: node scripts/migrarTagsVocabulario.js            (dry-run, não escreve nada)\n'
  + '     node scripts/migrarTagsVocabulario.js --apply    (grava de verdade)';
const FLAGS_RECONHECIDAS = ['--apply', '--dry-run'];

/**
 * Parse ESTRITO dos argumentos da CLI (`process.argv.slice(2)`) — fix round,
 * achado MEDIA 1: antes, `!argv.includes('--apply')` tratava QUALQUER coisa
 * que não fosse literalmente `--apply` como dry-run — incluindo
 * `--apply --dry-run` juntos, que na prática APLICAVA (gravava) porque
 * `--apply` também estava presente. Um operador que digitasse os dois por
 * engano (ou um typo como `--APPLY`) não tinha como saber que a intenção
 * dele não foi respeitada.
 *
 * Só `--apply` e `--dry-run` são reconhecidos. Retorna:
 *   { ok: true, dryRun }    — argumentos válidos, dryRun já resolvido
 *   { ok: false, mensagem } — inválido; quem chama NUNCA deve conectar no
 *                             Mongo nesse caso (a CLI abaixo checa `ok`
 *                             ANTES de `mongoose.connect`).
 * Inválido quando:
 *   - `--apply` E `--dry-run` juntos (ambíguo — nenhum prevalece, erro);
 *   - qualquer argumento fora de `--apply`/`--dry-run` (typo do operador
 *     precisa virar erro alto, nunca um dry-run silencioso disfarçado).
 */
function parseArgv(argv) {
  const desconhecidos = argv.filter((a) => !FLAGS_RECONHECIDAS.includes(a));
  if (desconhecidos.length > 0) {
    return {
      ok: false,
      mensagem: `Argumento(s) não reconhecido(s): ${desconhecidos.join(', ')}.\n${USO}`,
    };
  }

  const temApply = argv.includes('--apply');
  const temDryRun = argv.includes('--dry-run');
  if (temApply && temDryRun) {
    return {
      ok: false,
      mensagem: `--apply e --dry-run juntos são ambíguos — escolha um (sem nenhum dos dois = dry-run).\n${USO}`,
    };
  }

  return { ok: true, dryRun: !temApply };
}

if (require.main === module) {
  const parsed = parseArgv(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`❌ ${parsed.mensagem}`);
    process.exit(1);
  } else {
    require('dotenv').config();

    (async () => {
      try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux');
        const resultado = await aplicarMigracao({ dryRun: parsed.dryRun, mapa: MAPA_PADRAO });
        imprimirRelatorio(resultado);
        await mongoose.disconnect();
        process.exit(0);
      } catch (err) {
        // Fix round, achado BAIXA 3: a mensagem antiga ("nenhuma escrita foi
        // feita") era falsa quando o loop de escrita falhava NO MEIO — já
        // tinha gravado algumas obras antes do erro. `err.escritasFeitas`
        // (pendurado por aplicarMigracao) diz a verdade: 0 = realmente nada
        // foi gravado (erro na leitura/planejamento, ANTES do loop); >0 =
        // gravação parcial — o script é idempotente, então corrigir e rodar
        // `--apply` de novo é seguro (as já gravadas viram no-op).
        const escritasFeitas = typeof err.escritasFeitas === 'number' ? err.escritasFeitas : 0;
        if (escritasFeitas === 0) {
          console.error('❌ Migração abortada — 0 escritas, nada foi gravado.');
        } else {
          console.error(
            `❌ Migração interrompida NO MEIO da escrita — ${escritasFeitas} obra(s) já foi(ram) gravada(s) antes da falha. `
            + 'O script é idempotente: corrija o problema abaixo e rode "--apply" de novo (as obras já gravadas viram no-op).'
          );
        }
        console.error(err);
        try { await mongoose.disconnect(); } catch (_) { /* ignora */ }
        process.exit(1);
      }
    })();
  }
}

module.exports = {
  planejarMigracao,
  aplicarMigracao,
  resolverTag,
  prioridadeDoSlug,
  normalizarChaveTag,
  parseArgv,
};
