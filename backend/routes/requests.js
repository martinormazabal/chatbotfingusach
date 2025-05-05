// backend/routes/requests.js

const express    = require("express");
const { GoogleGenAI } = require("@google/genai");      // SDK unificado
const pool       = require("../db");
const removeMd   = require("remove-markdown");
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

// Función para dividir texto en chunks
function splitIntoChunks(text, maxLen = 1500) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    const nl = text.lastIndexOf("\n", end);
    if (nl > start) end = nl;
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

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
Si la pregunta no está relacionada con el contexto, responde que solo puedes responder preguntas relacionadas con el contexto.
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

module.exports = router;