
const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const token = req.cookies?.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Token não fornecido." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret-production-key');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: "Token inválido." });
  }
};
