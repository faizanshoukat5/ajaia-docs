import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { MAX_VERSIONS_PER_DOCUMENT, VERSION_MIN_INTERVAL_MS } from "@/lib/limits";
import {
  createDocument,
  deleteDocument,
  listDocumentsForUser,
  loadDocumentForUser,
  snapshotDocument,
  updateDocument,
} from "@/server/documents";
import { addShare, listShareableUsers, removeShare, updateShareRole } from "@/server/shares";
import { listVersions, restoreVersion } from "@/server/versions";
import type { SessionUser } from "@/server/session";
import { makeUser, testDb } from "./helpers";

/**
 * End-to-end tests of the server layer against a real SQLite database built from
 * the actual migrations. These cover the behaviour that only emerges when
 * permissions, persistence and versioning interact — which is where the bugs in a
 * system like this actually live.
 */

let db: Db;
let ada: SessionUser;
let grace: SessionUser;
let alan: SessionUser;

beforeEach(() => {
  db = testDb();
  ada = makeUser(db, "Ada Lovelace");
  grace = makeUser(db, "Grace Hopper");
  alan = makeUser(db, "Alan Turing");
});

function expectStatus(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(status);
    return;
  }
  throw new Error(`Expected the call to throw a ${status}, but it succeeded.`);
}

describe("create and read", () => {
  it("creates a document owned by its author", () => {
    const doc = createDocument(db, ada.id, { title: "Plan" });
    const loaded = loadDocumentForUser(db, doc.id, ada.id);

    expect(loaded.doc.title).toBe("Plan");
    expect(loaded.role).toBe("owner");
    expect(loaded.owner.name).toBe("Ada Lovelace");
    expect(loaded.shares).toEqual([]);
  });

  it("defaults the title when none is given", () => {
    expect(createDocument(db, ada.id).title).toBe("Untitled document");
  });

  it("stores a plain-text projection alongside the HTML", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<h1>Hi</h1><p>there</p>" });
    expect(doc.contentText).toBe("Hi\nthere");
  });

  it("sanitizes content at creation", () => {
    const doc = createDocument(db, ada.id, {
      contentHtml: '<p>ok</p><script>alert(1)</script>',
    });
    expect(doc.contentHtml).toBe("<p>ok</p>");
  });

  it("hides a document from users with no access", () => {
    const doc = createDocument(db, ada.id);
    // 404 rather than 403, so document ids are not an existence oracle.
    expectStatus(() => loadDocumentForUser(db, doc.id, grace.id), 404);
  });

  it("404s for a document that does not exist", () => {
    expectStatus(() => loadDocumentForUser(db, "NOPE", ada.id), 404);
  });
});

describe("listing", () => {
  it("separates owned documents from shared ones", () => {
    const mine = createDocument(db, ada.id, { title: "Mine" });
    const theirs = createDocument(db, grace.id, { title: "Theirs" });
    addShare(db, theirs.id, grace.id, { email: ada.email, role: "viewer" });

    const list = listDocumentsForUser(db, ada.id);
    expect(list.owned.map((d) => d.id)).toEqual([mine.id]);
    expect(list.shared.map((d) => d.id)).toEqual([theirs.id]);
    expect(list.shared[0]?.role).toBe("viewer");
    expect(list.shared[0]?.owner.name).toBe("Grace Hopper");
  });

  it("shows nothing to a user with no documents", () => {
    createDocument(db, ada.id);
    const list = listDocumentsForUser(db, alan.id);
    expect(list.owned).toEqual([]);
    expect(list.shared).toEqual([]);
  });

  it("counts collaborators per document", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });
    addShare(db, doc.id, ada.id, { email: alan.email, role: "viewer" });

    expect(listDocumentsForUser(db, ada.id).owned[0]?.collaboratorCount).toBe(2);
  });

  it("orders by most recently edited", () => {
    const first = createDocument(db, ada.id, { title: "First" });
    const second = createDocument(db, ada.id, { title: "Second" });
    updateDocument(db, first.id, ada, { contentHtml: "<p>touched</p>" });

    const titles = listDocumentsForUser(db, ada.id).owned.map((d) => d.title);
    expect(titles[0]).toBe("First");
    expect(titles[1]).toBe("Second");
    expect(second.id).toBeTruthy();
  });
});

