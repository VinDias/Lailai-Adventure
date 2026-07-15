/**
 * Upload de buffers para o Bunny Storage — helper compartilhado (avatares etc.).
 * Isolado num módulo próprio para permitir injeção nos testes: as rotas não
 * precisam (nem devem) falar com o Bunny em teste.
 */
let testUploader = null;

function isConfigured() {
  return Boolean(process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_STORAGE_KEY);
}

/**
 * Sobe um buffer para `remotePath` no Bunny Storage e retorna a URL pública.
 * Lança em falha de upload. Verifique isConfigured() (ou injete) antes de chamar.
 */
async function uploadBufferToStorage(buffer, remotePath, contentType = 'application/octet-stream') {
  if (testUploader) return testUploader(buffer, remotePath, contentType);

  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const storageKey = process.env.BUNNY_STORAGE_KEY;
  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';

  const res = await fetch(`https://${endpoint}/${storageZone}/${remotePath}`, {
    method: 'PUT',
    headers: { 'AccessKey': storageKey, 'Content-Type': contentType },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Bunny Storage respondeu ${res.status}: ${errText.slice(0, 200)}`);
  }

  // MESMA variável usada pelos uploads de capas/painéis (routes/bunnyWebhook):
  // o hostname do Pull Zone é diferente do host da API de storage.
  const cdnHostname = process.env.BUNNY_STORAGE_HOSTNAME || `${storageZone}.b-cdn.net`;
  return `https://${cdnHostname}/${remotePath}`;
}

/** Injeção exclusiva de testes (mesmo padrão do googleTokenVerifier). */
function __setUploaderForTests(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setUploaderForTests só pode ser usado em NODE_ENV=test');
  }
  testUploader = fn;
}

function hasTestUploader() {
  return Boolean(testUploader);
}

module.exports = { uploadBufferToStorage, isConfigured, hasTestUploader, __setUploaderForTests };
