import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  documentPresence,
  documentShares,
  documentVersions,
  documents,
  users,
} from "@/db/schema";
import { testDb } from "./helpers";

/**
 * Drift guard.
 *
 * `src/db/migrations/*.sql` is the source of truth for the physical schema and
 * `src/db/schema.ts` is a hand-written mirror used for typing. That is a
 * deliberate tradeoff (no codegen step), and this is the check that keeps it
 * honest: every Drizzle table selects every one of its columns from a database
 * built by the real migrations. A column renamed in one place and not the other
 * fails here rather than at runtime.
 */

describe("migrations and the Drizzle schema agree", () => {
  it("can select every column of every table", () => {
    const db = testDb();
    // A select() naming each column fails loudly if the column is missing.
    expect(() => db.select().from(users).all()).not.toThrow();
    expect(() => db.select().from(documents).all()).not.toThrow();
    expect(() => db.select().from(documentShares).all()).not.toThrow();
    expect(() => db.select().from(documentVersions).all()).not.toThrow();
    expect(() => db.select().from(documentPresence).all()).not.toThrow();
  });

  it("creates every expected table", () => {
    const db = testDb();
    const names = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((r) => r.name);

    for (const expected of [
      "users",
      "documents",
      "document_shares",
      "document_versions",
      "document_presence",
      "_migrations",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("records which migrations ran, so re-running is a no-op", () => {
    const db = testDb();
    const applied = db.all<{ name: string }>(sql`SELECT name FROM _migrations`);
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[0]?.name).toMatch(/^\d{4}_.*\.sql$/);
  });

  it("enforces the case-insensitive unique index on email", () => {
    const db = testDb();
    const base = { name: "X", passwordHash: "h", createdAt: 0 };
    db.insert(users).values({ id: "1", email: "Person@Example.com", ...base }).run();

    // Sharing looks users up by lower(email); two rows differing only in case
    // would make that lookup ambiguous.
    expect(() =>
      db.insert(users).values({ id: "2", email: "person@example.com", ...base }).run(),
    ).toThrow();
  });

  it("enforces foreign keys, so orphan rows cannot be written", () => {
    const db = testDb();
    expect(() =>
      db
        .insert(documents)
        .values({
          id: "d1",
          title: "t",
          contentHtml: "<p></p>",
          contentText: "",
          ownerId: "no-such-user",
          createdAt: 0,
          updatedAt: 0,
          revision: 1,
        })
        .run(),
    ).toThrow();
  });
});
