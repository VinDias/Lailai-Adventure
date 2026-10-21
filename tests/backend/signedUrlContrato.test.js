/**
 * Testes de regressão: contrato da URL assinada do Bunny CDN
 * (GET /api/bunny/signed-url — routes/bunnyWebhook.js)
 *
 * O DEFEITO, em linguagem de negócio
 * ----------------------------------
 * O vídeo simplesmente não tocava. O leitor abria o capítulo, o player
 * pedia o vídeo pro Bunny e o Bunny respondia 403 (acesso negado), porque a
 * "senha de entrada" (o token) que o nosso servidor punha na URL não era a
 * que o Bunny sabe conferir. Dois consertos, com dois sintomas diferentes:
 *
 *   1) 44692b6 — a conta do token estava errada: usávamos SHA256 e o Bunny
 *      só aceita MD5 em Base64URL sem "=" no fim. Nada tocava.
 *   2) 43e7694 — a conta certa, mas assinada pro ARQUIVO (/<id>/playlist.m3u8).
 *      O primeiro arquivo abria, e aí o player (hls.js) ia buscar as peças
 *      seguintes do mesmo vídeo (a lista por resolução, /480p/video.m3u8, e
 *      cada pedacinho .ts) — todas com endereço diferente do assinado, todas
 *      403. O vídeo travava depois de começar. O conserto foi assinar o
 *      DIRETÓRIO do vídeo (/<id>/) e declarar isso na URL pelo parâmetro
 *      token_path, para um token só cobrir a árvore HLS inteira.
 *
 * MEDIDO EM 21/10/2026 pela triagem de regressões: reintroduzindo cada um dos
 * dois bugs numa cópia, TODOS os testes existentes continuaram passando
 * (tests/backend/signedUrl.test.js, bunnyUpload.test.js,
 * parentalDocSurfaces.test.js, tests/frontend/video.test.tsx). A única
 * afirmação que havia sobre a URL assinada era que ela contém o hostname do
 * CDN — que os bugs não mudam. Primeira vez do caso: não há item de Bunny/HLS
 * no REGRESSOES.md.
 *
 * Commits das correções: 44692b6 (fórmula MD5 + Base64URL) e 43e7694
 * (path do diretório no material assinado + token_path na URL).
 *
 * O QUE ESTE ARQUIVO GARANTE
 * --------------------------
 * - Que o servidor REAL (rota montada em server.js, chamada por supertest)
 *   devolve um token que é Base64URL(MD5(chave + token_path + expires)), com
 *   22 caracteres e sem "+", "/" ou "=".
 * - Que o material assinado é o DIRETÓRIO do vídeo, não o arquivo: o teste
 *   recusa explicitamente o token da versão antiga (MD5 do
 *   /<id>/playlist.m3u8) e o da versão SHA256.
 * - Que a URL traz token_path, percent-encoded, e que o pathname continua
 *   sendo o playlist master.
 * - Que o MESMO token é aceito nas sub-requisições que o hls.js faz
 *   (sub-playlist por resolução e segmento .ts) — é esse o motivo de negócio
 *   de assinar o diretório. A conferência é feita por um verificador que
 *   imita a regra do Bunny, escrito aqui a partir da documentação dele.
 * - Que esse verificador não pode "concordar por acaso" com um servidor
 *   quebrado: ele é travado antes por um vetor conhecido escrito à mão
 *   (chave + path + expires fixos => token literal), e o teste do relógio
 *   congelado compara a URL inteira com uma string literal, sem conta nenhuma.
 *
 * O QUE ELE NÃO GARANTE
 * ---------------------
 * - Não fala com o Bunny de verdade: se o Bunny mudar a regra dele, este
 *   teste continua verde. Ele fixa o contrato que foi verificado contra o CDN
 *   em 05/06/2026 (bateria descrita em 44692b6).
 * - Não cobre a outra metade do 43e7694, que é do frontend: o xhrSetup do
 *   hls.js em components/VerticalPlayer.tsx (linhas 194 e 205-206), que
 *   repassa token/expires/token_path nas sub-requisições. Isso é teste de
 *   frontend e fica de fora de propósito — sem ele o vídeo ainda trava,
 *   mesmo com o servidor certo.
 * - Não cobre autorização (draft, premium, parental): isso já é o papel de
 *   tests/backend/signedUrl.test.js, e aqui não é repetido.
 * - Não cobre a janela de validade em si (4 horas) além de uma conferência
 *   folgada de que expires é futuro e entra na conta.
 */
