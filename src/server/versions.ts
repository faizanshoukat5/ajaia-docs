import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documentVersions, documents, users } from "@/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { canRestoreVersion } from "@/lib/permissions";
import { htmlToPlainText } from "@/lib/sanitize";
import { loadDocumentForUser, snapshotDocument } from "./documents";
import type { SessionUser } from "./session";

export interface VersionSummary {
  id: string;
  title: string;
  createdAt: number;
  authorName: string | null;
  label: string | null;
  /** Character count, so the UI can hint at how much changed without the body. */
  size: number;
}

/**
 * History for a document, newest first. Bodies are deliberately not included —
 * the list view only needs metadata, and a document can hold up to 1 MB.
 */
export function listVersions(db: Db, documentId: string, userId: string): VersionSummary[] {
  loadDocumentForUser(db, documentId, userId); // authorizes, or throws 404

  return db
    .select({
      id: documentVersions.id,
      title: documentVersions.title,
      createdAt: documentVersions.createdAt,
      authorName: users.name,
      label: documentVersions.label,
      contentHtml: documentVersions.contentHtml,
    })
    .from(documentVersions)
    .leftJoin(users, eq(users.id, documentVersions.authorId))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      authorName: row.authorName,
      label: row.label,
      size: htmlToPlainText(row.contentHtml).length,
    }));
}

/** A single snapshot's content, for the preview pane. */
export function getVersion(db: Db, documentId: string, versionId: string, userId: string) {
  loadDocumentForUser(db, documentId, userId);

  const version = db
    .select()
    .from(documentVersions)
    .where(
      and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)),
    )
    .get();

  if (!version) throw notFound("That version no longer exists.");
    return version;
}

/**
 * Restores a snapshot by writing it forward as a new state — never by rewinding.
 *
 * The pre-restore content is snapshotted first, so "restore" is itself undoable
 * and history stays append-only.
 */
export function restoreVersion(
  db: Db,
  documentId: string,
  versionId: string,
  user: SessionUser,
) {
  const { doc, role } = loadDocumentForUser(db, documentId, user.id);
  if (!canRestoreVersion(role)) {
    throw forbidden("You have view-only access to this document.");
  }

  const version = db
    .select()
    .from(documentVersions)
    .where(
      and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)),
    )
    .get();
  if (!version) throw notFound("That version no longer exists.");

  const now = Date.now();
  return db.transaction((tx) => {
    snapshotDocument(tx, doc, "Before restore", now);

    return tx
      .update(documents)
      .set({
        title: version.title,
        contentHtml: version.contentHtml,
        contentText: htmlToPlainText(version.contentHtml),
        updatedAt: now,
        updatedById: user.id,
        revision: doc.revision + 1,
      })
      .where(eq(documents.id, documentId))
      .returning()
      .get();
  });
}
