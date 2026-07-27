

# Ajaia Docs — Full Stack Product Engineer take-home

**Live app:** https://ajaia-docs.up.railway.app
**Walkthrough video:** https://youtu.be/qyioRI18x8U
**Google Drive folder:** [PASTE DRIVE FOLDER URL]

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · TipTap 3 (ProseMirror) · SQLite + Drizzle · Tailwind 4 · Vitest

---

## Reviewer credentials

Seeded automatically. **The login page has one-click buttons for each account** — no typing needed.

| Email | Password | Demonstrates |
| --- | --- | --- |
| `ada@ajaia.test` | `password123` | Owns two shared documents; has one shared *to* her |
| `grace@ajaia.test` | `password123` | **Editor** on Ada's roadmap; owns her own document |
| `alan@ajaia.test` | `password123` | **Viewer** on the roadmap (read-only enforced); owns a private document |

**Fastest way to see the access model:** open *Q3 Productivity Roadmap* as Ada, then sign in as Alan and open the same document. The toolbar disappears, the body is not editable, and Share/Delete are gone — and it is enforced server-side, not just hidden.

**Run locally:** `npm install && npm run setup && npm run dev` — Node 20.11+, no database server, no accounts, nothing to pay for.

---

## The one decision that shaped everything

This brief can absorb unlimited scope, so I picked a sentence to defend:

> **A document you can actually write in, that other people can actually open, where nothing you type is ever lost.**

Each clause got real engineering. Everything outside it was cut on purpose and listed below. The failure mode I most wanted to avoid was a demo that looks broad and collapses on the sixth click — I would rather show four things that survive being poked at.

---

## What is built

**Editing** — TipTap/ProseMirror: bold, italic, underline, strikethrough, three heading levels, bulleted/numbered lists, blockquote, code blocks, links, with keyboard shortcuts. Inline rename. **Autosave** debounced ~900 ms with a live status indicator, one in-flight request at a time with coalescing, failed saves stay dirty and retry, and a `keepalive` flush on tab close so the last seconds of typing survive.

**File import** — `.txt`, `.md`, `.markdown`, `.docx` up to 5 MB (stated in the UI, not just the README). From the list it creates a new document titled from the file's first heading; from inside a document you can append or replace. Word styles that cannot be represented are **reported** rather than silently dropped.

**Sharing** — one owner plus viewer/editor roles, enforced server-side on every route. Owned vs shared are separate tabs, and each row still shows its role and owner. Editors deliberately cannot re-share, which keeps the access graph to what each owner approved.

**Persistence** — SQLite via Drizzle. Documents, shares, history and presence all survive restarts; content is stored as sanitized HTML so formatting round-trips exactly.

**Beyond the brief** — version history (snapshot, preview, restore-forward), concurrent-edit detection, presence indicators, export to Markdown/HTML/text plus print-to-PDF with print-safe styling and per-document page titles, a full light/dark theme that follows the OS preference with a persistent in-app toggle, live word count and reading time, and instant document search.

---

## Three decisions I would defend in an interview

**1. Concurrent edits: honest degradation over a fake merge.**
Real-time co-editing needs a CRDT and a stateful socket server — a different architecture, not an increment, and half-built it corrupts documents. So I did not build it. Instead every write carries the revision the client was editing; if the server has moved on, it **force-snapshots the content it is about to overwrite** into history before applying the write, then tells the user with a link straight to it. Last-write-wins, but nothing is ever silently destroyed.

**2. Sanitize on write, not on read.**
Document HTML is rendered with `dangerouslySetInnerHTML`, and two untrusted sources feed it: the browser (a client can `PATCH` any string — TipTap being well-behaved is not a security property) and imported files. Both go through one allowlist sanitizer before storage, so stored data is always safe and a future surface that forgets to sanitize cannot reintroduce the hole. Tests cover script injection, event handlers, four `javascript:` obfuscations, `data:` URLs, Word's conditional comments, double-encoding — and **idempotency**, since content is re-sanitized on every keystroke's save.

**3. 404, not 403, for documents you cannot see.**
A document id should never confirm to an unauthorized user that a document exists.

---

## Testing — 150 tests

Weighted toward where a bug would actually be expensive:

