import path from 'path';
import bcrypt from 'bcrypt'; // Keep this import as bcrypt is likely an ES module or handles both
import pool from '../../../backend/db.js';

// Resolve the backend DB module by walking up from both __dirname and process.cwd(),
// ensuring we can locate "backend/db.js" even when executed from the transpiled
// .next output.
const resolveBackendDbPath = () => {
  const attempted = new Set();
  const roots = [__dirname, process.cwd()];

  for (const start of roots) {
    let current = start;
    while (true) {
      const candidate = path.normalize(path.join(current, 'backend', 'db.js'));
      if (!attempted.has(candidate)) {
        attempted.add(candidate);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new Error(
    `No se pudo ubicar backend/db.js para el pool de conexiones. Rutas probadas: ${Array.from(
      attempted,
    ).join(', ')}`,
  );
};

const pool = require(resolveBackendDbPath());

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find the user by email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    // --- TEMPORARY DEVELOPMENT BYPASS FOR ADMIN LOGIN ---
    // This bypass is INSECURE and should be REMOVED for production.
    if (email === 'admin@usach.cl' && password === 'admin') {
      // Bypass bcrypt comparison for this specific test account
      console.log('Admin development bypass triggered.');
      return res.status(200).json({ id: 0, email: 'admin@usach.cl', role: 'admin' });
    }
    else if (!user) {
      // User not found
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }
    // --- END TEMPORARY DEVELOPMENT BYPASS ---

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      // Passwords do not match
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }

    // Authentication successful for other users
    // Do not return the password_hash
    res.status(200).json({ id: user.id, email: user.email, role: user.role });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
}