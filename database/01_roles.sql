DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbotuser') THEN
    CREATE ROLE chatbotuser LOGIN PASSWORD 'cp1619comm2k1';
  END IF;
END
$$;

ALTER ROLE chatbotuser CREATEDB;