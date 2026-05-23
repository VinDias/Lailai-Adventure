/**
 * Retorna um novo objeto contendo apenas as chaves permitidas (whitelist).
 * Mitiga mass-assignment: campos não previstos (ex.: _id, views, role) são
 * descartados em updates que recebem req.body diretamente.
 */
module.exports = function pick(obj, allowed) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
};
