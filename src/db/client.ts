import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** The handle passed to a `db.transaction(...)` callback. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Anything that can run a query — the pooled handle or a transaction. Helpers
 * take this so they compose inside a transaction without casting.
 */
export type DbLike = Db | DbTx;

/**
 * Resolves the SQLite file location. `DATABASE_PATH` wins so the Docker/Fly
 * deployment can point at a mounted volume (`/data/ajaia.db`).
 */
export function resolveDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "ajaia.db");
}

export function createConnection(file: string): Database.Database {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const sqlite = new Database(file);
  // WAL lets readers proceed during a write, which matters because every
  // keystroke-debounced autosave is a write.
  if (file !== ":memory:") sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait rather than immediately throwing SQLITE_BUSY when two requests write.
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

/**
 * Builds an isolated database handle. Used by tests; the app uses `getDb()`.
 */
export function createDb(file: string): { db: Db; sqlite: Database.Database } {
  const sqlite = createConnection(file);
  runMigrations(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

// Next.js dev mode re-evaluates modules on hot reload. Cache the handle on
// globalThis so we do not leak file descriptors across reloads.
const globalForDb = globalThis as unknown as { __ajaiaDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__ajaiaDb) {
    globalForDb.__ajaiaDb = createDb(resolveDatabasePath()).db;
  }
  return globalForDb.__ajaiaDb;
}