const crypto = require('crypto');
const request = require('supertest');
const db = require('../helpers/db');

let app;
let Series, Episode;

const CDN = 'cdn-teste-signed.b-cdn.net';
const CHAVE = 'chave-teste-signed-url';

beforeAll(async () => {
  await db.connect();
  app = require('../../server');
  Series = require('../../models/Series');
  Episode = require('../../models/Episode');
});

afterAll(() => db.closeDatabase());

// Mesmo padrão de salvar/restaurar de tests/backend/signedUrl.test.js: a rota
// é fail-closed sem as duas variáveis (503).
let cdnAnterior, tokenAnterior;
beforeAll(() => {
  cdnAnterior = process.env.BUNNY_CDN_HOSTNAME;
  tokenAnterior = process.env.BUNNY_TOKEN_KEY;
  process.env.BUNNY_CDN_HOSTNAME = CDN;
  process.env.BUNNY_TOKEN_KEY = CHAVE;
});
afterAll(() => {
  if (cdnAnterior !== undefined) process.env.BUNNY_CDN_HOSTNAME = cdnAnterior; else delete process.env.BUNNY_CDN_HOSTNAME;
  if (tokenAnterior !== undefined) process.env.BUNNY_TOKEN_KEY = tokenAnterior; else delete process.env.BUNNY_TOKEN_KEY;
});

// --- Modelo independente da regra do Bunny (Basic Token Authentication) -----
// Escrito a partir da documentação do Bunny, e travado logo abaixo por um
// vetor conhecido literal, para não poder "virar" junto com o servidor.

function base64url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function assinarComoBunny(chave, caminhoAssinado, expires) {
  return base64url(crypto.createHash('md5').update(chave + caminhoAssinado + expires).digest('base64'));
}

// Imita o que o CDN faz quando chega um pedido: confere se o recurso pedido
// está dentro do token_path, se não expirou, e se o token é o MD5 do material
// declarado. Devolve o motivo da recusa para a mensagem de falha ser legível.
function bunnyAceita(urlPedida, { token, expires, tokenPath }, chave, agoraEmSegundos) {
  if (!token) return { ok: false, motivo: 'URL sem token' };
  if (!tokenPath) return { ok: false, motivo: 'URL sem token_path: o CDN não sabe o que foi assinado' };
  const pedido = new URL(urlPedida).pathname;
  if (!pedido.startsWith(tokenPath)) {
    return { ok: false, motivo: `recurso ${pedido} está fora do token_path ${tokenPath}` };
  }
  if (!(Number(expires) > agoraEmSegundos)) return { ok: false, motivo: `expires ${expires} não é futuro` };
  const esperado = assinarComoBunny(chave, tokenPath, expires);
  if (token !== esperado) return { ok: false, motivo: `token ${token} != ${esperado} (MD5 do token_path)` };
  return { ok: true, motivo: 'aceito' };
}

async function criarEpisodioPublicado(bunnyVideoId, titulo) {
  const serie = await Series.create({
    title: `${titulo} (série)`, genre: 'Teste', content_type: 'vcine',
    isPublished: true, content_rating: 'teen',
  });
  return Episode.create({
    seriesId: serie._id, episode_number: 1, title: titulo,
    status: 'published', bunnyVideoId,
  });
}

