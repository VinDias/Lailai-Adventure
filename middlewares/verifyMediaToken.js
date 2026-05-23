const jwt = require("jsonwebtoken");

/**
 * Middleware para verificar se o acesso ao arquivo de mídia possui um token válido.
 */
function verifyMediaToken(req, res, next) {
  const token = req.query.token;
  if (typeof token !== "string" || token.length === 0) {
    return res.status(403).send("Forbidden: Media token missing");
  }
  if (!process.env.MEDIA_TOKEN_SECRET) {
    return res.status(500).send("Server media configuration error");
  }

  try {
    const decoded = jwt.verify(token, process.env.MEDIA_TOKEN_SECRET);
    const authorized = typeof decoded.path === "string" ? decoded.path : "";

    // O token deve autorizar um caminho específico e não-vazio. A correspondência
    // exige igualdade ou que o recurso esteja DENTRO da pasta autorizada — o uso
    // anterior de String.includes() permitia bypass por substring.
    const reqPath = decodeURIComponent(req.path);
    const isAuthorized =
      authorized.length > 0 &&
      (reqPath === authorized ||
        reqPath.endsWith(authorized) ||
        reqPath.startsWith(authorized + "/") ||
        reqPath.includes("/" + authorized + "/") ||
        reqPath.endsWith("/" + authorized));

    if (!isAuthorized) {
      return res.status(403).send("Forbidden: Invalid media access path");
    }
    next();
  } catch (err) {
    return res.status(403).send("Forbidden: Token expired or invalid");
  }
}

module.exports = verifyMediaToken;