-- Se ejecuta en la DB "postgres" como superusuario
SELECT format('CREATE DATABASE %I OWNER %I', 'chatbotdb', 'chatbotuser')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'chatbotdb')\gexec