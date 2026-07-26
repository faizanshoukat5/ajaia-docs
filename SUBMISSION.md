# Submission contents

**Project:** Ajaia Docs — a lightweight collaborative document editor
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · TipTap 3 · SQLite + Drizzle · Tailwind 4 · Vitest

---

## ⚠️ Before you submit this — three things need your action

This package is complete except for items that require your accounts or your
voice. They are marked **[ACTION NEEDED]** below.

1. **Deploy it** and paste the URL into this file and the README. Instructions:
   [README.md § Deployment](./README.md#deployment). The verified path is
   `npm ci && npm run build && npm start` with `SESSION_SECRET` set.
2. **Record the walkthrough video** and put the link in `VIDEO.txt`. A
   shot-by-shot script keyed to the real UI is in
   [docs/WALKTHROUGH_SCRIPT.md](./docs/WALKTHROUGH_SCRIPT.md).
3. **Read [AI_WORKFLOW.md](./AI_WORKFLOW.md) and confirm it matches your account
   of how this was built.** It describes a paired effort with Claude Code across
   the code and the API layer, with the scoping, architecture and verification on
   your side. Reviewers will ask about specifics in the interview, so make sure
   every claim in it is one you can speak to.

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
| **`docs/WALKTHROUGH_SCRIPT.md`** | Shot-by-shot script for the 3–5 minute video **[ACTION NEEDED]** |
| **`VIDEO.txt`** | Video URL **[ACTION NEEDED — currently a placeholder]** |

### Deployment

| File | Purpose |
| --- | --- |
| `.env.example` | Every environment variable, documented |
| `render.yaml` | Render blueprint (plain Node service + persistent disk) |
| `Dockerfile` | Multi-stage, non-root container build — **written but not executed locally; Docker was unavailable on the build machine** |
| `fly.toml` | Fly.io config with a persistent volume |

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
| Working deployment | ⚠️ | **[ACTION NEEDED]** — configs and verified commands provided; needs your account |
| Validation and error handling | ✅ | Zod at every boundary; typed errors with human-readable messages |
| At least one meaningful test | ✅ | 150 tests, weighted toward permissions, sanitization and persistence |
| Architecture note | ✅ | `ARCHITECTURE.md` |
| AI workflow note | ✅ | `AI_WORKFLOW.md` |
| Walkthrough video | ⚠️ | **[ACTION NEEDED]** — script provided in `docs/` |

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
- **The Docker build is unverified.** Written from the standard pattern but never
  executed; Docker was not installed on the build machine.
- **No component/browser tests.** The server layer is covered thoroughly; the
  React components are not.
- **SQLite is single-writer** — this must not be scaled to multiple instances
  as-is.

### With another 2–4 hours

1. Playwright end-to-end test of the core journey — the biggest genuine gap.
2. Build and fix the Docker image, so the least-trustworthy artifact becomes
   trustworthy.
3. A document outline panel built from the headings.
4. Share links with expiry, as the first step toward inviting new users.

(Two earlier items on this list — a proper link-editing dialog and a live word
count — have since been built.)

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