- **`permissions.test.ts`** — the full role × capability matrix, tested exhaustively rather than by example, including **fail-closed** behaviour when the database holds an unrecognized role.
- **`documents.test.ts`** — server layer against a **real in-memory SQLite built from the actual migration files**, so foreign keys, cascades and unique indexes are genuinely exercised: sharing lifecycle, enforcement, version retention, concurrent edits.
- **`import.test.ts`** — builds a **genuine OOXML `.docx`** and runs it through mammoth, plus every rejection path.
- Plus sanitization, format conversion, session forgery/expiry, and a migration-vs-ORM drift guard.

Beyond the suite, I drove the running production build over HTTP as three concurrent users: every permission rule asserted as a status code, all import rejection paths, an XSS payload through the importer with the stored HTML inspected afterwards, the full grant → downgrade → revoke lifecycle, concurrent edits from two sessions, and the validation limits. I also booted against no database to confirm a fresh deploy self-seeds, then restarted with data present to confirm it does **not** re-seed.

---

## Deliberately cut

Real-time co-editing (CRDT + socket server) · comments/suggestions · images and tables (blob storage + a much wider editor schema; `.docx` import warns instead of pretending) · PDF export (headless Chromium is a disproportionate dependency — print-to-PDF is wired up) · email invites and password reset (would require reviewers to have an account somewhere) · folders/search/trash. Reasoning for each is in `ARCHITECTURE.md`.

---

## Known limitations

- No live co-editing; concurrent edits are last-write-wins with history preservation and a banner.
- Presence lags up to 10 s (polling); no live cursors.
- SQLite is single-writer — must not be scaled to multiple instances as-is.
- `/api/users` exposes every account to power share suggestions; correct for a 3-account demo, wrong for production.
- Login rate limiting is in-process only.
- Demo credentials are printed on the login page — deliberate for review, first thing to remove otherwise.
- Free-tier hosting: the machine suspends when idle, so the very first request after a quiet period can be slow.
- No component/browser tests — the server layer is covered thoroughly, the React components are not.

## With another 2–4 hours

1. A Playwright end-to-end test of the core journey — the biggest genuine gap.
2. A document outline panel built from the headings.
3. Share links with expiry, as a first step toward inviting people without accounts.

(Three earlier items on this list — a proper link-editing dialog, a live word count, and verifying the Docker build — have since been done; the container is what runs in production.)

I would **not** start real-time collaboration in that window — it is the most impressive-sounding feature and the one most likely to end as a broken half-build.

---

## AI workflow (summary — full note in `AI_WORKFLOW.md`)

Built as a paired effort with **Claude Code (Opus)**, working together across the API layer, the server logic, the editor front end and the tests. I set the scope and architecture, we worked through the implementation together, and I reviewed, corrected and rejected output as we went — and I worked in the code directly too, making hands-on adjustments, fixes and tuning throughout rather than only reviewing.

**Where it helped:** the route scaffolding, the schema/migration pair, and the Tailwind UI are most of the line count and little of the difficulty — moving through them quickly left room to spend real time on autosave semantics, the sanitizer, and the concurrency model. Several API endpoints changed shape mid-build once we started exercising them with real requests.

**What I rejected or fixed:**
- **Invented dependency versions** — `@types/react-dom@19.2.4` does not exist; `lucide-react` was pinned a whole major line off. Switched to querying the registry for every pin.
- **Raw control bytes written into source** — a generated regex contained actual NUL/0x1F/0x7F bytes rather than escapes. The editor rendered them as spaces, so it *read* as correct and two patch attempts failed before a hexdump revealed it.
- **A character-class range that silently ate digits** — `[ -<...]` is a range covering `0x20`–`0x3C`, so *"2026 Q3 Plan"* would have exported as `Q3-Plan.md`. Fixed, with a regression test named for the bug.
- **Duplicate editor extensions** — introspected TipTap's StarterKit instead of trusting recall; it already bundles underline and link.
- **Unsafe casts and inert generated code** — replaced `tx as unknown as Db` with a proper derived type, and deleted a syntactically valid but meaningless generated line.
- **Two failing tests where the *test* was wrong, not the code** — the instinct with a red suite is to change the code until it goes green; both needed the opposite.

**Three bugs that only running it could find** (all passed code review and the full test suite): config validated at first login instead of at boot, so a correct password 500'd while a wrong one 401'd; `output: "standalone"` silently breaking `npm start`; and exports printing the document title twice.

**Honest assessment:** the error distribution was distinctly non-human — fluent and structurally sound while confidently wrong about versions, occasionally emitting bytes that were not what they appeared to be. That is precisely why skim-reading generated code is not review. The parts of this project worth defending are decisions, not code — they came from the product side of the pairing, and the implementation followed once they were made.
