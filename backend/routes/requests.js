//backend/routes/requests.js
// imports (deja solo este bloque)
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

// Calcula indicadores desde BD si existe; si no, desde CSV /logs/chatbot_logs.csv
router.get("/stats", async (req, res) => {
  // 1) Intentar desde BD (si hay conexión)
  try {
    const q = `
      SELECT
        ROUND(100.0*AVG((juicio_correctitud='Correcta')::int),2)   AS exactitud_pct,
        ROUND(100.0*AVG((juicio_correctitud='Parcial')::int),2)    AS parciales_pct,
        ROUND(100.0*AVG((juicio_correctitud='Incorrecta')::int),2) AS incorrectas_pct,
        ROUND(AVG(tiempo_respuesta_ms)::numeric,0)                 AS t_medio_ms,
        ROUND(STDDEV_POP(tiempo_respuesta_ms)::numeric,0)          AS t_desv_ms
      FROM evaluation_logs;`;
    const { rows } = await pool.query(q); // si no hay Postgres, esto lanzará error
    return res.json({ source: "db", ...rows[0] });
  } catch (e) {
    // 2) Fallback a CSV
    try {
      const csvPath = path.join(__dirname, "..", "logs", "chatbot_logs.csv");
      const raw = await fsp.readFile(csvPath, "utf8");
      // parseo robusto de CSV con campos siempre entre comillas
      const lines = raw.split(/\r?\n/).filter(l => l.trim() !== "");
      if (lines.length <= 1) return res.json({ source: "csv", total: 0 });

      const parseQuoted = (line) => {
        const out = [];
        const re = /"([^"]*(?:""[^"]*)*)"(?:,|$)/g; // captura campos "..."
        let m; while ((m = re.exec(line)) !== null) out.push(m[1].replace(/""/g, '"'));
        return out;
      };

      const headers = parseQuoted(lines[0]);
      const rows = lines.slice(1).map(l => {
        const vals = parseQuoted(l);
        const o = {};
        headers.forEach((h,i) => o[h] = vals[i] ?? "");
        return o;
      });

      const total = rows.length;
      const count = (k) => rows.filter(r => r.juicio_correctitud === k).length;
      const nC = count("Correcta"), nP = count("Parcial"), nI = count("Incorrecta");
      const pct = (n) => total ? +(100*n/total).toFixed(2) : 0;

      const times = rows
        .map(r => +r.tiempo_respuesta_ms)
        .filter(n => Number.isFinite(n));
      const mean = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : 0;
      const sd   = times.length ? Math.round(Math.sqrt(times.reduce((s,x)=>s+(x-mean)**2,0)/(times.length))) : 0;

      // distribución por tipo_error
      const byErr = {};
      rows.forEach(r => {
        const t = (r.tipo_error || "").trim();
        if (!t) return;
        byErr[t] = (byErr[t] || 0) + 1;
      });
      const dist = Object.entries(byErr)
        .map(([tipo, n]) => ({ tipo_error: tipo, n, pct: pct(n) }))
        .sort((a,b)=>b.n-a.n);

      return res.json({
        source: "csv",
        total,
        exactitud_pct: pct(nC),
        parciales_pct: pct(nP),
        incorrectas_pct: pct(nI),
        t_medio_ms: mean,
        t_desv_ms: sd,
        dist
      });
    } catch (csvErr) {
      console.error("stats from CSV failed:", csvErr);
      return res.status(500).json({ error: "No se pudieron calcular indicadores" });
    }
  }
});

// 1) Endpoint admin para asegurar la tabla evaluation_logs (evita "relation does not exist")
router.post("/admin/evalogs/ensure", async (req, res) => {
  const ddl = `
  CREATE TABLE IF NOT EXISTS evaluation_logs (
    id SERIAL PRIMARY KEY,
    case_id TEXT,
    fecha TIMESTAMP,
    rol_usuario TEXT,
    pregunta_textual TEXT,
    referencia_esperada_o_fuente TEXT,
    respuesta_chatbot TEXT,
    juicio_correctitud TEXT CHECK (juicio_correctitud IN ('Correcta','Parcial','Incorrecta')),
    tiempo_respuesta_ms INT,
    tipo_error TEXT,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );`;
  try {
    await pool.query(ddl);
    // sanity check
    const { rows } = await pool.query(`SELECT to_regclass('public.evaluation_logs') AS reg;`);
    return res.json({ ok: true, table: rows[0].reg });
  } catch (e) {
    console.error("❌ ensure evalogs:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Helpers de cómputo desde DB
async function computeStatsFromDb() {
  // Totales por juicio
  const q1 = `
    SELECT
      COUNT(*)::int AS total,
      SUM( (juicio_correctitud = 'Correcta')::int )::int AS correctas,
      SUM( (juicio_correctitud = 'Parcial')::int )::int  AS parciales,
      SUM( (juicio_correctitud = 'Incorrecta')::int )::int AS incorrectas,
      ROUND(AVG(tiempo_respuesta_ms)::numeric, 1) AS promedio_ms
    FROM evaluation_logs;
  `;
  const q2 = `
    SELECT tipo_error, COUNT(*)::int AS cantidad
    FROM evaluation_logs
    WHERE tipo_error IS NOT NULL AND tipo_error <> ''
    GROUP BY tipo_error
    ORDER BY cantidad DESC;
  `;
  const [a, b] = await Promise.all([pool.query(q1), pool.query(q2)]);
  const row = a.rows[0] || { total: 0, correctas: 0, parciales: 0, incorrectas: 0, promedio_ms: null };
  const errores_por_tipo = {};
  for (const r of b.rows) errores_por_tipo[r.tipo_error] = r.cantidad;

  const exactitud = row.total ? Math.round((row.correctas / row.total) * 1000) / 10 : 0; // %
  return {
    total: row.total,
    correctas: row.correctas,
    parciales: row.parciales,
    incorrectas: row.incorrectas,
    exactitud_pct: exactitud,         // % correctas
    promedio_ms: row.promedio_ms,     // tiempo medio de respuesta
    errores_por_tipo                  // { "R-1": n, "G-1": n, ... }
  };
}

// Helper: parser CSV simple (con comillas) para fallback
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // parsea respetando comillas
    const out = [];
    let cur = "", inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQ && line[j + 1] === '"') { cur += '"'; j++; } // escape ""
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (out[idx] ?? "").trim()));
    rows.push(obj);
  }
  return { headers, rows };
}

