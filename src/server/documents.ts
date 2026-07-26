import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db, DbLike } from "@/db/client";
import {
  documentShares,
  documentVersions,
  documents,
  users,
  type DocumentRow,
} from "@/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { MAX_VERSIONS_PER_DOCUMENT, VERSION_MIN_INTERVAL_MS } from "@/lib/limits";
import {
  canDelete,
  canEdit,
  canRename,
  canView,
  resolveRole,
  type AccessRole,
  type ShareRole,
} from "@/lib/permissions";
import {
  EMPTY_DOCUMENT_HTML,
  excerpt,
  htmlToPlainText,
  sanitizeDocumentHtml,
} from "@/lib/sanitize";
import type { SessionUser } from "./session";

export const DEFAULT_TITLE = "Untitled document";

/** `documents.updated_by_id` resolved to a display name, as a scalar subquery. */
const lastEditorName = sql<string | null>`(
  SELECT name FROM users WHERE users.id = ${documents.updatedById}
)`.as("last_editor_name");

export interface DocumentSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  createdAt: number;
  role: AccessRole;
  owner: { id: string; name: string; email: string };
  lastEditedBy: string | null;
  collaboratorCount: number;
}

export interface ShareEntry {
  userId: string;
  role: ShareRole;
  name: string;
  email: string;
}

export interface LoadedDocument {
  doc: DocumentRow;
  role: AccessRole;
  owner: { id: string; name: string; email: string };
  shares: ShareEntry[];
}

/**
 * Loads a document together with the caller's effective role, or throws.
 *
 * Both "does not exist" and "exists but you have no access" raise the same 404,
 * so a document id is never an existence oracle for an unauthorized user.
 */
export function loadDocumentForUser(
  db: DbLike,
  documentId: string,
  userId: string,
): LoadedDocument {
  const doc = db.select().from(documents).where(eq(documents.id, documentId)).get();
  if (!doc) throw notFound();

  const shareRows = db
    .select({
      userId: documentShares.userId,
      role: documentShares.role,
      name: users.name,
      email: users.email,
    })
    .from(documentShares)
    .innerJoin(users, eq(users.id, documentShares.userId))
    .where(eq(documentShares.documentId, documentId))
    .all();

  const role = resolveRole({ ownerId: doc.ownerId, shares: shareRows }, userId);
  if (role === null || !canView(role)) throw notFound();

  const ownerRow = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, doc.ownerId))
    .get();

  return {
    doc,
    role,
    // owner_id is a FK, so a missing row means the DB was tampered with; degrade
    // rather than crash the read path.
    owner: ownerRow ?? { id: doc.ownerId, name: "Unknown user", email: "" },
    shares: shareRows.filter(
      (s): s is ShareEntry => s.role === "viewer" || s.role === "editor",
    ),
  };
}

/** Counts collaborators for many documents in one query instead of N. */
function collaboratorCounts(db: DbLike, documentIds: string[]): Map<string, number> {
  if (documentIds.length === 0) return new Map();
  const rows = db
    .select({
      documentId: documentShares.documentId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(documentShares)
    .where(inArray(documentShares.documentId, documentIds))
    .groupBy(documentShares.documentId)
    .all();
  return new Map(rows.map((r) => [r.documentId, Number(r.count)]));
}

function toSummary(
  doc: DocumentRow,
  owner: { id: string; name: string; email: string },
  lastEditedBy: string | null,
  role: AccessRole,
  counts: Map<string, number>,
): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    preview: excerpt(doc.contentText),
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    role,
    owner,
    lastEditedBy,
    collaboratorCount: counts.get(doc.id) ?? 0,
  };
}

/**
 * The document list, split into what the user owns and what has been shared with
 * them. Two queries rather than one UNION so each side keeps its own role, which
 * is then known statically instead of being re-derived per row.
 */
export function listDocumentsForUser(
  db: DbLike,
  userId: string,
): { owned: DocumentSummary[]; shared: DocumentSummary[] } {
  const ownedRows = db
    .select({
      doc: documents,
      ownerName: users.name,
      ownerEmail: users.email,
      lastEditedBy: lastEditorName,
    })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documents.ownerId, userId))
    .orderBy(desc(documents.updatedAt))
    .all();

  const sharedRows = db
    .select({
      doc: documents,
      ownerName: users.name,
      ownerEmail: users.email,
      role: documentShares.role,
      lastEditedBy: lastEditorName,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documents.id, documentShares.documentId))
    .innerJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documentShares.userId, userId))
    .orderBy(desc(documents.updatedAt))
    .all();

  const counts = collaboratorCounts(db, [...ownedRows, ...sharedRows].map((r) => r.doc.id));

  return {
    owned: ownedRows.map((r) =>
      toSummary(
        r.doc,
        { id: r.doc.ownerId, name: r.ownerName, email: r.ownerEmail },
        r.lastEditedBy,
        "owner",
        counts,
      ),
    ),
    shared: sharedRows
      // Defensive: an unrecognized role in the DB must not render as access.
      .filter((r): r is typeof r & { role: ShareRole } =>
        r.role === "viewer" || r.role === "editor",
      )
      .map((r) =>
        toSummary(
          r.doc,
          { id: r.doc.ownerId, name: r.ownerName, email: r.ownerEmail },
          r.lastEditedBy,
          r.role,
          counts,
        ),
      ),
  };
}

