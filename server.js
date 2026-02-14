
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

const JWT_SECRET = process.env.JWT_SECRET || 'lailai_production_secret_2024';

// Middlewares
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, is_premium',
      [email, hashed, name]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(400).json({ error: 'Email already exists' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (user && await bcrypt.compare(password, user.password_hash)) {
    const token = jwt.sign({ id: user.id, isPremium: user.is_premium }, JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, isPremium: user.is_premium, email: user.email } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// --- CONTENT GETTERS ---
app.get('/api/series', async (req, res) => {
  const { type } = req.query; // hqcine, vfilm, hiqua
  let query = 'SELECT * FROM series WHERE is_published = true';
  const params = [];
  if (type) {
    query += ' AND content_type = $1';
    params.push(type);
  }
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.get('/api/series/:id/content', async (req, res) => {
  const seasons = await pool.query('SELECT * FROM seasons WHERE series_id = $1 ORDER BY season_number', [req.params.id]);
  const episodes = await pool.query(
    'SELECT e.* FROM episodes e JOIN seasons s ON e.season_id = s.id WHERE s.series_id = $1 ORDER BY e.episode_number', 
    [req.params.id]
  );
  res.json({ seasons: seasons.rows, episodes: episodes.rows });
});

app.get('/api/episodes/:id/panels', async (req, res) => {
  const result = await pool.query('SELECT * FROM panels WHERE episode_id = $1 ORDER BY order_index', [req.params.id]);
  res.json(result.rows);
});

// --- MONETIZATION ---
app.get('/api/ads/pre-roll', async (req, res) => {
  const ad = (await pool.query('SELECT * FROM ads WHERE active = true ORDER BY RANDOM() LIMIT 1')).rows[0];
  res.json(ad || null);
});

app.post('/api/subscribe', auth, async (req, res) => {
  // Mock Gateway Integration
  await pool.query('UPDATE users SET is_premium = true WHERE id = $1', [req.user.id]);
  res.json({ success: true, message: 'Premium activated' });
});

// --- USER ACTIONS ---
app.post('/api/history', auth, async (req, res) => {
  const { episode_id } = req.body;
  await pool.query('INSERT INTO user_watch_history (user_id, episode_id) VALUES ($1, $2) ON CONFLICT (user_id, episode_id) DO UPDATE SET watched_at = NOW()', [req.user.id, episode_id]);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`LaiLai Backend Production ready on port ${PORT}`));
