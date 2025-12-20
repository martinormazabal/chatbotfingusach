const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const path = require("path");
const pool = require("../db");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
const tempImageDir = path.join(__dirname, '..', 'temp_images');

// Ensure directories exist
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);
fs.mkdir(tempImageDir, { recursive: true }).catch(console.error);

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

// Descripción: Ejecuta un flujo de OCR mejorado convirtiendo la primera página a imagen y reconociendo texto.
// Entrada: filePath (string) con ruta al PDF, originalFilename (string) nombre original del archivo.
// Salida: Texto reconocido (string) o error descriptivo si el OCR falla.
// Procesos:
// 1. Convertir la primera página del PDF a imagen PNG temporal con alta resolución.
// 2. Inicializar Tesseract con idiomas español e inglés y ejecutar reconocimiento.
// 3. Devolver el texto obtenido y limpiar recursos temporales (worker e imagen).

async function enhancedOCRProcessing(filePath, originalFilename) {
  let worker;
  const { fromPath } = require("pdf2pic");
  const { createWorker } = require("tesseract.js");

  const options = {
    density: 300,
    saveFilename: `${path.parse(originalFilename).name}_${uuidv4()}`,
    savePath: tempImageDir,
    format: "png",
    width: 2000,
    height: 2600
  };
  const convert = fromPath(filePath, options);
  let convertedPage = null;

  try {
    // 1. Convert the first page of the PDF to an image.
    console.log("Converting PDF to image for OCR...");
    const pageToConvert = 1;
    const result = await convert(pageToConvert, { responseType: 'image' });
    if (!result || !result.path) {
      throw new Error("Fallo al convertir PDF a imagen.");
    }
    convertedPage = result.path;
    console.log(`Image converted successfully: ${convertedPage}`);

    // 2. Run OCR on the resulting image.
    worker = await createWorker({
      logger: m => console.log("Tesseract OCR:", m),
      cachePath: "./tesseract-cache",
    });
    await worker.loadLanguage("spa+eng");
    await worker.initialize("spa+eng");

    const { data: { text } } = await worker.recognize(convertedPage);
    if (!text) {
      throw new Error("OCR no devolvió texto válido.");
    }
    return text;

  } catch (error) {
    console.error(`Error en el proceso de OCR mejorado: ${error.message}`);
    throw new Error(`Falló el procesamiento OCR. El archivo puede estar corrupto o tener un formato de imagen no compatible.`);
  } finally {
    if (worker) {
      await worker.terminate();
    }
    if (convertedPage) {
      await fs.unlink(convertedPage).catch(e => console.error("Error al eliminar el archivo de imagen temporal:", e));
    }
  }
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

// Nota: La ruta de carga es segura y no realiza OCR automáticamente.
// Descripción: Carga documentos PDF, intenta extraer texto (embebido u OCR) y guarda metadatos en BD.
// Entrada: req (Request) con archivo en campo document y metadatos opcionales; res (Response) para resultado.
// Salida: Respuesta HTTP 201 con datos del documento almacenado u error 400/500 si falla.
// Procesos:
// 1. Validar presencia de archivo y extraer texto incrustado; si no existe, ejecutar OCR.
// 2. Limpiar el texto, calcular banderas de estado y guardar registro en la tabla documents.
// 3. Insertar contenido en normative_texts si aplica y devolver el documento con estado de OCR.

router.post('/upload', uploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no recibido' });
  }

  try {
    let extractedText = '';
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
        ocrMetadata.status = 'embedded-text';
      }
    } catch (parseError) {
      console.warn('Fallo al extraer texto incrustado con pdf-parse. Se intentará OCR.', parseError);
    }

    if (!extractedText) {
      ocrMetadata.attempted = true;
      try {
        extractedText = (await enhancedOCRProcessing(req.file.path, req.file.originalname)).trim();
        ocrMetadata.succeeded = extractedText.length > 0;
        ocrMetadata.message = ocrMetadata.succeeded
          ? 'Texto extraído correctamente mediante OCR.'
          : 'OCR finalizó, pero no se encontró texto legible en el documento.';
      } catch (ocrError) {
        console.error('Error ejecutando OCR durante la subida del documento:', ocrError);
        ocrMetadata.succeeded = false;
        ocrMetadata.status = 'ocr-failed';
        ocrMetadata.message = 'No fue posible extraer texto automáticamente. Puede ejecutar el OCR manualmente desde la interfaz.';
      }
    }

    const cleanedText = improveTextLegibility(extractedText);
    const hasText = Boolean(cleanedText);
    const ocrUsed = Boolean(ocrMetadata.used || (ocrMetadata.attempted && ocrMetadata.succeeded));
    const title = req.body.title || req.file.originalname;
    const uploadedBy = req.body.uploaded_by || 'Anónimo';
    const sourceUrl = req.body.source_url || null;

    let result;
    try {
      result = await pool.query(
        `INSERT INTO documents (title, content, uploaded_by, filename, original_filename, source_url, has_text, ocr_used, ocr_status, ocr_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, title, upload_date, filename, original_filename, source_url, has_text, ocr_used, ocr_status, ocr_message`,
        [
          title,
          cleanedText,
          uploadedBy,
          req.file.filename,
          req.file.originalname,
          sourceUrl,
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
              `INSERT INTO documents (title, content, uploaded_by, filename, has_text, ocr_used, ocr_status, ocr_message)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id, title, upload_date, filename, has_text, ocr_used, ocr_status, ocr_message`,
              [
                title,
                cleanedText,
                uploadedBy,
                req.file.filename,
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
                  req.file.filename
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
      has_text: typeof result.rows[0].has_text === 'boolean' ? result.rows[0].has_text : hasText,
      ocr_used: typeof result.rows[0].ocr_used === 'boolean' ? result.rows[0].ocr_used : ocrUsed,
      ocr_status: result.rows[0].ocr_status || ocrMetadata.status,
      ocr_message: result.rows[0].ocr_message || ocrMetadata.message
    };
    if (hasText) {
      await upsertNormativeContent(storedDoc.id, cleanedText).catch(err =>
        console.warn('No se pudo guardar el texto en normative_texts:', err.message)
      );
    }

    res.status(201).json({ success: true, document: storedDoc, ocr: ocrMetadata });
  } catch (error) {
    console.error(`Error en la ruta de subida: ${error.stack}`);
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
// 2. Ejecutar enhancedOCRProcessing para obtener y limpiar el texto reconocido.
// 3. Actualizar la fila en documents, sincronizar normative_texts y retornar el contenido nuevo.

router.post('/:id/run-ocr', async (req, res) => {
  const { id } = req.params;
  try {
    
    const docResult = await pool.query(
      'SELECT filename, original_filename FROM documents WHERE id = $1',
      [id]
    );
    if (docResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const filename = docResult.rows[0].filename;
    const originalFilename = docResult.rows[0].original_filename || filename;

    let filePath = path.join(uploadDir, filename);
    const storedFileExists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!storedFileExists) {
      const altPath = path.join(uploadDir, originalFilename);
      const altExists = await fs.access(altPath).then(() => true).catch(() => false);
      if (!altExists) {
        return res.status(404).json({
          error: 'Archivo no encontrado en el servidor',
          details: `No se halló el PDF esperado (${filename}) ni su nombre original (${originalFilename}). Vuelva a subirlo para ejecutar OCR.`
        });
      }
      filePath = altPath;
    }

    const extractedText = await enhancedOCRProcessing(filePath, filename);
    const cleanedText = improveTextLegibility(extractedText);
    const hasCleanText = Boolean(cleanedText);
    const finalStatus = hasCleanText ? 'ocr-success' : 'ocr-empty';
    const finalMessage = hasCleanText
      ? 'Texto extraído correctamente mediante OCR a solicitud manual.'
      : 'OCR completado, pero no se encontraron caracteres legibles en el PDF.';

    const updatedDoc = await pool.query(
      `UPDATE documents
       SET content = $1,
           has_text = $2,
           ocr_used = true,
           ocr_status = $3,
           ocr_message = $4,
           upload_date = upload_date
       WHERE id = $5
       RETURNING id, content`,
       [cleanedText.trim(), hasCleanText, finalStatus, finalMessage, id]
    );

    if (hasCleanText) {
      await upsertNormativeContent(id, cleanedText.trim()).catch(err =>
        console.warn('No se pudo actualizar normative_texts tras OCR manual:', err.message)
      );
    }

    res.status(200).json({
        success: true,
        message: 'OCR procesado y guardado correctamente.',
        content: updatedDoc.rows[0].content
    });
  } catch (e) {
    if (id) {
      await pool.query(
        `UPDATE documents
         SET ocr_status = 'ocr-failed',
             ocr_message = $2
         WHERE id = $1`,
         [id, e.message || 'OCR no disponible o falló durante la ejecución.']
      ).catch(() => {});
    }
    return res.status(500).json({ error: 'OCR no disponible en este entorno', details: e.message });
  }
});

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
    const docResult = await pool.query('SELECT filename FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const filenameToDelete = docResult.rows[0].filename;

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