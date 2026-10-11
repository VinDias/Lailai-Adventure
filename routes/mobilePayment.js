
// Assinatura comprada dentro do app (Fase 6, T5).
//
// Montado em /api/mobile (server.js). Antes ficava em /mobile, FORA do /api
// e portanto fora do limitador de requisições — uma rota que valida
// comprovante de pagamento sem limite de tentativas.
//
// O caminho da Google Play é o do arquivo todo; a Apple segue como estava
// (não existe app iOS; o invólucro da Play é um TWA só de Android).
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { verifyAppleReceipt } = require("../services/mobilePaymentService");
const play = require("../services/playBillingService");
const verifyToken = require("../middlewares/verifyToken");
const User = require("../models/User");
const PlayPurchase = require("../models/PlayPurchase");
const logger = require("../utils/logger");

/** Comprovante é credencial: no log vai só o rabo, nunca o valor inteiro. */
function resumoDoToken(token) {
  const t = String(token || "");
  return t.length <= 6 ? "******" : `...${t.slice(-6)}`;
}

/**
 * Liga o Premium até a data que a Play informou, SEM encurtar um prazo maior
 * que já exista: a mesma conta pode estar paga pelo navegador (Stripe) com
 * vencimento mais longe. A data gravada é absoluta e vem da fonte, então
 * reenvio de aviso não acumula tempo.
 */
async function liberarPremium(userId, expiraEm) {
  const usuario = await User.findById(userId).select("isPremium premiumExpiresAt");
  if (!usuario) return;
  const prazoAtual = usuario.premiumExpiresAt ? new Date(usuario.premiumExpiresAt).getTime() : 0;
  const prazoNovo = expiraEm ? new Date(expiraEm).getTime() : 0;
  usuario.isPremium = true;
  if (prazoNovo > prazoAtual) usuario.premiumExpiresAt = new Date(prazoNovo);
  await usuario.save();
}

/**
 * Desliga o Premium quando a Play avisa que a assinatura acabou (vencimento,
 * estorno, suspensão por falta de pagamento).
 *
 * A conta pode ter DUAS fontes de pagamento ao mesmo tempo (Play e Stripe),
 * então desligar direto cortaria o acesso de quem está pagando pelo
 * navegador. Mas "o prazo guardado é maior que o que a Play diz agora" NÃO
 * serve de prova de outra fonte: depois de um estorno, o prazo guardado é
 * justamente o que esta mesma compra havia concedido, e ele está no futuro.
 * Era o furo da primeira versão desta função — acesso pago de graça até o
 * fim do mês estornado.
 *
 * A pergunta certa é: o prazo da conta vai ALÉM de tudo o que esta compra já
 * concedeu? Só então existe outra fonte, e o vencimento dela fica com a
 * varredura da T4 (services/assinaturaExpiracaoService.js).
 *
 * `prazoConcedido` é o `expiraEm` que estava gravado no registro ANTES da
 * sincronização — por isso quem chama tem de lê-lo antes de atualizar.
 */
async function encerrarPremiumDaPlay(userId, { prazoDaPlay = null, prazoConcedido = null } = {}) {
  const usuario = await User.findById(userId).select("isPremium premiumExpiresAt");
  if (!usuario) return false;

  const emMs = (d) => (d ? new Date(d).getTime() : 0);
  const prazoAtual = emMs(usuario.premiumExpiresAt);
  const limiteDaPlay = Math.max(emMs(prazoDaPlay), emMs(prazoConcedido));

  if (prazoAtual > limiteDaPlay && prazoAtual > Date.now()) return false;

  // `premiumExpiresAt` fica como está: quem decide o acesso é a flag
  // (utils/assinatura.js exige as duas coisas), e preservar a data ajuda a
  // entender o histórico da conta no suporte.
  usuario.isPremium = false;
  await usuario.save();
  return true;
}

