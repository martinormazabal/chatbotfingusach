//backend/routes/requests.js
const express = require("express");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const pool = require("../db");
const removeMd = require("remove-markdown");
const fsp = require("fs").promises;
const path = require("path");
const pdfParse = require("pdf-parse");

const CITATION_REGEX = /:contentReference\[\w+:\d+\]\{index=\d+\}/g;

const uploadDir = path.join(__dirname, "..", "uploads");
const docCachePath = path.join(uploadDir, "documents-cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let inMemoryDocCache = [];
let lastCacheSync = 0;

function sanitizeText(text = "") {
  if (typeof text !== "string") return "";
  return removeMd(text.replace(CITATION_REGEX, "")).trim();
}

function formatExcerpt(raw = "") {
  const clean = sanitizeText(raw).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 400 ? `${clean.slice(0, 397)}…` : clean;
}

function normalizeDocForCache(row = {}) {
  const content = sanitizeText(row.content || "");
  if (!content) return null;

  return {
    id: row.id,
    title: row.title || "Documento",
    filename: row.filename || null,
    source_url: row.source_url || null,
    content,
    contentLower: content.toLowerCase(),
  };
}

async function refreshDocumentCacheFromDb(force = false) {
  if (!force && Date.now() - lastCacheSync < CACHE_TTL_MS && inMemoryDocCache.length) {
    return inMemoryDocCache;
  }

  const { rows } = await pool.query(
    `SELECT id, title, filename, source_url, content
       FROM documents
       ORDER BY upload_date DESC
       LIMIT 200`
  );

  const normalized = rows
    .map(normalizeDocForCache)
    .filter(Boolean);

  inMemoryDocCache = normalized;
  lastCacheSync = Date.now();

  try {
    await fsp.mkdir(uploadDir, { recursive: true });
    await fsp.writeFile(
      docCachePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), docs: normalized }),
      "utf8"
    );
  } catch (cacheErr) {
    console.warn("⚠️  No se pudo actualizar el caché local de documentos:", cacheErr.message);
  }

  return inMemoryDocCache;
}

async function loadDocumentsFromCache() {
  if (inMemoryDocCache.length) return inMemoryDocCache;

  try {
    const raw = await fsp.readFile(docCachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.docs)) {
      inMemoryDocCache = parsed.docs
        .map((doc) => ({
          ...doc,
          content: sanitizeText(doc.content || ""),
          contentLower: sanitizeText(doc.content || "").toLowerCase(),
        }))
        .filter((doc) => doc.content);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("⚠️  No se pudo leer el caché de documentos:", err.message);
    }
    inMemoryDocCache = [];
  }

  return inMemoryDocCache;
}

function buildExcerptFromContent(content = "", queryTokens = []) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  let matchLength = 0;

  for (const token of queryTokens) {
    if (!token) continue;
    const idx = lower.indexOf(token);
    if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
      matchIndex = idx;
      matchLength = token.length;
    }
  }

  if (matchIndex === -1) {
    return normalized.slice(0, 400);
  }

  const start = Math.max(0, matchIndex - 200);
  const end = Math.min(normalized.length, matchIndex + matchLength + 200);
  return normalized.slice(start, end);
}

