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

function detectReferences(text = "") {
  const refPatterns = [
    /art[íi]culo\s+\d+[\w-]*/gi,
    /art\.\s*\d+/gi,
    /cap[íi]tulo\s+[\w-]+/gi,
    /secci[óo]n\s+[\w-]+/gi,
  ];

  const refs = new Set();
  for (const pattern of refPatterns) {
    const matches = text.match(pattern) || [];
    matches.forEach((m) => refs.add(m.trim()));
  }

  return Array.from(refs);
}

function formatExcerpt(raw = "") {
  const clean = sanitizeText(raw).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 400 ? `${clean.slice(0, 397)}…` : clean;
}

// Funciones de cache (sin cambios)
async function refreshDocumentCacheFromDb(force = false) { 
    if (!force && Date.now() - lastCacheSync < CACHE_TTL_MS && inMemoryDocCache.length) {
        return inMemoryDocCache;
    }
    const { rows } = await pool.query(`SELECT id, title, filename, source_url, content FROM documents ORDER BY upload_date DESC LIMIT 200`);
    const normalized = rows.map(normalizeDocForCache).filter(Boolean);
    inMemoryDocCache = normalized;
    lastCacheSync = Date.now();
    try {
        await fsp.mkdir(uploadDir, { recursive: true });
        await fsp.writeFile(docCachePath, JSON.stringify({ updatedAt: new Date().toISOString(), docs: normalized }), "utf8");
    } catch (cacheErr) {
        console.warn("⚠️  No se pudo actualizar el caché local de documentos:", cacheErr.message);
    }
    return inMemoryDocCache;
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


async function loadDocumentsFromCache() { 
    if (inMemoryDocCache.length) return inMemoryDocCache;
    try {
        const raw = await fsp.readFile(docCachePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.docs)) {
            inMemoryDocCache = parsed.docs.map(doc => ({ ...doc, content: sanitizeText(doc.content || ""), contentLower: sanitizeText(doc.content || "").toLowerCase() })).filter(doc => doc.content);
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

function formatContextForPrompt(blocks = []) {
  if (!Array.isArray(blocks) || !blocks.length) return "No hay documentos relevantes.";

  return blocks
    .map((b, i) => {
      const refs = b.references?.length ? `\nReferencias: ${b.references.join(", ")}` : "";
      return `[#${i + 1}] ${b.title}\n${b.excerpt || ""}${refs}`;
    })
    .join("\n\n");
}

function buildContextBlocks(docs = []) {
  return (docs || []).map((d) => {
    const excerpt = formatExcerpt(d.excerpt) || "";
    return {
      title: d.title || "Documento",
      excerpt,
      references: detectReferences(excerpt || ""),
    };
  });
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

// --- INICIO: LÓGICA DE GEMINI REFORZADA ---

// 3.1) Crea el cliente SOLO si hay API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
let genAI = null;
if (GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  } catch (e) {
    console.error('⚠️  No se pudo inicializar GoogleGenerativeAI:', e.message);
    genAI = null;
  }
} else {
  console.warn("⚠️  GEMINI_API_KEY no está configurada. Operando en modo sin IA.");
}

// 3.2) Lista de modelos viables (sólo los que sabes que tu cuenta soporta)
// (configurable por env GEMINI_MODELS="modelo1,modelo2")
const DEFAULT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-pro-exp",
];
const MODEL_FALLBACKS = (process.env.GEMINI_MODELS || "")
  .split(/[,\s]+/)
  .filter(Boolean)
  .concat(DEFAULT_MODELS)
  .filter(Boolean)
  .filter((m, idx, arr) => arr.indexOf(m) === idx);

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

function isModelNotFoundError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return err?.status === 404 || msg.includes("not found") || msg.includes("no model") || msg.includes("unavailable");
}

function isRetryableGeminiError(err) {
  if (!err) return false;
  if (err.retryable) return true;
  if (isModelNotFoundError(err)) return true;
  const status = Number(err?.status || err?.code);
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    err?.name === "AbortError" ||
    msg.includes("timeout") ||
    msg.includes("temporarily") ||
    msg.includes("overloaded") ||
    msg.includes("try again") ||
    msg.includes("unavailable") ||
    msg.includes("reset")
  );
}

