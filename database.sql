
-- LAILAI PROFESSIONAL SCHEMA 2025

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    provider VARCHAR(20) DEFAULT 'local', -- 'google', 'microsoft', 'local'
    provider_id VARCHAR(255),
    nome VARCHAR(255),
    telefone VARCHAR(20),
    endereco TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expira_em TIMESTAMP,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    descricao TEXT,
    duracao INTEGER NOT NULL, -- minutos (max 20)
    arquivo_url TEXT NOT NULL, -- HLS .m3u8
    thumbnail_url TEXT NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webtoons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    descricao TEXT,
    numero_paineis INTEGER DEFAULT 0, -- max 120
    is_premium BOOLEAN DEFAULT FALSE,
    thumbnail_url TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webtoon_paineis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webtoon_id UUID REFERENCES webtoons(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    imagem_url TEXT NOT NULL,
    largura INTEGER DEFAULT 800,
    altura INTEGER DEFAULT 1280
);

CREATE INDEX idx_videos_premium ON videos(is_premium);
CREATE INDEX idx_users_email ON users(email);