// Helpers de cómputo desde CSV
async function computeStatsFromCsv() {
  const logDir = path.join(__dirname, "..", "logs");
  const csvFile = path.join(logDir, "chatbot_logs.csv");
  const text = await fsp.readFile(csvFile, "utf8");
  const { headers, rows } = parseCsv(text);
  if (!rows.length) return { total: 0, correctas: 0, parciales: 0, incorrectas: 0, exactitud_pct: 0, promedio_ms: null, errores_por_tipo: {} };

  const h = (name) => headers.indexOf(name);
  const iJuicio = h("juicio_correctitud");
  const iMs = h("tiempo_respuesta_ms");
  const iErr = h("tipo_error");

  let total = 0, c = 0, p = 0, i = 0, sumMs = 0, nMs = 0;
  const errores_por_tipo = {};

  for (const row of rows) {
    total++;
    const juicio = row[headers[iJuicio]] || row["juicio_correctitud"] || "";
    if (juicio === "Correcta") c++;
    else if (juicio === "Parcial") p++;
    else if (juicio === "Incorrecta") i++;

    const msRaw = row[headers[iMs]] || row["tiempo_respuesta_ms"];
    const ms = Number(msRaw);
    if (Number.isFinite(ms)) { sumMs += ms; nMs++; }

    const te = (row[headers[iErr]] || row["tipo_error"] || "").trim();
    if (te) errores_por_tipo[te] = (errores_por_tipo[te] || 0) + 1;
  }

  const exactitud = total ? Math.round((c / total) * 1000) / 10 : 0;
  const promedio_ms = nMs ? Math.round((sumMs / nMs) * 10) / 10 : null;

  return { total, correctas: c, parciales: p, incorrectas: i, exactitud_pct: exactitud, promedio_ms, errores_por_tipo };
}

// 2) Endpoint JSON de estadísticas (DB -> fallback CSV)
router.get("/stats", async (req, res) => {
  try {
    const stats = await computeStatsFromDb();
    return res.json({ source: "db", ...stats });
  } catch (e1) {
    console.warn("⚠️ stats DB falló, uso CSV:", e1.message);
    try {
      const stats = await computeStatsFromCsv();
      return res.json({ source: "csv", ...stats });
    } catch (e2) {
      console.error("❌ stats CSV falló:", e2.message);
      return res.status(500).json({ error: "No se pudieron calcular estadísticas", detail: e2.message });
    }
  }
});

// 3) Endpoint Texto plano (amigable para curl sin jq)
router.get("/stats/plain", async (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  try {
    const s = await computeStatsFromDb();
    return res.send(
`[source=db]
Total: ${s.total}
Correctas: ${s.correctas}
Parciales: ${s.parciales}
Incorrectas: ${s.incorrectas}
Exactitud (%): ${s.exactitud_pct}
Tiempo medio (ms): ${s.promedio_ms ?? "s/d"}
Errores por tipo: ${JSON.stringify(s.errores_por_tipo)}\n`
    );
  } catch (e1) {
    try {
      const s = await computeStatsFromCsv();
      return res.send(
`[source=csv]
Total: ${s.total}
Correctas: ${s.correctas}
Parciales: ${s.parciales}
Incorrectas: ${s.incorrectas}
Exactitud (%): ${s.exactitud_pct}
Tiempo medio (ms): ${s.promedio_ms ?? "s/d"}
Errores por tipo: ${JSON.stringify(s.errores_por_tipo)}\n`
      );
    } catch (e2) {
      return res.status(500).send(`Error calculando estadísticas: ${e2.message}\n`);
    }
  }
});

module.exports = router;