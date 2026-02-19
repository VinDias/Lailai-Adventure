
/**
 * Middleware para restringir rotas a papéis específicos (user, admin, superadmin)
 */
module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: "Access denied: Insufficient permissions",
        required: allowedRoles
      });
    }

    next();
  };
};
