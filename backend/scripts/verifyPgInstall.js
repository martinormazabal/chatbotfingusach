#!/usr/bin/env node
/*
 * Fails fast when Render/NPM produced a partial pg installation. The production
 * outage showed pg/lib/crypto/sasl.js could be present while the sibling
 * cert-signatures.js file was missing, so requiring only "pg" is not enough on
 * every path unless we explicitly resolve the SCRAM helper too.
 */
const fs = require("fs");

function assertResolvable(moduleName) {
  try {
    const resolved = require.resolve(moduleName);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Resolved path does not exist: ${resolved}`);
    }
    return resolved;
  } catch (error) {
    const hint = [
      `Dependencia dañada o incompleta: no se pudo cargar ${moduleName}.`,
      "Ejecute una instalación limpia en producción: npm ci --omit=dev.",
      "En Render evite reutilizar node_modules generado por npm install/audit fix y redeploye con cache limpia.",
      `Detalle: ${error.message}`,
    ].join("\n");
    throw new Error(hint);
  }
}

try {
  assertResolvable("pg");
  assertResolvable("pg/lib/client");
  assertResolvable("pg/lib/crypto/sasl");
  assertResolvable("pg/lib/crypto/cert-signatures");
  require("pg");
  console.log("✅ Instalación de pg verificada correctamente.");
} catch (error) {
  console.error("❌ Verificación de pg falló.");
  console.error(error.message || error);
  process.exit(1);
}