const jwt = require("jsonwebtoken");

/**
 * Middleware para verificar se o acesso ao arquivo de mídia possui um token válido.
 */
function verifyMediaToken(req, res, next) {
  const token = req.query.token;
  if (!token) return res.status(403).send("Forbidden: Media token missing");

  try {
    const decoded = jwt.verify(token, process.env.MEDIA_TOKEN_SECRET);
    // Verifica se o caminho solicitado corresponde ao caminho autorizado no token
    if (!req.path.includes(decoded.path)) {
      return res.status(403).send("Forbidden: Invalid media access path");
    }
    next();
  } catch (err) {
    return res.status(403).send("Forbidden: Token expired or invalid");
  }
}

module.exports = verifyMediaToken;