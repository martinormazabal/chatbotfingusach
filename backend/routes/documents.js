const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const path = require("path");
const { createWorker } = require("tesseract.js");
const pool = require("../db");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Pure JavaScript OCR function using Tesseract.js
async function runOCRonPDF(filePath) {
  let worker;
  console.log(`Iniciando OCR en el archivo: ${filePath}`);
  try {
    worker = await createWorker({
      logger: m => console.log("Tesseract:", m.status, `(${Math.round(m.progress * 100)}%)`),
      cachePath: path.join(__dirname, '..', 'tesseract-cache'), // Cache in a writable directory
    });
    await worker.loadLanguage("spa+eng");
    await worker.initialize("spa+eng");
    const { data: { text } } = await worker.recognize(filePath);
    console.log("OCR completado.");
    return text || "";
  } catch (error) {
    console.error(`Error en el proceso de OCR con Tesseract: ${error.stack}`);
    throw new Error(`Falló el procesamiento OCR. Es posible que el archivo esté corrupto o no sea una imagen compatible.`);
  } finally {
    if (worker) {
      await worker.terminate();
      console.log("Tesseract worker terminado.");
    }
  }
}

// Modified upload route to try both pdf-parse and Tesseract if needed
router.post('/upload', upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo no recibido' });
  }

  let extractedText = '';
  try {
    // 1. Try to extract text with pdf-parse (fast, for text-based PDFs)
    const pdfData = await fs.readFile(req.file.path);
    const pdfInfo = await pdfParse(pdfData);
    extractedText = (pdfInfo.text || '').trim();
    console.log(`Texto extraído con pdf-parse: ${extractedText.substring(0, 100)}...`);

    // 2. If text is minimal, assume it's a scanned PDF and run Tesseract OCR
    if (extractedText.length < 150) { // Adjustable threshold
      console.log("El texto de pdf-parse es mínimo, iniciando OCR con Tesseract...");
      const ocrText = await runOCRonPDF(req.file.path);
      if (ocrText.length > extractedText.length) {
        extractedText = ocrText;
        console.log("OCR de Tesseract proveyó mejor resultado.");
      }
    }

    // 3. Save to database
    const result = await pool.query(
      `INSERT INTO documents (title, content, uploaded_by, filename) VALUES ($1, $2, $3, $4) RETURNING id, title, upload_date, filename`,
      [req.body.title || req.file.originalname, extractedText, req.body.uploaded_by || 'Anónimo', req.file.filename]
    );

    res.status(201).json({ success: true, document: result.rows[0] });
  } catch (error) {
    console.error(`Error en la ruta de subida: ${error.stack}`);
    // Clean up uploaded file on error
    await fs.unlink(req.file.path).catch(e => console.error("Error al limpiar archivo después de un error:", e));
    res.status(500).json({
      error: 'Error procesando documento',
      details: error.message || 'Ocurrió un error desconocido.'
    });
  }
});

// OCR route now uses the pure JS function
router.post('/:id/run-ocr', async (req, res) => {
  const { id } = req.params;
  try {
    const docResult = await pool.query('SELECT filename FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const filename = docResult.rows[0].filename;
    const filePath = path.join(uploadDir, filename);

    // Run the pure JS OCR function
    const extractedText = await runOCRonPDF(filePath);

    const updatedDoc = await pool.query(
      'UPDATE documents SET content = $1 WHERE id = $2 RETURNING id, content',
      [extractedText.trim(), id]
    );

    res.status(200).json({
        success: true,
        message: 'OCR procesado y guardado correctamente.',
        content: updatedDoc.rows[0].content
    });
  } catch (error) {
    console.error(`Error en la ruta /run-ocr para ID ${id}: ${error.stack}`);
    res.status(500).json({
      error: 'Falló el procesamiento OCR',
      details: error.message || 'Ocurrió un error desconocido.'
    });
  }
});

// --- Other routes remain the same ---

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
        SELECT id, title, uploaded_by, content,
               TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') AS upload_date,
               filename
        FROM documents
        ORDER BY upload_date DESC
    `);
    res.status(200).json(rows || []);
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({ error: 'Error al obtener documentos', details: error.message });
  }
});

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
