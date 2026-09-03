/**
 * Regras do PIN de proteção parental (Fase 5, Bloco 2, Task 3). Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.3, decisão "PIN").
 *
 * Rate limit PERSISTIDO no próprio User (`parental.pinTentativas`/
 * `parental.pinBloqueadoAte` — nada em memória: sobrevive a restart do
 * processo; key = userId, a rota já exige a própria sessão). Fórmula: a
 * cada MÚLTIPLO de 5 tentativas erradas, `pinBloqueadoAte = agora + 15min ×
 * 2^(lote-1)` onde `lote = tentativas/5`, com teto de 24h. Acerto zera
 * tentativas E bloqueio.
 *
 * As funções de cálculo (estaBloqueado/minutosRestantes/proximoAposErro/
 * resultadoAcerto) são PURAS e recebem `agora` injetável (default
 * `new Date()`) — os testes de fórmula do backoff chamam direto, sem
 * depender do relógio real. `avaliarTentativaPin` é o ÚNICO ponto que
 * compara o PIN em si (bcrypt) e é reutilizado pelas 3 rotas que o exigem:
 * PUT /api/parental, POST /api/parental/pin (troca/remoção) e
 * DELETE /api/account/me. Ela NÃO persiste nada — devolve `updateParental`
 * (via `paraUpdateParental`) para o chamador gravar, permitindo mesclar num
 * único `$set` com as demais mudanças que o PIN estava protegendo.
 */
const bcrypt = require('bcrypt');

const QUINZE_MIN_MS = 15 * 60 * 1000;
const TETO_MS = 24 * 60 * 60 * 1000;

function estaBloqueado(user, agora = new Date()) {
  const ate = user?.parental?.pinBloqueadoAte;
  return !!(ate && new Date(ate).getTime() > agora.getTime());
}

function minutosRestantes(user, agora = new Date()) {
  const ate = user?.parental?.pinBloqueadoAte;
  if (!ate) return 0;
  const ms = new Date(ate).getTime() - agora.getTime();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * Calcula o próximo (pinTentativas, pinBloqueadoAte) após UM erro de PIN —
 * função pura, NÃO persiste. `tentativasRestantesNoLote` é quanto falta até
 * o PRÓXIMO bloqueio (0 quando esta tentativa acabou de fechar um lote de 5
 * — a resposta ainda é 401 nesse request; só o PRÓXIMO request, já
 * bloqueado, responde 429 — ver `avaliarTentativaPin`/spec "Bloqueado → 429
 * SEM avaliar o pin").
 */
function proximoAposErro(user, agora = new Date()) {
  const tentativasAtuais = user?.parental?.pinTentativas || 0;
  const pinTentativas = tentativasAtuais + 1;
  let pinBloqueadoAte = user?.parental?.pinBloqueadoAte || null;

  if (pinTentativas % 5 === 0) {
    const lote = pinTentativas / 5;
    const duracaoMs = Math.min(QUINZE_MIN_MS * Math.pow(2, lote - 1), TETO_MS);
    pinBloqueadoAte = new Date(agora.getTime() + duracaoMs);
  }

  const restoNoLote = pinTentativas % 5;
  const tentativasRestantesNoLote = restoNoLote === 0 ? 0 : 5 - restoNoLote;

  return { pinTentativas, pinBloqueadoAte, tentativasRestantesNoLote };
}

function resultadoAcerto() {
  return { pinTentativas: 0, pinBloqueadoAte: null };
}

/**
 * Prefixa {pinTentativas, pinBloqueadoAte} para uso direto num `$set` do
 * Mongoose (`parental.pinTentativas`, `parental.pinBloqueadoAte`).
 */
function paraUpdateParental(campos) {
  const out = {};
  for (const chave of Object.keys(campos)) out[`parental.${chave}`] = campos[chave];
  return out;
}

/**
 * Avalia uma tentativa de uso do PIN contra o usuário (documento COM
 * `parental.pinHash` carregado via `.select('+parental.pinHash')` —
 * chamador garante isso). Retorna sempre `{ ok, status, body,
 * updateParental }`:
 *  - bloqueado → `{ ok:false, status:429, updateParental:null }`. O PIN
 *    fornecido NUNCA é comparado nesse caso (não vaza certo/errado, mesmo
 *    quando o `pin` do request está correto).
 *  - `pin` ausente/vazio → `{ ok:false, status:401, updateParental:null }`
 *    (não conta como tentativa — nada a persistir).
 *  - `pin` incorreto → `{ ok:false, status:401, updateParental:{...} }` —
 *    o chamador PERSISTE `updateParental` (via `paraUpdateParental`) antes
 *    de responder.
 *  - `pin` correto → `{ ok:true, status:200, updateParental:{pinTentativas:0,
 *    pinBloqueadoAte:null} }` — o chamador persiste o reset, podendo
 *    mesclar no MESMO update das mudanças que o PIN protegia.
 */
async function avaliarTentativaPin({ user, pin, agora = new Date() }) {
  if (estaBloqueado(user, agora)) {
    const minutos = minutosRestantes(user, agora);
    return {
      ok: false,
      status: 429,
      body: { error: `PIN bloqueado por excesso de tentativas. Tente novamente em ${minutos} minuto(s).` },
      updateParental: null,
    };
  }

  if (typeof pin !== 'string' || pin.length === 0) {
    return {
      ok: false,
      status: 401,
      body: { error: 'PIN obrigatório.' },
      updateParental: null,
    };
  }

  const correto = await bcrypt.compare(pin, user?.parental?.pinHash || '');
  if (!correto) {
    const { pinTentativas, pinBloqueadoAte, tentativasRestantesNoLote } = proximoAposErro(user, agora);
    return {
      ok: false,
      status: 401,
      body: { error: 'PIN incorreto.', tentativasRestantes: tentativasRestantesNoLote },
      updateParental: { pinTentativas, pinBloqueadoAte },
    };
  }

  return { ok: true, status: 200, body: null, updateParental: resultadoAcerto() };
}

module.exports = {
  estaBloqueado,
  minutosRestantes,
  proximoAposErro,
  resultadoAcerto,
  paraUpdateParental,
  avaliarTentativaPin,
  QUINZE_MIN_MS,
  TETO_MS,
};
