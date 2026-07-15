/**
 * Diagnóstico do envio de e-mail (SMTP) — roda direto na VPS ou local.
 *
 * Uso:
 *   node scripts/testEmail.js                     # só testa conexão/autenticação
 *   node scripts/testEmail.js voce@exemplo.com    # testa e envia um e-mail real
 *
 * Mostra a configuração (senha mascarada), o resultado do handshake SMTP e,
 * se um destinatário for passado, tenta um envio de verdade — imprimindo o
 * erro exato do servidor em caso de falha (auth, porta bloqueada, TLS etc.).
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME } = process.env;

  console.log('── Configuração ────────────────────────────────');
  console.log(`  SMTP_HOST   : ${SMTP_HOST || '(AUSENTE)'}`);
  console.log(`  SMTP_PORT   : ${SMTP_PORT || '(ausente → usa 465)'}`);
  console.log(`  SMTP_SECURE : ${SMTP_SECURE || '(ausente → true)'}`);
  console.log(`  SMTP_USER   : ${SMTP_USER || '(AUSENTE)'}`);
  console.log(`  SMTP_PASS   : ${SMTP_PASS ? `definida (${SMTP_PASS.length} caracteres)` : '(AUSENTE)'}`);
  console.log(`  FROM        : "${FROM_NAME || 'Lorflux'}" <${FROM_EMAIL || SMTP_USER || '?'}>`);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('\n❌ Variáveis obrigatórias ausentes no .env — preencha e rode de novo.');
    process.exit(1);
  }

  const port = Number(SMTP_PORT) || 465;
  const secure = SMTP_SECURE !== 'false';
  if (port === 587 && secure) {
    console.warn('\n⚠ Porta 587 com SMTP_SECURE=true costuma falhar: 587 usa STARTTLS (SMTP_SECURE=false).');
  }
  if (port === 465 && !secure) {
    console.warn('\n⚠ Porta 465 com SMTP_SECURE=false costuma falhar: 465 exige SSL direto (SMTP_SECURE=true).');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });

  console.log('\n── 1) Conexão e autenticação (verify) ─────────');
  try {
    await transporter.verify();
    console.log('✅ Conexão e autenticação OK');
  } catch (err) {
    console.error('❌ FALHOU:', err.message);
    if (err.code) console.error(`   código: ${err.code}`);
    console.error(`
Causas comuns:
  - ETIMEDOUT / ECONNECTION  → porta ${port} bloqueada pelo provedor da VPS (teste a 587 com SMTP_SECURE=false, ou peça liberação)
  - EAUTH / 535              → usuário ou senha incorretos (confira no painel do provedor de e-mail)
  - certificado / TLS        → SMTP_SECURE incompatível com a porta (465=true, 587=false)`);
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log('\n(Para testar um envio real: node scripts/testEmail.js seu@email.com)');
    process.exit(0);
  }

  console.log(`\n── 2) Envio real para ${to} ────────────────`);
  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME || 'Lorflux'}" <${FROM_EMAIL || SMTP_USER}>`,
      to,
      subject: 'Teste de e-mail — Lorflux',
      text: 'Se você recebeu este e-mail, o envio da Lorflux está funcionando corretamente.',
    });
    console.log(`✅ Enviado! messageId: ${info.messageId}`);
    console.log('   Confira a caixa de entrada (e o spam).');
  } catch (err) {
    console.error('❌ FALHOU no envio:', err.message);
    process.exit(1);
  }
  process.exit(0);
})();