describe("editing permissions", () => {
  it("lets an editor change the content", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });

    const { doc: updated } = updateDocument(db, doc.id, grace, { contentHtml: "<p>edited</p>" });
    expect(updated.contentHtml).toBe("<p>edited</p>");
    expect(updated.updatedById).toBe(grace.id);
  });

  it("refuses content edits from a viewer", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: alan.email, role: "viewer" });

    expectStatus(() => updateDocument(db, doc.id, alan, { contentHtml: "<p>nope</p>" }), 403);
  });

  it("refuses renames from a viewer", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: alan.email, role: "viewer" });

    expectStatus(() => updateDocument(db, doc.id, alan, { title: "Hijacked" }), 403);
  });

  it("refuses any edit from a stranger, as a 404", () => {
    const doc = createDocument(db, ada.id);
    expectStatus(() => updateDocument(db, doc.id, grace, { contentHtml: "<p>x</p>" }), 404);
  });

  it("sanitizes content on update, not just on create", () => {
    const doc = createDocument(db, ada.id);
    const { doc: updated } = updateDocument(db, doc.id, ada, {
      contentHtml: '<p>text</p><img src=x onerror=alert(1)>',
    });
    expect(updated.contentHtml).toBe("<p>text</p>");
  });

  it("increments the revision on every accepted write", () => {
    const doc = createDocument(db, ada.id);
    expect(doc.revision).toBe(1);
    expect(updateDocument(db, doc.id, ada, { contentHtml: "<p>a</p>" }).doc.revision).toBe(2);
    expect(updateDocument(db, doc.id, ada, { contentHtml: "<p>b</p>" }).doc.revision).toBe(3);
  });

  it("only lets the owner delete", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });

    expectStatus(() => deleteDocument(db, doc.id, grace.id), 403);
    deleteDocument(db, doc.id, ada.id);
    expectStatus(() => loadDocumentForUser(db, doc.id, ada.id), 404);
  });

  it("removes shares when the document is deleted", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });
    deleteDocument(db, doc.id, ada.id);

    // The cascade must actually fire, or Grace keeps a dangling row.
    expect(listDocumentsForUser(db, grace.id).shared).toEqual([]);
  });
});

describe("sharing", () => {
  it("grants access by email, case-insensitively", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email.toUpperCase(), role: "editor" });

    expect(loadDocumentForUser(db, doc.id, grace.id).role).toBe("editor");
  });

  it("treats re-sharing as a role change rather than a duplicate", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "viewer" });
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });

    const loaded = loadDocumentForUser(db, doc.id, ada.id);
    expect(loaded.shares).toHaveLength(1);
    expect(loaded.shares[0]?.role).toBe("editor");
  });

  it("stops an editor from re-sharing the document", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });

    expectStatus(() => addShare(db, doc.id, grace.id, { email: alan.email, role: "editor" }), 403);
  });

  it("rejects sharing with an address that has no account", () => {
    const doc = createDocument(db, ada.id);
    expectStatus(() => addShare(db, doc.id, ada.id, { email: "nobody@test.local", role: "editor" }), 400);
  });

  it("rejects sharing a document with its own owner", () => {
    const doc = createDocument(db, ada.id);
    expectStatus(() => addShare(db, doc.id, ada.id, { email: ada.email, role: "editor" }), 400);
  });

  it("downgrades an editor to a viewer", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });
    updateShareRole(db, doc.id, ada.id, grace.id, "viewer");

    expect(loadDocumentForUser(db, doc.id, grace.id).role).toBe("viewer");
    expectStatus(() => updateDocument(db, doc.id, grace, { contentHtml: "<p>x</p>" }), 403);
  });

  it("revokes access completely", () => {
    const doc = createDocument(db, ada.id);
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });
    removeShare(db, doc.id, ada.id, grace.id);

    expectStatus(() => loadDocumentForUser(db, doc.id, grace.id), 404);
  });

  it("404s when revoking someone who never had access", () => {
    const doc = createDocument(db, ada.id);
    expectStatus(() => removeShare(db, doc.id, ada.id, alan.id), 404);
  });

  it("excludes the caller from the shareable-user list", () => {
    const ids = listShareableUsers(db, ada.id).map((u) => u.id);
    expect(ids).not.toContain(ada.id);
    expect(ids).toContain(grace.id);
  });
});