export function createDocument(
  db: Db,
  userId: string,
  input: { title?: string; contentHtml?: string; versionLabel?: string } = {},
): DocumentRow {
  const now = Date.now();
  const html = sanitizeDocumentHtml(input.contentHtml ?? EMPTY_DOCUMENT_HTML);

  return db.transaction((tx) => {
    const doc = tx
      .insert(documents)
      .values({
        id: newId(),
        title: input.title?.trim() || DEFAULT_TITLE,
        contentHtml: html,
        contentText: htmlToPlainText(html),
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
        updatedById: userId,
        revision: 1,
      })
      .returning()
      .get();

    if (input.versionLabel) {
      // Record where an imported document's initial content came from, so its
      // history explains itself.
      tx.insert(documentVersions)
        .values({
          id: newId(),
          documentId: doc.id,
          title: doc.title,
          contentHtml: doc.contentHtml,
          authorId: userId,
          createdAt: now,
          label: input.versionLabel,
        })
        .run();
    }
    return doc;
  });
}

/**
 * Snapshots a document's *current* state into history, then prunes beyond the
 * retention limit. Called with pre-update content, so a version row always holds
 * what the document looked like before some accepted change.
 */
export function snapshotDocument(
  db: DbLike,
  doc: Pick<DocumentRow, "id" | "title" | "contentHtml" | "updatedById">,
  label: string | null,
  now = Date.now(),
): void {
  db.insert(documentVersions)
    .values({
      id: newId(),
      documentId: doc.id,
      title: doc.title,
      contentHtml: doc.contentHtml,
      authorId: doc.updatedById ?? null,
      createdAt: now,
      label,
    })
    .run();

  const keep = db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, doc.id))
    .orderBy(desc(documentVersions.createdAt))
    .limit(MAX_VERSIONS_PER_DOCUMENT)
    .all()
    .map((r) => r.id);

  // Only prune once retention is actually exceeded; `notInArray` with an empty
  // list would otherwise delete everything.
  if (keep.length >= MAX_VERSIONS_PER_DOCUMENT) {
    db.delete(documentVersions)
      .where(
        and(eq(documentVersions.documentId, doc.id), notInArray(documentVersions.id, keep)),
      )
      .run();
  }
}

/** True when the newest snapshot is old enough that another one is worth keeping. */
function shouldSnapshot(db: DbLike, documentId: string, now: number): boolean {
  const latest = db
    .select({ createdAt: documentVersions.createdAt })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.createdAt))
    .limit(1)
    .get();
  if (!latest) return true;
  return now - latest.createdAt >= VERSION_MIN_INTERVAL_MS;
}

export interface UpdateResult {
  doc: DocumentRow;
  /**
   * Set when the caller's `baseRevision` was stale — somebody else saved between
   * this client's last read and this write.
   *
   * The write still goes through (last-write-wins), but the content it overwrites
   * is force-snapshotted into history first. So a concurrent edit is never
   * silently destroyed, and the UI can tell the user where it went. Real
   * character-level merging would need a CRDT; see ARCHITECTURE.md.
   */
  concurrentEdit?: { by: string; at: number };
}

export function updateDocument(
  db: Db,
  documentId: string,
  user: SessionUser,
  input: { title?: string; contentHtml?: string; baseRevision?: number },
): UpdateResult {
  const { doc, role } = loadDocumentForUser(db, documentId, user.id);

  if (input.contentHtml !== undefined && !canEdit(role)) {
    throw forbidden("You have view-only access to this document.");
  }
  if (input.title !== undefined && !canRename(role)) {
    throw forbidden("You have view-only access to this document.");
  }

  const now = Date.now();
  const isStale = input.baseRevision !== undefined && input.baseRevision !== doc.revision;
  const nextHtml =
    input.contentHtml !== undefined ? sanitizeDocumentHtml(input.contentHtml) : doc.contentHtml;
  const nextTitle = input.title !== undefined ? input.title.trim() : doc.title;
  const contentChanged = nextHtml !== doc.contentHtml;

  // Resolve the other editor's name before the update overwrites updated_by_id.
  const concurrentEdit =
    isStale && doc.updatedById && doc.updatedById !== user.id
      ? {
          by:
            db.select({ name: users.name }).from(users).where(eq(users.id, doc.updatedById)).get()
              ?.name ?? "Someone",
          at: doc.updatedAt,
        }
      : undefined;

  const updated = db.transaction((tx) => {
    // Snapshot when this write destroys something worth keeping: either on the
    // normal throttled cadence, or unconditionally when we are about to overwrite
    // an edit this client never saw.
    if (contentChanged && (isStale || shouldSnapshot(tx, documentId, now))) {
      snapshotDocument(tx, doc, isStale ? "Replaced by a concurrent edit" : null, now);
    }

    return tx
      .update(documents)
      .set({
        title: nextTitle,
        contentHtml: nextHtml,
        contentText: htmlToPlainText(nextHtml),
        updatedAt: now,
        updatedById: user.id,
        revision: doc.revision + 1,
      })
      .where(eq(documents.id, documentId))
      .returning()
      .get();
  });

  return { doc: updated, concurrentEdit };
}

export function deleteDocument(db: Db, documentId: string, userId: string): void {
  const { role } = loadDocumentForUser(db, documentId, userId);
  if (!canDelete(role)) {
    throw forbidden("Only the document owner can delete it.");
  }
  // Shares, versions and presence rows follow via ON DELETE CASCADE.
  db.delete(documents).where(eq(documents.id, documentId)).run();
}
