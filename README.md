# Ajaia Docs

A lightweight collaborative document editor — rich-text editing, file import, and
role-based sharing, built as a single Next.js application.

Built as a timeboxed take-home. The goal was depth in a few areas that matter
rather than shallow coverage of everything Google Docs does. What was cut, and
why, is in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Quick start

Requires **Node.js 20.11+** (developed on 24/26). No database server, no Docker,
no accounts, nothing to pay for.

```bash
npm install
npm run setup     # creates ./data/ajaia.db, applies migrations, seeds demo data
npm run dev       # http://localhost:3000
```

Then sign in with one of the seeded accounts — the login page has one-click
buttons for each.

| Email              | Password      | Starts with                                       |
| ------------------ | ------------- | ------------------------------------------------- |
| `ada@ajaia.test`   | `password123` | Owns 2 documents, shared with the others          |
| `grace@ajaia.test` | `password123` | Editor on Ada's roadmap; owns the import spec     |
| `alan@ajaia.test`  | `password123` | **Viewer** on the roadmap; owns a private document |

The seed is deliberately arranged so all three access levels are visible without
setting anything up: sign in as **Alan** to see read-only access enforced, and as
**Ada** to see a document someone else shared with her.

### Other commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Development server with hot reload                        |
| `npm run build`    | Production build                                          |
| `npm start`        | Serve the production build                                |
| `npm test`         | Run the test suite (150 tests)                            |
| `npm run test:watch` | Tests in watch mode                                     |
| `npm run typecheck`| `tsc --noEmit`                                            |
| `npm run db:migrate` | Apply pending migrations                                |
| `npm run db:seed`  | Reset demo data (**destructive** — truncates every table) |
| `npm run db:reset` | Delete the database file entirely                         |
| `npm run setup`    | `db:migrate` + `db:seed`                                  |

---

## What it does

### Document creation and editing

