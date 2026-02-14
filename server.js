
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'lailai_secret_key_2024';
const MAX_VIDEO_DURATION = 210; // 3min30s

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, name, avatar) VALUES ($1, $2, $3, $4) RETURNING id, email, name, is_premium',
      [email, hashedPassword, name, `https://picsum.photos/seed/${email}/200`]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { ...user, isPremium: user.is_premium } });
  } catch (err) {
    res.status(400).json({ error: "E-mail já cadastrado ou erro no servidor." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        isPremium: user.is_premium,
        avatar: user.avatar 
      } 
    });
  } else {
    res.status(401).json({ error: "Credenciais inválidas." });
  }
});

// --- ROTAS DE VÍDEO (HQCINE & VE-FILME) ---

app.get('/api/episodes', async (req, res) => {
  const result = await pool.query('SELECT * FROM episodes ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/episodes', authenticateToken, async (req, res) => {
  const { title, description, videoUrl, duration, channelId } = req.body;
  
  // Validação Real no Backend
  if (duration > MAX_VIDEO_DURATION) {
    return res.status(400).json({ error: "Duração excede 3min30s." });
  }

  try {
    const result = await pool.query(
      'INSERT INTO episodes (title, description, video_url, duration, channel_id, thumbnail) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, videoUrl, duration, channelId, `https://picsum.photos/seed/${title}/1080/1920`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROTAS DE ANÚNCIOS ---

app.get('/api/ads/active', async (req, res) => {
  const result = await pool.query('SELECT * FROM ads WHERE active = true AND views < max_views');
  res.json(result.rows);
});

app.post('/api/ads/impression/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('UPDATE ads SET views = views + 1 WHERE id = $1', [id]);
  await pool.query('UPDATE ads SET active = false WHERE id = $1 AND views >= max_views');
  res.sendStatus(200);
});

// Inicialização
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`LaiLai Backend Rodando na porta ${PORT}`));
