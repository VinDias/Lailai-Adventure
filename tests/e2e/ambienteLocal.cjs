/**
 * Ambiente inteiramente local para os roteiros E2E da frente A (Chromium de
 * verdade). Nada sai para a rede e nada toca a produção:
 *  - MongoDB em memória (mongodb-memory-server, o mesmo dos testes);
 *  - o servidor da Lorflux (server.js) no mesmo processo, NODE_ENV=test;
 *  - Bunny FALSO: o envio grava em <dirCdn>; o endereço do CDN é
 *    https://cdn-e2e.localhost e o navegador do roteiro recebe os arquivos
 *    direto do disco (`atenderCdn`), sem servidor nem rede;
 *  - a tela pelo Vite, com /api repassado ao servidor (mesma origem, como em
 *    produção atrás do nginx).
 *
 * Trava de segurança: recusa subir se houver um `.env` na pasta de onde o
 * roteiro roda ou na raiz do repositório (o server.js o leria), e zera as
 * variáveis de serviços de fora (Bunny, Stripe, e-mail, Google, Sentry).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const raiz = path.resolve(__dirname, '..', '..');

function chromiumInstalado() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  for (const d of fs.readdirSync(cache).filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const HOST_CDN = 'cdn-e2e.localhost';

async function subirAmbiente({ dirCdn, portaApi = 3466, portaTela = 5183 }) {
  for (const pasta of new Set([process.cwd(), raiz])) {
    if (fs.existsSync(path.join(pasta, '.env'))) {
      throw new Error(`Há um .env em ${pasta}: o roteiro E2E não sobe com ele (poderia apontar para serviço real). Rode de uma pasta sem .env.`);
    }
  }
  fs.mkdirSync(dirCdn, { recursive: true });

  // Tudo que fala com serviço de fora fica vazio ou aponta para lugar nenhum.
  for (const nome of Object.keys(process.env)) {
    if (/^(BUNNY_|STRIPE_|SMTP_|SENTRY_|GEMINI_|GOOGLE_|MONGO|REDIS_|PLAY_|APPLE_|API_KEY$)/.test(nome)) delete process.env[nome];
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: 'e2e-jwt-local',
    REFRESH_SECRET: 'e2e-refresh-local',
    // Porta fechada de propósito: a fila de vídeo só reclama no log.
    REDIS_URL: 'redis://127.0.0.1:1',
    FRONTEND_URL: `http://localhost:${portaTela}`,
    BUNNY_STORAGE_ZONE: 'zona-local-e2e',
    BUNNY_STORAGE_KEY: 'chave-local-e2e',
    BUNNY_STORAGE_ENDPOINT: '127.0.0.1:1',
    // https e sem porta, como o CDN de verdade: é o que o servidor reconhece
    // como arquivo nosso na hora de apagar (utils/bunnyStorage caminhoDaUrl).
    BUNNY_STORAGE_HOSTNAME: HOST_CDN,
    VITE_API_URL: '/api',
  });

  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  if (!/^mongodb:\/\/127\.0\.0\.1:/.test(process.env.MONGO_URI)) throw new Error('Mongo em memória fora do 127.0.0.1: parando.');

  const mongoose = require('mongoose');
  const app = require(path.join(raiz, 'server'));
  await new Promise(r => (mongoose.connection.readyState === 1 ? r() : mongoose.connection.once('connected', r)));

  const pedidos = { total: 0, recusados429: 0, porRota: {} };
  const api = app.listen(portaApi, '0.0.0.0');
  api.on('request', (req, res) => res.on('finish', () => {
    pedidos.total++;
    if (res.statusCode === 429) pedidos.recusados429++;
    const rota = req.method + ' ' + (req.originalUrl || req.url).split('?')[0].replace(/[0-9a-f]{24}/g, ':id');
    pedidos.porRota[rota] = (pedidos.porRota[rota] || 0) + 1;
  }));

  const bunny = require(path.join(raiz, 'utils/bunnyStorage'));
  const apagadosDoCdn = [];
  bunny.__setUploaderForTests(async (buffer, caminho) => {
    const destino = path.join(dirCdn, caminho);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, buffer);
    return `https://${HOST_CDN}/${caminho}`;
  });
  bunny.__setDeleterForTests(async (caminho) => {
    apagadosDoCdn.push(caminho);
    fs.rmSync(path.join(dirCdn, caminho), { force: true });
  });

  // Rotas antigas (capa da obra, miniatura) falam com o Bunny por `fetch`
  // direto, sem passar pelo utils/bunnyStorage. O `fetch` deste processo fica
  // cercado: o que iria ao Storage é gravado em <dirCdn>; qualquer outro
  // endereço que não seja desta máquina é recusado (nada sai para a rede).
  const fetchDeVerdade = global.fetch;
  const prefixoStorage = `https://${process.env.BUNNY_STORAGE_ENDPOINT}/${process.env.BUNNY_STORAGE_ZONE}/`;
  global.fetch = async (alvo, opcoes = {}) => {
    const url = String(alvo && alvo.url ? alvo.url : alvo);
    if (url.startsWith(prefixoStorage)) {
      const caminho = decodeURIComponent(url.slice(prefixoStorage.length));
      const destino = path.join(dirCdn, caminho);
      if (!destino.startsWith(dirCdn + path.sep)) return new Response('caminho recusado', { status: 400 });
      const metodo = (opcoes.method || 'GET').toUpperCase();
      if (metodo === 'PUT') {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, Buffer.from(opcoes.body));
        return new Response('{"HttpCode":201}', { status: 201 });
      }
      if (metodo === 'DELETE') {
        apagadosDoCdn.push(caminho);
        fs.rmSync(destino, { force: true });
        return new Response('{"HttpCode":200}', { status: 200 });
      }
      return new Response('', { status: 405 });
    }
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') throw new Error(`E2E local: pedido para fora recusado (${host})`);
    return fetchDeVerdade(alvo, opcoes);
  };

  const { createServer } = await import('vite');
  const vite = await createServer({
    root: raiz,
    logLevel: 'error',
    server: {
      port: portaTela,
      host: '0.0.0.0',
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${portaApi}`, changeOrigin: false } },
    },
  });
  await vite.listen();

  const arquivoNoCdn = (url) => path.join(dirCdn, decodeURIComponent(new URL(url).pathname));

  return {
    raiz,
    tela: `http://localhost:${portaTela}`,
    pedidos,
    apagadosDoCdn,
    arquivoNoCdn,
    existeNoCdn: (url) => fs.existsSync(arquivoNoCdn(url)),
    modelo: (nome) => require(path.join(raiz, 'models', nome)),
    // O CDN falso não tem servidor: o navegador do roteiro recebe os arquivos
    // direto do disco.
    async atenderCdn(contexto) {
      await contexto.route(`https://${HOST_CDN}/**`, (rota) => {
        const arquivo = arquivoNoCdn(rota.request().url());
        if (!arquivo.startsWith(dirCdn + path.sep) || !fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: '' });
        return rota.fulfill({ status: 200, path: arquivo });
      });
    },
    async derrubar() {
      global.fetch = fetchDeVerdade;
      await vite.close();
      api.close();
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

module.exports = { subirAmbiente, chromiumInstalado, raiz };
