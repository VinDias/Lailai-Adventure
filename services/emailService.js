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

// ─── Logo SVG inline (compatível com Apple Mail, Outlook 2019+, Gmail web) ────
const LOGO_HTML = `
  <div style="text-align:center;margin-bottom:32px">
    <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDI0IiBoZWlnaHQ9IjEwMjQiIGZpbGw9IiMwMDAwMDAiLz48cmVjdCB4PSIxMjgiIHk9IjEyOCIgd2lkdGg9Ijc2OCIgaGVpZ2h0PSI3NjgiIHJ4PSIxODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIxMiIvPjxwYXRoIGQ9Ik0zNjAgMzAwIEg0NDAgVjYyMCBINzYwIFY3MDAgSDM2MCBaIiBmaWxsPSIjRkZGRkZGIi8+PGcgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGxpbmUgeDE9IjM2MCIgeTE9IjM0MCIgeDI9IjQwMCIgeTI9IjM0MCIvPjxsaW5lIHgxPSIzNjAiIHkxPSI0MjAiIHgyPSI0MDAiIHkyPSI0MjAiLz48bGluZSB4MT0iMzYwIiB5MT0iNTAwIiB4Mj0iNDAwIiB5Mj0iNTAwIi8+PGxpbmUgeDE9IjM2MCIgeTE9IjU4MCIgeDI9IjQwMCIgeTI9IjU4MCIvPjxsaW5lIHgxPSIzNjAiIHkxPSIzODAiIHgyPSIzODUiIHkyPSIzODAiLz48bGluZSB4MT0iMzYwIiB5MT0iNDYwIiB4Mj0iMzg1IiB5Mj0iNDYwIi8+PGxpbmUgeDE9IjM2MCIgeTE9IjU0MCIgeDI9IjM4NSIgeTI9IjU0MCIvPjwvZz48ZyBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48bGluZSB4MT0iNDIwIiB5MT0iNzAwIiB4Mj0iNDIwIiB5Mj0iNjYwIi8+PGxpbmUgeDE9IjUyMCIgeTE9IjcwMCIgeDI9IjUyMCIgeTI9IjY2MCIvPjxsaW5lIHgxPSI2MjAiIHkxPSI3MDAiIHgyPSI2MjAiIHkyPSI2NjAiLz48bGluZSB4MT0iNzIwIiB5MT0iNzAwIiB4Mj0iNzIwIiB5Mj0iNjYwIi8+PGxpbmUgeDE9IjQ3MCIgeTE9IjcwMCIgeDI9IjQ3MCIgeTI9IjY3NSIvPjxsaW5lIHgxPSI1NzAiIHkxPSI3MDAiIHgyPSI1NzAiIHkyPSI2NzUiLz48bGluZSB4MT0iNjcwIiB5MT0iNzAwIiB4Mj0iNjcwIiB5Mj0iNjc1Ii8+PC9nPjwvc3ZnPg=="
         alt="Lorflux" width="72" height="72"
         style="border-radius:16px;display:block;margin:0 auto">
    <p style="color:#a1a1aa;font-size:13px;margin-top:12px;margin-bottom:0">Entretenimento digital vertical</p>
  </div>
`;

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
        ${LOGO_HTML}
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
        ${LOGO_HTML}
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
        ${LOGO_HTML}
        <h2 style="font-size:20px;font-weight:700;margin-bottom:16px">Redefinição de senha</h2>
        <p style="color:#d4d4d8;line-height:1.6">Clique no botão abaixo para redefinir sua senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#e11d48;color:#fff;border-radius:12px;font-weight:700;text-decoration:none">Redefinir senha</a>
        <p style="color:#71717a;font-size:12px;margin-top:24px">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `
  });
}

module.exports = { sendEmail, sendWelcome, sendPremiumConfirmation, sendPasswordReset };
