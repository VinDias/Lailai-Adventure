// Expiração de assinatura (Fase 6, T4).
//
// Até aqui o Premium só era desligado por webhook: se o aviso do Stripe (ou,
// a partir da T5, da Google Play) se perdesse, a conta ficava com
// `isPremium: true` e uma data no passado. Isso era inofensivo enquanto o
// Premium só escondia anúncio — o cliente conferia a data. Com o Premium
// barrando conteúdo no servidor, o banco passa a ser a fonte, e o estado
// pendurado viraria acesso pago de graça.
//
// Molde: services/recommendationService.js (varredura de 24h) — guarda de
// teste, idempotente e com unref() para não segurar o processo vivo.
const User = require('../models/User');
const logger = require('../utils/logger');

const INTERVALO_MS = 60 * 60 * 1000; // de hora em hora: a conta vence em um instante qualquer do dia
let timer = null;

/**
 * Desliga `isPremium` de quem tem prazo vencido. Conta SEM `premiumExpiresAt`
 * não é tocada: é assinatura antiga, anterior ao campo, e desligar levaria
 * embora o acesso de quem paga.
 */
async function encerrarAssinaturasVencidas(agora = new Date()) {
  const resultado = await User.updateMany(
    { isPremium: true, premiumExpiresAt: { $ne: null, $lt: agora } },
    { $set: { isPremium: false } }
  );
  const encerradas = resultado.modifiedCount ?? resultado.nModified ?? 0;
  if (encerradas > 0) logger.info(`[Assinatura] ${encerradas} assinatura(s) vencida(s) encerrada(s).`);
  return encerradas;
}

function iniciarVarreduraDeAssinaturas() {
  if (process.env.NODE_ENV === 'test') return; // mesma guarda das outras varreduras
  if (timer) return; // idempotente

  timer = setInterval(() => {
    encerrarAssinaturasVencidas().catch((erro) =>
      logger.error('[Assinatura] Varredura de expiracao falhou', erro && erro.message)
    );
  }, INTERVALO_MS);
  if (typeof timer.unref === 'function') timer.unref();

  // Varredura de boot: cobre o tempo em que o processo esteve fora do ar.
  encerrarAssinaturasVencidas().catch((erro) =>
    logger.error('[Assinatura] Varredura de boot falhou', erro && erro.message)
  );
}

function pararVarreduraDeAssinaturas() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { encerrarAssinaturasVencidas, iniciarVarreduraDeAssinaturas, pararVarreduraDeAssinaturas };
