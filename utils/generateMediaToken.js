const jwt = require("jsonwebtoken");

/**
 * Gera um token temporário para acesso a um arquivo de mídia específico.
 */
function generateMediaToken(path) {
  if (!process.env.MEDIA_TOKEN_SECRET) {
    throw new Error("MEDIA_TOKEN_SECRET not defined");
  }
  return jwt.sign(
    { path },
    process.env.MEDIA_TOKEN_SECRET,
    { expiresIn: "10m" }
  );
}

module.exports = generateMediaToken;