/**
 * Amarra o comprovante a UMA conta, de forma idempotente.
 *
 * Duas chamadas simultâneas com o mesmo comprovante são resolvidas pelo
 * índice único da coleção: a perdedora recebe E11000 e relê o registro, em
 * vez de criar um segundo vínculo. É o mesmo padrão de reivindicação usado no
 * resumo semanal (services/novidadesService.js).
 */
async function vincular({ purchaseToken, assinatura, userId }) {
  const existente = await PlayPurchase.findOne({ purchaseToken });
  if (existente) {
    return { ok: String(existente.userId) === String(userId), registro: existente };
  }
  try {
    const registro = await PlayPurchase.create({
      purchaseToken,
      userId,
      productId: assinatura.productId || "desconhecido",
      estado: assinatura.estado,
      expiraEm: assinatura.expiraEm,
      confirmada: assinatura.confirmada,
      ultimoPedido: assinatura.ultimoPedido,
      tokenAnterior: assinatura.tokenAnterior,
    });
    return { ok: true, registro };
  } catch (erro) {
    if (erro && erro.code === 11000) {
      const concorrente = await PlayPurchase.findOne({ purchaseToken });
      return { ok: !!concorrente && String(concorrente.userId) === String(userId), registro: concorrente };
    }
    throw erro;
  }
}

/**
 * POST /api/mobile/verify-google
 * O app manda o comprovante; o servidor pergunta à Play, amarra o
 * comprovante à conta, confirma a compra e libera o Premium.
 *
 * O `productId` do corpo da requisição é IGNORADO de propósito: ele vem do
 * cliente e serviria para confirmar a compra do produto errado. Vale o que a
 * própria Play respondeu.
 */
router.post("/verify-google", verifyToken, async (req, res) => {
  const { purchaseToken } = req.body || {};

  if (typeof purchaseToken !== "string" || !purchaseToken) {
    return res.status(400).json({ error: "Dados da compra incompletos." });
  }

  let assinatura;
  try {
    assinatura = await play.consultarAssinatura(purchaseToken);
  } catch (erro) {
    logger.error("[Play] Falha ao consultar a assinatura", erro && erro.message);
    return res.status(502).json({ error: "Não foi possível confirmar a compra com a Google agora. Tente novamente em instantes." });
  }

  if (!assinatura.ativa) {
    logger.warn(`[Play] Comprovante ${resumoDoToken(purchaseToken)} sem assinatura ativa (estado ${assinatura.estado}).`);
    return res.status(402).json({ error: "Esta compra não tem assinatura ativa.", estado: assinatura.estado });
  }

  const vinculo = await vincular({ purchaseToken, assinatura, userId: req.user.id });
  if (!vinculo.ok) {
    logger.warn(`[Play] Comprovante ${resumoDoToken(purchaseToken)} já pertence a outra conta — recusado.`);
    return res.status(409).json({ error: "Esta compra já está vinculada a outra conta." });
  }

  // Confirmação junto ao Google. Falhar aqui NÃO cancela a liberação: a
  // pessoa pagou e tem de entrar. Fica `confirmada: false` no registro, e a
  // próxima notificação da Play (ou uma nova abertura do app) tenta de novo —
  // é o que dá para fazer antes do estorno automático de 3 dias.
  if (!assinatura.confirmada) {
    try {
      await play.confirmarCompra({ productId: assinatura.productId, purchaseToken });
      assinatura.confirmada = true;
    } catch (erro) {
      logger.error(`[Play] NÃO confirmou a compra ${resumoDoToken(purchaseToken)} — risco de estorno em 3 dias:`, erro && erro.message);
    }
  }

  await PlayPurchase.updateOne({ purchaseToken }, {
    $set: {
      estado: assinatura.estado,
      expiraEm: assinatura.expiraEm,
      confirmada: assinatura.confirmada,
      ultimoPedido: assinatura.ultimoPedido,
      productId: assinatura.productId || vinculo.registro.productId,
      tokenAnterior: assinatura.tokenAnterior,
    },
  });

  await liberarPremium(req.user.id, assinatura.expiraEm);
  logger.info(`[Play] Premium liberado para userId ${req.user.id} até ${assinatura.expiraEm && assinatura.expiraEm.toISOString()}.`);

  return res.json({
    success: true,
    message: "Assinatura da Google Play ativada.",
    premiumExpiresAt: assinatura.expiraEm,
  });
});

