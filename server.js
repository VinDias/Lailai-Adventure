
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { checkPremiumStatus } = require('./middlewares/premium.middleware');

dotenv.config();
const app = express();

// Segurança de Produção
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100 // Limite de 100 requests por IP
});
app.use('/api/', limiter);

// Injeção de status premium em todas as rotas
app.use(checkPremiumStatus);

// Rotas Modulares
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/content', require('./routes/content.routes'));
app.use('/api/billing', require('./routes/billing.routes'));
app.use('/api/ads', require('./routes/ads.routes'));

// Error Handler Global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`LaiLai Production Server running on port ${PORT}`);
});
