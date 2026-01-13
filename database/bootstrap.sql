-- Bootstrap roles and database for the chatbot project.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chatbotuser') THEN
    CREATE ROLE chatbotuser WITH LOGIN PASSWORD 'cp1619comm2k1';
  END IF;
END
$$;

ALTER ROLE chatbotuser CREATEDB;
ALTER ROLE chatbotuser CREATEROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'chatbotdb') THEN
    CREATE DATABASE chatbotdb OWNER chatbotuser;
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE chatbotdb TO chatbotuser;