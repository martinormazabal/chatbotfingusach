const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const path = require("path");
const pool = require("../db");
const fs = require("fs").promises;
const fetch = require("node-fetch");
const Tesseract = require("tesseract.js");
const { v4: uuidv4 } = require("uuid");

const { createClient } = require("@supabase/supabase-js");

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || "documents";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseClient = supabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;
let checkedBucket = null;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

// Ensure directories exist
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB para PDFs grandes
  }
});

// Descripción: Mejora la legibilidad de textos extraídos eliminando saltos y artefactos comunes de OCR.
// Entrada: text (string) con contenido crudo de PDF u OCR.
// Salida: string limpio y compacto sin saltos innecesarios ni guiones cortados.
// Procesos:
// 1. Remover retornos de carro y guiones de corte de línea.
// 2. Reemplazar saltos de línea por espacios preservando oraciones.
// 3. Normalizar espacios múltiples y recortar extremos para entregar texto continuo.

function improveTextLegibility(text = "") {
  if (!text) return "";

  return text
    .replace(/\r/g, "")
    .replace(/-\s*\n\s*/g, "") // elimina guiones de cortes de línea
    .replace(/\s*\n\s*/g, " ")
    .replace(/([a-záéíóúñ0-9])(?=[A-ZÁÉÍÓÚÑ])/g, "$1. ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function downloadPDF(fileUrl, maxBytes = MAX_PDF_BYTES) {
  const response = await fetch(fileUrl, { timeout: 120000 });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el PDF desde Storage (${response.status} ${response.statusText})`);
  }
  const contentLength = Number(response.headers.get("content-length")) || 0;
  if (contentLength > maxBytes) {
    throw new Error(`El PDF excede el tamaño máximo permitido de ${Math.floor(maxBytes / (1024 * 1024))}MB`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > maxBytes) {
    throw new Error(`El PDF excede el tamaño máximo permitido de ${Math.floor(maxBytes / (1024 * 1024))}MB`);
  }
  return buffer;
}

async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    const extractedText = data?.text?.trim() || "";
    if (extractedText.length > 50) {
      return extractedText;
    }
    return null;
  } catch {
    return null;
  }
}

async function runOCROnPDF(pdfBuffer) {
  if (!pdfBuffer?.length) {
    throw new Error("PDF vacío o inválido para OCR");
  }

  const result = await Tesseract.recognize(pdfBuffer, "spa", {
    logger: (message) => console.log("[Tesseract]", message)
  });

  return result?.data?.text?.trim() || "";
}

async function saveText(id, content, usedOCR, status, message) {
  await pool.query(
    `UPDATE documents
     SET content = $1,
         has_text = $2,
         ocr_used = $3,
         ocr_status = $4,
         ocr_message = $5
     WHERE id = $6`,
    [content, Boolean(content?.trim()), usedOCR, status, message, id]
  );
}

async function markOCRFailed(id, message) {
  await pool.query(
    `UPDATE documents
     SET ocr_status = 'failed',
         ocr_message = $1
     WHERE id = $2`,
    [message, id]
  );
}

async function setOCRStatus(id, status, message = null) {
  await pool.query(
    `UPDATE documents
     SET ocr_status = $1,
         ocr_message = COALESCE($2, ocr_message)
     WHERE id = $3`,
    [status, message, id]
  );
}

async function processDocumentOCR(documentId, fileUrl) {
  console.log("🔎 OCR ejecutándose en entorno:", process.env.NODE_ENV);
  const buffer = await downloadPDF(fileUrl);
  const embeddedText = await extractTextFromPDF(buffer);

  if (embeddedText) {
    const cleanedEmbeddedText = improveTextLegibility(embeddedText);
    await saveText(documentId, cleanedEmbeddedText, false, "completed", "Texto extraído sin OCR");
    return { content: cleanedEmbeddedText, ocrUsed: false };
  }

  const ocrText = await runOCROnPDF(buffer);
  if (!ocrText || ocrText.trim().length < 10) {
    throw new Error("No se pudo extraer contenido del documento");
  }
  const cleanedOCRText = improveTextLegibility(ocrText);
  await saveText(documentId, cleanedOCRText, true, "completed", "OCR aplicado correctamente");
  return { content: cleanedOCRText, ocrUsed: true };
}

function queueDocumentOCR(documentId, fileUrl) {
  setImmediate(async () => {
    try {
      await setOCRStatus(documentId, "processing", "OCR en procesamiento.");
      const { content } = await processDocumentOCR(documentId, fileUrl);
      if (content) {
        await upsertNormativeContent(documentId, content).catch((err) =>
          console.warn("No se pudo guardar el texto OCR en normative_texts:", err.message)
        );
      }
    } catch (err) {
      const reason = err?.message || "OCR no disponible o falló durante la ejecución.";
      console.error(`Error OCR asíncrono para documento ${documentId}:`, err);
      await markOCRFailed(documentId, reason).catch(() => {});
    }
  });
}

let normativeTableReady = false;

// Descripción: Garantiza que la tabla normative_texts exista antes de guardar contenidos normativos.
// Entrada: Sin parámetros; usa el estado global normativeTableReady y la conexión pool.
// Salida: Promesa resuelta cuando la tabla está confirmada o reintenta en caso de error.
// Procesos:
// 1. Verificar si la tabla ya se creó para evitar ejecuciones repetidas.
// 2. Intentar crear la tabla con la definición esperada si no existe.
// 3. Marcar el estado interno como listo o registrar advertencias al fallar.

async function ensureNormativeTable() {
  if (normativeTableReady) return;
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS normative_texts (
         id SERIAL PRIMARY KEY,
         document_id INT UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
         content TEXT NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );`
    );
    normativeTableReady = true;
  } catch (err) {
    console.warn("⚠️  No se pudo garantizar la tabla normative_texts:", err.message);
  }
}

