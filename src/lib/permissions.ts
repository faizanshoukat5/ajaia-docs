/**
 * The whole access-control model, as pure functions over plain data.
 *
 * Nothing here touches the database or the request. Every route resolves a
 * caller's role once via `resolveRole` and then asks a `can*` predicate. Keeping
 * it pure is what makes the rules cheap to test exhaustively
 * (`tests/permissions.test.ts`) instead of only through HTTP.
 */

export const SHARE_ROLES = ["viewer", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

/** A share role, plus the implicit role the document owner holds. */
export type AccessRole = "owner" | ShareRole;

export function isShareRole(value: unknown): value is ShareRole {
  return typeof value === "string" && (SHARE_ROLES as readonly string[]).includes(value);
}

export interface DocumentAccessInput {
  ownerId: string;
  /**
   * Share rows for this document. `role` is typed loosely on purpose: it comes
   * from a TEXT column, and a value written by an older/newer build must fail
   * closed rather than be trusted.
   */
  shares: ReadonlyArray<{ userId: string; role: string }>;
}

/**
 * The caller's effective role, or `null` if they have no access at all.
 *
 * Ownership always wins over a share row, so a document that was somehow shared
 * with its own owner still grants full rights rather than downgrading them.
 */
export function resolveRole(
  doc: DocumentAccessInput,
  userId: string | null | undefined,
): AccessRole | null {
  if (!userId) return null;
  if (doc.ownerId === userId) return "owner";

  const share = doc.shares.find((s) => s.userId === userId);
  if (!share) return null;
  // Unrecognized role in the database -> no access, not partial access.
  if (!isShareRole(share.role)) return null;
  return share.role;
}

/** Read the document and its version history. */
export function canView(role: AccessRole | null): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

/** Change the body of the document. */
export function canEdit(role: AccessRole | null): boolean {
  return role === "owner" || role === "editor";
}

/** Rename the document. Editors may, because renaming is a content-level act. */
export function canRename(role: AccessRole | null): boolean {
  return role === "owner" || role === "editor";
}

/** Roll the document back to an earlier snapshot — a write, so editors may. */
export function canRestoreVersion(role: AccessRole | null): boolean {
  return canEdit(role);
}

/** Import file content into an existing document — also a write. */
export function canImportInto(role: AccessRole | null): boolean {
  return canEdit(role);
}

/**
 * Add, change or revoke collaborators. Owner only: letting editors re-share
 * would make the access graph unbounded, which is not a call this scope needs.
 */
export function canManageSharing(role: AccessRole | null): boolean {
  return role === "owner";
}

/** Delete the document outright. Owner only. */
export function canDelete(role: AccessRole | null): boolean {
  return role === "owner";
}

/** Human-facing label for a role badge. */
export function roleLabel(role: AccessRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "editor":
      return "Can edit";
    case "viewer":
      return "Can view";
  }
}