describe('Contrato da URL assinada do Bunny (regressão 44692b6 + 43e7694)', () => {
  it('o verificador deste teste reproduz o vetor conhecido do Bunny (MD5 + Base64URL sem padding)', () => {
    // Vetor escrito à mão: chave, path e expires fixos => este token literal.
    // Se alguém "ajustar" assinarComoBunny para aceitar outra fórmula (SHA256,
    // Base64 com padding, material em outra ordem), este caso cai primeiro e
    // os demais perdem o valor de oráculo.
    expect(assinarComoBunny('chave-teste-signed-url', '/bunny-signed-contrato-1/', 1792972800))
      .toBe('w1bh6jANUGNmRM27TJ0f5g');
    // MD5 em Base64 sem padding tem 22 caracteres; SHA256 teria 43.
    expect(assinarComoBunny('chave-teste-signed-url', '/bunny-signed-contrato-1/', 1792972800)).toHaveLength(22);
  });

  it('a URL assinada aponta pro playlist master e declara o DIRETÓRIO em token_path', async () => {
    const episodio = await criarEpisodioPublicado('bunny-contrato-dir-1', 'Ep contrato diretório');

    const res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(res.status).toBe(200);

    const url = new URL(res.body.signedUrl);
    expect(url.host).toBe(CDN);
    expect(url.pathname).toBe('/bunny-contrato-dir-1/playlist.m3u8');
    expect(url.searchParams.get('token_path')).toBe('/bunny-contrato-dir-1/');
    // Percent-encoded na query: o Bunny lê token_path cru da URL.
    expect(res.body.signedUrl).toContain('&token_path=%2Fbunny-contrato-dir-1%2F');
    // expires volta no corpo e é o mesmo da query (é o que o player repassa).
    expect(url.searchParams.get('expires')).toBe(String(res.body.expires));
    expect(Number(res.body.expires)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('o token é MD5/Base64URL do diretório — não do arquivo (bug 43e7694) nem SHA256 (bug 44692b6)', async () => {
    const episodio = await criarEpisodioPublicado('bunny-contrato-formula-1', 'Ep contrato fórmula');

    const res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(res.status).toBe(200);

    const url = new URL(res.body.signedUrl);
    const token = url.searchParams.get('token');
    const expires = url.searchParams.get('expires');
    const id = episodio.bunnyVideoId;

    // Forma: Base64URL sem padding (o Bunny quebra a query com +, / ou =).
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    // Material assinado = diretório do vídeo.
    expect(token).toBe(assinarComoBunny(CHAVE, `/${id}/`, expires));

    // Recusa explícita das duas versões com bug, para o teste cair se o
    // material voltar a ser o arquivo ou a conta voltar a ser SHA256.
    expect(token).not.toBe(assinarComoBunny(CHAVE, `/${id}/playlist.m3u8`, expires));
    expect(token).not.toBe(base64url(crypto.createHash('sha256').update(`${CHAVE}/${id}${expires}`).digest('base64')));
    expect(token).not.toBe(base64url(crypto.createHash('sha256').update(CHAVE + `/${id}/` + expires).digest('base64')));
  });

  it('o mesmo token serve para todas as peças do HLS (sub-playlist e segmento .ts)', async () => {
    const episodio = await criarEpisodioPublicado('bunny-contrato-hls-1', 'Ep contrato HLS');

    const res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    expect(res.status).toBe(200);

    const url = new URL(res.body.signedUrl);
    const credenciais = {
      token: url.searchParams.get('token'),
      expires: url.searchParams.get('expires'),
      tokenPath: url.searchParams.get('token_path'),
    };
    const agora = Math.floor(Date.now() / 1000);
    const base = `https://${CDN}/bunny-contrato-hls-1`;

    // É isto que o leitor sente: o playlist master abre, e as peças seguintes
    // que o hls.js busca têm de abrir com a MESMA credencial.
    for (const recurso of [
      `${base}/playlist.m3u8`,
      `${base}/480p/video.m3u8`,
      `${base}/480p/video_0.ts`,
      `${base}/720p/video_137.ts`,
    ]) {
      const veredito = bunnyAceita(recurso, credenciais, CHAVE, agora);
      expect(veredito, `${recurso}: ${veredito.motivo}`).toEqual({ ok: true, motivo: 'aceito' });
    }

    // Contraprova de que o verificador não aceita qualquer coisa: outro vídeo
    // não entra com esta credencial.
    const outro = bunnyAceita(`https://${CDN}/outro-video/playlist.m3u8`, credenciais, CHAVE, agora);
    expect(outro.ok).toBe(false);
  });

  it('com o relógio congelado, a URL assinada é exatamente a string esperada', async () => {
    const episodio = await criarEpisodioPublicado('bunny-contrato-golden', 'Ep contrato golden');

    // Só a leitura do tempo é falsa (toFake: ['Date']); timers de rede e do
    // mongodb-memory-server continuam reais.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
    let res;
    try {
      res = await request(app).get(`/api/bunny/signed-url?videoId=${episodio.bunnyVideoId}`);
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(200);
    // Nenhuma conta neste caso: literal conferido fora do teste. 1792584000
    // (o instante congelado) + 14400 = 1792598400.
    expect(res.body.signedUrl).toBe(
      'https://cdn-teste-signed.b-cdn.net/bunny-contrato-golden/playlist.m3u8'
      + '?token=-NgNyP5Z1gZq4_c0XZFy0Q&expires=1792598400&token_path=%2Fbunny-contrato-golden%2F'
    );
    expect(res.body.expires).toBe(1792598400);
  });
});
