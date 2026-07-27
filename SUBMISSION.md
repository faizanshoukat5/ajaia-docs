# Submission contents

**Project:** Ajaia Docs — a lightweight collaborative document editor
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · TipTap 3 (ProseMirror) · SQLite + Drizzle · Tailwind 4 · Vitest

---

## For the reviewer — everything you need, in one place

| | |
| --- | --- |
| **Live app** | **https://ajaia-docs.up.railway.app** |
| **Walkthrough video** | **https://youtu.be/qyioRI18x8U** (4:47, captioned) |
| **Source** | https://github.com/faizanshoukat5/ajaia-docs — also in this folder as `ajaia-docs-source.zip` |
| **Sign in** | One-click buttons on the login page. Password for all three: `password123` |

**Test accounts** — seeded automatically, on the live app and locally:

| Email | Password | Demonstrates |
| --- | --- | --- |
| `ada@ajaia.test` | `password123` | Owner of two shared documents; also a **viewer** on one of Grace's |
| `grace@ajaia.test` | `password123` | **Editor** on Ada's roadmap; owns her own document |
| `alan@ajaia.test` | `password123` | **Viewer** on the roadmap — read-only, enforced server-side |

**Fastest way to see the access model (about a minute):** open *Q3 Productivity
Roadmap* as Ada, then sign in as Alan and open the same document. The toolbar is
gone, the body is not editable, and Share/Delete are absent — and it is enforced
on the server, not merely hidden. A hand-crafted `PATCH` returns 403; a document
you have no access to returns **404, not 403**, so IDs cannot be used to probe
what exists.

**Run it locally** — Node 20.11+, no database server, no accounts, nothing to pay for:

```bash
npm install
npm run setup     # creates ./data/ajaia.db, migrates, seeds the demo accounts
npm run dev       # http://localhost:3000
npm test          # 150 tests
```