router.post("/verify-apple", verifyToken, async (req, res) => {
  const { receiptData } = req.body || {};

  if (typeof receiptData !== "string" || !receiptData) {
    return res.status(400).json({ error: "Recibo Apple não fornecido." });
  }

  const result = await verifyAppleReceipt(receiptData);

  if (result.valid) {
    await liberarPremium(req.user.id, result.expiresAt);
    logger.info(`[Mobile] Premium (Apple) ativado para userId ${req.user.id}`);
    return res.json({ success: true, message: "Assinatura Apple IAP ativada.", premiumExpiresAt: result.expiresAt });
  }

  res.status(402).json({ error: "Falha na validação do recibo Apple." });
});

/** Compara o segredo em tempo constante, tolerando tamanhos diferentes. */
function segredoConfere(recebido, esperado) {
  const a = Buffer.from(String(recebido || ""));
  const b = Buffer.from(String(esperado));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Aplica na conta o que a Play está dizendo sobre um comprovante.
 * Devolve o que aconteceu, para o log e para a resposta.
 */
async function sincronizarComprovante(purchaseToken) {
  const registro = await PlayPurchase.findOne({ purchaseToken });
  if (!registro) return { resultado: "desconhecido" };

  // Lido ANTES de qualquer atualização: é o prazo que esta compra havia
  // concedido, e `encerrarPremiumDaPlay` precisa dele para distinguir o
  // prazo desta assinatura do prazo de uma segunda fonte de pagamento.
  const prazoConcedido = registro.expiraEm;

  let assinatura;
  try {
    assinatura = await play.consultarAssinatura(purchaseToken);
  } catch (erro) {
    logger.error("[Play] Aviso recebido, mas a consulta falhou", erro && erro.message);
    return { resultado: "falha_na_consulta" };
  }

  await PlayPurchase.updateOne({ purchaseToken }, {
    $set: {
      estado: assinatura.estado,
      expiraEm: assinatura.expiraEm,
      confirmada: assinatura.confirmada,
      ultimoPedido: assinatura.ultimoPedido,
      tokenAnterior: assinatura.tokenAnterior,
    },
  });

  // Confirmação atrasada: se a primeira tentativa falhou na rota de compra,
  // este é o segundo tiro antes do estorno automático.
  if (assinatura.ativa && !assinatura.confirmada) {
    try {
      await play.confirmarCompra({ productId: assinatura.productId || registro.productId, purchaseToken });
      await PlayPurchase.updateOne({ purchaseToken }, { $set: { confirmada: true } });
    } catch (erro) {
      logger.error(`[Play] Nova tentativa de confirmar ${resumoDoToken(purchaseToken)} falhou:`, erro && erro.message);
    }
  }

  if (assinatura.ativa) {
    await liberarPremium(registro.userId, assinatura.expiraEm);
    return { resultado: "liberado", expiraEm: assinatura.expiraEm };
  }

  const encerrou = await encerrarPremiumDaPlay(registro.userId, {
    prazoDaPlay: assinatura.expiraEm,
    prazoConcedido,
  });
  return { resultado: encerrou ? "encerrado" : "mantido_por_outra_fonte" };
}

/**
 * POST /api/mobile/notificacoes
 * Avisos em tempo real da Google Play (RTDN): renovação, cancelamento,
 * suspensão, estorno. Chega por Pub/Sub push, com o evento em base64 dentro
 * de `message.data`.
 *
 * AUTENTICAÇÃO: segredo compartilhado na própria URL configurada no Pub/Sub
 * (`?s=...`), porque ali se configura o endereço, não cabeçalhos. Sem
 * `PLAY_RTDN_SECRET` no ambiente a rota responde 503: uma rota aberta aqui
 * seria um botão de "encerrar a assinatura de quem eu quiser" para quem
 * descobrisse o endereço.
 *
 * RESPOSTA 200 NA MAIORIA DOS CASOS, de propósito: o Pub/Sub reentrega tudo
 * que não for 2xx. Comprovante desconhecido (compra de outro ambiente, teste
 * do painel) seria reentregue para sempre. As exceções são justamente onde
 * repetir resolve: consulta ao Google indisponível devolve 503 para o
 * Pub/Sub tentar de novo.
 */
router.post("/notificacoes", async (req, res) => {
  const esperado = process.env.PLAY_RTDN_SECRET;
  if (!esperado) {
    logger.error("[Play] PLAY_RTDN_SECRET não configurado — rota de avisos recusando tudo.");
    return res.status(503).json({ error: "Recebimento de avisos não configurado." });
  }
  if (!segredoConfere(req.query.s, esperado)) {
    logger.warn("[Play] Aviso recebido com segredo inválido — descartado.");
    return res.status(401).json({ error: "Não autorizado." });
  }

  const dados = req.body && req.body.message && req.body.message.data;
  if (!dados) {
    // Não é uma entrega do Pub/Sub. 400 aqui é informação para quem
    // configurou errado, e não gera reentrega (o Pub/Sub nunca manda isso).
    return res.status(400).json({ error: "Corpo fora do formato de aviso do Pub/Sub." });
  }

  let evento;
  try {
    evento = JSON.parse(Buffer.from(String(dados), "base64").toString("utf8"));
  } catch (erro) {
    // Reentregar não vai fazer o conteúdo passar a ser JSON: confirma e sai.
    logger.warn("[Play] Aviso com conteúdo ilegível — confirmado e ignorado.");
    return res.json({ received: true, ignorado: "conteudo_ilegivel" });
  }

  try {
    if (evento.testNotification) {
      logger.info("[Play] Aviso de teste recebido do Play Console.");
      return res.json({ received: true, teste: true });
    }

    // Estorno e chargeback. O acesso tem de cair já: o dinheiro voltou.
    if (evento.voidedPurchaseNotification) {
      const token = evento.voidedPurchaseNotification.purchaseToken;
      const registro = await PlayPurchase.findOne({ purchaseToken: token });
      if (registro) {
        // O dinheiro voltou: o prazo que esta compra concedeu deixa de valer
        // por inteiro, então ele entra como limite a derrubar — e não como
        // motivo para manter o acesso.
        const encerrou = await encerrarPremiumDaPlay(registro.userId, { prazoConcedido: registro.expiraEm });
        await PlayPurchase.updateOne({ purchaseToken: token }, { $set: { estado: "ESTORNADA" } });
        logger.warn(`[Play] Compra ${resumoDoToken(token)} estornada — Premium ${encerrou ? "encerrado" : "mantido por outra fonte"}.`);
      } else {
        logger.warn(`[Play] Estorno de comprovante desconhecido ${resumoDoToken(token)} — ignorado.`);
      }
      return res.json({ received: true });
    }

    if (evento.subscriptionNotification) {
      const { purchaseToken, notificationType } = evento.subscriptionNotification;
      const { resultado, expiraEm } = await sincronizarComprovante(purchaseToken);

      if (resultado === "falha_na_consulta") {
        // Aqui repetir RESOLVE: devolve erro para o Pub/Sub reentregar.
        return res.status(503).json({ error: "Consulta à Google indisponível." });
      }

      logger.info(`[Play] Aviso tipo ${notificationType} para ${resumoDoToken(purchaseToken)}: ${resultado}${expiraEm ? ` (até ${expiraEm.toISOString()})` : ""}.`);
      return res.json({ received: true, resultado });
    }

    logger.info("[Play] Aviso sem seção reconhecida — confirmado e ignorado.");
    return res.json({ received: true, ignorado: "sem_secao_conhecida" });
  } catch (erro) {
    logger.error("[Play] Falha ao processar aviso", erro && erro.message);
    // Erro nosso: deixa o Pub/Sub reentregar.
    return res.status(500).json({ error: "Falha ao processar o aviso." });
  }
});

module.exports = router;
