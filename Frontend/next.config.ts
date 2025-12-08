import type { NextConfig } from "next";

// Reexporta la configuración real definida en next.config.js para evitar
// divergencias entre archivos de configuración.
const config: NextConfig = require("./next.config.js");

export default config;
