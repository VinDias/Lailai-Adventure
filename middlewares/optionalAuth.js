const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação opcional.
 * Se um token válido for enviado, popula req.user.
 * Se não houver token (ou for inválido), continua sem req.user (sem bloquear a requisição).
 */
module.exports = function (req, res, next) {
  const token = req.cookies?.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token || !process.env.JWT_SECRET) {
    return next();
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Token inválido ou expirado — trata como não autenticado
  }

  next();
};
