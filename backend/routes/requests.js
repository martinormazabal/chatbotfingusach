//backend/routes/requests.js
const express = require("express");
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require("@google/genai");
const pool = require("../db");
const removeMd = require("remove-markdown");
const fsp = require("fs").promises;
const path = require("path");

const router = express.Router();

// Initialize GenAI client
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not configured");
}
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

const generationConfig = {
  temperature: 0.2,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

async function runChat({ query, contextBlocks, history }) {
  // Construye historial para Gemini (user/model). Manténlo corto (máx. 6–8 turnos previos).
  const trimmedHistory = (history || []).slice(-8).map(h => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }]
  }));

  const model = genAI.getGenerativeModel({
    model: "gemini-1.0-pro",
    generationConfig,
    safetySettings
  });

  const contextText = contextBlocks.length
    ? contextBlocks.map((b, i) => `[#${i+1}] ${b.title}\n${b.excerpt}`).join("\n\n")
    : "No hay documentos relevantes.";

  // Si el contexto es débil, no niegues de inmediato: da definición mínima + orienta a fuentes.
  const guidance = contextBlocks.length
    ? `Responde SOLO con lo que esté sustentado en el contexto. Si falta un detalle, indícalo y orienta con la fuente citada.`
    : `El contexto es débil. Entrega una definición breve y neutra del concepto consultado SIN inventar normativa específica, y orienta con enlaces oficiales (si se proporcionan).`;

  const systemPreamble = `
Eres un asistente de normativa de la Universidad de Santiago de Chile (USACH).
Usa únicamente el CONTEXTO para emitir afirmaciones normativas.
${guidance}
Si no hay evidencia textual, dilo y ofrece una ruta de verificación.
Responde en español, claro y breve. Incluye “Pasos sugeridos” cuando aplique.
  `.trim();

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: systemPreamble }] },
      { role: "model", parts: [{ text: "OK" }] },
      ...trimmedHistory
    ],
    generationConfig,
    safetySettings
  });

  const prompt = `CONTEXTO:\n${contextText}\n\nPREGUNTA:\n${query}`;
  const result = await chat.sendMessage(prompt);
  return result.response.text();
}

// Endpoint /chatbot
router.post("/chatbot", async (req, res) => {
  const { query, history = [] } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Empty query" });

  try {
    // 1) Recuperación
    const { docs, mode } = await retrieveContext(query);

    // 2) Normaliza fuentes (URL usable)
    const origin = process.env.BACKEND_ORIGIN || "http://localhost:5000";
    const sources = docs.map(d => ({
      id: d.id,
      title: d.title || "Documento",
      // si hay source_url úsala; si no, sirve el PDF local
      url: d.source_url || `${origin}/uploads/${d.filename}`,
      page: null
    }));

    // 3) Arma bloques de contexto para el prompt
    const contextBlocks = docs.map(d => ({
      title: d.title || "Documento",
      excerpt: d.excerpt || ""
    }));

    // 4) Llama a Gemini con historial
    const aiResponse = await runChat({ query, contextBlocks, history });

    // 5) Guarda en BD (opcional guarda el modo de recuperación)
    await pool.query(
      `INSERT INTO requests (user_id, query, response, context, created_at, model)
       VALUES ($1,$2,$3,$4,NOW(),$5)`,
      [1, query, aiResponse, contextBlocks.map((b,i)=>`[#${i+1}] ${b.title}`).join(" | "), "gemini-1.0-pro/"+mode]
    );

    return res.json({ answer: aiResponse, sources });

  } catch (err) {
    console.error("❌ /chatbot:", err);
    return res.status(500).json({ error: err.message || "Query Error" });
  }
});

// Endpoint to register evaluations
router.post("/log", async (req, res) => {
  const logDir = path.join(__dirname, "..", "logs");
  const csvLogFile = path.join(logDir, "chatbot_logs.csv");
  const headers = [
    "case_id", "fecha", "rol_usuario", "pregunta_textual", "referencia_esperada_o_fuente",
    "respuesta_chatbot", "juicio_correctitud", "tiempo_respuesta_ms", "tipo_error", "observaciones",
  ];

  try {
    await fsp.mkdir(logDir, { recursive: true });

    try {
      await fsp.access(csvLogFile);
    } catch (accessErr) {
      if (accessErr.code === "ENOENT") {
        await fsp.writeFile(csvLogFile, headers.join(",") + "\n");
      } else {
        throw accessErr;
      }
    }

    const b = req.body || {};
    const line = headers
      .map((h) => `\"${String(b[h] ?? "").replace(/"/g, '').replace(/\n/g, " ")}\"`)
      .join(",");

    await fsp.appendFile(csvLogFile, line + "\n");
    return res.json({ success: true, storage: "csv" });
  } catch (csvErr) {
    console.error("❌ CSV log failed:", csvErr);
    // Fallback to DB
    try {
      const q = `
        INSERT INTO evaluation_logs
        (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente,
         respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`;
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
        b.observaciones ?? "",
      ];
      const { rows } = await pool.query(q, vals);
      return res.json({ success: true, storage: "db_fallback", id: rows[0].id });
    } catch (dbErr) {
      console.error("❌ DB fallback failed:", dbErr);
      return res.json({ success: false, error: "Could not persist log", detail: dbErr.message });
    }
  }
});

async function retrieveContext(query) {
  // 1) Full text (español + unaccent)
  const ft = await pool.query(`
    SELECT id, title, filename, source_url,
           ts_rank(to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))),
                   websearch_to_tsquery('spanish', unaccent($1))) AS score,
           substring(content for 1500) AS excerpt
    FROM documents
    WHERE to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,'')))
          @@ websearch_to_tsquery('spanish', unaccent($1))
    ORDER BY score DESC
    LIMIT 3
  `, [query]);

  if (ft.rows.length > 0) return { docs: ft.rows, mode: 'fulltext' };

  // 2) Fallback: trigram por título/contenido
  const tg = await pool.query(`
    SELECT id, title, filename, source_url,
           greatest(similarity(title, $1), similarity(content, $1)) AS score,
           substring(content for 1500) AS excerpt
    FROM documents
    ORDER BY score DESC
    LIMIT 3
  `, [query]);
  if (tg.rows.length > 0 && (tg.rows[0].score ?? 0) > 0.1) return { docs: tg.rows, mode: 'trigram' };

  // 3) Fallback final: más recientes
  const recent = await pool.query(`
    SELECT id, title, filename, source_url,
           0 AS score,
           substring(content for 1500) AS excerpt
    FROM documents
    ORDER BY upload_date DESC
    LIMIT 3
  `);
  return { docs: recent.rows, mode: 'recent' };
}

module.exports = router;