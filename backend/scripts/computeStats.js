// backend/scripts/computeStats.js
const pool = require("../db");

(async () => {
  try {
    const start = process.env.STATS_START || null; // ej: "2025-06-01"
    const end   = process.env.STATS_END   || null; // ej: "2025-07-01"

    const where = `
      WHERE ($1::timestamp IS NULL OR fecha >= $1::timestamp)
        AND ($2::timestamp IS NULL OR fecha <  $2::timestamp)
    `;
    const params = [start, end];

    const aggQ = `
      SELECT
        COUNT(*)::int AS total,
        SUM((juicio_correctitud='Correcta')::int)::int   AS correctas,
        SUM((juicio_correctitud='Parcial')::int)::int    AS parciales,
        SUM((juicio_correctitud='Incorrecta')::int)::int AS incorrectas,
        ROUND(100.0*SUM((juicio_correctitud='Correcta')::int)/NULLIF(COUNT(*),0),2)   AS exactitud_pct,
        ROUND(100.0*SUM((juicio_correctitud='Parcial')::int)/NULLIF(COUNT(*),0),2)    AS parciales_pct,
        ROUND(100.0*SUM((juicio_correctitud='Incorrecta')::int)/NULLIF(COUNT(*),0),2) AS incorrectas_pct,
        ROUND(AVG(tiempo_respuesta_ms)::numeric,0)   AS t_medio_ms,
        ROUND(STDDEV_POP(tiempo_respuesta_ms)::numeric,0) AS t_desv_ms
      FROM evaluation_logs
      ${where};
    `;

    const distQ = `
      SELECT tipo_error,
             COUNT(*)::int AS n,
             ROUND(100.0*COUNT(*)/NULLIF(SUM(COUNT(*)) OVER (),0),2) AS pct
      FROM evaluation_logs
      ${where}
        AND COALESCE(tipo_error,'') <> ''
      GROUP BY tipo_error
      ORDER BY n DESC;
    `;

    const lastIncorrectQ = `
      SELECT fecha, pregunta_textual, referencia_esperada_o_fuente, tipo_error
      FROM evaluation_logs
      ${where}
        AND juicio_correctitud = 'Incorrecta'
      ORDER BY fecha DESC
      LIMIT 5;
    `;

    const { rows: [agg] }   = await pool.query(aggQ, params);
    const { rows: dist }    = await pool.query(distQ, params);
    const { rows: lastBad } = await pool.query(lastIncorrectQ, params);

    console.log("=== Indicadores globales ===");
    console.table(agg || {});
    console.log("=== Distribución por tipo_error ===");
    console.table(dist || []);
    console.log("=== Últimos 5 casos Incorrecta (para análisis cualitativo) ===");
    console.table(lastBad || []);

    process.exit(0);
  } catch (e) {
    console.error("❌ Error computeStats:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
