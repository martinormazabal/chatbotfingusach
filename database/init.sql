-- Eliminar solo si existen
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- Resto de tablas...

-- (Opcional) Crear usuario
CREATE DATABASE chatbotdb WITH OWNER = chatbotuser;
CREATE DATABASE postgres WITH OWNER = chatbotuser;
CREATE USER chatbotuser WITH PASSWORD 'cp1619comm2k1';
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

-- Crear tablas
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL 
    CHECK (role IN ('estudiante', 'funcionario', 'administrador de documentos')) 
    DEFAULT 'estudiante',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear la tabla requests
CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED
);

-- Crear la tabla documents
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    uploaded_by VARCHAR(100) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Si se requiere la tabla profiles, créala con la relación a users
CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Insertar datos de ejemplo en requests
INSERT INTO requests (name, description, steps)
VALUES
('Solicitud de Cambio de Carrera', 'Permite solicitar un cambio de carrera dentro de la universidad.', '1. Descargue el formulario.\n2. Complete los campos requeridos.\n3. Entregue el formulario a la oficina correspondiente.'),
('Solicitud de Certificado de Alumno Regular', 'Permite obtener un certificado que acredite su condición de estudiante.', '1. Ingrese al portal.\n2. Seleccione "Solicitar certificado".\n3. Descargue el documento.'),
('Solicitud de Reincorporación', 'Permite solicitar la reincorporación tras una suspensión o retiro.', '1. Complete el formulario de reincorporación.\n2. Adjunte la documentación requerida.\n3. Presente su solicitud en la secretaría académica.');

-- Relaciones entre perfiles y usuarios
ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE profiles ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- Otorgar privilegios correctos al usuario
GRANT CONNECT ON DATABASE chatbotdb TO chatbotuser;
GRANT CONNECT ON DATABASE postgres TO chatbotuser;
GRANT USAGE ON SCHEMA public TO chatbotuser;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatbotuser;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatbotuser;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbotuser;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO chatbotuser;

ALTER TABLE requests 
ADD COLUMN tokens_used INT,
ADD COLUMN model VARCHAR(50);

COMMIT;
/* Verificar permisos (opcional)
\du chatbotuser
*/
