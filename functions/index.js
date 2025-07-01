const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors'); // Si necesitas CORS

// Importa tu aplicación Express. La ruta es relativa desde functions/index.js
// hasta backend/server.js, que está un nivel arriba (../) y luego en la carpeta backend.
const app = require('../backend/server');

// Crea una aplicación Express que servirá tus rutas bajo /api
const main = express();

// Usa middleware si lo necesitas (CORS es común)
main.use(cors());
// Firebase Functions agrega el prefijo /api, por lo que tus rutas de Express
// ya no necesitan /api al inicio.
main.use('/api', app);


// Define la función HTTP que sirve tu aplicación Express
// El nombre 'api' se convierte en el endpoint en Firebase Functions
exports.api = functions.https.onRequest(main);