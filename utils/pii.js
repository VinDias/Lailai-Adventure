/**
 * Utilitários de minimização de dados pessoais (LGPD).
 * Evita gravar e-mails completos em logs persistidos por 30 dias.
 */

function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "[email]";
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

module.exports = { maskEmail };
