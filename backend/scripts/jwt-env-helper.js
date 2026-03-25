const fs = require('fs');
const path = require('path');

const [, , privateArg = 'jwt_private.pem', publicArg = 'jwt_public.pem'] = process.argv;

function readPem(fileArg) {
  const resolved = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No se encontró el archivo: ${resolved}`);
  }
  return fs.readFileSync(resolved, 'utf8').trim();
}

function toSingleLineEnv(pem) {
  return pem.replace(/\r?\n/g, '\\n');
}

function toBase64(pem) {
  return Buffer.from(pem, 'utf8').toString('base64');
}

try {
  const privatePem = readPem(privateArg);
  const publicPem = readPem(publicArg);

  console.log('# Copia una de estas opciones en backend/.env');
  console.log('# Opción 1: claves inline con \\n escapado');
  console.log(`JWT_PRIVATE_KEY=${toSingleLineEnv(privatePem)}`);
  console.log(`JWT_PUBLIC_KEY=${toSingleLineEnv(publicPem)}`);
  console.log('');
  console.log('# Opción 2: rutas a archivos .pem');
  console.log(`JWT_PRIVATE_KEY_PATH=${path.resolve(process.cwd(), privateArg)}`);
  console.log(`JWT_PUBLIC_KEY_PATH=${path.resolve(process.cwd(), publicArg)}`);
  console.log('');
  console.log('# Opción 3: Base64 (más cómodo para algunos hosts)');
  console.log(`JWT_PRIVATE_KEY_BASE64=${toBase64(privatePem)}`);
  console.log(`JWT_PUBLIC_KEY_BASE64=${toBase64(publicPem)}`);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}