
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'lailai_secret_key_2024';
const MAX_VIDEO_DURATION = 210; 

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

// --- AUTH ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, isPremium: user.is_premium, avatar: user.avatar } });
  } else {
    res.status(401).json({ error: "Credenciais inválidas." });
  }
});

// --- CANAIS ---
app.get('/api/my-channels', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM channels WHERE owner_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
  const { name, handle, description, avatar, banner } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO channels (owner_id, name, handle, description, avatar, banner) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.id, name, handle.toLowerCase(), description, avatar, banner]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: "Handle (ID do canal) já está em uso." });
  }
});

// --- CONTEÚDO ---
app.post('/api/episodes', authenticateToken, async (req, res) => {
  const { title, description, videoUrl, duration, channelId } = req.body;
  
  // Validação: O canal pertence ao usuário?
  const channelCheck = await pool.query('SELECT owner_id FROM channels WHERE id = $1', [channelId]);
  if (channelCheck.rows.length === 0 || channelCheck.rows[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: "Você não tem permissão para postar neste canal." });
  }

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

app.get('/api/episodes', async (req, res) => {
  const result = await pool.query('SELECT e.*, c.name as channel_name, c.handle as channel_handle, c.avatar as channel_avatar FROM episodes e JOIN channels c ON e.channel_id = c.id ORDER BY e.created_at DESC');
  res.json(result.rows);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`LaiLai Multi-Channel Backend Rodando`));
