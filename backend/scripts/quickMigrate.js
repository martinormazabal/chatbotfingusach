// backend/scripts/quickMigrate.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "chatbotuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "chatbotdb",
  password: process.env.DB_PASSWORD || "cp1619comm2k1",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
});

(async () => {
  try {
    // Extensiones usadas por tus consultas
    await pool.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    // 1) requests.context (para guardar el resumen de contexto que insertas)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'requests' AND column_name = 'context'
        ) THEN
          ALTER TABLE requests ADD COLUMN context TEXT;
        END IF;
      END $$;
    `);

    // 2) documents.source_url (para poder guardar enlaces oficiales)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'documents' AND column_name = 'source_url'
        ) THEN
          ALTER TABLE documents ADD COLUMN source_url TEXT;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'has_text'
        ) THEN
          ALTER TABLE documents ADD COLUMN has_text BOOLEAN DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'ocr_used'
        ) THEN
          ALTER TABLE documents ADD COLUMN ocr_used BOOLEAN DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'ocr_status'
        ) THEN
          ALTER TABLE documents ADD COLUMN ocr_status VARCHAR(50) DEFAULT 'pending';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'ocr_message'
        ) THEN
          ALTER TABLE documents ADD COLUMN ocr_message TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'original_filename'
        ) THEN
          ALTER TABLE documents ADD COLUMN original_filename TEXT;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'normative_texts'
        ) THEN
          CREATE TABLE normative_texts (
            id SERIAL PRIMARY KEY,
            document_id INT UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        END IF;
      END $$;
    `);

    console.log("✅ Migración aplicada correctamente");
  } catch (e) {
    console.error("❌ Error en migración:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();