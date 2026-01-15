-- Eliminar solo si existen
/*
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
*/
-- Resto de tablas...
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

/*
\c postgres chatbotuser
\c chatbotdb chatbotuser
*/
-- Crear la tabla 'users' con la columna role incluida

-- 1) Sólo definir tablas y datos en chatbotdb (ejecutar con chatbotuser)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50)
    CHECK (role IN ('estudiante','funcionario','administrador de documentos','admin'))
    DEFAULT 'estudiante',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
--Prueba de inserción de un usuario
--Inserting a default user with id = 1 if the table is empty
--INSERT INTO users (username, email, password_hash, role, id)
--SELECT 'default_user', 'default@example.com', 'default_password_hash', 'estudiante', 1
--WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED,
  tokens_used INT,
  model VARCHAR(50)
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
  ocr_message TEXT
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



-- Semilla admin (requiere pgcrypto, arriba creada)
-- Asegurar el rol "admin" en la restricción de roles y el usuario admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('estudiante','funcionario','administrador de documentos','admin'));
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@usach.cl', crypt('admin', gen_salt('bf')), 'admin')
ON CONFLICT (email) DO UPDATE
SET
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  password_hash = crypt('admin', gen_salt('bf'));

--INSERT INTO requests (user_id, query, response)
--SELECT (SELECT id FROM users WHERE username = 'user1'), 'Solicitud de Cambio de Carrera', 'Permite solicitar…' UNION ALL
--SELECT (SELECT id FROM users WHERE username = 'user2'), 'Solicitud de Certificado de Alumno Regular', 'Permite obtener…' UNION ALL
--SELECT (SELECT id FROM users WHERE username = 'user3'), 'Solicitud de Reincorporación', 'Permite solicitar…';
-- 2) Quitar la restricción actual
ALTER TABLE requests
  DROP CONSTRAINT requests_user_id_fkey;

-- 3) Agregarla de nuevo con CASCADE
ALTER TABLE requests
  ADD CONSTRAINT requests_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
  
-- 4) Privilegios
GRANT CONNECT ON DATABASE chatbotdb TO chatbotuser;
GRANT USAGE ON SCHEMA public TO chatbotuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatbotuser;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatbotuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbotuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO chatbotuser;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS original_filename TEXT;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS context TEXT;

-- Índices recomendados para FTS y trigram
CREATE INDEX IF NOT EXISTS idx_documents_tsv
  ON documents
  USING GIN (to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(content,'')));

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON documents
  USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_content_trgm
  ON documents
  USING GIN (content gin_trgm_ops);

COMMIT;
--Verificar permisos (opcional)