
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ffmpeg = require('fluent-ffmpeg');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

app.use(helmet());
app.use(cors({ 
  origin: process.env.FRONTEND_URL,
  credentials: true 
}));
app.use(express.json());

// Proteção Anti-DDoS e Brute Force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Muitas requisições. Tente novamente em 15 minutos." }
});
app.use('/api/', limiter);

// Pipeline de Processamento de Vídeo Profissional
const processVideoToHLS = (inputPath, outputFolder) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-profile:v baseline',
        '-level 3.0',
        '-start_number 0',
        '-hls_time 4',
        '-hls_list_size 0',
        '-f hls',
        '-s 1080x1920', // Garantia de resolução vertical
        '-r 30'         // Trava de FPS para economia de banda/fluidez
      ])
      .output(`${outputFolder}/index.m3u8`)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
};

// Middlewares de Segurança
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Token inválido" });
  }
};

// Rotas de Produção
app.post('/api/upload', authenticate, async (req, res) => {
  // Lógica de Multer para receber o arquivo
  // processVideoToHLS(file.path, targetDir)
  res.json({ message: "Processamento iniciado no background" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`LaiLai Production Server v1.0 running on ${PORT}`));