// Descripción: Inserta o actualiza el texto normativo asociado a un documento en la tabla dedicada.
// Entrada: documentId (number) identificador del documento, content (string) texto limpio a guardar.
// Salida: Resultado de la consulta SQL con la fila afectada o null si falta información.
// Procesos:
// 1. Validar que existan documentId y content antes de operar.
// 2. Asegurar la existencia de la tabla normativa mediante ensureNormativeTable.
// 3. Ejecutar un UPSERT para insertar o actualizar el contenido, manejando esquemas faltantes.

async function upsertNormativeContent(documentId, content) {
  if (!documentId || !content) return null;

  await ensureNormativeTable();

  try {
    return await pool.query(
      `INSERT INTO normative_texts (document_id, content)
       VALUES ($1, $2)
       ON CONFLICT (document_id)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
       RETURNING document_id`,
      [documentId, content]
    );
  } catch (err) {
    // Si la tabla no existe y no pudo crearse antes, intenta crearla en caliente.
    if (String(err.code) === "42P01") {
      normativeTableReady = false;
      await ensureNormativeTable();
      return await pool.query(
        `INSERT INTO normative_texts (document_id, content)
         VALUES ($1, $2)
         ON CONFLICT (document_id)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
         RETURNING document_id`,
        [documentId, content]
      );
    }
    throw err;
  }
}

const uploadMiddleware = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: 'Error al procesar el archivo',
        details: err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el límite de 50 MB permitido por el servidor.'
        : err.message
    });
  }
  if (err) {
    return next(err);
  }
  next();
});
};

function toSafeFilename(filename = "") {
return filename
  .replace(/[^a-zA-Z0-9._-]/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 160) || "document.pdf";
}

