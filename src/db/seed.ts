import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { documentShares, documentVersions, documents, users } from "./schema";
import { SEED_PASSWORD, SEED_USERS, type SeedUserKey } from "@/lib/demo-accounts";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/password";
import { htmlToPlainText } from "@/lib/sanitize";

/**
 * Demo data. Three accounts that already share documents with each other, so a
 * reviewer can verify the owned/shared distinction and both share roles without
 * setting anything up first.
 *
 * The shared password is intentional and documented in the README — these are
 * throwaway demo accounts, not a credential-handling example.
 */

export { SEED_PASSWORD, SEED_USERS } from "@/lib/demo-accounts";

const ROADMAP_HTML = `
<h1>Q3 Productivity Roadmap</h1>
<p>This is the working draft for the internal tools review. <strong>Ada owns this document</strong> and has shared it with the team.</p>
<h2>Themes</h2>
<ul>
<li><strong>Shared context</strong> — stop losing decisions in chat threads</li>
<li><strong>Fewer handoffs</strong> — one surface for drafting and review</li>
<li><em>Measurable</em> time-to-first-draft</li>
</ul>
<h2>Open questions</h2>
<ol>
<li>Do we need per-paragraph comments in v1, or is a shared draft enough?</li>
<li>How do we handle two people editing the same paragraph?</li>
<li>What is the smallest useful import path — <code>.docx</code> only, or markdown too?</li>
</ol>
<blockquote><p>Decision from 12 June: ship the editor first, layer collaboration signals on top.</p></blockquote>
<p>See the <a href="https://example.com/spec">full specification</a> for background.</p>
`;

const MEETING_NOTES_HTML = `
<h1>Weekly sync — notes</h1>
<p><strong>Attendees:</strong> Ada, Grace, Alan</p>
<h3>Decisions</h3>
<ul>
<li>Autosave beats an explicit save button for this workflow.</li>
<li>Sharing is <u>role-based</u>: viewers cannot edit, editors cannot re-share.</li>
</ul>
<h3>Follow-ups</h3>
<ol>
<li>Grace to draft the import spec.</li>
<li>Alan to review the access-control rules.</li>
</ol>
`;

const IMPORT_SPEC_HTML = `
<h1>File import — spec</h1>
<p>Grace owns this one. Ada has <em>view-only</em> access, which is a good way to check that the read-only state actually holds.</p>
<h2>Supported formats</h2>
<ul>
<li><code>.txt</code> — blank lines become paragraphs</li>
<li><code>.md</code> / <code>.markdown</code> — headings, lists, emphasis, links</li>
<li><code>.docx</code> — converted via mammoth, styles flattened to the editor's schema</li>
</ul>
<h2>Explicitly out of scope</h2>
<ul>
<li>Images and tables</li>
<li>Legacy <code>.doc</code></li>
<li>PDF</li>
</ul>
`;

const SCRATCH_HTML = `
<h1>Scratch pad</h1>
<p>Alan's private document. Nobody else can see this one, which is the case worth checking after signing in as Grace or Ada.</p>
<p>Try the formatting toolbar here: <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strikethrough</s>.</p>
`;

interface SeedResult {
  users: number;
  documents: number;
  shares: number;
}

/**
 * Wipes and repopulates the demo data. Idempotent: safe to run repeatedly.
 * Only ever touches rows it created, and it creates all of them.
 */
