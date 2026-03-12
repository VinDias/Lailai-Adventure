
module.exports = function(req, res, next) {
  // O req.user deve ser injetado pelo middleware verifyToken anteriormente
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "superadmin")) {
    return res.status(403).json({ 
      error: "Acesso negado. Recurso exclusivo para administradores.",
      code: "ADMIN_REQUIRED"
    });
  }
  next();
};