function parseBooleanField(value) {
if (typeof value === "boolean") return value;
if (typeof value !== "string") return false;
return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function ensureSupabaseBucketExists() {
if (!supabaseClient) {
  throw new Error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY para usar Storage.");
}

if (checkedBucket === supabaseBucket) {
  return;
}

const { data: buckets, error } = await supabaseClient.storage.listBuckets();
if (error) {
  throw new Error(`No fue posible listar buckets de Supabase Storage: ${error.message}`);
}

const exists = (buckets || []).some((bucket) => bucket.name === supabaseBucket);
if (!exists) {
  throw new Error(`Bucket '${supabaseBucket}' no existe en Supabase Storage`);
}

checkedBucket = supabaseBucket;
}

async function uploadToSupabaseStorage(localPath, storagePath, mimetype = "application/pdf") {
await ensureSupabaseBucketExists();

const fileBuffer = await fs.readFile(localPath);
const { error: uploadError } = await supabaseClient.storage
  .from(supabaseBucket)
  .upload(storagePath, fileBuffer, {
    contentType: mimetype,
    upsert: true
  });

if (uploadError) {
  throw new Error(`Supabase Storage rechazó la subida: ${uploadError.message}`);
}

const { data } = supabaseClient.storage
  .from(supabaseBucket)
  .getPublicUrl(storagePath);

if (!data?.publicUrl) {
  throw new Error("No fue posible construir la URL pública del archivo en Supabase Storage.");
}

return { publicUrl: data.publicUrl, storagePath };
}

async function deleteFromSupabaseStorage(storagePath, { throwOnError = true } = {}) {
if (!storagePath) return;

await ensureSupabaseBucketExists();
const { error } = await supabaseClient.storage.from(supabaseBucket).remove([storagePath]);

if (error) {
  if (throwOnError) {
    throw new Error(`No se pudo eliminar archivo de Supabase Storage: ${error.message}`);
  }
  console.warn("No se pudo eliminar archivo en Supabase Storage:", error.message);
}
}

// Nota: La ruta de carga es segura y no realiza OCR automáticamente.
// Descripción: Carga documentos PDF, intenta extraer texto (embebido u OCR) y guarda metadatos en BD.
// Entrada: req (Request) con archivo en campo document y metadatos opcionales; res (Response) para resultado.
// Salida: Respuesta HTTP 201 con datos del documento almacenado u error 400/500 si falla.
// Procesos:
// 1. Validar presencia de archivo y extraer texto incrustado; si no existe, ejecutar OCR.
// 2. Limpiar el texto, calcular banderas de estado y guardar registro en la tabla documents.
// 3. Insertar contenido en normative_texts si aplica y devolver el documento con estado de OCR.

router.post('/upload', uploadMiddleware, async (req, res) => {
let uploadedStoragePath = null;
if (!req.file) {
  return res.status(400).json({ error: 'Archivo no recibido' });
}

try {
  let extractedText = '';
  const useOCR = parseBooleanField(req.body.useOCR);
  const storageFilename = `${uuidv4()}-${toSafeFilename(req.file.originalname)}`;
  const uploadedBy = req.body.uploaded_by || 'Anónimo';
  const title = req.body.title || req.file.originalname;
  const uploadResult = await uploadToSupabaseStorage(req.file.path, storageFilename, req.file.mimetype);
  uploadedStoragePath = uploadResult.storagePath;
  const ocrMetadata = {
    attempted: false,
    succeeded: false,
    used: false,
    status: 'pending',
    message: ''
  };

  try {
    const pdfData = await fs.readFile(req.file.path);
    const pdfInfo = await pdfParse(pdfData);
    extractedText = (pdfInfo.text || '').trim();
    if (extractedText) {
      ocrMetadata.message = 'Se detectó texto incrustado en el PDF. No fue necesario ejecutar OCR.';
      ocrMetadata.succeeded = true;
      ocrMetadata.status = 'completed';
    }
  } catch (parseError) {
    console.warn('Fallo al extraer texto incrustado con pdf-parse. Se intentará OCR.', parseError);
  }

  if (!extractedText && useOCR) {
    ocrMetadata.attempted = true;
    ocrMetadata.status = 'pending';
    ocrMetadata.message = 'OCR encolado para ejecución asíncrona.';
  } else if (!extractedText && !useOCR) {
    ocrMetadata.status = 'pending';
    ocrMetadata.message = 'OCR no solicitado. El archivo se almacenó sin extracción de texto.';
  }

  const cleanedText = improveTextLegibility(extractedText);
  const hasText = Boolean(cleanedText);
  const ocrUsed = Boolean(ocrMetadata.used || (ocrMetadata.attempted && ocrMetadata.succeeded));
  const sourceUrl = uploadResult.publicUrl;
  const storagePath = uploadResult.storagePath;

  let result;
  try {
    result = await pool.query(
      `INSERT INTO documents (title, content, uploaded_by, filename, original_filename, source_url, file_url, storage_path, has_text, ocr_used, ocr_status, ocr_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, title, upload_date, filename, original_filename, source_url, file_url, storage_path, has_text, ocr_used, ocr_status, ocr_message`,
      [
        title,
        cleanedText,
        uploadedBy,
        storageFilename,
        req.file.originalname,
        sourceUrl,
        sourceUrl,
        storagePath,
        hasText,
        ocrUsed,
        ocrMetadata.status,
        ocrMetadata.message
      ]
    );
  } catch (err) {
      // Fallback para esquemas antiguos sin columnas nuevas como original_filename, source_url o has_text
      if (String(err.code) === "42703") {
        try {
          result = await pool.query(
            `INSERT INTO documents (title, content, uploaded_by, filename, original_filename, source_url, has_text, ocr_used, ocr_status, ocr_message)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, title, upload_date, filename, original_filename, source_url, has_text, ocr_used, ocr_status, ocr_message`,
            [
              title,
              cleanedText,
              uploadedBy,
              storageFilename,
              req.file.originalname,
              sourceUrl,
              hasText,
              ocrUsed,
              ocrMetadata.status,
              ocrMetadata.message
            ]
          );
        } catch (legacyErr) {
          // Fallback mínimo cuando tampoco existen las columnas de OCR/has_text
          if (String(legacyErr.code) === "42703") {
            result = await pool.query(
              `INSERT INTO documents (title, content, uploaded_by, filename)
              VALUES ($1, $2, $3, $4)
              RETURNING id, title, upload_date, filename`,
              [
                title,
                cleanedText,
                uploadedBy,
                storageFilename
              ]
            );
          } else {
            throw legacyErr;
          }
        }
    } else {
      throw err;
    }
  }

  const storedDoc = {
    ...result.rows[0],
    original_filename: result.rows[0].original_filename || req.file.originalname,
    source_url: result.rows[0].source_url || sourceUrl,
    file_url: result.rows[0].file_url || sourceUrl,
    storage_path: result.rows[0].storage_path || storagePath,
    has_text: typeof result.rows[0].has_text === 'boolean' ? result.rows[0].has_text : hasText,
    ocr_used: typeof result.rows[0].ocr_used === 'boolean' ? result.rows[0].ocr_used : ocrUsed,
    ocr_status: result.rows[0].ocr_status || ocrMetadata.status,
    ocr_message: result.rows[0].ocr_message || ocrMetadata.message
  };
  if (!hasText && useOCR) {
    queueDocumentOCR(storedDoc.id, storedDoc.file_url || sourceUrl);
  }
  if (hasText) {
    await upsertNormativeContent(storedDoc.id, cleanedText).catch(err =>
      console.warn('No se pudo guardar el texto en normative_texts:', err.message)
    );
  }
  await fs.unlink(req.file.path).catch(() => {});
  res.status(201).json({ success: true, document: storedDoc, ocr: ocrMetadata });
} catch (error) {
  console.error(`Error en la ruta de subida: ${error.stack}`);
  if (uploadedStoragePath) {
    await deleteFromSupabaseStorage(uploadedStoragePath, { throwOnError: false }).catch(() => {});
  }
  await fs.unlink(req.file.path).catch(e => console.error("Error al limpiar archivo temporal después de un error:", e));
  res.status(500).json({
    error: 'Error procesando documento',
    details: error.message || 'Ocurrió un error desconocido.'
  });
}
});

// Nota: Nueva ruta para ejecutar OCR bajo demanda.
// Descripción: Ejecuta OCR manual sobre un documento existente y actualiza su contenido en la base de datos.
// Entrada: req (Request) con parámetro id del documento; res (Response) para enviar el resultado.
// Salida: Respuesta HTTP 200 con el contenido actualizado o errores 404/500 según el caso.
// Procesos:
// 1. Recuperar el documento y localizar el archivo físico usando filename u original_filename.
// 2. Ejecutar processDocumentOCR para obtener y limpiar el texto reconocido.
// 3. Actualizar la fila en documents, sincronizar normative_texts y retornar el contenido nuevo.

async function runOCRHandler(req, res) {
  const { id } = req.params;
  try {
      const docResult = await pool.query(
        'SELECT id, filename, original_filename, source_url, file_url FROM documents WHERE id = $1',
        [id]
      );
      if (docResult.rowCount === 0) {
        return res.status(404).json({ error: 'Documento no encontrado' });
      }
  
      const documentRow = docResult.rows[0];
      const fileUrl = documentRow.file_url || documentRow.source_url;
      if (!fileUrl) {
        return res.status(400).json({
          error: 'Documento sin URL de Storage',
          details: 'El documento no tiene file_url/source_url para descargar el archivo y ejecutar OCR.'
        });
      }
  
      await setOCRStatus(id, 'pending', 'OCR encolado para ejecución asíncrona.');
      queueDocumentOCR(id, fileUrl);

      res.status(202).json({
        success: true,
        message: 'OCR encolado para ejecución asíncrona.'
      });
    } catch (e) {
      await markOCRFailed(id, e.message || 'OCR no disponible o falló durante la ejecución.').catch(() => {});
      return res.status(500).json({ error: 'No se pudo ejecutar OCR', details: e.message });
    }
  }
  
  router.post('/:id/run-ocr', runOCRHandler);
  router.post('/:id/ocr', runOCRHandler);

router.get('/', async (req, res) => {
  try {
    try {
      const { rows } = await pool.query(`
          SELECT id, title, uploaded_by, content,
                 COALESCE(original_filename, filename) AS original_filename,
                 COALESCE(has_text, false) AS has_text,
                 COALESCE(ocr_used, false) AS ocr_used,
                 COALESCE(ocr_status, 'pending') AS ocr_status,
                 COALESCE(ocr_message, '') AS ocr_message,
                 source_url,
                 file_url,
                 storage_path,
                 TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') AS upload_date,
                 filename
          FROM documents
          ORDER BY upload_date DESC
      `);
      return res.status(200).json(rows || []);
    } catch (error) {
      // If the new OCR columns do not exist, fall back to the legacy shape
      if (String(error.code) !== '42703') {
        throw error;
      }

      const { rows } = await pool.query(`
          SELECT id, title, uploaded_by, content,
                 TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') AS upload_date,
                 filename
          FROM documents
          ORDER BY upload_date DESC
      `);

      const hydrated = rows.map((row) => ({
        ...row,
        original_filename: row.filename,
        source_url: null,
        file_url: null,
        storage_path: row.filename,
        has_text: Boolean(row.content),
        ocr_used: false,
        ocr_status: 'pending',
        ocr_message: ''
      }));

      return res.status(200).json(hydrated);
    }
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({ error: 'Error al obtener documentos', details: error.message });
  }
});

// Descripción: Elimina un documento y su archivo físico asociado del servidor.
// Entrada: req (Request) con parámetro id del documento a borrar; res (Response) para la confirmación.
// Salida: Respuesta HTTP 200 en éxito o 404/500 cuando el documento no existe o falla la eliminación.
// Procesos:
// 1. Buscar el documento por id y recuperar su filename registrado.
// 2. Borrar la fila en la base de datos y eliminar el archivo del disco si está presente.
// 3. Responder con mensaje de éxito o error contextualizado según la excepción.

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const docResult = await pool.query('SELECT filename, storage_path FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const filenameToDelete = docResult.rows[0].filename;
    const storagePath = docResult.rows[0].storage_path || filenameToDelete;
    await deleteFromSupabaseStorage(storagePath);
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    if (filenameToDelete) {
      const filePathToDelete = path.join(uploadDir, filenameToDelete);
      await fs.unlink(filePathToDelete).catch(e => console.error("Error deleting document file:", e));
    }

    res.status(200).json({ message: 'Documento eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando documento:', error);
    res.status(500).json({ error: 'Error al eliminar documento', details: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, title, content, filename, original_filename, source_url, file_url, storage_path,
              COALESCE(has_text, false) AS has_text,
              COALESCE(ocr_used, false) AS ocr_used,
              COALESCE(ocr_status, 'pending') AS ocr_status,
              COALESCE(ocr_message, '') AS ocr_message,
              uploaded_by,
              TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') AS upload_date
       FROM documents WHERE id = $1`,
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Documento no encontrado" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error obteniendo documento:", error);
    return res.status(500).json({ error: "Error al obtener documento", details: error.message });
  }
});

// Descripción: Devuelve el contenido textual de un documento almacenado en la base de datos.
// Entrada: req (Request) con parámetro id del documento; res (Response) para enviar el texto.
// Salida: Respuesta HTTP 200 con el contenido o 404/500 si el documento no se encuentra o ocurre un error.
// Procesos:
// 1. Consultar la tabla documents para obtener el campo content según el id recibido.
// 2. Validar la existencia del documento y retornar mensaje 404 si no hay coincidencias.
// 3. Responder con el contenido encontrado o un mensaje de error controlado en caso de fallo.

router.get('/:id/content', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query('SELECT content FROM documents WHERE id = $1', [id]);
        if (!rows.length) {
            return res.status(404).json({ error: 'Contenido del documento no encontrado' });
        }
        res.status(200).json({ content: rows[0].content || '' });
    } catch (error) {
        console.error('Error reading document content from DB:', error);
        res.status(500).json({ error: 'Error al leer el contenido del documento', details: error.message });
    }
});

module.exports = router;