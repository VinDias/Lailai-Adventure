/**
 * Bunny Stream visto pelo envio de vídeo do AUTOR (Fase 7, frente A, item 9).
 *
 * O vídeo do autor não passa pela VPS: o navegador envia direto ao Bunny pelo
 * protocolo TUS, com uma autorização de curta duração que SÓ o servidor sabe
 * gerar (a chave da biblioteca nunca sai daqui). O servidor faz três coisas
 * pequenas na API do Bunny: cria o vídeo (para ter o id), consulta o estado e
 * apaga o vídeo que o autor substituiu.
 *
 * Isolado num módulo próprio, como utils/bunnyStorage.js, para os testes
 * trocarem o Bunny por um falso. Em NODE_ENV=test, sem o falso injetado,
 * nenhuma função fala com o Bunny: lança.
 *
 * Variáveis de ambiente: as MESMAS que o envio de vídeo do admin já usa
 * (BUNNY_API_KEY, BUNNY_LIBRARY_ID). Nenhuma nova.
 */
const crypto = require('crypto');

const API = 'https://video.bunnycdn.com/library';
const ENDPOINT_TUS = 'https://video.bunnycdn.com/tusupload';

let clienteDeTeste = null;

function isConfigured() {
  return Boolean(process.env.BUNNY_API_KEY && process.env.BUNNY_LIBRARY_ID);
}

function libraryId() {
  return String(process.env.BUNNY_LIBRARY_ID || '');
}

function semRedeEmTeste() {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('bunnyStream: teste sem Bunny falso injetado (__setClientForTests)');
  }
}

async function chamar(caminho, opcoes = {}) {
  semRedeEmTeste();
  const res = await fetch(`${API}/${libraryId()}${caminho}`, {
    ...opcoes,
    headers: { AccessKey: process.env.BUNNY_API_KEY, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  return res;
}

/** Cria o vídeo (vazio) na biblioteca e devolve o id (guid). */
async function createVideo(title) {
  if (clienteDeTeste) return clienteDeTeste.createVideo(title);
  const res = await chamar('/videos', { method: 'POST', body: JSON.stringify({ title }) });
  if (!res.ok) throw new Error(`Bunny Stream respondeu ${res.status} ao criar o vídeo`);
  const body = await res.json();
  if (!body || !body.guid) throw new Error('Bunny Stream não devolveu o id do vídeo');
  return String(body.guid);
}

/** Estado do vídeo no Bunny: { status } (0 a 6), ou null se não existe. */
async function getVideo(videoId) {
  if (clienteDeTeste) return clienteDeTeste.getVideo(videoId);
  const res = await chamar(`/videos/${encodeURIComponent(videoId)}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bunny Stream respondeu ${res.status} ao consultar o vídeo`);
  const body = await res.json();
  return { status: body.status };
}

/** Apaga o vídeo da biblioteca. 404 conta como apagado. */
async function deleteVideo(videoId) {
  if (clienteDeTeste) return clienteDeTeste.deleteVideo(videoId);
  const res = await chamar(`/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Bunny Stream respondeu ${res.status} ao apagar o vídeo`);
}

/**
 * Assinatura do envio TUS, como o Bunny Stream confere:
 * SHA256(id da biblioteca + chave da API + validade + id do vídeo), em hexa.
 * `expira` é o instante (em segundos) até o qual o Bunny aceita o envio.
 * Serve só para ESSE vídeo: não dá acesso a mais nada da biblioteca.
 */
function assinaturaTus(videoId, expira) {
  return crypto
    .createHash('sha256')
    .update(`${libraryId()}${process.env.BUNNY_API_KEY}${expira}${videoId}`)
    .digest('hex');
}

/** Injeção exclusiva de testes: { createVideo, getVideo, deleteVideo }. */
function __setClientForTests(cliente) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setClientForTests só pode ser usado em NODE_ENV=test');
  }
  clienteDeTeste = cliente;
}

module.exports = {
  isConfigured, libraryId, createVideo, getVideo, deleteVideo, assinaturaTus,
  ENDPOINT_TUS, __setClientForTests,
};
