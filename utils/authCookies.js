/**
 * Centraliza a configuração dos cookies de autenticação.
 *
 * Estratégia de segurança:
 *  - Tokens são entregues em cookies httpOnly → inacessíveis a JavaScript,
 *    eliminando o roubo de sessão via XSS (antes os tokens ficavam no
 *    localStorage, totalmente legível por qualquer script injetado).
 *  - Secure em produção → só trafegam por HTTPS.
 *  - SameSite=strict → o navegador não envia os cookies em requisições
 *    cross-site, mitigando CSRF.
 */

const isProduction = process.env.NODE_ENV === "production";

const ACCESS_MAX_AGE = 15 * 60 * 1000;            // 15 minutos
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;  // 7 dias

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  };
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie("accessToken", accessToken, { ...baseOptions(), maxAge: ACCESS_MAX_AGE });
  }
  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, { ...baseOptions(), maxAge: REFRESH_MAX_AGE });
  }
}

function clearAuthCookies(res) {
  const opts = baseOptions();
  res.clearCookie("accessToken", opts);
  res.clearCookie("refreshToken", opts);
}

module.exports = { setAuthCookies, clearAuthCookies, ACCESS_MAX_AGE, REFRESH_MAX_AGE };
