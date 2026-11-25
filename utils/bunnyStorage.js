/**
 * Upload de buffers para o Bunny Storage — helper compartilhado (avatares etc.).
 * Isolado num módulo próprio para permitir injeção nos testes: as rotas não
 * precisam (nem devem) falar com o Bunny em teste.
 */
let testUploader = null;
let testDeleter = null;

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

function cdnHostname() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  return process.env.BUNNY_STORAGE_HOSTNAME || `${storageZone}.b-cdn.net`;
}

/**
 * Caminho no Storage de uma URL do NOSSO CDN, ou null se a URL for de outro
 * lugar (link colado à mão pelo admin, por exemplo). Só caminhos sob
 * `lorflux/` contam: nada fora disso foi gravado por este código.
 */
function caminhoDaUrl(url) {
  if (typeof url !== 'string' || !isConfigured()) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== cdnHostname()) return null;
  const caminho = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  if (!caminho.startsWith('lorflux/') || caminho.includes('..')) return null;
  return caminho;
}

/**
 * Apaga um arquivo do Bunny Storage (frente A, item 3: até 25/11/2026 nenhum
 * código apagava; tudo o que era trocado ficava lá). 404 conta como apagado.
 * Lança em outra falha.
 */
async function deleteFromStorage(remotePath) {
  if (testDeleter) return testDeleter(remotePath);
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const storageKey = process.env.BUNNY_STORAGE_KEY;
  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';
  const res = await fetch(`https://${endpoint}/${storageZone}/${remotePath}`, {
    method: 'DELETE',
    headers: { 'AccessKey': storageKey },
  });
  if (!res.ok && res.status !== 404) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Bunny Storage respondeu ${res.status} ao apagar: ${errText.slice(0, 200)}`);
  }
}

function __setDeleterForTests(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setDeleterForTests só pode ser usado em NODE_ENV=test');
  }
  testDeleter = fn;
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

module.exports = {
  uploadBufferToStorage, deleteFromStorage, caminhoDaUrl, cdnHostname, isConfigured,
  hasTestUploader, __setUploaderForTests, __setDeleterForTests,
};