async function ensureContextBlocks(query = "", providedBlocks = []) {
  if (Array.isArray(providedBlocks) && providedBlocks.length) return providedBlocks;

  try {
    const { docs } = await retrieveContext(query);
    if (Array.isArray(docs) && docs.length) {
      console.info("ℹ️  Contexto reconstruido desde la base de datos para la conversación.");
      return buildContextBlocks(docs);
    }
  } catch (ctxErr) {
    console.warn("⚠️  No se pudo regenerar el contexto antes de invocar Gemini:", ctxErr.message);
  }

  return Array.isArray(providedBlocks) ? providedBlocks : [];
}

// 3.3) Llamada protegida a Gemini con timeout
async function tryChatWithModel(modelName, { query, contextBlocks, history } = {}) {
  if (!genAI) {
    return { text: "⚠️ Servicio IA deshabilitado. Falta GEMINI_API_KEY.", modelName: "offline" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s
  try {
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig, safetySettings });

    const trimmedHistory = (history || []).slice(-8).map(h => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text }]
    }));

    const contextText = formatContextForPrompt(contextBlocks);

    const guidance = contextBlocks?.length
      ? "Responde SOLO con lo sustentado en el contexto. Aunque el detalle sea breve, afirma lo que sí está respaldado y cita la fuente. Si falta algo, indícalo sin descartar lo que ya existe."
      : "El contexto es débil. Da una definición breve, sin inventar normativa, y orienta a fuentes oficiales.";

      const responseFormat = `Formato de respuesta (respeta exactamente los encabezados):
      - Resumen: limita a 2-3 frases con la mejor respuesta posible según el contexto.
      - Fundamento normativo: cita artículo/sección y documento fuente (ej: Artículo 5, Reglamento de Convivencia USACH). Si no hay número explícito, usa la referencia textual disponible.
      - Pasos sugeridos: 2-4 pasos accionables para el estudiante.
      - Documento y referencia: lista breve por cada fuente usada en la respuesta con el formato "Documento: <título> | Referencia: <artículo/sección o descripción del extracto>".`;
    
    const systemPreamble = `
Eres un asistente de normativa de la Universidad de Santiago de Chile (USACH).
Usa únicamente el CONTEXTO para afirmaciones normativas.
${guidance}
Si no hay evidencia textual, dilo y ofrece ruta de verificación.
Responde en español, claro y breve.

${responseFormat}
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

    // Nota: El SDK de Node no soporta `signal` en `sendMessage`. Se maneja con el timeout.
    const prompt = `Pregunta del estudiante: ${query}\n\nContexto relevante:\n${contextText}\n\nRecuerda mantener el formato indicado.`;
    const result = await chat.sendMessage(prompt);
    const text = typeof result?.response?.text === "function" ? result.response.text() : "";
    return { text: text?.trim() || "No se obtuvo texto del modelo.", modelName };
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error("⌛ El modelo tardó demasiado en responder.");
      timeoutErr.retryable = true;
      timeoutErr.modelName = modelName;
      throw timeoutErr;
    }
    err.retryable = err.retryable ?? isModelNotFoundError(err);
    err.modelName = modelName;
    throw err; // se maneja en runChat
  } finally {
    clearTimeout(timeout);
  }
}

async function runChat(options = {}) {
  // Modo sin IA (no te mato el backend nunca)
  if (!genAI) {
    return {
      text: "El servicio IA no está disponible (falta configuración). Aún así, puedes revisar las fuentes listadas.",
      modelName: "offline"
    };
  }

  const { query = "", history = [] } = options;
  const contextBlocks = await ensureContextBlocks(query, options.contextBlocks);

  let lastErr = null;
  const attempts = [];
  for (const candidate of MODEL_FALLBACKS) {
    try {
      const r = await tryChatWithModel(candidate, { query, contextBlocks, history });
      if (candidate !== MODEL_FALLBACKS[0]) {
        console.info(`ℹ️  Respuesta usando modelo alternativo: ${candidate}`);
      }
      return r;
    } catch (err) {
      lastErr = err;
      attempts.push({ model: candidate, message: err?.message });
      const retryable = isRetryableGeminiError(err);
      const reason = err?.message || "Error desconocido";
      const logFn = isModelNotFoundError(err) ? console.warn : console.error;
      logFn(`⚠️  Error con modelo ${candidate}: ${reason}. ${retryable ? "Probando siguiente fallback..." : "Se continuará con otros modelos para no interrumpir la respuesta."}`);
      // Se sigue probando con el siguiente modelo aunque el error no sea “retriable” para mantener la rotación.
    }
  }
  // Si ninguno funcionó, devuelve mensaje claro (no throw → no 502)
  const attemptedList = attempts.map((a) => a.model).join(", ") || "los modelos configurados";
  const lastMessage = lastErr?.message ? ` Detalle: ${lastErr.message}` : "";
  return {
    text: `No se encontró un modelo disponible en tu cuenta después de probar ${attemptedList}.${lastMessage}`.trim(),
    modelName: "no-models"
  };
}


// --- FIN: LÓGICA DE GEMINI REFORZADA ---

// Endpoint /chatbot
router.post("/chatbot", async (req, res) => {
  const { query, history = [] } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Empty query" });

  const startedAt = Date.now();

  try {
    const { docs, mode } = await retrieveContext(query);

    if (!docs.length) {
      const fallback = {
        answer:
          "Solo puedo responder consultas sobre normativa y procedimientos de la USACH/FING. No encuentro fuentes para esta pregunta.",
        sources: [],
        model: "guardrail/offline",
      };
      try {
        await pool.query(
          `INSERT INTO evaluation_logs (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente, respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
           VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `${Date.now()}`,
            req.user?.role || null,
            query,
            "Sin contexto normativo localizado",
            fallback.answer,
            "Correcta",
            Date.now() - startedAt,
            "sin_fuentes",
            `modo=${mode}`,
          ]
        );
      } catch (logErr) {
        console.warn("⚠️  No se pudo registrar el log de evaluación (fallback):", logErr.message);
      }
      return res.json(fallback);
    }

    const origin = process.env.BACKEND_ORIGIN || "http://localhost:5000";
    const appOrigin = process.env.APP_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
    const sources = docs.map(d => ({
        id: d.id,
        title: d.title || "Documento",
        url: d.source_url || (d.filename ? `${origin}/uploads/${d.filename}` : null) || `${appOrigin.replace(/\/$/, "")}/documents/${d.id}`,
        page: null,
        excerpt: formatExcerpt(d.excerpt),
    }));

    const contextBlocks = buildContextBlocks(docs);

    const { text: aiResponse, modelName: resolvedModel } = await runChat({ query, contextBlocks, history });

    try {
      await pool.query(
        `INSERT INTO requests (user_id, query, response, context, created_at, model) VALUES ($1,$2,$3,$4,NOW(),$5)`,
        [1, query, aiResponse, contextBlocks.map((b, i) => `[#${i + 1}] ${b.title}`).join(" | "), `${resolvedModel || MODEL_FALLBACKS[0]}/${mode}`]
      );
    } catch (persistErr) {
      console.warn("⚠️  No se pudo registrar la solicitud en la BD:", persistErr.message);
    }
    try {
      await pool.query(
        `INSERT INTO evaluation_logs (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente, respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          `${Date.now()}`,
          req.user?.role || null,
          query,
          contextBlocks.map((b, i) => `[#${i + 1}] ${b.title}`).join(" | ") || null,
          aiResponse,
          docs.length ? "Correcta" : "Parcial",
          Date.now() - startedAt,
          docs.length ? null : "contexto_debil",
          `modo=${mode};modelo=${resolvedModel || MODEL_FALLBACKS[0]}`,
        ]
      );
    } catch (logErr) {
      console.warn("⚠️  No se pudo registrar el log de evaluación:", logErr.message);
    }

    return res.json({ answer: aiResponse, sources, model: resolvedModel || MODEL_FALLBACKS[0] });

  } catch (err) {
    console.error("❌ /chatbot:", err);
    return res.status(500).json({ error: err.message || "Query Error" });
  }
});

