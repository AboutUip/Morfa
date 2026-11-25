import fs from "node:fs";
import path from "node:path";

import { MIGRATIONS_DIR } from "../config.js";
import { db } from "./connection.js";

interface MigrationRow {
  id: string;
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    (db
      .prepare("SELECT id FROM schema_migrations")
      .all() as unknown as MigrationRow[]).map((row) => row.id),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
      ).run(file, Date.now());
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}
