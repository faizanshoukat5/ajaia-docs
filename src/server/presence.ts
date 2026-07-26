import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documentPresence, users } from "@/db/schema";
import { PRESENCE_TTL_MS } from "@/lib/limits";
import { loadDocumentForUser } from "./documents";

/**
 * "Who else has this document open", as a heartbeat table rather than a socket.
 *
 * This is the honest version of a collaboration indicator at this scope: it is
 * eventually consistent within one TTL, costs two tiny queries, and needs no
 * stateful server — so it survives the same serverless/container deployment as
 * everything else. Real-time cursors would need a WebSocket layer and a CRDT;
 * that call is documented in ARCHITECTURE.md.
 */

export interface PresentUser {
  id: string;
  name: string;
  /** Whether this row is the requesting user. */
  isSelf: boolean;
  lastSeenAt: number;
}

/** Records that `userId` is currently viewing `documentId`. Authorizes first. */
export function recordPresence(
  db: Db,
  documentId: string,
  userId: string,
  now = Date.now(),
): void {
  loadDocumentForUser(db, documentId, userId); // 404s if no access

  db.insert(documentPresence)
    .values({ documentId, userId, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [documentPresence.documentId, documentPresence.userId],
      set: { lastSeenAt: now },
    })
    .run();

  // Opportunistic cleanup: drop this document's expired rows on each heartbeat so
  // the table stays proportional to active use with no scheduled job.
  db.delete(documentPresence)
    .where(
      and(
        eq(documentPresence.documentId, documentId),
        sql`${documentPresence.lastSeenAt} < ${now - PRESENCE_TTL_MS}`,
      ),
    )
    .run();
}

/** Users seen within the TTL, self first, then alphabetically. */
export function listPresence(
  db: Db,
  documentId: string,
  userId: string,
  now = Date.now(),
): PresentUser[] {
  loadDocumentForUser(db, documentId, userId);

  return db
    .select({
      id: users.id,
      name: users.name,
      lastSeenAt: documentPresence.lastSeenAt,
    })
    .from(documentPresence)
    .innerJoin(users, eq(users.id, documentPresence.userId))
    .where(
      and(
        eq(documentPresence.documentId, documentId),
        gte(documentPresence.lastSeenAt, now - PRESENCE_TTL_MS),
      ),
    )
    .orderBy(users.name)
    .all()
    .map((row) => ({ ...row, isSelf: row.id === userId }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
}

/** Called when a client navigates away, so the avatar disappears immediately. */
export function clearPresence(db: Db, documentId: string, userId: string): void {
  db.delete(documentPresence)
    .where(
      and(eq(documentPresence.documentId, documentId), eq(documentPresence.userId, userId)),
    )
    .run();
}
