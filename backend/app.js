// backend/app.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const pool = require("./db");

const uploadDir = path.join(__dirname, 'uploads');
const app = express();

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
// Aumenta el límite global para peticiones grandes (p. ej. uploads de PDF).
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(uploadDir));

// Rutas
app.use("/api/users", require("./routes/users"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/requests", require("./routes/requests"));

// Error global
app.use((err, req, res, next) => {
  console.error("🔥 Error Global:", err.stack);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = app;