
-- Tabela de Usuários
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    is_premium BOOLEAN DEFAULT FALSE,
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Canais
CREATE TABLE channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    handle VARCHAR(50) UNIQUE NOT NULL,
    avatar TEXT,
    banner TEXT,
    description TEXT,
    follower_count INTEGER DEFAULT 0,
    is_monetized BOOLEAN DEFAULT TRUE
);

-- Tabela de Vídeos (HQCINE/VE-FILME)
CREATE TABLE episodes (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    duration INTEGER NOT NULL, -- Limite de 210s validado no Node
    thumbnail TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Anúncios
CREATE TABLE ads (
    id SERIAL PRIMARY KEY,
    advertiser_id INTEGER,
    title VARCHAR(100),
    video_url TEXT NOT NULL,
    duration INTEGER DEFAULT 90,
    views INTEGER DEFAULT 0,
    max_views INTEGER NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