describe("version history", () => {
  it("snapshots the previous content before overwriting it", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>original</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>replacement</p>" });

    const versions = listVersions(db, doc.id, ada.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.authorName).toBe("Ada Lovelace");
  });

  it("throttles snapshots so autosave does not flood history", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>v0</p>" });
    // Three rapid edits: only the first crosses the "no snapshot yet" threshold.
    updateDocument(db, doc.id, ada, { contentHtml: "<p>v1</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>v2</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>v3</p>" });

    expect(listVersions(db, doc.id, ada.id)).toHaveLength(1);
    expect(VERSION_MIN_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("does not snapshot when the content did not actually change", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>same</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>same</p>" });

    expect(listVersions(db, doc.id, ada.id)).toHaveLength(0);
  });

  it("restores a version forward, keeping the replaced content in history", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>original</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>changed</p>" });

    const [version] = listVersions(db, doc.id, ada.id);
    const restored = restoreVersion(db, doc.id, version!.id, ada);

    expect(restored.contentHtml).toBe("<p>original</p>");
    // Restoring is itself undoable: the pre-restore state was snapshotted too.
    const after = listVersions(db, doc.id, ada.id);
    expect(after.length).toBeGreaterThan(1);
    expect(after.some((v) => v.label === "Before restore")).toBe(true);
  });

  it("refuses a restore from a viewer", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>a</p>" });
    updateDocument(db, doc.id, ada, { contentHtml: "<p>b</p>" });
    addShare(db, doc.id, ada.id, { email: alan.email, role: "viewer" });

    const [version] = listVersions(db, doc.id, alan.id); // viewers may read history
    expectStatus(() => restoreVersion(db, doc.id, version!.id, alan), 403);
  });

  it("hides history from users with no access", () => {
    const doc = createDocument(db, ada.id);
    expectStatus(() => listVersions(db, doc.id, grace.id), 404);
  });

  it("prunes history beyond the retention limit", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>base</p>" });
    // Drive the snapshot helper directly to bypass the time throttle.
    for (let i = 0; i < MAX_VERSIONS_PER_DOCUMENT + 10; i++) {
      snapshotDocument(
        db,
        { id: doc.id, title: doc.title, contentHtml: `<p>v${i}</p>`, updatedById: ada.id },
        null,
        Date.now() + i,
      );
    }
    expect(listVersions(db, doc.id, ada.id)).toHaveLength(MAX_VERSIONS_PER_DOCUMENT);
  });

  it("records where imported content came from", () => {
    const doc = createDocument(db, ada.id, {
      contentHtml: "<p>from a file</p>",
      versionLabel: "Imported from notes.docx",
    });
    expect(listVersions(db, doc.id, ada.id)[0]?.label).toBe("Imported from notes.docx");
  });
});

describe("concurrent edits", () => {
  it("reports when another user saved in between, and keeps their work", () => {
    const doc = createDocument(db, ada.id, { contentHtml: "<p>start</p>" });
    addShare(db, doc.id, ada.id, { email: grace.email, role: "editor" });

    // Both clients loaded revision 1. Grace saves first.
    updateDocument(db, doc.id, grace, { contentHtml: "<p>grace's work</p>", baseRevision: 1 });
    // Ada saves against the now-stale revision she loaded.
    const result = updateDocument(db, doc.id, ada, {
      contentHtml: "<p>ada's work</p>",
      baseRevision: 1,
    });

    // Last write wins, but the user is told, and nothing is destroyed.
    expect(result.doc.contentHtml).toBe("<p>ada's work</p>");
    expect(result.concurrentEdit?.by).toBe("Grace Hopper");

    const versions = listVersions(db, doc.id, ada.id);
    expect(versions.some((v) => v.label === "Replaced by a concurrent edit")).toBe(true);
  });

  it("does not flag a user's own consecutive saves as a conflict", () => {
    const doc = createDocument(db, ada.id);
    updateDocument(db, doc.id, ada, { contentHtml: "<p>one</p>", baseRevision: 1 });
    // Deliberately stale, but it is the same author, so this is not a conflict.
    const result = updateDocument(db, doc.id, ada, {
      contentHtml: "<p>two</p>",
      baseRevision: 1,
    });
    expect(result.concurrentEdit).toBeUndefined();
  });

  it("does not flag anything when the client sends a current revision", () => {
    const doc = createDocument(db, ada.id);
    const first = updateDocument(db, doc.id, ada, { contentHtml: "<p>a</p>", baseRevision: 1 });
    const second = updateDocument(db, doc.id, ada, {
      contentHtml: "<p>b</p>",
      baseRevision: first.doc.revision,
    });
    expect(second.concurrentEdit).toBeUndefined();
  });
});
