const rateLimit = require('express-rate-limit');

// Limita rotas sensíveis de conta (cadastro, recuperação e redefinição de
// senha; Fase 5 Bloco 2: recuperação de PIN) para mitigar brute-force de
// tokens, criação de contas em massa e email-bombing. Extraído de server.js
// (era um `const` local) para ser reutilizável por outros routers
// (routes/parental.js) sem exigir um require circular do próprio server.js.
const accountLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: "Muitas solicitações. Tente novamente mais tarde." }
    });

module.exports = accountLimiter;
