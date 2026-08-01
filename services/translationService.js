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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// O nível gratuito limita requisições por MINUTO por modelo (gemini-3-flash: 5).
// Por isso cada item é traduzido numa ÚNICA chamada (os 3 idiomas de uma vez),
// em vez de uma chamada por idioma/campo — 6x menos requisições por obra.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

/** Erros transitórios da API (cota por minuto, indisponibilidade) valem retry. */
function isRetryable(err) {
  const msg = String(err?.message || '');
  return /429|RESOURCE_EXHAUSTED|quota|rate/i.test(msg) || /503|UNAVAILABLE|overloaded/i.test(msg);
}

/** A resposta 429 informa quanto esperar ("Please retry in 43.6s" / retryDelay). */
function retryDelayMs(err, attempt) {
  const msg = String(err?.message || '');
  const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 2000; // margem de 2s
  return Math.min(60000, 5000 * Math.pow(2, attempt));
}

async function callModel(prompt, { retries = 5 } = {}) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { temperature: 0.2, responseMimeType: 'application/json' },
      });
      const text = (response.text || '').trim();
      if (!text) throw new Error('Resposta vazia do modelo');
      return text;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === retries) break;
      await sleep(retryDelayMs(err, attempt));
    }
  }
  throw lastErr;
}

/** Traduz todos os campos para os 3 idiomas numa única requisição. */
async function translateAllLangs(entries) {
  const fieldList = entries.map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n');
  const shape = TARGET_LANGS
    .map(l => `"${l}": {${entries.map(([k]) => `"${k}": "tradução em ${LANG_NAMES[l]}"`).join(', ')}}`)
    .join(', ');

  const prompt = `Traduza os campos abaixo do português para inglês, espanhol e chinês simplificado.

Campos:
${fieldList}

Responda APENAS com um JSON válido exatamente neste formato, sem markdown e sem comentários:
{${shape}}`;

  const raw = await callModel(prompt);
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    throw new Error('Modelo não devolveu JSON válido');
  }

  const result = {};
  for (const lang of TARGET_LANGS) {
    const got = parsed[lang];
    if (!got) throw new Error(`Tradução ausente para ${lang}`);
    const obj = {};
    for (const [key] of entries) {
      const value = typeof got[key] === 'string' ? got[key].trim() : '';
      if (!value) throw new Error(`Campo "${key}" vazio em ${lang}`);
      obj[key] = value;
    }
    result[lang] = obj;
  }
  return result;
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

  // Testes injetam um tradutor por (texto, idioma) — mantém a seam simples.
  if (testTranslator) {
    const result = {};
    for (const lang of TARGET_LANGS) {
      const translated = {};
      for (const [key, value] of entries) {
        translated[key] = await testTranslator(value, lang);
      }
      result[lang] = translated;
    }
    return result;
  }

  // Produção: uma única requisição para os 3 idiomas (economia de cota).
  return translateAllLangs(entries);
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
