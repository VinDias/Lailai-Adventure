/**
 * Envio da pasta de um episódio (Fase 7, frente A, item 3). Regras e passos
 * em services/envioEpisodioService.js. Serve o Meu Estúdio e o Gerenciar
 * Conteúdo (a guarda de admin ou dono fica no serviço).
 *
 *  GET    /api/envio-episodio/config               limites (painéis, MB) e tamanho da parte
 *  POST   /api/envio-episodio/:episodeId/iniciar   { arquivos: [{ nome, largura, altura, tamanho }] }
 *  POST   /api/envio-episodio/:envioId/partes      multipart, um campo por arquivo, nome do campo = chave
 *  POST   /api/envio-episodio/:envioId/concluir
 *  DELETE /api/envio-episodio/:envioId
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');
const servico = require('../services/envioEpisodioService');

router.use(verifyToken);

function responderErro(res, err, contexto) {
  if (err.status) {
    const corpo = { error: err.message };
    for (const k of ['problemas', 'recusados', 'falhas', 'faltando', 'recebidos', 'total']) {
      if (err[k] !== undefined) corpo[k] = err[k];
    }
    return res.status(err.status).json(corpo);
  }
  logger.error(`[EnvioEpisodio] ${contexto}`, err);
  return res.status(500).json({ error: 'Erro interno no envio do episódio.' });
}

router.get('/config', async (req, res) => {
  try {
    res.json(await servico.configuracao());
  } catch (err) {
    responderErro(res, err, 'GET /config');
  }
});

router.post('/:episodeId/iniciar', async (req, res) => {
  try {
    const r = await servico.iniciarEnvio({ user: req.user, episodeId: req.params.episodeId, arquivos: req.body?.arquivos });
    res.status(201).json(r);
  } catch (err) {
    responderErro(res, err, 'POST /:episodeId/iniciar');
  }
});

const parteUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: servico.TAMANHO_MAXIMO_PARTE,
    files: servico.ARQUIVOS_POR_PARTE,
    fields: 10,
  },
});

// A parte inteira tem de caber em TAMANHO_MAXIMO_PARTE (mais o envelope do
// multipart). Conferido pelo Content-Length ANTES de ler o corpo: o multer
// sozinho só limita por arquivo, e 60 x 20 MB derrubaria o processo (pm2
// reinicia acima de 500 MB).
function limitarTamanhoDaParte(req, res, next) {
  const tamanho = Number.parseInt(req.headers['content-length'] || '', 10);
  if (!Number.isInteger(tamanho)) return res.status(411).json({ error: 'Envie a parte com Content-Length.' });
  if (tamanho > servico.TAMANHO_MAXIMO_PARTE + 256 * 1024) {
    return res.status(413).json({ error: 'Parte grande demais; divida em partes menores.' });
  }
  next();
}

router.post('/:envioId/partes', limitarTamanhoDaParte, (req, res) => {
  parteUpload.any()(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const arquivos = (req.files || []).map(f => ({ chave: f.fieldname, buffer: f.buffer }));
      res.json(await servico.receberParte({ user: req.user, envioId: req.params.envioId, arquivos }));
    } catch (e) {
      responderErro(res, e, 'POST /:envioId/partes');
    }
  });
});

router.post('/:envioId/concluir', async (req, res) => {
  try {
    res.json(await servico.concluirEnvio({ user: req.user, envioId: req.params.envioId }));
  } catch (err) {
    responderErro(res, err, 'POST /:envioId/concluir');
  }
});

router.delete('/:envioId', async (req, res) => {
  try {
    res.json(await servico.cancelarEnvio({ user: req.user, envioId: req.params.envioId }));
  } catch (err) {
    responderErro(res, err, 'DELETE /:envioId');
  }
});

module.exports = router;
