#!/usr/bin/env node
// Minimal migration runner for the Azure MySQL database.
//
//   node db/migrate.mjs            apply pending migrations
//   node db/migrate.mjs --status   list applied / pending
//
// Migrations live in db/migrations and run in filename order, each once.
// A .sql file is executed as-is; a .mjs file exports `up(db, helpers)` for
// changes that need conditional logic. Applied versions are recorded in
// schema_migrations. Connection settings come from the same MYSQL_* env vars
// as lib/db.ts (MYSQL_SSL=false disables TLS for local/CI databases).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate({ log = console.log, statusOnly = false } = {}) {
  const db = await mysql.createConnection({
    host:     process.env.MYSQL_HOST,
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port:     Number(process.env.MYSQL_PORT || 3306),
    ssl:      process.env.MYSQL_SSL === "false" ? undefined : { rejectUnauthorized: false },
    multipleStatements: true,
  });

  const helpers = {
    async columnExists(table, column) {
      const [rows] = await db.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND COLUMN_NAME = ?`,
        [table, column]
      );
      return rows.length > 0;
    },
  };

  try {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const [rows] = await db.query(`SELECT version FROM schema_migrations`);
    const applied = new Set(rows.map((r) => r.version));
    const files = fs.readdirSync(dir).filter((f) => /\.(sql|mjs)$/.test(f)).sort();

    for (const file of files) {
      if (applied.has(file)) {
        if (statusOnly) log(`applied  ${file}`);
        continue;
      }
      if (statusOnly) { log(`pending  ${file}`); continue; }

      log(`applying ${file}`);
      if (file.endsWith(".sql")) {
        await db.query(fs.readFileSync(path.join(dir, file), "utf8"));
      } else {
        const mod = await import(pathToFileURL(path.join(dir, file)).href);
        await mod.up(db, helpers);
      }
      // MySQL DDL auto-commits, so a failure part-way leaves earlier statements
      // applied. Keep migrations idempotent (IF NOT EXISTS / columnExists).
      await db.query(`INSERT INTO schema_migrations (version) VALUES (?)`, [file]);
    }
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate({ statusOnly: process.argv.includes("--status") }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