export function seed(db: Db): SeedResult {
  const now = Date.now();
  const minutes = (n: number) => now - n * 60 * 1000;
  const passwordHash = hashPassword(SEED_PASSWORD);

  return db.transaction((tx) => {
    // Order matters only for clarity; ON DELETE CASCADE would handle children.
    tx.delete(documentVersions).run();
    tx.delete(documentShares).run();
    tx.delete(documents).run();
    tx.delete(users).run();

    const ids = new Map<SeedUserKey, string>();
    for (const user of SEED_USERS) {
      const id = newId();
      ids.set(user.key, id);
      tx.insert(users)
        .values({
          id,
          email: user.email,
          name: user.name,
          passwordHash,
          createdAt: minutes(60 * 24 * 30),
        })
        .run();
    }

    const userId = (key: SeedUserKey): string => {
      const id = ids.get(key);
      if (!id) throw new Error(`seed: unknown user key ${key}`);
      return id;
    };

    const insertDoc = (input: {
      title: string;
      html: string;
      owner: SeedUserKey;
      createdAt: number;
      updatedAt: number;
      updatedBy: SeedUserKey;
    }) => {
      const html = input.html.trim();
      const id = newId();
      tx.insert(documents)
        .values({
          id,
          title: input.title,
          contentHtml: html,
          contentText: htmlToPlainText(html),
          ownerId: userId(input.owner),
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          updatedById: userId(input.updatedBy),
          revision: 3,
        })
        .run();
      return id;
    };

    const roadmapId = insertDoc({
      title: "Q3 Productivity Roadmap",
      html: ROADMAP_HTML,
      owner: "ada",
      createdAt: minutes(60 * 24 * 6),
      updatedAt: minutes(42),
      updatedBy: "grace",
    });

    const notesId = insertDoc({
      title: "Weekly sync — notes",
      html: MEETING_NOTES_HTML,
      owner: "ada",
      createdAt: minutes(60 * 24 * 2),
      updatedAt: minutes(180),
      updatedBy: "ada",
    });

    const specId = insertDoc({
      title: "File import — spec",
      html: IMPORT_SPEC_HTML,
      owner: "grace",
      createdAt: minutes(60 * 24 * 3),
      updatedAt: minutes(95),
      updatedBy: "grace",
    });

    insertDoc({
      title: "Scratch pad",
      html: SCRATCH_HTML,
      owner: "alan",
      createdAt: minutes(60 * 12),
      updatedAt: minutes(20),
      updatedBy: "alan",
    });

    const shares = [
      // Ada's roadmap: Grace can edit, Alan can only read.
      { documentId: roadmapId, userId: userId("grace"), role: "editor" as const, by: "ada" as const },
      { documentId: roadmapId, userId: userId("alan"), role: "viewer" as const, by: "ada" as const },
      // Ada's notes: Alan can edit.
      { documentId: notesId, userId: userId("alan"), role: "editor" as const, by: "ada" as const },
      // Grace's spec: Ada can only read — the read-only path to demo.
      { documentId: specId, userId: userId("ada"), role: "viewer" as const, by: "grace" as const },
    ];

    for (const share of shares) {
      tx.insert(documentShares)
        .values({
          documentId: share.documentId,
          userId: share.userId,
          role: share.role,
          createdAt: minutes(60 * 24),
          createdById: userId(share.by),
        })
        .run();
    }

    // One prior version on the roadmap so History has something to show without
    // the reviewer having to wait out the snapshot throttle.
    tx.insert(documentVersions)
      .values({
        id: newId(),
        documentId: roadmapId,
        title: "Q3 Productivity Roadmap",
        contentHtml:
          "<h1>Q3 Productivity Roadmap</h1><p>First pass — just the themes, no open questions yet.</p><ul><li>Shared context</li><li>Fewer handoffs</li></ul>",
        authorId: userId("ada"),
        createdAt: minutes(60 * 24 * 5),
        label: "First draft",
      })
      .run();

    return {
      users: SEED_USERS.length,
      documents: 4,
      shares: shares.length,
    };
  });
}

/** Row counts, for the seed script's summary output. */
export function tableCounts(db: Db) {
  const countOf = (table: typeof users | typeof documents | typeof documentShares | typeof documentVersions) =>
    Number(db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0);

  return {
    users: countOf(users),
    documents: countOf(documents),
    shares: countOf(documentShares),
    versions: countOf(documentVersions),
  };
}
