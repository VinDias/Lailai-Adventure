/**
 * Sanitização anti-NoSQL injection.
 *
 * Remove, de forma recursiva, quaisquer chaves que comecem com "$" (operadores
 * do MongoDB, ex.: $gt, $ne, $where) ou que contenham "." (dot-notation usada
 * para alcançar campos aninhados). Isso impede ataques do tipo:
 *
 *   { "token": { "$gt": "" } }  →  casaria com qualquer documento
 *
 * Sem dependências externas (substitui express-mongo-sanitize). Mutamos os
 * objetos em vez de reatribuir req.query/req.params para compatibilidade com
 * versões do Express em que esses getters são somente-leitura.
 */

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    value.forEach(sanitizeValue);
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete value[key];
        continue;
      }
      sanitizeValue(value[key]);
    }
  }
  return value;
}

module.exports = function sanitizeMongo(req, res, next) {
  if (req.body) sanitizeValue(req.body);
  if (req.params) sanitizeValue(req.params);
  if (req.query) {
    // req.query pode ser somente-leitura em alguns setups; sanitizamos o conteúdo.
    for (const key of Object.keys(req.query)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete req.query[key];
      } else {
        sanitizeValue(req.query[key]);
      }
    }
  }
  next();
};
