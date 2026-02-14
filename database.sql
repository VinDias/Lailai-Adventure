
-- Extensão para UUID se necessário, mas usaremos SERIAL para simplicidade nesta arquitetura
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    address TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE series (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image TEXT NOT NULL,
    genre VARCHAR(100),
    content_type VARCHAR(20) DEFAULT 'hqcine', -- 'hqcine' ou 'vfilm'
    is_published BOOLEAN DEFAULT TRUE
);

CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    series_id INTEGER REFERENCES series(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL,
    title VARCHAR(255)
);

CREATE TABLE episodes (
    id SERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    video_url TEXT, -- Para HQCINE/V-Film
    duration INTEGER, -- Segundos (Max 600)
    thumbnail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar TEXT,
    owner_id INTEGER REFERENCES users(id)
);

-- Relaciona canais a séries para HI-QUA
ALTER TABLE series ADD COLUMN channel_id INTEGER REFERENCES channels(id);

CREATE TABLE panels (
    id SERIAL PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    order_index INTEGER NOT NULL
);

CREATE TABLE ads (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    video_url TEXT NOT NULL,
    duration INTEGER DEFAULT 60,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE user_watch_history (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE user_favorites (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    series_id INTEGER REFERENCES series(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, series_id)
);
