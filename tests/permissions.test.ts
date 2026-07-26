import { describe, expect, it } from "vitest";
import {
  canDelete,
  canEdit,
  canManageSharing,
  canRename,
  canRestoreVersion,
  canView,
  isShareRole,
  resolveRole,
  roleLabel,
  type AccessRole,
} from "@/lib/permissions";

/**
 * The access-control rules are the part of this system where a mistake is both
 * most likely and most costly, so they are tested as an exhaustive matrix rather
 * than by example. If a predicate's behaviour changes for any role, this fails.
 */

const OWNER = "user-owner";
const EDITOR = "user-editor";
const VIEWER = "user-viewer";
const STRANGER = "user-stranger";

const doc = {
  ownerId: OWNER,
  shares: [
    { userId: EDITOR, role: "editor" },
    { userId: VIEWER, role: "viewer" },
  ],
};

describe("resolveRole", () => {
  it("identifies the owner", () => {
    expect(resolveRole(doc, OWNER)).toBe("owner");
  });

  it("identifies shared roles", () => {
    expect(resolveRole(doc, EDITOR)).toBe("editor");
    expect(resolveRole(doc, VIEWER)).toBe("viewer");
  });

  it("returns null for a user with no relationship to the document", () => {
    expect(resolveRole(doc, STRANGER)).toBeNull();
  });

  it("returns null for anonymous callers", () => {
    expect(resolveRole(doc, null)).toBeNull();
    expect(resolveRole(doc, undefined)).toBeNull();
    expect(resolveRole(doc, "")).toBeNull();
  });

  it("prefers ownership over a share row, so the owner is never downgraded", () => {
    const selfShared = {
      ownerId: OWNER,
      shares: [{ userId: OWNER, role: "viewer" }],
    };
    expect(resolveRole(selfShared, OWNER)).toBe("owner");
  });

  it("fails closed on a role value it does not recognise", () => {
    // A row written by a different build, or tampered with directly in SQLite,
    // must not be treated as partial access.
    const corrupt = { ownerId: OWNER, shares: [{ userId: EDITOR, role: "admin" }] };
    expect(resolveRole(corrupt, EDITOR)).toBeNull();
    expect(canView(resolveRole(corrupt, EDITOR))).toBe(false);
  });

  it("ignores case differences in role values rather than guessing intent", () => {
    const corrupt = { ownerId: OWNER, shares: [{ userId: EDITOR, role: "Editor" }] };
    expect(resolveRole(corrupt, EDITOR)).toBeNull();
  });
});

describe("capability matrix", () => {
  const cases: Array<{
    role: AccessRole | null;
    view: boolean;
    edit: boolean;
    rename: boolean;
    restore: boolean;
    share: boolean;
    remove: boolean;
  }> = [
    { role: "owner", view: true, edit: true, rename: true, restore: true, share: true, remove: true },
    { role: "editor", view: true, edit: true, rename: true, restore: true, share: false, remove: false },
    { role: "viewer", view: true, edit: false, rename: false, restore: false, share: false, remove: false },
    { role: null, view: false, edit: false, rename: false, restore: false, share: false, remove: false },
  ];

  for (const c of cases) {
    it(`role=${c.role ?? "none"} has the expected capabilities`, () => {
      expect(canView(c.role)).toBe(c.view);
      expect(canEdit(c.role)).toBe(c.edit);
      expect(canRename(c.role)).toBe(c.rename);
      expect(canRestoreVersion(c.role)).toBe(c.restore);
      expect(canManageSharing(c.role)).toBe(c.share);
      expect(canDelete(c.role)).toBe(c.remove);
    });
  }

  it("never lets a non-owner manage sharing or delete", () => {
    // Stated separately from the matrix because these are the two rules that
    // would be most damaging to get wrong.
    for (const role of ["editor", "viewer", null] as const) {
      expect(canManageSharing(role)).toBe(false);
      expect(canDelete(role)).toBe(false);
    }
  });

  it("only grants write capabilities to roles that can also view", () => {
    for (const role of ["owner", "editor", "viewer", null] as const) {
      if (canEdit(role)) expect(canView(role)).toBe(true);
      if (canManageSharing(role)) expect(canView(role)).toBe(true);
    }
  });
});

describe("isShareRole", () => {
  it("accepts only the two supported roles", () => {
    expect(isShareRole("viewer")).toBe(true);
    expect(isShareRole("editor")).toBe(true);
    expect(isShareRole("owner")).toBe(false);
    expect(isShareRole("")).toBe(false);
    expect(isShareRole(null)).toBe(false);
    expect(isShareRole(undefined)).toBe(false);
    expect(isShareRole(1)).toBe(false);
    expect(isShareRole({})).toBe(false);
  });
});

describe("roleLabel", () => {
  it("gives every role human-facing copy", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("editor")).toBe("Can edit");
    expect(roleLabel("viewer")).toBe("Can view");
  });
});
