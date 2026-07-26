import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documentShares, users } from "@/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { canManageSharing, type ShareRole } from "@/lib/permissions";
import { loadDocumentForUser, type ShareEntry } from "./documents";

/**
 * Sharing is by email against an existing account. There is no invite-by-link and
 * no email delivery — see ARCHITECTURE.md for why that was cut and what it would
 * take to add.
 */

function findUserByEmail(db: Db, email: string) {
  // Matches the `lower(email)` unique index, so this uses the index rather than
  // scanning.
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .get();
}

export function listShares(db: Db, documentId: string, userId: string): ShareEntry[] {
  // Any viewer may see who else has access; that is normal in a doc tool and
  // avoids a confusing asymmetry when two people are editing.
  return loadDocumentForUser(db, documentId, userId).shares;
}

export function addShare(
  db: Db,
  documentId: string,
  ownerUserId: string,
  input: { email: string; role: ShareRole },
): ShareEntry {
  const { doc, role } = loadDocumentForUser(db, documentId, ownerUserId);
  if (!canManageSharing(role)) {
    throw forbidden("Only the document owner can change who has access.");
  }

  const target = findUserByEmail(db, input.email);
  if (!target) {
    // Enumeration is not a concern here: these are seeded, known-to-each-other
    // demo accounts, and a vague error would make the flow untestable.
    throw badRequest(
      `No account found for ${input.email}. Sharing works between existing accounts — see the seeded users in the README.`,
    );
  }
  if (target.id === doc.ownerId) {
    throw badRequest("That person already owns this document.");
  }

  db.insert(documentShares)
    .values({
      documentId,
      userId: target.id,
      role: input.role,
      createdAt: Date.now(),
      createdById: ownerUserId,
    })
    // Re-sharing with a different role is a role change, not an error.
    .onConflictDoUpdate({
      target: [documentShares.documentId, documentShares.userId],
      set: { role: input.role },
    })
    .run();

  return { userId: target.id, role: input.role, name: target.name, email: target.email };
}

export function updateShareRole(
  db: Db,
  documentId: string,
  ownerUserId: string,
  targetUserId: string,
  role: ShareRole,
): ShareEntry {
  const { role: callerRole } = loadDocumentForUser(db, documentId, ownerUserId);
  if (!canManageSharing(callerRole)) {
    throw forbidden("Only the document owner can change who has access.");
  }

  const updated = db
    .update(documentShares)
    .set({ role })
    .where(
      and(eq(documentShares.documentId, documentId), eq(documentShares.userId, targetUserId)),
    )
    .returning()
    .get();

  if (!updated) throw notFound("That person does not have access to this document.");

  const target = db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .get();

  return {
    userId: targetUserId,
    role,
    name: target?.name ?? "Unknown user",
    email: target?.email ?? "",
  };
}

export function removeShare(
  db: Db,
  documentId: string,
  ownerUserId: string,
  targetUserId: string,
): void {
  const { role } = loadDocumentForUser(db, documentId, ownerUserId);
  if (!canManageSharing(role)) {
    throw forbidden("Only the document owner can change who has access.");
  }

  const removed = db
    .delete(documentShares)
    .where(
      and(eq(documentShares.documentId, documentId), eq(documentShares.userId, targetUserId)),
    )
    .returning()
    .get();

  if (!removed) throw notFound("That person does not have access to this document.");
}

/**
 * Accounts the caller can share with: everyone except themselves. Powers the
 * datalist in the share dialog, which is what makes the seeded-user flow quick to
 * demo. A real product would scope this to an organization.
 */
export function listShareableUsers(db: Db, callerId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`${users.id} <> ${callerId}`)
    .orderBy(users.name)
    .all();
}
