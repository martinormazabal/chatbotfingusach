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

// 1. Configuración Multer mejorada
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf' 
      ? cb(null, true) 
      : cb(new Error('Solo PDF permitidos'), false);
  }
});
// 2. Nuevo sistema de conversión PDF a texto
const pdfToText = async (filePath) => {
  const worker = await createWorker({
    logger: () => {},
    cachePath: "./tesseract-cache",
    cacheMethod: "refresh"
  });
  
  try {
    await worker.loadLanguage('spa+eng');
    await worker.initialize('spa+eng');
    const { data: { text } } = await worker.recognize(filePath);
    return text;
  } finally {
    await worker.terminate();
    await fs.unlink(filePath);
  }
};
// Optimización del procesamiento OCR
async function pdfToImages(pdfPath, outputDir) {
  const opts = {
    format: "jpeg",
    out_dir: outputDir,
    out_prefix: path.basename(pdfPath, path.extname(pdfPath)),
    page: null
  };

  await poppler.convert(pdfPath, opts);
  return fs.readdirSync(outputDir).filter(f => f.endsWith(".jpeg"));
}

async function enhancedOCRProcessing(filePath) {
  let worker;
  try {
    // 1. Verificar existencia del archivo
    await fs.access(filePath);
    
    // 2. Inicializar worker con control de tiempo de espera
    worker = await Promise.race([
      createWorker({
        logger: m => console.log(m),
        cachePath: "./tesseract-cache",
        cacheMethod: "refresh"
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout inicializando Tesseract")), 5000)
      )
    ]);

    // 3. Cargar idiomas con verificación
    const langs = await worker.getLoadedLanguages();
    if (!langs.includes("spa") || !langs.includes("eng")) {
      await worker.loadLanguage("spa+eng");
    }
    
    await worker.initialize("spa+eng");

    // 4. Procesamiento seguro con estructura de respuesta alternativa
    const result = await worker.recognize(filePath);
    
    if (!result?.data?.text) {
      throw new Error("OCR no devolvió texto válido");
    }

    return result.data.text;

  } catch (error) {
    console.error(`Error en OCR: ${error.message}`);
    throw new Error(`Falló el procesamiento OCR: ${error.message}`);
  } finally {
    // 5. Limpieza garantizada del worker
    if (worker) {
      await worker.terminate().catch(e => 
        console.error("Error terminando worker:", e)
      );
    }
    
    // 6. Limpiar archivos temporales
    try {
      await fs.unlink(filePath);
    } catch (cleanError) {
      console.error("Error limpiando archivos:", cleanError);
    }
  }
}

// 3. Ruta de upload optimizada
router.post('/upload', upload.single('document'), async (req, res) => {
  let tempFilePath = '';
  
  try {
    if (!req.file) throw new Error('Archivo no recibido');
    tempFilePath = req.file.path;

    // Procesamiento en 2 pasos
    const pdfText = await pdfParse(await fs.readFile(tempFilePath));
    let extractedText = pdfText.text;
    
    if (pdfText.text.length < 100) {
      extractedText = await pdfToText(tempFilePath);
    }

    // Insertar en DB con transacción
    const result = await pool.query(`
      INSERT INTO documents 
      (title, content, uploaded_by) 
      VALUES ($1, $2, $3) 
      RETURNING id, title, upload_date`,
      [
        req.body.title || req.file.originalname,
        extractedText,
        req.body.uploaded_by || 'Anónimo'
      ]
    );

    res.status(201).json({
      success: true,
      document: result.rows[0]
    });

  } catch (error) {
    console.error(`Error crítico: ${error.stack}`);
    
    // Limpieza garantizada
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});

    res.status(500).json({
      error: 'Error procesando documento',
      details: error.message
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, content, uploaded_by, 
             TO_CHAR(upload_date, 'DD/MM/YYYY HH24:MI') as upload_date 
      FROM documents 
      ORDER BY upload_date DESC
    `);
    
    // Asegurar respuesta como array
    res.status(200).json(rows || []); 
  
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({
      error: 'Error al obtener documentos',
      details: error.message
    });
  }
});

module.exports = router;