const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db");
const nodemailer = require("nodemailer");
require("dotenv").config();

const router = express.Router();

// Configurar nodemailer para enviar correos
const EMAIL_ENABLED = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const transporter = EMAIL_ENABLED
  ? nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;

const PASSWORD_RESET_TOKEN_TTL_MINUTES = parseInt(
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  10
);

const PASSWORD_RESET_TTL = Number.isFinite(PASSWORD_RESET_TOKEN_TTL_MINUTES)
  ? PASSWORD_RESET_TOKEN_TTL_MINUTES
  : 60; // 1 hora por defecto

const VALID_ROLES = [
  "estudiante",
  "funcionario",
  "administrador de documentos",
  "admin",
];

const ALLOWED_ROLE_METHODS = ["PUT", "POST"];

const PASSWORD_POLICY = {
  minLength: 6,
  minLowercase: 1,
  minUppercase: 1,
  minDigits: 1,
  minSymbols: 0,
};

function describePasswordPolicy(policy = PASSWORD_POLICY) {
  const segments = [
    `mínimo ${policy.minLength} caracteres`,
    `${policy.minUppercase} mayúscula${policy.minUppercase > 1 ? "s" : ""}`,
    `${policy.minLowercase} minúscula${policy.minLowercase > 1 ? "s" : ""}`,
    `${policy.minDigits} número${policy.minDigits > 1 ? "s" : ""}`,
    `${policy.minSymbols} símbolo${policy.minSymbols > 1 ? "s" : ""}`,
  ];
  return `La contraseña no cumple con la política de seguridad (${segments.join(", ")}).`;
}

function validatePasswordStrength(password) {
  const stats = {
    length: 0,
    lowercase: 0,
    uppercase: 0,
    digits: 0,
    symbols: 0,
  };

  if (!password) {
    return { isValid: false, stats };
  }

  for (const char of password) {
    stats.length += 1;

    if (/\p{Ll}/u.test(char)) {
      stats.lowercase += 1;
    } else if (/\p{Lu}/u.test(char)) {
      stats.uppercase += 1;
    } else if (/\p{N}/u.test(char)) {
      stats.digits += 1;
    } else {
      // Todo carácter que no sea letra o número cuenta como símbolo, incluyendo
      // puntuación, emojis, espacios u otros signos Unicode.
      stats.symbols += 1;
    }
  }

  const isValid =
    stats.length >= PASSWORD_POLICY.minLength &&
    stats.lowercase >= PASSWORD_POLICY.minLowercase &&
    stats.uppercase >= PASSWORD_POLICY.minUppercase &&
    stats.digits >= PASSWORD_POLICY.minDigits &&
    stats.symbols >= PASSWORD_POLICY.minSymbols;

  return { isValid, stats };
}

