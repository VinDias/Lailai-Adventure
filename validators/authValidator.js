/**
 * Validações de autenticação centralizadas.
 *
 * - Garante que os campos sejam strings (defesa adicional contra NoSQL
 *   injection — operadores como { "$gt": "" } não são strings).
 * - Política de senha: mínimo 8 caracteres, com pelo menos uma letra e um
 *   número.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isValidEmail(v) {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);
}

function validatePassword(password) {
  if (typeof password !== "string") {
    return { valid: false, message: "Senha inválida." };
  }
  if (password.length < 8) {
    return { valid: false, message: "A senha deve ter no mínimo 8 caracteres." };
  }
  if (password.length > 200) {
    return { valid: false, message: "A senha é muito longa." };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: "A senha deve conter ao menos uma letra e um número." };
  }
  return { valid: true };
}

module.exports = { isNonEmptyString, isValidEmail, validatePassword };