async function retrieveFromCache(query = "") {
  const docs = await loadDocumentsFromCache();
  if (!docs.length) return [];

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  return docs
    .map((doc) => {
      let score = 0;
      for (const token of tokens) {
        if (!token) continue;
        if (doc.title.toLowerCase().includes(token)) score += 3;
        if (doc.contentLower.includes(token)) {
          const occurrences = doc.contentLower.split(token).length - 1;
          score += Math.min(occurrences, 5);
        }
      }

      const excerpt = buildExcerptFromContent(doc.content, tokens);

      return {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        source_url: doc.source_url || null,
        excerpt,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

const router = express.Router();

// Initialize GenAI client
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not configured");
}
const GEMINI_MODEL = "gemini-2.0-flash";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const MODEL_FALLBACKS = Array.from(
  new Set(
    [
      GEMINI_MODEL,
      "gemini-2.0-pro",
      "gemini-2.0-flash-lite",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ].filter(Boolean)
  )
);

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

async function tryChatWithModel(modelName, { query, contextBlocks, history }) {
  // Construye historial para Gemini (user/model). Manténlo corto (máx. 6–8 turnos previos).
  const trimmedHistory = (history || []).slice(-8).map(h => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }]
  }));

  const model = genAI.getGenerativeModel({
    model: modelName,
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
  const text = result?.response?.text?.();
  if (!text) {
    throw new Error("El modelo no entregó contenido utilizable");
  }

  return { text, modelName };
}

function isModelNotFoundError(err) {
  if (!err) return false;
  if (err.status === 404) return true;
  const message = String(err.message || err.toString() || "").toLowerCase();
  return message.includes("not found") || message.includes("no model") || message.includes("unavailable");
}

async function runChat(options) {
  if (!genAI) {
    throw new Error(
      "El servicio de Gemini no está configurado. Define GEMINI_API_KEY en el backend."
    );
  }
  let lastErr = null;

  for (const candidate of MODEL_FALLBACKS) {
    if (!candidate) continue;

    try {
      const response = await tryChatWithModel(candidate, options);
      if (candidate !== GEMINI_MODEL) {
        console.info(`ℹ️  Gemini respondió con el modelo alternativo "${candidate}".`);
      }
      return response;
    } catch (err) {
      if (!isModelNotFoundError(err)) {
        throw err;
      }

      lastErr = err;
      console.warn(
        `⚠️  El modelo "${candidate}" no está disponible, intentando con otra versión...`
      );
    }
  }

  if (lastErr) {
    throw lastErr;
  }

  throw new Error("No se pudo inicializar ningún modelo de Gemini disponible");
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
    const appOrigin = process.env.APP_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
    const sources = docs.map(d => {
      const fallbackUrl = d.filename ? `${origin}/uploads/${d.filename}` : null;
      const documentRoute = d.id ? `${appOrigin.replace(/\/$/, "")}/documents/${d.id}` : null;
      return {
        id: d.id,
        title: d.title || "Documento",
        // si hay source_url úsala; si no, intenta servir el PDF local si existe; como último recurso apunta al detalle interno
        url: d.source_url || fallbackUrl || documentRoute,
        page: null,
        excerpt: formatExcerpt(d.excerpt),
      };
    });

    // 3) Arma bloques de contexto para el prompt
    const contextBlocks = docs.map(d => ({
      title: d.title || "Documento",
      excerpt: formatExcerpt(d.excerpt) || ""
    }));

    // 4) Llama a Gemini con historial
    const { text: aiResponse, modelName: resolvedModel } = await runChat({
      query,
      contextBlocks,
      history,
    });

    // 5) Guarda en BD (opcional guarda el modo de recuperación)
    try {
      await pool.query(
        `INSERT INTO requests (user_id, query, response, context, created_at, model)
         VALUES ($1,$2,$3,$4,NOW(),$5)`,
        [
          1,
          query,
          aiResponse,
          contextBlocks.map((b, i) => `[#${i + 1}] ${b.title}`).join(" | "),
          `${resolvedModel || GEMINI_MODEL}/${mode}`,
        ]
      );
    } catch (persistErr) {
      console.warn("⚠️  No se pudo registrar la solicitud en la BD:", persistErr.message);
    }

    return res.json({ answer: aiResponse, sources, model: resolvedModel || GEMINI_MODEL });

  } catch (err) {
    console.error("❌ /chatbot:", err);
    const friendly =
      err.status === 404
        ? "El modelo configurado no está disponible. Verifica el nombre en GEMINI_MODEL o consulta la consola de Google AI Studio."
        : err.message || "Query Error";
    return res.status(500).json({ error: friendly });
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
  try {
    await refreshDocumentCacheFromDb();

    // 1) Full text (español + unaccent)
    const ft = await pool.query(`
      SELECT id, title, filename, NULL::text AS source_url,
             ts_rank(to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))),
                     websearch_to_tsquery('spanish', unaccent($1))) AS score,
             substring(content for 1500) AS excerpt
      FROM documents
      WHERE to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,'')))
            @@ websearch_to_tsquery('spanish', unaccent($1))
      ORDER BY score DESC
      LIMIT 3
    `, [query]);

    if (ft.rows.length > 0) return { docs: ft.rows, mode: "fulltext" };

    // 2) Fallback: trigram por título/contenido
    const tg = await pool.query(`
      SELECT id, title, filename,
        COALESCE(source_url, NULL)::text AS source_url,
        greatest(similarity(title, $1), similarity(content, $1)) AS score,
        substring(content for 1500) AS excerpt
      FROM documents
      ORDER BY score DESC
      LIMIT 3;
    `, [query]);
    if (tg.rows.length > 0 && (tg.rows[0].score ?? 0) > 0.1) return { docs: tg.rows, mode: "trigram" };

    // 3) Fallback final: más recientes
    const recent = await pool.query(`
      SELECT id, title, filename,
        COALESCE(source_url, NULL)::text AS source_url,
        0 AS score,
        substring(content for 1500) AS excerpt
      FROM documents
      ORDER BY upload_date DESC
      LIMIT 3;
    `);
    if (recent.rows.length > 0) return { docs: recent.rows, mode: "recent" };
  } catch (dbErr) {
    console.warn("⚠️  Búsqueda en BD falló, se usará el almacenamiento local:", dbErr.message);
  }

  const fallbackDocs = await retrieveFromCache(query);
  return { docs: fallbackDocs, mode: fallbackDocs.length ? "cache" : "cache-empty" };
}

module.exports = router;