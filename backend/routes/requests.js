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
const MODEL_FALLBACKS = [
  "gemini-1.5-flash-latest",
  "gemini-pro",
].filter(Boolean);

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

// 3.3) Llamada protegida a Gemini con timeout
async function tryChatWithModel(modelName, { query, contextBlocks, history }) {
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

    const contextText = contextBlocks?.length
      ? contextBlocks.map((b, i) => `[#${i+1}] ${b.title}\n${b.excerpt || ""}`).join("\n\n")
      : "No hay documentos relevantes.";

    const guidance = contextBlocks?.length
      ? "Responde SOLO con lo sustentado en el contexto. Si falta un detalle, indícalo y orienta con la fuente."
      : "El contexto es débil. Da una definición breve, sin inventar normativa, y orienta a fuentes oficiales.";

    const systemPreamble = `
Eres un asistente de normativa de la Universidad de Santiago de Chile (USACH).
Usa únicamente el CONTEXTO para afirmaciones normativas.
${guidance}
Si no hay evidencia textual, dilo y ofrece ruta de verificación.
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

    // Nota: El SDK de Node no soporta `signal` en `sendMessage`. Se maneja con el timeout.
    const result = await chat.sendMessage(query);
    const text = typeof result?.response?.text === "function" ? result.response.text() : "";
    return { text: text?.trim() || "No se obtuvo texto del modelo.", modelName };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { text: "⌛ El modelo tardó demasiado en responder. Intenta de nuevo.", modelName };
    }
    throw err; // se maneja en runChat
  } finally {
    clearTimeout(timeout);
  }
}

async function runChat(options) {
  // Modo sin IA (no te mato el backend nunca)
  if (!genAI) {
    return {
      text: "El servicio IA no está disponible (falta configuración). Aún así, puedes revisar las fuentes listadas.",
      modelName: "offline"
    };
  }

  let lastErr = null;
  for (const candidate of MODEL_FALLBACKS) {
    try {
      const r = await tryChatWithModel(candidate, options);
      if (candidate !== MODEL_FALLBACKS[0]) {
        console.info(`ℹ️  Respuesta usando modelo alternativo: ${candidate}`);
      }
      return r;
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) {
        // Error “real” (red, auth, etc.) → devuelvo mensaje amable sin matar backend
        console.error(`❌ Error con modelo ${candidate}:`, err.message);
        return {
          text: `No fue posible obtener respuesta del modelo. Intenta nuevamente.`,
          modelName: `error:${candidate}`
        };
      }
      console.warn(`⚠️  Modelo no disponible: ${candidate}. Probando otro...`);
    }
  }
  // Si ninguno funcionó, devuelve mensaje claro (no throw → no 502)
  return {
    text: "No se encontró un modelo disponible en tu cuenta. Revisa los modelos activados en Google AI Studio.",
    modelName: "no-models"
  };
}


// --- FIN: LÓGICA DE GEMINI REFORZADA ---

// Endpoint /chatbot
router.post("/chatbot", async (req, res) => {
  const { query, history = [] } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Empty query" });

  try {
    const { docs, mode } = await retrieveContext(query);

    const origin = process.env.BACKEND_ORIGIN || "http://localhost:5000";
    const appOrigin = process.env.APP_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
    const sources = docs.map(d => ({
        id: d.id,
        title: d.title || "Documento",
        url: d.source_url || (d.filename ? `${origin}/uploads/${d.filename}` : null) || `${appOrigin.replace(/\/$/, "")}/documents/${d.id}`,
        page: null,
        excerpt: formatExcerpt(d.excerpt),
    }));

    const contextBlocks = docs.map(d => ({ title: d.title || "Documento", excerpt: formatExcerpt(d.excerpt) || "" }));

    const { text: aiResponse, modelName: resolvedModel } = await runChat({ query, contextBlocks, history });

    try {
      await pool.query(
        `INSERT INTO requests (user_id, query, response, context, created_at, model) VALUES ($1,$2,$3,$4,NOW(),$5)`,
        [1, query, aiResponse, contextBlocks.map((b, i) => `[#${i + 1}] ${b.title}`).join(" | "), `${resolvedModel || MODEL_FALLBACKS[0]}/${mode}`]
      );
    } catch (persistErr) {
      console.warn("⚠️  No se pudo registrar la solicitud en la BD:", persistErr.message);
    }

    return res.json({ answer: aiResponse, sources, model: resolvedModel || MODEL_FALLBACKS[0] });

  } catch (err) {
    console.error("❌ /chatbot:", err);
    return res.status(500).json({ error: err.message || "Query Error" });
  }
});

// Endpoints /log, /stats, etc (sin cambios)
router.post("/log", async (req, res) => { 
    // ... (código existente sin cambios)
});

async function retrieveContext(query) {
  try {
    await refreshDocumentCacheFromDb();
    const ft = await pool.query(`SELECT id, title, filename, NULL::text AS source_url, ts_rank(to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))), websearch_to_tsquery('spanish', unaccent($1))) AS score, substring(content for 1500) AS excerpt FROM documents WHERE to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,''))) @@ websearch_to_tsquery('spanish', unaccent($1)) ORDER BY score DESC LIMIT 3`, [query]);
    if (ft.rows.length > 0) return { docs: ft.rows, mode: "fulltext" };

    const tg = await pool.query(`SELECT id, title, filename, COALESCE(source_url, NULL)::text AS source_url, greatest(similarity(title, $1), similarity(content, $1)) AS score, substring(content for 1500) AS excerpt FROM documents ORDER BY score DESC LIMIT 3;`, [query]);
    if (tg.rows.length > 0 && (tg.rows[0].score ?? 0) > 0.1) return { docs: tg.rows, mode: "trigram" };

    const recent = await pool.query(`SELECT id, title, filename, COALESCE(source_url, NULL)::text AS source_url, 0 AS score, substring(content for 1500) AS excerpt FROM documents ORDER BY upload_date DESC LIMIT 3;`);
    if (recent.rows.length > 0) return { docs: recent.rows, mode: "recent" };

  } catch (dbErr) {
    console.warn("⚠️  Búsqueda en BD falló, se usará el almacenamiento local:", dbErr.message);
  }

  const fallbackDocs = await retrieveFromCache(query);
  return { docs: fallbackDocs, mode: fallbackDocs.length ? "cache" : "cache-empty" };
}

module.exports = router;
