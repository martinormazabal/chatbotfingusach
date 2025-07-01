const path = require('path');

// Mock initial database state
let mockUsers = [
  { id: 1, username: 'user1', email: 'user1@example.com', role: 'estudiante' },
  { id: 2, username: 'user2', email: 'user2@example.com', role: 'estudiante' },
  { id: 3, username: 'user3', email: 'user3@example.com', role: 'funcionario' },
  { id: 4, username: 'user4', email: 'user4@example.com', role: 'administrador de documentos' }
];

let mockRequests = [
  { id: 101, user_id: 1, query: 'query1', response: 'resp1' },
  { id: 102, user_id: 2, query: 'query2', response: 'resp2' },
  { id: 103, user_id: 3, query: 'query3', response: 'resp3' },
  { id: 104, user_id: 1, query: 'query4', response: 'resp4' }
];

// Store executed queries for verification
let executedQueries = [];

// Mock pool object
const pool = {
  query: async (sql, params) => {
    console.log('Mock pool.query called with:', { sql, params });
    executedQueries.push({ sql, params });

    if (sql.trim() === 'BEGIN') {
      console.log('Simulating BEGIN transaction.');
      return Promise.resolve({});
    }
    if (sql.trim() === 'COMMIT') {
      console.log('Simulating COMMIT transaction.');
      return Promise.resolve({});
    }
    if (sql.trim() === 'ROLLBACK') {
      console.log('Simulating ROLLBACK transaction.');
      return Promise.resolve({});
    }

    if (sql.includes('DELETE FROM requests WHERE user_id = ANY($1::int[])')) {
      const idsToDelete = params[0];
      console.log('Deleting requests for user_ids:', idsToDelete);
      mockRequests = mockRequests.filter(req => !idsToDelete.includes(req.user_id));
      return Promise.resolve({ rowCount: idsToDelete.length });
    }

    if (sql.includes('DELETE FROM users WHERE id = ANY($1::int[])')) {
      const idsToDelete = params[0];
      console.log('Deleting users with ids:', idsToDelete);
      mockUsers = mockUsers.filter(user => !idsToDelete.includes(user.id));
      return Promise.resolve({ rowCount: idsToDelete.length });
    }

    if (sql.includes('UPDATE users u SET id = o.new_id FROM ordered o WHERE u.id = o.id')) {
      console.log('Renumbering user IDs.');
      mockUsers.sort((a, b) => a.id - b.id);
      mockUsers = mockUsers.map((user, index) => ({ ...user, id: index + 1 }));
      return Promise.resolve({ rowCount: mockUsers.length });
    }

    if (sql.includes('SELECT setval') && sql.includes('pg_get_serial_sequence')) {
      console.log('Resetting sequence.');
      return Promise.resolve({
        rows: [{ setval: mockUsers.length > 0 ? mockUsers[mockUsers.length - 1].id + 1 : 1 }]
      });
    }

    console.warn('Unhandled mock query:', sql);
    return Promise.resolve({ rows: [], rowCount: 0 });
  },
  end: async () => console.log('Mock pool.end called.')
};

// Simulate DELETE /api/users handler
async function simulateDeleteUsersHandler(idsToDelete) {
  const req = { body: { ids: idsToDelete } };
  const res = {
    status: function (s) {
      console.log(`Response status: ${s}`);
      this._status = s;
      return this;
    },
    json: function (b) {
      console.log('Response body:', JSON.stringify(b, null, 2));
      this._body = b;
    }
  };

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    console.log("Invalid input: IDs must be a non-empty array.");
    return res.status(400).json({ message: "Se requiere array de IDs. (simulated)" });
  }

  try {
    await pool.query("BEGIN");

    await pool.query(
      "DELETE FROM requests WHERE user_id = ANY($1::int[])",
      [ids]
    );

    await pool.query(
      "DELETE FROM users WHERE id = ANY($1::int[])",
      [ids]
    );

    await pool.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
        FROM users
      )
      UPDATE users u
      SET id = o.new_id
      FROM ordered o
      WHERE u.id = o.id;
    `);

    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('users','id'),
        (SELECT COALESCE(MAX(id),0) FROM users) + 1,
        false
      );
    `);

    await pool.query("COMMIT");
    res.json({ message: "Usuarios y solicitudes eliminados correctamente. (simulated)" });

  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error en DELETE /api/users (simulated):", error);
    res.status(500).json({ message: error.message || "Error del servidor (simulated)" });
  }

  console.log('--- Simulation Results ---');
  console.log('Final Mock Users:', JSON.stringify(mockUsers, null, 2));
  console.log('Final Mock Requests:', JSON.stringify(mockRequests, null, 2));
  console.log('Executed Queries:', executedQueries.map(q =>
    q.sql.trim().split('\n')[0] + '...'
  ));
}

// Ejecutar simulación con IDs 2 y 3
simulateDeleteUsersHandler([2, 3]);
