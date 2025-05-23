-- Eliminar solo si existen
/*
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
*/
-- Resto de tablas...

-- (Opcional) Crear usuario
CREATE USER chatbotuser WITH PASSWORD 'cp1619comm2k1';
CREATE DATABASE chatbotdb WITH OWNER = chatbotuser;
CREATE DATABASE postgres WITH OWNER = chatbotuser;
GRANT ALL PRIVILEGES ON DATABASE chatbotdb TO chatbotuser;
GRANT ALL PRIVILEGES ON DATABASE postgres TO chatbotuser;
ALTER USER chatbotuser CREATEDB;
ALTER USER chatbotuser CREATEROLE;

/*
\c postgres chatbotuser
\c chatbotdb chatbotuser
*/
-- Crear la tabla 'users' con la columna role incluida
BEGIN;

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
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n
 INSERT INTO users (username, email, password_hash, role)
 SELECT 'admin', 'admin@usach.cl', crypt('admin', gen_salt('bf')), 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@usach.cl');
--  ('user2', 'user2@example.com', 'hashed_password_2', 'funcionario'),
--  ('user3', 'user3@example.com', 'hashed_password_3', 'administrador de documentos');

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

COMMIT;
--Verificar permisos (opcional)
\du chatbotuser

