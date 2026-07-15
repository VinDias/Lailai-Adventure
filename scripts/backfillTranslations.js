/**
 * Backfill de traduções do catálogo (EN/ES/ZH) — roda uma vez na VPS.
 *
 * Séries e episódios criados ANTES da feature de tradução automática não têm
 * o campo `translations`. Este script percorre o catálogo e traduz gênero/
 * descrição do que estiver faltando. Conteúdo novo já é traduzido no save.
 *
 * Requisitos: GEMINI_API_KEY e MONGO_URI no .env.
 * Uso: node scripts/backfillTranslations.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const translationService = require('../services/translationService');

(async () => {
  if (!translationService.isAvailable()) {
    console.error('❌ GEMINI_API_KEY não está no .env — configure e rode novamente.');
    console.error('   Chave gratuita em: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorflux');
  const Series = require('../models/Series');
  const Episode = require('../models/Episode');

  let ok = 0, skipped = 0, failed = 0;

  const allSeries = await Series.find().lean();
  console.log(`── Séries: ${allSeries.length} ─────────────────────────`);
  for (const s of allSeries) {
    const hasContent = (s.genre && s.genre.trim()) || (s.description && s.description.trim());
    const alreadyDone = s.translations?.en?.description || s.translations?.en?.genre;
    if (!hasContent || alreadyDone) { skipped++; continue; }
    try {
      const translations = await translationService.buildTranslations({ genre: s.genre, description: s.description });
      if (translations) {
        await Series.updateOne({ _id: s._id }, { $set: { translations } });
        console.log(`✅ Série "${s.title}" traduzida`);
        ok++;
      } else skipped++;
    } catch (err) {
      console.error(`❌ Série "${s.title}": ${err.message}`);
      failed++;
    }
  }

  const allEpisodes = await Episode.find().select('title description translations').lean();
  console.log(`── Episódios: ${allEpisodes.length} ──────────────────────`);
  for (const ep of allEpisodes) {
    const hasContent = ep.description && ep.description.trim();
    const alreadyDone = ep.translations?.en?.description;
    if (!hasContent || alreadyDone) { skipped++; continue; }
    try {
      const translations = await translationService.buildTranslations({ description: ep.description });
      if (translations) {
        await Episode.updateOne({ _id: ep._id }, { $set: { translations } });
        console.log(`✅ Episódio "${ep.title}" traduzido`);
        ok++;
      } else skipped++;
    } catch (err) {
      console.error(`❌ Episódio "${ep.title}": ${err.message}`);
      failed++;
    }
  }

  console.log(`\n── Resumo ──────────────────────────────────────`);
  console.log(`   Traduzidos: ${ok} | Já ok/sem texto: ${skipped} | Falhas: ${failed}`);
  console.log('   (Títulos nunca são traduzidos — decisão do cliente.)');
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