async function upsertPasswordResetToken(userId, tokenHash, client) {
  const db = client || pool;
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, consumed_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), NULL)
     ON CONFLICT (user_id)
     DO UPDATE SET token_hash = EXCLUDED.token_hash,
                   expires_at = EXCLUDED.expires_at,
                   consumed_at = NULL,
                   updated_at = NOW()` ,
    [userId, tokenHash, PASSWORD_RESET_TTL]
  );
}

function buildEmailTransportFallbackMessage(to, subject, body) {
  return `\n--- EMAIL NO ENVIADO (configuración ausente) ---\nPara: ${to}\nAsunto: ${subject}\n${body}\n----------------------------------------------\n`;
}

async function sendEmailIfEnabled({ to, subject, text }) {
  if (!EMAIL_ENABLED || !transporter) {
    console.warn(
      buildEmailTransportFallbackMessage(to, subject, text)
    );
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
  });
}

function generateTemporaryPassword() {
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = lowercase + uppercase + digits + symbols;

  const pick = (set) => set[crypto.randomInt(0, set.length)];
  const passwordChars = [
    pick(lowercase),
    pick(uppercase),
    pick(digits),
    pick(symbols),
  ];

  while (passwordChars.length < 16) {
    passwordChars.push(pick(all));
  }

  return passwordChars
    .sort(() => 0.5 - Math.random())
    .join("");
}

function sanitizeRole(role) {
  const normalized = (role || "estudiante").toString().trim().toLowerCase();
  if (!VALID_ROLES.includes(normalized)) {
    throw new Error(
      `Rol no válido. Opciones permitidas: ${VALID_ROLES.join(", ")}`
    );
  }
  return normalized;
}

async function getUserByEmail(email, client) {
  const db = client || pool;
  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] || null;
}

async function getUserById(id, client) {
  const db = client || pool;
  const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function ensurePasswordResetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// Endpoint para crear un nuevo usuario
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email) {
      return res
        .status(400)
        .json({ message: "Los campos 'username' y 'email' son obligatorios." });
    }

    let sanitizedRole;
    try {
      sanitizedRole = sanitizeRole(role);
    } catch (roleError) {
      return res.status(400).json({ message: roleError.message });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "El correo ya está registrado." });
    }

    const finalPassword = password || generateTemporaryPassword();
    const { isValid } = validatePasswordStrength(finalPassword);
    if (!isValid) {
      return res.status(400).json({
        message: describePasswordPolicy(),
      });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 12);

    const newUser = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
      [username.trim(), email.trim().toLowerCase(), hashedPassword, sanitizedRole]
    );

    const responsePayload = {
      message: "Usuario creado exitosamente.",
      user: {
        ...newUser.rows[0],
        hasTemporaryPassword: !password,
      },
    };

    res.status(201).json(responsePayload);

    const emailBody = `Hola ${username},

Tu cuenta ha sido creada con éxito.
Correo: ${email}
${password ? "" : `Contraseña temporal: ${finalPassword}\n`}
Por tu seguridad, cambia esta contraseña en tu próximo ingreso.

Saludos,
Administración`;

    await sendEmailIfEnabled({
      to: email,
      subject: "Bienvenido al sistema",
      text: emailBody,
    });
  } catch (error) {
    console.error(
      "Error en el registro de usuario (antes o durante DB insert):",
      error
    );
    res.status(500).json({
      message:
        error.code === "23505"
          ? "El correo ya está registrado"
          : "Error en el servidor",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
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
async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    if (!req.body.role) {
      return res.status(400).json({ message: "El campo 'role' es requerido" });
    }

    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    let sanitizedRole;
    try {
      sanitizedRole = sanitizeRole(req.body.role);
    } catch (roleError) {
      return res.status(400).json({ message: roleError.message });
    }

    const user = await getUserById(parseInt(id, 10));
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    await pool.query(
      "UPDATE users SET role = $1 WHERE id = $2",
      [sanitizedRole, user.id]
    );
    /*
    // Enviar correo de notificación al usuario
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.rows[0].email,
      subject: "Actualización de perfil",
      text: `Hola ${user.rows[0].username},

Tu perfil ha sido actualizado a: ${role}.

Saludos,
Administración.`,
    };
    await transporter.sendMail(mailOptions);
    */
    res.status(200).json({
      message: "Perfil actualizado correctamente",
      previousRole: user.role,
      newRole: sanitizedRole
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
}

// Ruta para actualizar el perfil de un usuario (PUT o POST)
router.put("/:id(\d+)/role", updateUserRole);
router.post("/:id(\d+)/role", updateUserRole);

// Acepta IDs no numéricos (por ejemplo, strings de consulta que lleguen con
// caracteres) y devuelve mensajes JSON coherentes en lugar de HTML 404.
router.all("/:id/role", (req, res) => {
  if (!ALLOWED_ROLE_METHODS.includes(req.method)) {
    return res.status(405).json({ message: "Método no permitido" });
  }
  return updateUserRole(req, res);
});

// Ruta para cambiar la contraseña de un usuario
router.post("/:id(\d+)/change-password", async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: "Los campos 'currentPassword' y 'newPassword' son obligatorios.",
    });
  }

  const { isValid } = validatePasswordStrength(newPassword);
  if (!isValid) {
    return res.status(400).json({
      message: describePasswordPolicy(),
    });
  }

  try {
    await ensurePasswordResetTable();
    const user = await getUserById(parseInt(id, 10));
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!isCurrentPasswordValid) {
      return res.status(403).json({ message: "La contraseña actual no es válida" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      user.id,
    ]);

    await pool.query(
      "UPDATE password_reset_tokens SET consumed_at = NOW() WHERE user_id = $1",
      [user.id]
    );

    await sendEmailIfEnabled({
      to: user.email,
      subject: "Contraseña actualizada",
      text: `Hola ${user.username},

