/**
 * Edição dos painéis de um episódio, um a um (Fase 7, frente A, item 6).
 * Regras em services/edicaoPaineisService.js. Serve a grade do Meu Estúdio
 * (dono do canal, só em rascunho não enviado) e a do Gerenciar Conteúdo
 * (admin); a guarda fica no serviço, a mesma do envio da pasta. Quem não é
 * dono nem admin recebe 404.
 *
 *  GET    /api/edicao-paineis/:episodeId                                  painéis (todos com _id) e se dá para editar
 *  POST   /api/edicao-paineis/:episodeId/apagar                           { paineis: [id, ...] }
 *  PUT    /api/edicao-paineis/:episodeId/paineis/:painelId/imagem         multipart, campo "arquivo"
 *  PUT    /api/edicao-paineis/:episodeId/paineis/:painelId/baloes/:idioma multipart, campo "arquivo"
 *  DELETE /api/edicao-paineis/:episodeId/paineis/:painelId/baloes/:idioma
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const logger = require('../utils/logger');
const servico = require('../services/edicaoPaineisService');
const { TAMANHO_MAXIMO_PARTE } = require('../services/envioEpisodioService');

router.use(verifyToken);

function responderErro(res, err, contexto) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  logger.error(`[EdicaoPaineis] ${contexto}`, err);
  return res.status(500).json({ error: 'Erro interno na edição dos painéis.' });
}

// Um arquivo por pedido, na memória só até subir ao Bunny (mesmo teto da parte
// do envio da pasta: cabe no client_max_body_size do nginx).
const umArquivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_PARTE, files: 1, fields: 5 },
}).single('arquivo');

function comArquivo(req, res, next) {
  umArquivo(req, res, (err) => {
    if (!err) return next();
    const grande = err.code === 'LIMIT_FILE_SIZE';
    res.status(grande ? 413 : 400).json({ error: grande ? 'Arquivo grande demais (máximo de 8 MB).' : err.message });
  });
}

router.get('/:episodeId', async (req, res) => {
  try {
    res.json(await servico.listar({ user: req.user, episodeId: req.params.episodeId }));
  } catch (err) {
    responderErro(res, err, 'GET /:episodeId');
  }
});

router.post('/:episodeId/apagar', async (req, res) => {
  try {
    res.json(await servico.apagarPaineis({ user: req.user, episodeId: req.params.episodeId, paineis: req.body?.paineis }));
  } catch (err) {
    responderErro(res, err, 'POST /:episodeId/apagar');
  }
});

router.put('/:episodeId/paineis/:painelId/imagem', comArquivo, async (req, res) => {
  try {
    res.json(await servico.trocarImagem({
      user: req.user, episodeId: req.params.episodeId, painelId: req.params.painelId, buffer: req.file?.buffer,
    }));
  } catch (err) {
    responderErro(res, err, 'PUT /:episodeId/paineis/:painelId/imagem');
  }
});

router.put('/:episodeId/paineis/:painelId/baloes/:idioma', comArquivo, async (req, res) => {
  try {
    res.json(await servico.trocarBalao({
      user: req.user, episodeId: req.params.episodeId, painelId: req.params.painelId,
      idioma: req.params.idioma, buffer: req.file?.buffer,
    }));
  } catch (err) {
    responderErro(res, err, 'PUT /:episodeId/paineis/:painelId/baloes/:idioma');
  }
});

router.delete('/:episodeId/paineis/:painelId/baloes/:idioma', async (req, res) => {
  try {
    res.json(await servico.removerBalao({
      user: req.user, episodeId: req.params.episodeId, painelId: req.params.painelId, idioma: req.params.idioma,
    }));
  } catch (err) {
    responderErro(res, err, 'DELETE /:episodeId/paineis/:painelId/baloes/:idioma');
  }
});

module.exports = router;
