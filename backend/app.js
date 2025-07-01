// backend/app.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const pool = require("./db");

const uploadDir = path.join(__dirname, 'uploads');
const app = express();

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