Tu contraseña ha sido modificada correctamente.
Si no reconoces este cambio, contacta a soporte de inmediato.

Saludos,
Administración`,
    });

    res.status(200).json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error("Error al cambiar la contraseña:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

router.post("/password-reset/request", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "El campo 'email' es obligatorio." });
  }

  try {
    await ensurePasswordResetTable();

    const user = await getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(200).json({
        message:
          "Si el correo existe en el sistema, se enviarán instrucciones para restablecer la contraseña.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(resetToken, 12);
    await upsertPasswordResetToken(user.id, tokenHash);

    const resetLink = `${process.env.FRONTEND_RESET_URL || "http://localhost:3000/reset-password"}?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    await sendEmailIfEnabled({
      to: user.email,
      subject: "Solicitud de restablecimiento de contraseña",
      text: `Hola ${user.username},

Hemos recibido una solicitud para restablecer tu contraseña.
Si no solicitaste este cambio, ignora este mensaje.

Para continuar, visita el siguiente enlace (válido por ${PASSWORD_RESET_TTL} minutos):
${resetLink}

Saludos,
Administración`,
    });

    res.status(200).json({
      message:
        "Si el correo existe en el sistema, se enviarán instrucciones para restablecer la contraseña.",
    });
  } catch (error) {
    console.error("Error al solicitar restablecimiento de contraseña:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

router.post("/password-reset/confirm", async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({
      message: "Los campos 'email', 'token' y 'newPassword' son obligatorios.",
    });
  }

  const { isValid } = validatePasswordStrength(newPassword);
  if (!isValid) {
    return res.status(400).json({
      message: describePasswordPolicy(),
    });
  }

  try {
    const user = await getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(400).json({ message: "Token inválido o expirado" });
    }

    await ensurePasswordResetTable();

    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [user.id]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) {
      return res.status(400).json({ message: "Token inválido o expirado" });
    }

    const isTokenValid = await bcrypt.compare(token, tokenRow.token_hash);
    if (!isTokenValid) {
      return res.status(400).json({ message: "Token inválido o expirado" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query("BEGIN");
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      user.id,
    ]);
    await pool.query(
      "UPDATE password_reset_tokens SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [tokenRow.id]
    );
    await pool.query("COMMIT");

    await sendEmailIfEnabled({
      to: user.email,
      subject: "Contraseña restablecida",
      text: `Hola ${user.username},

Tu contraseña fue restablecida correctamente.
Si no solicitaste este cambio, comunícate con soporte de inmediato.

Saludos,
Administración`,
    });

    res.status(200).json({ message: "La contraseña fue restablecida correctamente" });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("Error al confirmar restablecimiento de contraseña:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Borrar múltiples usuarios y sus solicitudes antes
router.delete("/", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ message: "Se requiere array de IDs." });
  }

  try {
    await pool.query("BEGIN");

    // 1) Eliminar requests asociadas
    await pool.query(
      "DELETE FROM requests WHERE user_id = ANY($1::int[])",
      [ids]
    );

    // 2) Eliminar usuarios
    await pool.query(
      "DELETE FROM users WHERE id = ANY($1::int[])",
      [ids]
    );

    // 3) (Opcional) Reordenar IDs como ya tenías
    await pool.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
        FROM users
      )
      UPDATE users u
      SET id = o.new_id
      FROM ordered o
      WHERE u.id = o.id;
    `);
    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('users','id'),
        (SELECT COALESCE(MAX(id),0) FROM users) + 1,
        false
      );
    `);

    await pool.query("COMMIT");
    res.json({ message: "Usuarios y solicitudes eliminados correctamente." });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error DELETE /api/users:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
