
module.exports = function(req, res, next) {
  // Assume-se que o req.user foi injetado pelo verifyToken anterior
  if (!req.user || !req.user.isPremium) {
    return res.status(403).json({ message: "Plano premium necessário para acessar este recurso." });
  }
  next();
};
