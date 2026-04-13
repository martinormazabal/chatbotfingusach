BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50)
    CHECK (role IN ('estudiante','funcionario','administrador de documentos','admin'))
    DEFAULT 'estudiante',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED,
  tokens_used INT,
  model VARCHAR(50),
  context TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  uploaded_by VARCHAR(100) NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  has_text BOOLEAN DEFAULT FALSE,
  ocr_used BOOLEAN DEFAULT FALSE,
  ocr_status VARCHAR(50) DEFAULT 'pending',
  ocr_message TEXT,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS normative_texts (
  id SERIAL PRIMARY KEY,
  document_id INT UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  jti VARCHAR(128) NOT NULL,
  device_info TEXT DEFAULT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  CONSTRAINT ux_refresh_jti UNIQUE (jti)
);

CREATE TABLE IF NOT EXISTS auth_security_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  event_type VARCHAR(64) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address VARCHAR(64),
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_logs (
  id SERIAL PRIMARY KEY,
  case_id TEXT,
  fecha TIMESTAMP,
  rol_usuario TEXT,
  pregunta_textual TEXT,
  referencia_esperada_o_fuente TEXT,
  respuesta_chatbot TEXT,
  juicio_correctitud TEXT CHECK (juicio_correctitud IN ('Correcta','Parcial','Incorrecta')),
  tiempo_respuesta_ms INT,
  tipo_error TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_security_logs_user_id ON auth_security_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_documents_tsv
  ON documents
  USING GIN (to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(content,'')));

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON documents
  USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_content_trgm
  ON documents
  USING GIN (content gin_trgm_ops);

INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@usach.cl', crypt('admin', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO UPDATE
SET
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  password_hash = crypt('admin', gen_salt('bf'));

COMMIT;