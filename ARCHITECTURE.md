# Architecture note

What I prioritized, what I cut, and why.

---

## The framing decision

"A lightweight collaborative document editor inspired by Google Docs" can absorb
unlimited effort. The brief explicitly rewards depth over coverage, so before
writing anything I picked the spine of the product and agreed with myself to
defend it:

> **A document you can actually write in, that other people can actually open,
> where nothing you type is ever lost.**

Everything below follows from that sentence. Each of the three clauses got real
engineering; things outside it got cut deliberately and are listed at the bottom.

The main risk in a brief like this is a demo that looks broad and collapses on
contact — five half-features where the sixth click 500s. I would rather show four
things that survive being poked at.

---

## Stack

| Choice | Why | What I gave up |
| --- | --- | --- |
| **Next.js 16 (App Router)** | One deployable unit for UI and API. Server components mean the document list and editor arrive server-rendered with data already in them — no spinner on the primary surface. | A separate API would be tidier if this ever needed non-web clients. |
| **TipTap 3** (ProseMirror) | Rich text is the one thing here that is genuinely hard. ProseMirror has a real document model, so "bold" is a schema operation, not a `contenteditable` guess. MIT-licensed. | ~90 KB of client JS. Worth it — this is the core of the product. |
| **SQLite + Drizzle** | Zero setup: `npm install && npm run setup` works on a clean machine with no database server, no Docker, no cloud account. Relational integrity (cascades, unique indexes, foreign keys) for free. Drizzle gives typed queries without a codegen daemon. | Single-writer. Cannot scale horizontally without changing stores. |
| **Cookie sessions, no auth library** | Auth is not what is being evaluated, and NextAuth would have been more configuration than code at this size. HMAC-signed cookie + scrypt is ~100 lines I fully understand. | No OAuth, no password reset, no session revocation. |
| **Tailwind v4** | Fast, consistent spacing and colour without inventing a design system. | — |
| **Vitest** | Fast, native ESM/TS, same `expect` vocabulary as Jest. | — |

### Hand-written SQL migrations

`src/db/migrations/*.sql` is the source of truth; `src/db/schema.ts` is a
hand-written Drizzle mirror used only for typing.

This is a real tradeoff. Codegen (`drizzle-kit`) would keep the two in sync
automatically, but it adds a generate step to every schema change and produces
SQL nobody reads. At this size I would rather the physical schema be one readable
file with comments explaining *why* each column exists.

The obvious risk is drift. `tests/schema.test.ts` closes it: it builds a database
from the real migration files and selects every column of every table through
Drizzle. Rename a column in one place and not the other, and the suite fails
immediately rather than at runtime.

---

## Where the effort went

### 1. Never lose the user's work

This got the most attention, because it is the thing that destroys trust in a
document editor and it is invisible when it works.

- **Autosave**, debounced ~900 ms, with one in-flight request at a time. Edits
  made during a save are coalesced into a single follow-up rather than queued per
  keystroke, so fast typing produces a steady trickle of writes instead of a
  pile-up.
- **`keepalive` flush on unload.** A normal `fetch` is cancelled when the tab
  closes. `keepalive: true` lets it outlive the page — which is what makes a
  900 ms debounce safe rather than a gamble.
- **Failed saves stay dirty.** A dropped connection leaves the draft pending and
  surfaces a retry, instead of a silent loss with a green checkmark.
- **Version history** as a safety net under all of it.

### 2. Concurrent edits, handled honestly

Two people editing one document is the hard problem in this space and I did not
have time to solve it properly. What I did instead:

Every write carries the `baseRevision` the client was editing. If the server's
revision has moved on, it means somebody else saved in between. The server then:

1. **Force-snapshots** the content it is about to overwrite into version history,
   bypassing the normal one-per-minute throttle.
2. Applies the write (last-write-wins).
3. Returns `concurrentEdit: { by, at }`.

The UI shows *"Grace edited this while you were writing — their version is in
history"* with a link straight to it.

This is not a merge. But it means **no edit is ever silently destroyed**, and the
user is told what happened rather than discovering it later. Proper concurrent
editing needs a CRDT (Yjs) and a WebSocket server — a different architecture, not
an increment, and not something to half-build in a timebox. Choosing the honest
degradation over a fragile fake merge was the single most deliberate call I made.

### 3. Content sanitization as a real boundary

Document HTML is rendered with `dangerouslySetInnerHTML` and loaded into the
editor, so it is executable content. Two untrusted sources feed it: the browser
(a client can `PATCH` any string — TipTap being well-behaved is not a security
property) and imported `.docx`/`.md` files.

Both go through one allowlist sanitizer **on write**, not on read. Sanitizing on
write means stored data is always safe, so a future surface that forgets to
sanitize cannot reintroduce the hole. The allowlist is exactly the set of tags
the editor can produce — adding a toolbar button means widening it, which is
intended friction.

