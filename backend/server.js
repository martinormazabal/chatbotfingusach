const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require('dotenv').config();
const pool = require('./db');  // <-- Mover aquí la importación

// Configuración inicial
const initialize = async () => {
  try {
    // 1. Verificar conexión PostgreSQL
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado');

    // 2. Instalar extensión pg_trgm
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    console.log('✅ Extensión pg_trgm instalada/verificada');

    // 3. Iniciar servidor Express
    const app = express();
    
    // Middlewares
    app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    app.use(bodyParser.json());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rutas
    app.use("/api/users", require('./routes/users'));
    app.use("/api/documents", require('./routes/documents'));
    app.use("/api/requests", require('./routes/requests'));

    // Manejo de errores
    app.use((err, req, res, next) => {
      console.error('🔥 Error Global:', err.stack);
      res.status(500).json({ error: 'Error interno del servidor' });
    });

    // Iniciar servidor
    const PORT = process.env.BACKEND_PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Backend en http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Error de inicialización:', error.message);
    process.exit(1);  // Salir con código de error
  }
};

// Ejecutar inicialización
initialize();