/**
 * Fase 5 Bloco 3 — constantes da curadoria semiautomática (spec rev.2,
 * decisão "Faixas dos gatilhos"). O Vin deu os patamares 100/200/300/500 e
 * "20 + 30%" para obras pequenas SEM mapear volumes; as faixas de V abaixo
 * são decisão nossa (ledger P1) e ficam aqui, num único objeto, para ajuste
 * por deploy sem tocar em lógica.
 *
 * PROPRIEDADE OBRIGATÓRIA: limiarPara é não-decrescente em V. A rev.1 da
 * spec tinha "20 E 30%" até V<1.000 e 100 fixo a partir de 1.000 — o limiar
 * caía de 300 (V=999) para 100 (V=1.000). Qualquer mudança nas constantes
 * precisa manter o teste de propriedade verde.
 */
const PISO_PEQUENA = 20;          // regra 3 do Vin: "mínimo de 20"
const PERCENTUAL_PEQUENA = 30;    // regra 3: "30% das visualizações únicas" (inteiro — sem float)
const TETO_PEQUENA = 100;         // a partir daqui vale o 1º patamar normal do Vin

// Patamares do Vin (100/200/300/500) por faixa de V. `ateV` é EXCLUSIVO.
// O 1º patamar (100) é também o teto da fórmula "pequena" — a escada é
// contínua por construção: 30% de V cruza 100 em V=334 e fica em 100 até
// 9.999.
const PATAMARES = [
  { ateV: 10000, limiar: 100 },
  { ateV: 50000, limiar: 200 },
  { ateV: 100000, limiar: 300 },
  { ateV: Infinity, limiar: 500 },
];

const GRAVE = 5;                  // regra 4: 5 sinalizações graves em qualquer V

// Antibrigada (spec rev.2): cadastro não exige verificação de e-mail e o
// accountLimiter dá 10 contas/15min por IP — contas recém-criadas não
// contam até "amadurecer". Aplicado NA AVALIAÇÃO (não na escrita).
const IDADE_MINIMA_CONTA_DIAS = 3;
const IDADE_MINIMA_CONTA_GRAVE_DIAS = 7;

const MOTIVOS = [
  'conteudo_inadequado_faixa',
  'discurso_de_odio',
  'spam_ou_enganoso',
  'direitos_autorais',
  'conteudo_proibido',
  'outro',
];
const MOTIVOS_GRAVES = ['direitos_autorais', 'conteudo_proibido'];
const MOTIVOS_COM_DESCRICAO_OBRIGATORIA = ['outro'];
const DESCRICAO_MAX = 500;
const TEXTO_ADMIN_MAX = 1500;     // texto do curador vai dentro de uma MensagemPortal (maxlength 2000) junto do template

// Primeiro V em que 30% alcança o teto: ceil(100 / 0,30) = 334.
const LIMITE_PEQUENA_V = Math.ceil((TETO_PEQUENA * 100) / PERCENTUAL_PEQUENA);

function validarV(V) {
  if (!Number.isInteger(V) || V < 0) {
    throw new TypeError(`V deve ser um inteiro >= 0 (recebido: ${V})`);
  }
}

// ceil(V * 30 / 100) em aritmética inteira — evita ceil(0.3*V) dar N+1 por
// erro de ponto flutuante numa fronteira exata.
function trintaPorCento(V) {
  return Math.floor((V * PERCENTUAL_PEQUENA + 99) / 100);
}

function limiarPara(V) {
  validarV(V);
  const faixa = PATAMARES.find(p => V < p.ateV);
  if (faixa === PATAMARES[0]) {
    return Math.max(PISO_PEQUENA, Math.min(trintaPorCento(V), faixa.limiar));
  }
  return faixa.limiar;
}

function tipoGatilho(V) {
  validarV(V);
  return V < LIMITE_PEQUENA_V ? 'pequena' : 'normal';
}

function ehGrave(motivo) {
  return MOTIVOS_GRAVES.includes(motivo);
}

module.exports = {
  PISO_PEQUENA, PERCENTUAL_PEQUENA, TETO_PEQUENA, LIMITE_PEQUENA_V, PATAMARES, GRAVE,
  IDADE_MINIMA_CONTA_DIAS, IDADE_MINIMA_CONTA_GRAVE_DIAS,
  MOTIVOS, MOTIVOS_GRAVES, MOTIVOS_COM_DESCRICAO_OBRIGATORIA, DESCRICAO_MAX, TEXTO_ADMIN_MAX,
  limiarPara, tipoGatilho, ehGrave,
};