Create a blank document or import one. Rename inline from the header. Rich text
via [TipTap](https://tiptap.dev) (ProseMirror): **bold**, *italic*, underline,
strikethrough, three heading levels, bulleted and numbered lists, blockquotes,
code blocks, and links. Standard keyboard shortcuts work (`Ctrl/Cmd+B`, `I`, `U`,
`Z`).

**Saving is automatic** — edits are debounced ~900 ms and written in the
background, with a live status indicator in the header. `Ctrl/Cmd+S` forces an
immediate save. If you close the tab mid-edit, a `keepalive` request flushes the
pending change so the last few seconds of typing are not lost.

### File import

Upload a file to turn it into a document, or pull one into a draft you already
have open.

**Supported: `.txt`, `.md`, `.markdown`, `.docx`. Maximum 5 MB.**
Anything else is rejected with a message naming what is accepted.

- **From the document list** → creates a new document, titled from the file's
  first heading.
- **From inside a document** → choose *replace* the body or *append* to it.

`.docx` is converted with [mammoth](https://github.com/mwilliamson/mammoth.js);
Word styles that do not map onto the editor's formats are reported after the
import rather than silently dropped. Images, tables and legacy `.doc` are **not**
supported — see [ARCHITECTURE.md](./ARCHITECTURE.md#deliberate-cuts).

### Sharing

Every document has one owner. The owner can grant other accounts access at one of
two levels:

| Capability          | Owner | Editor | Viewer |
| ------------------- | :---: | :----: | :----: |
| Read + read history |   ✅   |   ✅    |   ✅    |
| Edit content        |   ✅   |   ✅    |   —    |
| Rename              |   ✅   |   ✅    |   —    |
| Restore a version   |   ✅   |   ✅    |   —    |
| Import into it      |   ✅   |   ✅    |   —    |
| Manage sharing      |   ✅   |   —    |   —    |
| Delete              |   ✅   |   —    |   —    |

The document list separates **My documents** from **Shared with me**, and every
row shows its role and owner. Editors deliberately cannot re-share — that keeps
the access graph bounded to what each owner explicitly approved.

Sharing is by email against an **existing account**. There is no email invite
(nothing in this build sends mail); sharing with an unknown address returns a
clear error rather than failing silently.

### Persistence

SQLite via [Drizzle ORM](https://orm.drizzle.team). Documents, shares, version
history and presence all survive restarts. Content is stored as sanitized HTML,
so formatting round-trips exactly.

### Also included

- **Version history** — automatic snapshots (throttled to one per minute per
  document), previewable and restorable. Restoring writes forward as a new
  revision, so it is itself undoable.
- **Concurrent-edit detection** — if someone else saves while you are typing, the
  content you were about to overwrite is snapshotted into history first and you
  get a banner pointing at it. Honest last-write-wins with nothing destroyed;
  it is not a CRDT merge.
- **Presence indicators** — avatars of others viewing the same document, via a
  polled heartbeat.
- **Export** — Markdown, HTML, plain text, and print-to-PDF via the browser.

---

## Testing

```bash
npm test
```

**150 tests across 7 files**, concentrated on the logic where a bug would be
expensive rather than on UI scaffolding:

| File                     | Covers                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| `permissions.test.ts`    | The full role × capability matrix, plus fail-closed on bad data     |
| `documents.test.ts`      | Server layer against a real SQLite DB: sharing lifecycle, enforcement, versioning, concurrent edits |
| `sanitize.test.ts`       | XSS vectors, tag allowlist, idempotency                             |
| `import.test.ts`         | Real `.docx`/`.md`/`.txt` parsing and every rejection path          |
| `convert.test.ts`        | Format conversion both ways, filename safety                        |
| `session.test.ts`        | Token forgery, expiry, clock skew, password hashing                 |
| `schema.test.ts`         | Guards against migration/ORM-schema drift                           |

The database tests run against a real in-memory SQLite instance built from the
actual migration files — not mocks — so they exercise foreign keys, cascades and
unique indexes for real.

---

## Deployment

The app is a standard Next.js server plus one SQLite file. The only real
requirement is **a writable, persistent disk** for that file.

On first boot the server migrates itself and, **if the database is completely
empty**, seeds the demo accounts. So a fresh deployment is immediately reviewable
with no shell access. It will never re-seed a database that already has users in
it — verified.

### Required configuration

| Variable         | Required            | Notes                                              |
| ---------------- | ------------------- | -------------------------------------------------- |
| `SESSION_SECRET` | **yes** in production | HMAC key for session cookies. `openssl rand -base64 32` |
| `DATABASE_PATH`  | recommended         | Point at the mounted volume, e.g. `/data/ajaia.db`  |
| `PORT`           | no                  | Defaults to 3000                                    |
| `SEED_ON_EMPTY`  | no                  | Set `false` to disable first-boot demo seeding      |

The server **refuses to start** in production without `SESSION_SECRET`, with an
actionable message. That is intentional: a silent fallback to a publicly-known
signing key would be worse than downtime.

See [`.env.example`](./.env.example).

### Option A — any Node host (simplest)

Works on Render, Railway, Fly, a VM, anywhere:

```bash
npm ci
npm run build
npm start
```

A [`render.yaml`](./render.yaml) blueprint is included. Note that persistent
disks are a **paid** feature on Render — on the free plan the app still runs and
re-seeds on cold start, but user-created documents do not survive a restart. Read
the comments in that file before deploying.

### Option B — Docker / Fly.io

A [`Dockerfile`](./Dockerfile) (multi-stage, non-root, standalone output) and
[`fly.toml`](./fly.toml) are included. Fly's free allowance includes a persistent
volume, which is what makes SQLite viable there.

```bash
fly launch --no-deploy --copy-config --name <your-app>
fly volumes create ajaia_data --size 1 --region iad
fly secrets set SESSION_SECRET="$(openssl rand -base64 32)"
fly deploy
```

> **Honest caveat:** Docker was not installed on the machine this was built on, so
> the container build is written from the standard multi-stage pattern but was
> **not executed locally**. Option A is the path that was actually run and
> verified end to end. If the image build fails, that is where to look first.

### Do not deploy to Vercel as-is

Serverless filesystems are ephemeral — the SQLite file would be discarded between
invocations. Moving to a hosted Postgres is a contained change (see
[ARCHITECTURE.md](./ARCHITECTURE.md#if-this-needed-to-scale)).

---

## Security notes

Worth stating plainly, since some choices are deliberate demo affordances:

- **Demo credentials are printed on the login page.** That is on purpose for
  review, and it is the first thing to remove for any real use.
- **All content is sanitized server-side on write** (`src/lib/sanitize.ts`)
  against an allowlist matching exactly what the editor can produce. The browser
  is never trusted — a hand-crafted `PATCH` gets the same treatment as the editor.
- **Authorization is enforced server-side on every route.** The UI hides controls
  you cannot use, but hiding is not the mechanism — each request re-resolves the
  caller's role.
- **Documents are 404, not 403, when you lack access**, so ids are not an
  existence oracle.
- **Passwords** are scrypt-hashed with per-user salts and verified in constant
  time.
- **Login is rate-limited** per account (15 attempts / 5 min). In-process only —
  it does not coordinate across instances.
- **`/api/users` exposes every account** to power the share dialog's suggestions.
  Fine for a three-account demo; a real product would scope it to an org.

---

## Project layout

```
src/
  app/                 Next.js App Router — pages and API routes
    api/               REST endpoints (documents, shares, versions, imports, ...)
    documents/         Document list and editor pages
  components/          React components (editor, toolbar, dialogs)
  db/
    migrations/        Hand-written SQL — the source of truth for the schema
    schema.ts          Drizzle mirror of the above, for typing
    seed.ts            Demo data
  lib/                 Framework-free logic: permissions, sanitize, convert, ...
  server/              Server-only: session, documents, shares, versions, import
  instrumentation.ts   Boot-time config validation, migration, first-run seeding
tests/                 Vitest suite
```

The split that matters: **`src/lib/` is pure and framework-free** (this is where
the permission rules and the sanitizer live, which is why they are cheap to test
exhaustively), **`src/server/` touches the database**, and **`src/app/` is only
transport** — parse, authorize, delegate, serialize.

---

## Known limitations

Stated up front rather than left to be discovered:

- **No live co-editing.** Two people editing simultaneously get last-write-wins
  with the overwritten version preserved in history and a banner — not a merge.
- **Presence lags up to 10 seconds** (it polls) and there are no live cursors.
- **No comments, suggestions, images, or tables.**
- **No password reset**, no email of any kind.
- **SQLite is single-writer** — do not scale this to multiple instances as-is.
- **Version history keeps the last 30 snapshots** per document; older ones are
  pruned.

What I would build next, in priority order, is in
[ARCHITECTURE.md](./ARCHITECTURE.md#what-i-would-do-next).
