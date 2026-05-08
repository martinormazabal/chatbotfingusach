#!/usr/bin/env node
/*
 * Fails fast when Render/NPM produced a partial pg installation. The production
 * outage showed pg itself can be left incomplete after forced dependency fixes,
 * so production verifies the stable pg entry points before opening the server.
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
      "Ejecute una instalación limpia en producción: rm -rf node_modules package-lock.json && npm install.",
      "No ejecute npm audit fix --force ni actualice pg automáticamente; este backend fija pg@8.20.0 en package-lock.",
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
  console.log("pg ok");
  console.log("✅ Instalación de pg verificada correctamente.");
} catch (error) {
  console.error("❌ Verificación de pg falló.");
  console.error(error.message || error);
  process.exit(1);
}