const rateLimit = require('express-rate-limit');

// Fase 5 Bloco 3: teto por USUÁRIO em POST /content/series/:id/sinalizar.
// Válidas já são limitadas por unique+consumo; inválidas (sem consumo) eram
// gravadas sem teto — uma conta podia escrever 1 sinalização em cada obra do
// catálogo em minutos (achado do painel). Fica DEPOIS de verifyToken na
// rota: req.user sempre existe, a chave nunca cai em IP. No-op em test,
// mesmo padrão de middlewares/accountLimiter.js.
const sinalizacaoLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 30,
      keyGenerator: (req) => String(req.user.id),
      message: { error: 'Muitas sinalizações em pouco tempo. Tente novamente mais tarde.' },
    });

module.exports = sinalizacaoLimiter;
