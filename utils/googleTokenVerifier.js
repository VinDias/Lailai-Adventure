/**
 * Verificação do ID token do Google Sign-In (Google Identity Services).
 * Isolado num módulo próprio para permitir injeção nos testes — a rota
 * /api/auth/google não precisa (nem deve) falar com o Google em teste.
 */
let testVerifier = null;

/**
 * Verifica o ID token e retorna o payload do Google
 * ({ sub, email, email_verified, name, picture }). Lança em token inválido.
 */
async function verifyGoogleIdToken(credential, clientId) {
  if (testVerifier) return testVerifier(credential, clientId);

  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  return ticket.getPayload();
}

/** Injeção exclusiva de testes (mesmo padrão dos rate limiters). */
function __setVerifierForTests(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setVerifierForTests só pode ser usado em NODE_ENV=test');
  }
  testVerifier = fn;
}

module.exports = { verifyGoogleIdToken, __setVerifierForTests };