// Endpoint para registrar evaluaciones manuales desde el frontend
router.post("/log", async (req, res) => {
  const {
    case_id,
    rol_usuario,
    pregunta_textual,
    referencia_esperada_o_fuente,
    respuesta_chatbot,
    juicio_correctitud,
    tiempo_respuesta_ms,
    tipo_error,
    observaciones,
  } = req.body || {};

  try {
    const result = await pool.query(
      `INSERT INTO evaluation_logs (case_id, fecha, rol_usuario, pregunta_textual, referencia_esperada_o_fuente, respuesta_chatbot, juicio_correctitud, tiempo_respuesta_ms, tipo_error, observaciones)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        case_id || `${Date.now()}`,
        rol_usuario || req.user?.role || null,
        pregunta_textual || null,
        referencia_esperada_o_fuente || null,
        respuesta_chatbot || null,
        juicio_correctitud || null,
        tiempo_respuesta_ms || null,
        tipo_error || null,
        observaciones || null,
      ]
    );

    return res.status(201).json({ success: true, log: result.rows[0] });
  } catch (error) {
    console.error("❌ Error registrando evaluation_log:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/evaluation-logs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM evaluation_logs ORDER BY fecha DESC");
    return res.json(result.rows);
  } catch (error) {
    console.error("❌ Error obteniendo evaluation_logs:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function retrieveContext(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  try {
    await refreshDocumentCacheFromDb();
    const ft = await pool.query(`SELECT id, title, filename, COALESCE(source_url, NULL)::text AS source_url, ts_rank(to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))), websearch_to_tsquery('spanish', unaccent($1))) AS score, content FROM documents WHERE to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))) @@ websearch_to_tsquery('spanish', unaccent($1)) ORDER BY score DESC LIMIT 3`, [query]);
    if (ft.rows.length > 0) return { docs: ft.rows.map((row) => ({ ...row, excerpt: buildExcerptFromContent(row.content || "", tokens) })), mode: "fulltext" };

    const tg = await pool.query(`SELECT id, title, filename, COALESCE(source_url, NULL)::text AS source_url, greatest(similarity(title, $1), similarity(content, $1)) AS score, content FROM documents ORDER BY score DESC LIMIT 3;`, [query]);
    if (tg.rows.length > 0 && (tg.rows[0].score ?? 0) > 0.1) return { docs: tg.rows.map((row) => ({ ...row, excerpt: buildExcerptFromContent(row.content || "", tokens) })), mode: "trigram" };

    const recent = await pool.query(`SELECT id, title, filename, COALESCE(source_url, NULL)::text AS source_url, 0 AS score, content FROM documents ORDER BY upload_date DESC LIMIT 3;`);
    if (recent.rows.length > 0) return { docs: recent.rows.map((row) => ({ ...row, excerpt: buildExcerptFromContent(row.content || "", tokens) })), mode: "recent" };

  } catch (dbErr) {
    console.warn("⚠️  Búsqueda en BD falló, se usará el almacenamiento local:", dbErr.message);
  }

  const fallbackDocs = await retrieveFromCache(query);
  return { docs: fallbackDocs, mode: fallbackDocs.length ? "cache" : "cache-empty" };
}

module.exports = router;