Jump to: [what works and what does not](#status-what-works-what-does-not) ·
[requirements checklist](#requirements-checklist) ·
[architecture note](./ARCHITECTURE.md) · [AI workflow note](./AI_WORKFLOW.md)

---

## What is included

### Source code

| Path | Contents |
| --- | --- |
| `src/app/` | Pages and 14 API route handlers |
| `src/components/` | React components — editor, toolbar, share dialog, history, presence |
| `src/lib/` | Framework-free logic: permissions, sanitizer, converters, validation |
| `src/server/` | Server-only: sessions, documents, shares, versions, import |
| `src/db/` | SQL migrations, Drizzle schema, seed data |
| `src/instrumentation.ts` | Boot-time config validation, migration, first-run seeding |
| `tests/` | 150 tests across 7 files |
| `scripts/` | `migrate`, `seed`, `reset` |

### Documentation

| File | Contents |
| --- | --- |
| **`README.md`** | Setup, feature tour, permission matrix, deployment, security notes, known limitations |
| **`ARCHITECTURE.md`** | What was prioritized and why, stack tradeoffs, deliberate cuts, weak points, what I would do next |
| **`AI_WORKFLOW.md`** | Tools used, where AI helped, what I rejected, how correctness was verified |
| **`SUBMISSION.md`** | This file |
| **`docs/WALKTHROUGH_SCRIPT.md`** | Narration script for the walkthrough video |
| **`docs/VIDEO_DESCRIPTION.md`** | Chapters and description for the published video |
| **`VIDEO.txt`** | Walkthrough video URL |

### Deployment

| File | Purpose |
| --- | --- |
| `.env.example` | Every environment variable, documented |
| `render.yaml` | Render blueprint, configured for the free tier |
| `Dockerfile` | Multi-stage, non-root container build — **this is what runs in production on Railway** |
| `fly.toml` | Fly.io config with a persistent volume (alternative host) |
| `docs/DEPLOYMENT.md` | Step-by-step guide for Railway, Render and Fly |

---

## Credentials for reviewers

Seeded automatically by `npm run setup`, and also on the first boot of a fresh
deployment. **The login page has one-click buttons for each account** — no typing
required.

| Email | Password | What they demonstrate |
| --- | --- | --- |
| `ada@ajaia.test` | `password123` | Owner of two shared documents; has one shared *to* her |
| `grace@ajaia.test` | `password123` | **Editor** on Ada's roadmap; owns her own document |
| `alan@ajaia.test` | `password123` | **Viewer** on the roadmap (read-only enforced); owns a private document |

To see the access model in one minute: open the roadmap as Ada, then sign in as
Alan and open the same document — the toolbar is gone, the body is not editable,
and Delete/Share are absent.

---

## Requirements checklist

| Requirement | Status | Notes |
| --- | --- | --- |
| Create a document | ✅ | Blank, or from an imported file |
| Rename a document | ✅ | Inline in the header, autosaved |
| Edit in the browser | ✅ | TipTap / ProseMirror |
| Save and reopen | ✅ | Autosave + `keepalive` flush on tab close |
| Bold / italic / underline | ✅ | Plus strikethrough |
| Headings or size variation | ✅ | Three levels + normal text |
| Bulleted / numbered lists | ✅ | Plus blockquote, code block, links |
| File upload | ✅ | `.txt`, `.md`, `.markdown`, `.docx` (5 MB cap), stated in UI and README |
| Document owner | ✅ | |
| Grant another user access | ✅ | By email, with viewer/editor roles |
| Owned vs shared distinction | ✅ | Separate tabs, plus per-row role and owner |
| Documents survive refresh | ✅ | SQLite |
| Formatting preserved | ✅ | Stored as sanitized HTML |
| Shared access demonstrable | ✅ | Three seeded accounts covering all three roles |
| Setup and run instructions | ✅ | README |
| Working deployment | ✅ | Live on Railway; permission matrix re-verified against the public URL |
| Validation and error handling | ✅ | Zod at every boundary; typed errors with human-readable messages |
| At least one meaningful test | ✅ | 150 tests, weighted toward permissions, sanitization and persistence |
| Architecture note | ✅ | `ARCHITECTURE.md` |
| AI workflow note | ✅ | `AI_WORKFLOW.md` |
| Walkthrough video | ✅ | 4:47, captioned — https://youtu.be/qyioRI18x8U |

### Stretch items completed

Not required, and not pursued at the expense of the core:

- ✅ **Version history** — automatic snapshots, preview, restore-forward
- ✅ **Export** — Markdown, HTML, plain text, print-to-PDF
- ✅ **Role-based permissions** beyond basic access — viewer/editor split
- ✅ **Collaboration indicators** — presence avatars via polled heartbeat
- ✅ **Light and dark theme** — OS-aware with a persistent in-app toggle
- ✅ **Word count and reading time** — live in the editor footer
- ✅ **Document search** — instant client-side filter over the list
- ✅ **Print/PDF polish** — per-document page titles, print-safe styling from
  either theme, link targets printed after anchors

---

## Status: what works, what does not

### Working end to end (verified over real HTTP against a production build)

Authentication and sessions · document CRUD · rich-text editing with autosave ·
file import in all three modes · the complete sharing lifecycle (grant →
downgrade → revoke) with server-side enforcement of every rule · version history
and restore · concurrent-edit detection · presence · export in three formats ·
first-boot self-migration and self-seeding, including the guard that prevents
re-seeding a database that already has data.

### Incomplete or intentionally absent

- **No live co-editing.** Concurrent edits are last-write-wins, with the
  overwritten version force-snapshotted into history and the user told. Not a
  merge — a CRDT is a different architecture, not an increment.
- **Presence lags up to 10 seconds** (polling) and there are no live cursors.
- **No comments, images, or tables.** `.docx` imports warn when Word content
  cannot be represented rather than dropping it silently.
- **No email of any kind** — so no invites to non-existent accounts, and no
  password reset.
- **No component/browser tests.** The server layer is covered thoroughly; the
  React components are not.
- **SQLite is single-writer** — this must not be scaled to multiple instances
  as-is.

### With another 2–4 hours

1. **A Playwright end-to-end test** of the core journey — sign in, create,
   format, share, switch user, verify read-only. The server layer is covered
   thoroughly and the React components not at all; this is the biggest genuine
   gap.
2. **A document outline panel** built from the document's headings, which is
   what long documents start to need.
3. **Share links with an expiry**, as the first step toward inviting people who
   do not yet have an account.

(Three earlier items on this list have since been built: a proper link-editing
dialog, a live word count, and verifying the Docker image — which is now what
runs in production.)

Reasoning for that order, and for what I would *not* start, is in
[ARCHITECTURE.md](./ARCHITECTURE.md#what-i-would-do-next).

---

## Verifying this locally

```bash
npm install
npm run setup
npm test        # 150 passing
npm run dev     # http://localhost:3000
```

Tested on Node 26 (Windows). Requires Node 20.11+. No external services.
