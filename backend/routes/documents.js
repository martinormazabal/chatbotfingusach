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

async function findUploadedFile(title) {
  const files = await fs.readdir(uploadDir);
  const suffix = `-${title}.pdf`;
  const match = files.find(f => f.endsWith(suffix));

  if (!match) {
    throw new Error(`No se encontró fichero con sufijo "${suffix}"`);
  }
  return path.join(uploadDir, match);
}

// Configuración Multer mejorada
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Solo PDF permitidos'), false);
  }
});

// Nuevo sistema de conversión PDF a texto con mejor error handling
const pdfToText = async (filePath) => {
  let worker;
  try {
    console.log("Tesseract: Creating worker...");
    worker = await createWorker({
      logger: m => console.log("Tesseract:", m), // Add logging here
      cachePath: "./tesseract-cache",
      cacheMethod: "refresh"
    });

    console.log("Tesseract: Loading language...");
    await worker.loadLanguage('spa+eng');
    console.log("Tesseract: Initializing...");
    await worker.initialize('spa+eng');
    console.log("Tesseract: Recognizing text...");
    const { data: { text } } = await worker.recognize(filePath);
    console.log("Tesseract: Recognition complete.");
    return text;
  } catch (error) {
    console.error(`Tesseract Error: ${error.message || error}`); // Log the Tesseract error
    throw new Error(`PDF OCR failed: ${error.message || error}`); // Re-throw a standard error
  } finally {
    if (worker) {
      console.log("Tesseract: Terminating worker.");
      await worker.terminate().catch(e => console.error("Error terminating Tesseract worker:", e));
    }
    // File cleanup is handled in the /upload route
  }
};

// Optimization of OCR processing (This function is not currently used in /upload route, 
// but keeping it for completeness based on previous context)
async function enhancedOCRProcessing(filePath) {
  let worker;
  try {
    await fs.access(filePath);
    
    worker = await Promise.race([
      createWorker({
        logger: m => console.log("Enhanced OCR:", m),
        cachePath: "./tesseract-cache",
        cacheMethod: "refresh"
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout inicializando Tesseract")), 5000)
      )
    ]);

    const langs = await worker.getLoadedLanguages();
    if (!langs.includes("spa") || !langs.includes("eng")) {
      await worker.loadLanguage("spa+eng");
    }
    
    await worker.initialize("spa+eng");

    const result = await worker.recognize(filePath);
    
    if (!result?.data?.text) {
      throw new Error("OCR no devolvió texto válido");
    }

    return result.data.text;

  } catch (error) {
    console.error(`Error en Enhanced OCR: ${error.message || error}`);
    throw new Error(`Falló el procesamiento OCR mejorado: ${error.message || error}`);
  } finally {
    if (worker) {
      await worker.terminate().catch(e => 
        console.error("Error terminando worker mejorado:", e)
      );
    }
    try {
      await fs.unlink(filePath);
    } catch (cleanError) {
      console.error("Error limpiando archivos temporales mejorado:", cleanError);
    }
  }
}

// Ruta de upload optimizada
router.post('/upload', upload.single('document'), async (req, res) => {
  let tempFilePath = '';

  try {
    console.log("Received upload request.");
    if (!req.file) {
      console.log("No file received.");
      throw new Error('Archivo no recibido');
    }
    tempFilePath = req.file.path;
    console.log(`Processing uploaded file: ${tempFilePath}`);

    // Procesamiento en 2 pasos: primero pdfParse, luego OCR if needed
    console.log("Attempting initial PDF parse...");
    const pdfData = await fs.readFile(tempFilePath);
    const pdfInfo = await pdfParse(pdfData);
    let extractedText = pdfInfo.text;
    console.log(`Initial PDF parse extracted text length: ${extractedText.length}`);

    if (extractedText.length < 100 && pdfData.length > 0) { // Add check for empty file data
      console.log("Text length is short, attempting OCR...");
      extractedText = await pdfToText(tempFilePath); // Use the improved pdfToText
      console.log(`OCR extracted text length: ${extractedText.length}`);
    } else if (extractedText.length === 0 && pdfData.length > 0) {
        console.log("Initial PDF parse extracted no text, attempting OCR...");
        extractedText = await pdfToText(tempFilePath); // Use the improved pdfToText
        console.log(`OCR extracted text length: ${extractedText.length}`);
    }

    // Basic text cleaning
    // extractedText = extractedText.replace(/([^])([^])/g, '$1 $2');
    extractedText = extractedText.trim();
    console.log(`Final cleaned text length: ${extractedText.length}`);

    // Insertar en DB
    console.log("Inserting document metadata into database...");
    const result = await pool.query(`
      INSERT INTO documents
      (title, content, uploaded_by, filename)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, upload_date, filename`,
      [
        req.body.title || req.file.originalname, // Use provided title or original filename
        extractedText,
        req.body.uploaded_by || 'Anónimo',
        req.file.filename
      ]
    );
    console.log("Document metadata inserted successfully.");

    // File cleanup after successful processing and DB insertion
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(e => console.error("Error cleaning up temp file after success:", e));
    }

    res.status(201).json({
      success: true,
      document: result.rows[0]
    });

  } catch (error) {
    console.error(`Error in /upload route: ${error.stack}`); // Log the full stack trace

    // Ensure cleanup even if error occurs during processing
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(e => console.error("Error cleaning up temp file after error:", e));
    }

    // Ensure a JSON error response is always sent
    res.status(500).json({
      error: 'Error procesando documento',
      details: error.message || 'Unknown error occurred during document processing.'
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
        SELECT id, title, content, uploaded_by,
               TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') AS upload_date,
               filename
        FROM documents
        ORDER BY upload_date DESC
    `);

    // The filename in the DB includes the UUID, frontend needs this to retrieve the file
    res.status(200).json(rows || []);

  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({
      error: 'Error al obtener documentos',
      details: error.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // First, get the filename to delete the actual file
    const docResult = await pool.query('SELECT filename FROM documents WHERE id = $1', [id]);
    if (docResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const filenameToDelete = docResult.rows[0].filename;

    // Delete from database
    const deleteResult = await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    // Delete the actual file from the uploads directory
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

// Endpoint to retrieve document content by ID
router.get('/:id/content', async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch the filename from the database using the ID
        const { rows } = await pool.query(
           'SELECT filename FROM documents WHERE id = $1', [id]
         );
        if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

        const filename = rows[0].filename;
        const filePath = path.join(uploadDir, filename);

        // Read the file content
        const data = await fs.readFile(filePath);
        const pdf = await pdfParse(data);

        res.status(200).json({ content: pdf.text });
    } catch (error) {
        console.error('Error reading document content:', error);
        res.status(500).json({ error: 'Error al leer el contenido del documento', details: error.message });
    }
});


module.exports = router;