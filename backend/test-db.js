const pool = require("./db");

(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Conexión exitosa:", res.rows[0]);
  } catch (error) {
    console.error("Error al conectar con la base de datos:", error.message);
  } finally {
    pool.end();
  }
})();