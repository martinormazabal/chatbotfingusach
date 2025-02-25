const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const nodemailer = require("nodemailer");
const { Client } = require("pg");
require("dotenv").config();

const router = express.Router();

// Configurar nodemailer para enviar correos
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Endpoint para crear un nuevo usuario
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "Todos los campos son obligatorios." });
    }

    // Generar salt y hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Verificar si el usuario ya existe
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "El usuario ya existe." });
    }

    // Insertar usuario en la base de datos
    const newUser = await pool.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *",
      [username, email, hashedPassword, role || 'estudiante']
    );

    // Enviar correo al nuevo usuario
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Bienvenido al sistema",
      text: `Hola ${username},\n\nTu cuenta ha sido creada con éxito.\nCorreo: ${email}\nContraseña: (la que ingresaste)\n\nSaludos,\nAdministración`,
    };
    await transporter.sendMail(mailOptions);
    transporter.sendMail(mailOptions, (error) => {
      if (error) console.error("Error al enviar email:", error);
    });
    res.status(201).json({ 
      message: "Usuario creado exitosamente. " + 
      (process.env.NODE_ENV === "production" ? "Se ha enviado un email de confirmación" : ""),
      user: newUser.rows[0] 
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    res.status(500).json({ 
      message: error.message.includes("duplicate") 
        ? "El correo ya está registrado" 
        : "Error en el servidor" 
    });
  }
});

// **Importante:** Define la ruta GET de usuarios sin prefijo adicional.
router.get("/", async (req, res) => {
  try {
    const users = await pool.query("SELECT id, username, email, role, created_at FROM users");
    res.status(200).json(users.rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para actualizar el perfil de un usuario
router.put("/:id(\\d+)/role", async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.body.role) {
      return res.status(400).json({ message: "El campo 'role' es requerido" });
    }

    const role = req.body.role.toString().trim().toLowerCase();
    // Validación numérica
    if (isNaN(id)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }
    // Validar que el rol sea válido
    const validRoles = ["estudiante", "funcionario", "administrador de documentos"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: `Rol no válido. Opciones permitidas: ${validRoles.join(", ")}`,
        receivedRole: req.body.role
      });
    }

    // Verificar si el usuario existe
    const user = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Actualizar el rol del usuario
    await pool.query(
      "UPDATE users SET role = $1 WHERE id = $2",
      [role, parseInt(id, 10)] // Conversión explícita a número
    );
    /*
    // Enviar correo de notificación al usuario
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.rows[0].email,
      subject: "Actualización de perfil",
      text: `Hola ${user.rows[0].username},\n\nTu perfil ha sido actualizado a: ${role}.\n\nSaludos,\nAdministración.`,
    };
    await transporter.sendMail(mailOptions);
    */
    res.status(200).json({ 
      message: "Perfil actualizado correctamente",
      previousRole: user.rows[0].role,
      newRole: role
    });
  } catch (error) {
    console.error(`Error actualizando rol: ${error.message}`, {
      query: error.query,
      parameters: error.parameters
    });
    res.status(500).json({ 
      message: "Error en el servidor",
      details: error.message 
    });
  }
});


module.exports = router;

