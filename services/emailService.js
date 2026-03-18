const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Variáveis SMTP_HOST, SMTP_USER e SMTP_PASS são obrigatórias para envio de e-mail.');
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: SMTP_SECURE !== 'false', // true por padrão (SSL/TLS na porta 465)
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  return _transporter;
}

/**
 * Envia um e-mail transacional.
 * @param {object} options
 * @param {string|string[]} options.to      - Destinatário(s)
 * @param {string}          options.subject - Assunto
 * @param {string}          options.html    - Corpo em HTML
 * @param {string}          [options.text]  - Corpo em texto simples (fallback)
 * @returns {Promise<object>} Resultado do nodemailer (messageId, etc.)
 */
async function sendEmail({ to, subject, html, text }) {
  const from = `"${process.env.FROM_NAME || 'Lorflux'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`;

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({ from, to, subject, html, text });
    logger.info(`[Email] Enviado para ${to} — ${subject} (messageId: ${info.messageId})`);
    return info;
  } catch (err) {
    logger.error(`[Email] Falha ao enviar para ${to} — ${subject}:`, err.message);
    throw err;
  }
}

// ─── Templates prontos ────────────────────────────────────────────────────────

async function sendWelcome(user) {
  const name = user.nome || user.email;
  return sendEmail({
    to: user.email,
    subject: 'Bem-vindo à Lorflux!',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0a0a0b;color:#fff;padding:40px;border-radius:16px">
        <h1 style="font-size:28px;font-weight:900;margin-bottom:8px">Lorflux</h1>
        <p style="color:#a1a1aa;font-size:13px;margin-bottom:32px">Entretenimento digital vertical</p>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:16px">Olá, ${name}!</h2>
        <p style="color:#d4d4d8;line-height:1.6">Sua conta foi criada com sucesso. Explore HQCines, VCines e Hi-Qua na plataforma.</p>
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#e11d48;color:#fff;border-radius:12px;font-weight:700;text-decoration:none">Acessar a plataforma</a>
      </div>
    `
  });
}

async function sendPremiumConfirmation(user) {
  const name = user.nome || user.email;
  const expires = user.premiumExpiresAt ? new Date(user.premiumExpiresAt).toLocaleDateString('pt-BR') : '—';
  return sendEmail({
    to: user.email,
    subject: 'Assinatura Premium ativada — Lorflux',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0a0a0b;color:#fff;padding:40px;border-radius:16px">
        <h1 style="font-size:28px;font-weight:900;margin-bottom:8px">Lorflux</h1>
        <p style="color:#a1a1aa;font-size:13px;margin-bottom:32px">Entretenimento digital vertical</p>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:16px">Assinatura Premium ativada!</h2>
        <p style="color:#d4d4d8;line-height:1.6">Olá, ${name}! Seu acesso premium está ativo até <strong>${expires}</strong>. Aproveite todo o conteúdo exclusivo sem anúncios.</p>
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#f59e0b;color:#000;border-radius:12px;font-weight:700;text-decoration:none">Explorar conteúdo premium</a>
      </div>
    `
  });
}

async function sendPasswordReset(user, resetUrl) {
  return sendEmail({
    to: user.email,
    subject: 'Redefinição de senha — Lorflux',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0a0a0b;color:#fff;padding:40px;border-radius:16px">
        <h1 style="font-size:28px;font-weight:900;margin-bottom:8px">Lorflux</h1>
        <p style="color:#a1a1aa;font-size:13px;margin-bottom:32px">Entretenimento digital vertical</p>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:16px">Redefinição de senha</h2>
        <p style="color:#d4d4d8;line-height:1.6">Clique no botão abaixo para redefinir sua senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#e11d48;color:#fff;border-radius:12px;font-weight:700;text-decoration:none">Redefinir senha</a>
        <p style="color:#71717a;font-size:12px;margin-top:24px">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `
  });
}

module.exports = { sendEmail, sendWelcome, sendPremiumConfirmation, sendPasswordReset };
