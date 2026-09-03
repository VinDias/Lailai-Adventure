/**
 * Fase 5, Bloco 2 (Task 3) — "Classificação etária e Preferências de
 * conteúdo" + PIN de proteção. Spec:
 * docs/superpowers/specs/2026-09-03-fase5-bloco2-parental-tags-design.md
 * (rev.3, seções "Modelo do usuário", "PIN", "Recuperação de PIN", "Rotas").
 *
 * Tudo atrás de verifyToken — não há leitura/escrita anônima de parental.
 * pinHash NUNCA sai em NENHUM shape aqui: as respostas abaixo são sempre
 * objetos construídos campo a campo (nunca spread do documento do
 * Mongoose) — mesma garantia que a T1 já cobre para auth/me, admin/users e
 * o export LGPD (tests/backend/parentalFoundations.test.js).
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const verifyToken = require('../middlewares/verifyToken');
const accountLimiter = require('../middlewares/accountLimiter');
const logger = require('../utils/logger');
const { VOCABULARIO, isSlugValido } = require('../utils/tagsVocabulario');
const { avaliarTentativaPin, paraUpdateParental } = require('../services/parentalPinService');

const User = require('../models/User');
const ParentalPinResetToken = require('../models/ParentalPinResetToken');

const CLASSIFICACOES = ['kids', 'teen', 'young'];
// Espelha o TTL do model (`expires: '1h'`). O TTL do Mongo roda em varredura
// periódica (não é instantâneo) — a checagem explícita abaixo garante um
// token "velho" ser recusado mesmo que o documento ainda não tenha sido
// varrido pelo housekeeper do banco.
const TOKEN_TTL_MS = 60 * 60 * 1000;

router.use(verifyToken);

function shapeParental(user) {
  return {
    classificacaoEtaria: user.parental?.classificacaoEtaria ?? 'young',
    tagsBloqueadas: user.parental?.tagsBloqueadas ?? [],
    temPin: !!(user.parental && user.parental.pinHash),
  };
}

// GET /api/parental — preferências + temPin + vocabulário (canal dos
// toggles do frontend — a lista de slugs NUNCA é hardcoded lá).
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+parental.pinHash').lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    res.json({
      ...shapeParental(user),
      vocabulario: VOCABULARIO.map((v) => ({ slug: v.slug, rotuloPt: v.rotuloPt })),
    });
  } catch (err) {
    logger.error('[Parental] GET /', err);
    res.status(500).json({ error: 'Erro ao carregar preferências.' });
  }
});

// PUT /api/parental — classificacaoEtaria?/tagsBloqueadas? (pin obrigatório
// e correto quando temPin — INCLUSIVE as próprias tagsBloqueadas do adulto,
// letra da spec). Resposta = mesmo shape do GET, SEM `vocabulario`.
router.put('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+parental.pinHash');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const temPin = !!(user.parental && user.parental.pinHash);
    const updateParental = {};

    if (temPin) {
      const avaliacao = await avaliarTentativaPin({ user, pin: req.body?.pin });
      if (avaliacao.updateParental) Object.assign(updateParental, paraUpdateParental(avaliacao.updateParental));
      if (!avaliacao.ok) {
        if (Object.keys(updateParental).length > 0) {
          await User.findByIdAndUpdate(user._id, { $set: updateParental });
        }
        return res.status(avaliacao.status).json(avaliacao.body);
      }
    }

    // Allowlist ESTRITA por construção: só estas duas chaves são lidas do
    // corpo. `pinHash`/`pinTentativas`/`pinBloqueadoAte`/`role`/... no body
    // são simplesmente NUNCA olhados — não há spread de req.body em lugar
    // nenhum desta rota.
    if (req.body?.classificacaoEtaria !== undefined) {
      const valor = req.body.classificacaoEtaria;
      if (!CLASSIFICACOES.includes(valor)) {
        return res.status(400).json({ error: 'Classificação etária inválida. Use kids, teen ou young.' });
      }
      updateParental['parental.classificacaoEtaria'] = valor;
    }

    if (req.body?.tagsBloqueadas !== undefined) {
      const tags = req.body.tagsBloqueadas;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'tagsBloqueadas deve ser uma lista de slugs.' });
      }
      const ofensor = tags.find((slug) => !isSlugValido(slug));
      if (ofensor !== undefined) {
        return res.status(400).json({ error: `Tag inválida: "${ofensor}". Fora do vocabulário oficial.` });
      }
      updateParental['parental.tagsBloqueadas'] = tags;
    }

    if (Object.keys(updateParental).length > 0) {
      await User.findByIdAndUpdate(user._id, { $set: updateParental });
    }

    const atualizado = await User.findById(user._id).select('+parental.pinHash').lean();
    res.json(shapeParental(atualizado));
  } catch (err) {
    logger.error('[Parental] PUT /', err);
    res.status(500).json({ error: 'Erro ao atualizar preferências.' });
  }
});

function formatoPinValido(pin) {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

// POST /api/parental/pin — define (sem PIN prévio: só novoPin) / troca
// (pinAtual + novoPin) / remove (pinAtual + remover:true). bcrypt custo 12
// (mesmo padrão de senha, server.js). Nunca devolve o hash.
router.post('/pin', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+parental.pinHash');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const temPin = !!(user.parental && user.parental.pinHash);
    const { novoPin, pinAtual, remover } = req.body || {};

    if (remover === true) {
      if (!temPin) return res.status(400).json({ error: 'Não há PIN definido para remover.' });

      const avaliacao = await avaliarTentativaPin({ user, pin: pinAtual });
      if (avaliacao.updateParental) {
        await User.findByIdAndUpdate(user._id, { $set: paraUpdateParental(avaliacao.updateParental) });
      }
      if (!avaliacao.ok) return res.status(avaliacao.status).json(avaliacao.body);

      await User.findByIdAndUpdate(user._id, { $set: { 'parental.pinHash': null } });
      return res.json({ temPin: false });
    }

    if (!formatoPinValido(novoPin)) {
      return res.status(400).json({ error: 'PIN deve ter de 4 a 6 dígitos numéricos.' });
    }

    if (temPin) {
      // TROCA: exige o PIN atual (mesmo rate limit persistido).
      const avaliacao = await avaliarTentativaPin({ user, pin: pinAtual });
      if (avaliacao.updateParental) {
        await User.findByIdAndUpdate(user._id, { $set: paraUpdateParental(avaliacao.updateParental) });
      }
      if (!avaliacao.ok) return res.status(avaliacao.status).json(avaliacao.body);
    }
    // DEFINIR (sem PIN prévio): nenhuma checagem de PIN atual — não existe.

    const pinHash = await bcrypt.hash(novoPin, 12);
    await User.findByIdAndUpdate(user._id, {
      $set: { 'parental.pinHash': pinHash, 'parental.pinTentativas': 0, 'parental.pinBloqueadoAte': null },
    });
    res.json({ temPin: true });
  } catch (err) {
    logger.error('[Parental] POST /pin', err);
    res.status(500).json({ error: 'Erro ao atualizar o PIN.' });
  }
});

// POST /api/parental/pin/recuperar — inicia a recuperação (token por
// e-mail, TTL 1h). Conta LOCAL exige senha no body (401 sem/errada) — é a
// mesma prova de identidade da exclusão de conta. Conta SOCIAL: sem
// checagem de senha (não existe) — a rota já é autenticada (verifyToken
// acima), o dono da sessão conhece o próprio provider; não há a
// neutralidade do forgot-password público a preservar aqui (aquele nunca
// revela se um e-mail existe porque é anônimo — este já sabe exatamente
// quem é o usuário pela sessão).
router.post('/pin/recuperar', accountLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (user.provider === 'local') {
      const { password } = req.body || {};
      if (typeof password !== 'string' || !password) {
        return res.status(401).json({ error: 'Confirme sua senha para recuperar o PIN.' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash || '');
      if (!ok) return res.status(401).json({ error: 'Senha incorreta.' });
    }

    await ParentalPinResetToken.deleteMany({ userId: user._id });
    const token = crypto.randomBytes(32).toString('hex');
    await ParentalPinResetToken.create({ userId: user._id, token });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/recuperar-pin?token=${token}`;
    const { sendParentalPinReset } = require('../services/emailService');
    await sendParentalPinReset(user, resetUrl);

    res.json({ message: 'Enviamos um link de recuperação do PIN para o seu e-mail.' });
  } catch (err) {
    logger.error('[Parental] POST /pin/recuperar', err);
    res.status(500).json({ error: 'Erro ao processar a recuperação do PIN.' });
  }
});

// POST /api/parental/pin/recuperar/confirmar — REMOVE o PIN (usuário define
// um novo depois, já sem bloqueio) e zera tentativas/bloqueio. Escopado ao
// usuário LOGADO (userId do token bate com o dono do registro) — a rota
// inteira é autenticada, nunca pública como o reset de senha.
router.post('/pin/recuperar/confirmar', accountLimiter, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== 'string' || token.length === 0) {
      return res.status(400).json({ error: 'Token obrigatório.' });
    }

    const registro = await ParentalPinResetToken.findOne({ token, userId: req.user.id });
    if (!registro) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const expirado = (Date.now() - new Date(registro.createdAt).getTime()) > TOKEN_TTL_MS;
    if (expirado) {
      await ParentalPinResetToken.deleteOne({ _id: registro._id });
      return res.status(400).json({ error: 'Link inválido ou expirado.' });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $set: { 'parental.pinHash': null, 'parental.pinTentativas': 0, 'parental.pinBloqueadoAte': null },
    });
    // Todos os tokens pendentes do usuário caem junto (mesmo padrão do
    // reset de senha) — inclusive o que acabou de ser usado, o que barra o
    // reuso (2ª tentativa com o mesmo token não encontra mais o registro).
    await ParentalPinResetToken.deleteMany({ userId: req.user.id });

    res.json({ message: 'PIN removido. Defina um novo PIN quando quiser.' });
  } catch (err) {
    logger.error('[Parental] POST /pin/recuperar/confirmar', err);
    res.status(500).json({ error: 'Erro ao confirmar a recuperação do PIN.' });
  }
});

module.exports = router;
