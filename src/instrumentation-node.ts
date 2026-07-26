import { sql } from "drizzle-orm";
import { getDb, resolveDatabasePath, type Db } from "./db/client";
import { seed } from "./db/seed";
import { users } from "./db/schema";
import { SEED_PASSWORD, SEED_USERS } from "./lib/demo-accounts";

/**
 * Boot-time startup work. Reached only from `instrumentation.ts`, and only under
 * the Node.js runtime — see the note there about why the split exists.
 *
 * Doing this at boot rather than lazily means:
 *
 *  - A misconfigured production deploy fails immediately and loudly, instead of
 *    booting fine and throwing a 500 the first time somebody signs in. (That is
 *    exactly how the missing-SESSION_SECRET bug surfaced during testing.)
 *  - A fresh deployment migrates and seeds itself, so a reviewer who clicks a
 *    deploy button gets a working demo without shell access.
 */
export async function registerNode(): Promise<void> {
  assertConfigured();

  let db: Db;
  try {
    // Opening the handle also applies pending migrations, so a bad DATABASE_PATH
    // or an unwritable volume surfaces here rather than on the first request.
    db = getDb();
    console.log(`[ajaia-docs] database ready at ${resolveDatabasePath()}`);
  } catch (error) {
    console.error(
      `\nAjaia Docs cannot open its database at ${resolveDatabasePath()}:\n  ${
        error instanceof Error ? error.message : String(error)
      }\n\nIf this is a container, check that DATABASE_PATH points at a writable, mounted volume.\n`,
    );
    process.exit(1);
  }

  seedIfEmpty(db);
}

function assertConfigured(): void {
  const problems: string[] = [];

  if (process.env.NODE_ENV === "production") {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length === 0) {
      problems.push(
        "SESSION_SECRET is not set. Session cookies cannot be signed.\n" +
          "    Generate one with:  openssl rand -base64 32",
      );
    } else if (secret.length < 16) {
      problems.push("SESSION_SECRET is too short; use at least 16 characters.");
    } else if (secret === "dev-only-insecure-session-secret") {
      problems.push("SESSION_SECRET is still the development placeholder.");
    }
  }

  if (problems.length === 0) return;

  console.error(
    `\nAjaia Docs cannot start:\n\n${problems.map((p) => `  - ${p}`).join("\n")}\n\n` +
      "See .env.example for the full list of settings.\n",
  );
  // A production server that cannot sign sessions is broken, not degraded.
  // Refuse to serve rather than failing one request at a time.
  process.exit(1);
}

/**
 * Seeds demo data on a genuinely empty database.
 *
 * Guarded on "zero users" rather than on an env flag alone, because `seed()`
 * truncates every table — it must never run against a database that has real
 * content. Set SEED_ON_EMPTY=false to opt out entirely.
 */
function seedIfEmpty(db: Db): void {
  if (process.env.SEED_ON_EMPTY === "false") return;

  try {
    const count = Number(db.select({ c: sql<number>`count(*)` }).from(users).get()?.c ?? 0);
    if (count > 0) return; // existing data — never touch it

    seed(db);

    console.log(
      `[ajaia-docs] empty database detected — seeded ${SEED_USERS.length} demo accounts ` +
        `(password: ${SEED_PASSWORD}). Set SEED_ON_EMPTY=false to disable.`,
    );
  } catch (error) {
    // A seeding failure must not stop the app from serving: an empty document
    // list is recoverable, a crash loop is not.
    console.error("[ajaia-docs] could not seed demo data:", error);
  }
}
