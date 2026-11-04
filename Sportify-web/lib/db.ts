import mysql from "mysql2/promise";

const dbConfig = {
  host:     process.env.MYSQL_HOST,
  user:     process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port:     Number(process.env.MYSQL_PORT),
  // Azure MySQL — cert verified at the network level. MYSQL_SSL=false for local / CI databases.
  ssl:      process.env.MYSQL_SSL === "false" ? undefined : { rejectUnauthorized: false },
};

// ── Connection pool ─────────────────────────────────────────────────────────
// In serverless (Netlify Lambda), the module is re-evaluated on cold starts
// but the same Lambda instance may handle many requests (warm). The global
// singleton means the pool is reused across those warm invocations, avoiding
// a fresh TCP+SSL handshake for every query.

type GlobalWithPool = typeof globalThis & { _dbPool?: mysql.Pool };

const g = globalThis as GlobalWithPool;

if (!g._dbPool) {
  g._dbPool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit:    5,    // small — Lambda instances are isolated
    queueLimit:         20,
    connectTimeout:     10_000,
    idleTimeout:        60_000,
  });
}

export const pool = g._dbPool;

// ── createConnection — for routes that open one connection and run many queries ──
export const createConnection = async () => {
  const connection = await mysql.createConnection(dbConfig);
  return connection;
};

// ── executeQuery — uses the pool so there is no per-call connection overhead ──
export const executeQuery = async (query: string, params?: unknown[]) => {
  const [results] = await pool.execute(query, params);
  return results;
};

export default createConnection;
