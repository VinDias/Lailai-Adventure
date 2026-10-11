// Conversa com a Google Play Developer API (Fase 6, T5).
//
// Substitui `verifyGooglePurchase` de services/mobilePaymentService.js, que
// tinha três problemas de fundo:
//
// 1. Usava `purchases.subscriptions.get` (API v3, modelo antigo de um
//    produto = um plano). O modelo atual da Play tem produto com vários
//    planos e a consulta certa é `purchases.subscriptionsv2.get`, que
//    responde com `subscriptionState` em vez de `paymentState`.
// 2. Não CONFIRMAVA a compra. O Google estorna automaticamente toda compra
//    não confirmada em 3 dias: o assinante recebia o dinheiro de volta e a
//    gente achava que tinha um assinante.
// 3. Engolia qualquer erro e devolvia `{ valid: false }`. Uma queda da API
//    do Google ficava indistinguível de "esta compra não existe", e o
//    assinante legítimo levava recusa.
//
// Aqui a consulta LANÇA quando não consegue perguntar, e quem chama decide
// o que fazer — a diferença entre 502 (tente de novo) e 402 (não vale).
//
// Molde da injeção de teste: utils/googleTokenVerifier.js (`__set*ForTests`
// guardado por NODE_ENV) — nenhum teste fala com o Google de verdade.
const logger = require('../utils/logger');

const ESCOPO = 'https://www.googleapis.com/auth/androidpublisher';

// Estados que DÃO acesso (`subscriptionState` da API v2).
//
// CANCELED está na lista de propósito: cancelar na Play não corta o acesso na
// hora, ele vale até o fim do período já pago. Tirar daqui seria cobrar o mês
// inteiro e entregar meio.
//
// Fora da lista, com o motivo: ON_HOLD (pagamento recusado, o Google ainda
// está tentando cobrar — sem acesso), PAUSED (pausa pedida pelo usuário),
// EXPIRED, PENDING (primeira cobrança ainda não aprovada) e
// PENDING_PURCHASE_CANCELED.
const ESTADOS_COM_ACESSO = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

let apiDeTeste = null;

async function apiPlay() {
  if (apiDeTeste) return apiDeTeste;
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ scopes: [ESCOPO] });
  const authClient = await auth.getClient();
  return google.androidpublisher({ version: 'v3', auth: authClient });
}

function nomeDoPacote() {
  const pacote = process.env.ANDROID_PACKAGE_NAME;
  if (!pacote) {
    throw new Error('ANDROID_PACKAGE_NAME é obrigatório para falar com a Google Play.');
  }
  return pacote;
}

/**
 * Traduz a resposta da API v2 para o que o resto do servidor precisa saber.
 * Exportada para ser testada sozinha: é aqui que mora a regra de quem tem
 * acesso, e ela precisa ser conferível sem subir rota nenhuma.
 */
function normalizar(dados) {
  const d = dados || {};
  const linhas = Array.isArray(d.lineItems) ? d.lineItems : [];

  // Uma assinatura pode ter mais de uma linha (plano base mais complemento).
  // A data que vale é a que vence POR ÚLTIMO: é até ela que o acesso dura.
  let expiraEm = null;
  for (const linha of linhas) {
    if (!linha || !linha.expiryTime) continue;
    const quando = new Date(linha.expiryTime);
    if (Number.isNaN(quando.getTime())) continue;
    if (!expiraEm || quando > expiraEm) expiraEm = quando;
  }

  const estado = d.subscriptionState || null;
  const linhaComProduto = linhas.find((l) => l && l.productId);

  // Fecha a porta por omissão: sem data de validade não há acesso. Resposta
  // truncada, campo que o Google renomeie ou produto mal configurado passam a
  // negar, não a liberar.
  const noPrazo = !!expiraEm && expiraEm.getTime() > Date.now();

  return {
    estado,
    expiraEm,
    productId: (linhaComProduto && linhaComProduto.productId) || null,
    confirmada: d.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    ultimoPedido: d.latestOrderId || null,
    tokenAnterior: d.linkedPurchaseToken || null,
    ativa: ESTADOS_COM_ACESSO.has(estado) && noPrazo,
  };
}

/**
 * Consulta o estado de uma assinatura na Play. LANÇA se não der para
 * perguntar (credencial, rede, cota) — não confunda com "não vale".
 */
async function consultarAssinatura(purchaseToken) {
  const api = await apiPlay();
  const res = await api.purchases.subscriptionsv2.get({
    packageName: nomeDoPacote(),
    token: purchaseToken,
  });
  return normalizar(res && res.data);
}

/**
 * Confirma a compra junto ao Google. Isto NÃO é formalidade: compra não
 * confirmada em 3 dias é estornada automaticamente.
 *
 * Em assinatura a confirmação ainda é o método v3
 * (`purchases.subscriptions.acknowledge`); a v2 só tem consulta. O
 * `subscriptionId` é o id do PRODUTO, que vem da própria consulta — nunca do
 * corpo da requisição do app.
 */
async function confirmarCompra({ productId, purchaseToken }) {
  if (!productId) throw new Error('Confirmação de compra sem productId.');
  const api = await apiPlay();
  await api.purchases.subscriptions.acknowledge({
    packageName: nomeDoPacote(),
    subscriptionId: productId,
    token: purchaseToken,
  });
  logger.info('[Play] Compra confirmada junto ao Google.');
}

/** Injeção exclusiva de testes (mesmo padrão de utils/googleTokenVerifier.js). */
function __setApiPlayForTests(api) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setApiPlayForTests só pode ser usado em NODE_ENV=test');
  }
  apiDeTeste = api;
}

module.exports = {
  consultarAssinatura,
  confirmarCompra,
  normalizar,
  ESTADOS_COM_ACESSO,
  __setApiPlayForTests,
};
