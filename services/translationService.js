/**
 * Tradução automática de conteúdo do catálogo (PT → EN/ES/ZH) via Gemini.
 * Chamado no create/update de séries/episódios. Sem GEMINI_API_KEY é no-op
 * (retorna null e a UI cai no PT). Título NUNCA é traduzido.
 * Seam de teste no mesmo padrão do googleTokenVerifier/bunnyStorage.
 */
const logger = require('../utils/logger');

const TARGET_LANGS = ['en', 'es', 'zh'];
const LANG_NAMES = { en: 'inglês', es: 'espanhol', zh: 'chinês simplificado' };

let testTranslator = null;

function isAvailable() {
  return Boolean(testTranslator || process.env.GEMINI_API_KEY);
}

async function translateText(text, targetLang) {
  if (testTranslator) return testTranslator(text, targetLang);

  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Traduza o texto abaixo do português para ${LANG_NAMES[targetLang]}. Responda APENAS com a tradução, sem comentários, sem aspas e sem explicações.\n\n${text}`,
    config: { temperature: 0.2 },
  });
  const translated = (response.text || '').trim();
  if (!translated) throw new Error(`Tradução vazia para ${targetLang}`);
  return translated;
}

/**
 * Recebe { genre?, description? } (ou só { description }) e devolve
 * { en: {...}, es: {...}, zh: {...} } com os campos não vazios traduzidos.
 * Retorna null quando indisponível ou sem nada a traduzir. Lança em falha
 * de tradução — o chamador decide (as rotas tratam como não-crítico).
 */
async function buildTranslations(fields) {
  if (!isAvailable()) return null;
  const entries = Object.entries(fields || {})
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
  if (entries.length === 0) return null;

  const result = {};
  await Promise.all(TARGET_LANGS.map(async (lang) => {
    const translated = {};
    for (const [key, value] of entries) {
      translated[key] = await translateText(value, lang);
    }
    result[lang] = translated;
  }));
  return result;
}

/**
 * Variante segura para uso nas rotas: nunca lança, loga e devolve null em
 * falha (a tradução não pode impedir um save de conteúdo).
 */
async function buildTranslationsSafe(fields, contextLabel) {
  try {
    return await buildTranslations(fields);
  } catch (err) {
    logger.error(`[Translation] Falha ao traduzir ${contextLabel || 'conteúdo'}: ${err.message}`);
    return null;
  }
}

/** Injeção exclusiva de testes. */
function __setTranslatorForTests(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTranslatorForTests só pode ser usado em NODE_ENV=test');
  }
  testTranslator = fn;
}

module.exports = { buildTranslations, buildTranslationsSafe, isAvailable, __setTranslatorForTests };
