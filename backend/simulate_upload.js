const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, 'uploads');

// Mock dependencies
const mockPdfParseContent = "This is the extracted text from the dummy PDF.";
const pdfParse = async (data) => {
    console.log('Mock pdfParse called.');
    return { text: mockPdfParseContent };
};

let capturedDbInsertArgs = null;
const pool = {
    query: async (sql, params) => {
        console.log('Mock pool.query called.', { sql, params });
        capturedDbInsertArgs = { sql, params };
        // Simulate a successful insert returning some data
        return Promise.resolve({
            rows: [{
                id: 999,
                title: params[0],
                upload_date: new Date().toISOString(),
                filename: params[3]
            }],
            rowCount: 1
        });
    },
    end: async () => { console.log('Mock pool.end called.'); }
};

const mockUuid = 'SIMULATED_UUID';
const uuid = { v4: () => mockUuid };

// Simulate the core logic of the upload route handler
async function simulateUploadHandler() {
    const originalname = 'dummy_upload_test.pdf';
    const filename = `${uuid.v4()}-${originalname}`;
    const tempFilePath = path.join(uploadDir, filename);

    // Create a dummy file to simulate the upload
    try {
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(tempFilePath, 'This is dummy PDF content.');
        console.log(`Dummy file created at ${tempFilePath}`);
    } catch (error) {
        console.error('Error creating dummy file:', error);
        return;
    }

    // Mock request object
    const req = {
        file: {
            path: tempFilePath,
            originalname: originalname,
            filename: filename
        },
        body: {
            title: 'Simulated Document Title',
            uploaded_by: 'Simulator User'
        }
    };

    // Mock response object
    const res = {
        status: function(s) {
            console.log(`Simulated response status: ${s}`);
            this._status = s; // Store status
            return this; // Allow chaining
        },
        json: function(b) {
            console.log('Simulated response body:', JSON.stringify(b, null, 2));
            this._body = b; // Store body
        }
    };

    // Extract the core logic from the actual route handler
    try {
        console.log("Received upload request (simulated).");
        if (!req.file) {
            console.log("No file received (simulated).");
            throw new Error('Archivo no recibido (simulated)');
        }

        console.log(`Processing uploaded file (simulated): ${req.file.path}`);

        // Processing in 2 steps: first pdfParse, then OCR if needed
        console.log("Attempting initial PDF parse (simulated)...");
        const pdfData = await fs.readFile(req.file.path);
        const pdfInfo = await pdfParse(pdfData);
        let extractedText = pdfInfo.text;
        console.log(`Initial PDF parse extracted text length (simulated): ${extractedText.length}`);

        // Simplified check - in real code, OCR is only if length is small
        // For this simulation, we rely on mockPdfParse to return the expected content

        // Basic text cleaning
        extractedText = extractedText.trim();
        console.log(`Final cleaned text length (simulated): ${extractedText.length}`);

        // Insert into DB
        console.log("Inserting document metadata into database (simulated)...");
        const result = await pool.query(
            `INSERT INTO documents
      (title, content, uploaded_by, filename)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, upload_date, filename`,
            [
                req.body.title || req.file.originalname,
                extractedText,
                req.body.uploaded_by || 'Anónimo',
                req.file.filename
            ]
        );
        console.log("Document metadata inserted successfully (simulated).");

        // File cleanup after successful processing and DB insertion (simulated)
        if (req.file.path) {
           await fs.unlink(req.file.path).catch(e => console.error("Error cleaning up temp file after success (simulated):", e));
           console.log(`Dummy file deleted: ${req.file.path}`);
        }

        res.status(201).json({
            success: true,
            document: result.rows[0]
        });

    } catch (error) {
        console.error(`Error in upload route simulation: ${error}`);

        // Ensure cleanup even if error occurs during processing (simulated)
        if (req.file?.path) {
            await fs.unlink(req.file.path).catch(e => console.error("Error cleaning up temp file after error (simulated):", e));
             console.log(`Dummy file deleted after error: ${req.file.path}`);
        }

        res.status(500).json({
            error: 'Error procesando documento (simulated)',
            details: error.message || 'Unknown error occurred during document processing (simulated).'
        });
    }

    // After the handler finishes, check the captured args and response
    console.log('--- Simulation Results ---');
    console.log('Captured DB Insert Args:', JSON.stringify(capturedDbInsertArgs, null, 2));
    // You would check res._status and res._body here in a real test framework
    // For this simulation, we rely on the console logs from res.status and res.json
     console.log('Check for file existence in uploads directory (should be deleted):');
     try {
         await fs.access(tempFilePath);
         console.error(`Error: Dummy file ${tempFilePath} still exists after cleanup.`);
     } catch (e) {
         if (e.code === 'ENOENT') {
             console.log(`Confirmed: Dummy file ${tempFilePath} was deleted.`);
         } else {
             console.error(`Error checking dummy file existence: ${e}`);
         }
     }
}

// Run the simulation
simulateUploadHandler();