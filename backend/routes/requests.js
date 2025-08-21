// backend/routes/requests.js
const express    = require("express");
const { GoogleGenAI } = require("@google/genai");      // SDK unificado
const pool       = require("../db");
const removeMd   = require("remove-markdown");
const fs         = require("fs");
const fsp        = require("fs").promises;
const path       = require("path");
require("dotenv").config();

const router = express.Router();

// Regex para limpiar marcadores de citación
const CITATION_REGEX = /:contentReference\[oaicite:\d+\]\{index=\d+\}/g;
function sanitize(text) {
  let clean = text.replace(CITATION_REGEX, "");
  clean = removeMd(clean);
  return clean.trim();
}

// Inicializar cliente GenAI 
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Endpoint /chatbot
router.post("/chatbot", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Consulta vacía" });

  try {
    // 1) Obtener contexto :contentReference[oaicite:4]{index=4}
    let docs = await pool.query(
      `SELECT content
         FROM documents
        WHERE content ILIKE $1
     ORDER BY similarity(title,$2) DESC
        LIMIT 3`,
      [`%${query}%`, query]
    );
    
    if (docs.rows.length === 0) {
      // Fallback: tomar los 3 documentos más recientes sin filtrar
      docs = await pool.query(
        `SELECT content
           FROM documents
       ORDER BY upload_date DESC
          LIMIT 3`
      );
    }
    const context = docs.rows.length
      ? docs.rows.map((d,i) => `[Doc ${i+1}]: ${d.content}`).join("\n\n")
      : "No hay documentos relevantes.";

    console.log("📚 Contexto:", context.slice(0,500));

    // 2) Construir prompt
    const instruction = `
Eres un chatbot. Usa solo la información del contexto para responder a las preguntas del usuario.
Contexto: ${context}
Si la pregunta no está relacionada con el contexto, exceptuando por un saludo para poder guíar al usuario algunas de la sugerencia de un resolución aleatoria, responde que solo puedes responder preguntas relacionadas con el contexto.
Responde de forma concisa y clara.`;

  const inputs = `${instruction}\nTexto: ${context}\nUsuario: ${query}\nAsistente:`;
  console.log("📝 Prompt:", inputs.slice(0,300));

  // 3) Llamada a Gemini con SDK correcto y variable 'inputs' 
  const resp = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: inputs });
    const raw = resp.text || "";
  if (!raw.trim()) {
    console.warn("⚠️ Gemini devolvió texto vacío, usando mensaje por defecto");
    return res.json({ response: "No pude generar una respuesta. Intenta de nuevo." });
  }

  // 4) Sanitizar y loguear 
  const aiResponse = sanitize(raw);
  console.log("🤖 Respuesta:", aiResponse);

  // 5) Guardar en BD
  await pool.query(
    `INSERT INTO requests (user_id, query, response, created_at)
    VALUES ($1,$2,$3,NOW())`,
    [1, query, aiResponse]
  );
  console.log("💾 Guardado en BD");

  return res.json({ response: aiResponse });

  } catch (err) {
  console.error("❌ Error en /chatbot:", err);
  return res.status(500).json({ error: err.message || "Error de Consulta" });
  }
});

// Endpoint para registrar evaluaciones en CSV
router.post("/log", async (req, res) => {
  const logFile = path.join(__dirname, "..", "chatbot_logs.csv"); // Redundant, will be declared again
  const headers = [
    "case_id",
    "fecha",
    "rol_usuario",
    "pregunta_textual",
    "referencia_esperada_o_fuente",
    "respuesta_chatbot",
    "juicio_correctitud",
    "tiempo_respuesta_ms",
    "tipo_error",
    "observaciones",
  ];

  try {
    // 1) Intentar CSV
    const logDir = path.join(__dirname, "..", "logs");
    await fsp.mkdir(logDir, { recursive: true });               // asegura carpeta
    const csvLogFile = path.join(logDir, "chatbot_logs.csv"); // Renamed to avoid confusion

    // crear encabezados si no existe
    try { 
      await fsp.access(csvLogFile); 
      console.log("CSV log file exists."); // Added log
    } 
    catch (accessErr) { 
      if (accessErr.code === 'ENOENT') { // File does not exist
        await fsp.writeFile(csvLogFile, headers.join(",") + "\n"); 
        console.log("CSV log file created with headers."); // Added log
      } else {
        console.error("❌ CSV access/write header failed unexpectedly:", accessErr.message, accessErr.stack); // More detailed error
        throw accessErr; // Re-throw to fall back to DB
      }
    }

    const b = req.body || {};
    const line = headers
      .map((h) =>
        `"${String(b[h] ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`
      )
      .join(",");

    await fsp.appendFile(csvLogFile, line + "\n");
    console.log("✅ CSV log successfully written."); // Added log
    return res.json({ success: true, storage: "csv" });

  } catch (csvErr) {
    console.error("❌ CSV log failed:", csvErr.code, csvErr.message, csvErr.stack); // More detailed error

    // 2) Fallback a BD
    try {
      const q = `
        INSERT INTO evaluation_logs
        (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente,
         respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `;
      const b = req.body || {};
      const vals = [
        b.case_id ?? null,
        b.fecha ? new Date(b.fecha) : new Date(),
        b.rol_usuario ?? "usuario",
        b.pregunta_textual ?? "",
        b.referencia_esperada_o_fuente ?? "",
        b.respuesta_chatbot ?? "",
        b.juicio_correctitud ?? null,
        Number.isFinite(+b.tiempo_respuesta_ms) ? +b.tiempo_respuesta_ms : null,
        b.tipo_error ?? "",
        b.observaciones ?? ""
      ];
      const { rows } = await pool.query(q, vals);
      console.log("✅ DB fallback log successfully written."); // Added log
      return res.json({ success: true, storage: "db_fallback", id: rows[0].id });
    } catch (dbErr) {
      console.error("❌ DB fallback failed:", dbErr.message, dbErr.stack); // More detailed error
      // Evitar que un fallo al persistir el log genere un error 500 visible para el usuario
      // Responder con éxito=false pero sin estatus de error para que la plataforma no "caiga"
      return res.json({ success: false, error: "No se pudo persistir el log", detail: dbErr.message });
    }
  }
});

// Endpoint para guardar evaluaciones en la base de datos
router.post("/log/db", async (req, res) => {
  try {
    const q = `
      INSERT INTO evaluation_logs
      (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente,
       respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`;
    const b = req.body || {};
    const vals = [
      b.case_id ?? null,
      b.fecha ? new Date(b.fecha) : new Date(),
      b.rol_usuario ?? 'usuario',
      b.pregunta_textual ?? '',
      b.referencia_esperada_o_fuente ?? '',
      b.respuesta_chatbot ?? '',
      b.juicio_correctitud ?? null,
      Number.isFinite(+b.tiempo_respuesta_ms) ? +b.tiempo_respuesta_ms : null,
      b.tipo_error ?? '',
      b.observaciones ?? ''
    ];
    const { rows } = await pool.query(q, vals);
    return res.json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error("❌ Error guardando log en DB:", err);
    return res.status(500).json({ error: "No se pudo guardar log en DB" });
  }
});

module.exports = router;