`tests/sanitize.test.ts` covers script injection, event handlers, `javascript:`
in four obfuscations, `data:` URLs, protocol-relative URLs, Word's conditional
comments, and double-encoding. It also asserts **idempotency** — content is
re-sanitized on every save, so a non-idempotent sanitizer would make documents
drift with each keystroke.

### 4. Authorization as pure functions

`src/lib/permissions.ts` has no imports. It is plain functions over plain data:
`resolveRole(doc, userId)` then `canEdit(role)`, `canManageSharing(role)`, and so
on. Every route resolves once and asks a predicate.

Making this pure is what let me test the entire role × capability matrix
exhaustively instead of by example, including the cases that matter most:

- An unrecognized role string in the database **fails closed** rather than
  granting partial access.
- Ownership always beats a share row, so a document shared with its own owner
  never downgrades them.
- Missing/`null` access is 404, not 403 — a document id should not confirm that a
  document exists to someone who cannot see it.

### 5. Import that tells the truth

Dispatch is on file **extension**, not the browser's `Content-Type`: browsers
disagree on the type for `.md`, and the header is client-controlled anyway.

Every rejection path returns a message a human can act on — a renamed `.doc` says
*"re-save it as .docx"*, a binary file with a `.txt` extension is detected by NUL
bytes rather than being decoded into replacement characters, and Word styles that
could not be mapped are reported after the import instead of vanishing.

---

## Deliberate cuts

Each of these was a considered decision, not an oversight.

| Cut | Why |
| --- | --- |
| **Real-time collaborative editing** | Needs a CRDT and a stateful socket server. Half-built, it corrupts documents. Shipped honest conflict handling instead. |
| **Comments / suggestion mode** | A second document-anchored data model with its own permission surface. Bigger than it looks. |
| **Images and tables** | Images need blob storage and a media pipeline; tables need a much larger editor schema and a wider sanitizer allowlist. Both are visible in `.docx` imports, so the import warns rather than pretending. |
| **PDF export** | Needs headless Chromium or a PDF library — a disproportionate dependency. The browser's print-to-PDF is wired up and covers the need. |
| **Email invites / password reset** | Requires an email provider, which would mean a reviewer needs an account somewhere. The brief says not to require that. |
| **Binary attachments** | The brief allows "upload a file" to mean import, which is the more product-relevant behaviour here. Attachments would need object storage to be done properly, and stuffing blobs into SQLite would bloat the file the whole app depends on. |
| **Folders, search, trash, favourites** | List-management features. Breadth, not depth. |
| **OAuth** | Not what is being evaluated. |

---

## Things I would flag in review

Being specific about the weak points, rather than only the strong ones:

- **`/api/users` returns every account.** It powers the share dialog's
  suggestions. Correct for a three-account demo, wrong for a real product —
  should be scoped to an organization.
- **Login rate limiting is in-process.** It does not survive a restart or
  coordinate across instances. Better than nothing on a password endpoint;
  not a substitute for a real limiter.
- **Sessions cannot be individually revoked.** There is no session table —
  rotating `SESSION_SECRET` invalidates everyone at once. Acceptable here,
  not acceptable with real users.
- **Presence writes on every heartbeat.** Ten seconds per open document per user
  is fine at this scale and would need a different store at any real one.
- **Demo credentials are on the login page.** Deliberate for review; first thing
  to remove otherwise.
- **The `.docx` importer flattens styling** to the editor's schema. That is the
  intended behaviour, but a user importing a heavily formatted document will lose
  more than the warnings convey.

---

## If this needed to scale

The change that unlocks everything else is **SQLite → Postgres**. Everything that
touches the database lives in `src/db/` and `src/server/`; the routes and all of
`src/lib/` are storage-agnostic. Drizzle's Postgres dialect keeps the query code
substantially the same, and the hand-written migrations would be ported once.

After that, in order: move sessions into a table so they can be revoked; move
rate limiting and presence into Redis; then — as a genuinely separate project —
introduce Yjs and a WebSocket service for real-time editing, at which point
`documents.content_html` becomes a materialized projection of the CRDT rather
than the source of truth.

---

## What I would do next

Two items from the original version of this list have since been done: the
`window.prompt` link editor was replaced with a proper dialog, and a live word
count / reading time was added to the editor. What remains, in the order I
would do it:

1. **A Playwright end-to-end test** of the core journey — sign in, create,
   format, share, switch user, verify read-only. The current suite covers the
   server thoroughly and the React components not at all; this is the biggest
   real gap.
2. **Verify and fix the Docker build.** It is written but was never executed
   (Docker was not installed on the build machine), which makes it the least
   trustworthy artifact in the repo.
3. **A document outline panel** for long documents, built from the headings.
4. **Per-document share links with an expiry**, as the first step toward inviting
   people who do not yet have accounts.

I would not start real-time collaboration in that window. It is the most
requested-sounding feature and the one most likely to end as a broken half-build.
