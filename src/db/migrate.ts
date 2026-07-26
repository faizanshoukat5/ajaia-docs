import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

/**
 * Applies every `NNNN_*.sql` file in `src/db/migrations` that has not run yet,
 * in filename order, each inside its own transaction.
 *
 * Deliberately hand-rolled rather than `drizzle-kit migrate`: it is ~30 lines,
 * has no extra CLI dependency, and means `npm run dev` on a clean checkout does
 * the right thing with no generate step. See ARCHITECTURE.md.
 */
export function runMigrations(db: Database.Database): string[] {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare<[], { name: string }>("SELECT name FROM _migrations")
      .all()
      .map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        Date.now(),
      );
    });
    apply();
    ran.push(file);
  }
  return ran;
}
