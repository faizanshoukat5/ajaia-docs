# Walkthrough video script

Two ways to produce the video. **The brief asks for 3–5 minutes covering the
user flow, what works, what was deprioritized, key decisions, and the AI
workflow** — so whichever route you take, the closing section on decisions is
not optional.

- **Option A — use the full automated recording.** `demo/ajaia-demo-full.webm`
  (4:46, 1280×720) walks **every feature** end to end with subtitle captions
  burned in: sign-in, list/tabs/search, create, rename, autosave states, all
  formatting, the link dialog (including a rejected scheme), undo/redo, word
  count, append-import, export, delete, import-with-title-inference, import
  rejection, live presence, a **real concurrent-edit conflict** (a second
  session saves mid-edit and the snapshot lands in history, labeled), version
  history, sharing, dark mode, and the viewer's read-only enforcement.
  A matching `demo/ajaia-demo-full.srt` subtitle file is alongside it for
  YouTube. Record a short voice-over on top (Clipchamp is preinstalled on
  Windows), or upload as-is and append 1–2 minutes of yourself covering
  Part 2 below — the brief requires the decisions and AI-workflow story,
  which captions alone don't fully deliver. (A shorter 1:23 cut without
  captions is at `demo/ajaia-demo.webm`.)
- **Option B — record live.** Follow Part 1 as stage directions yourself, then
  continue into Part 2. Before recording: `npm run db:reset && npm run setup`,
  then start the app and use two browser profiles so you can be Ada and Alan
  side by side.

---

## Part 1 — Product demo narration

Timed to `demo/ajaia-demo.webm`. Timestamps are approximate — cue off what is
on screen, not the clock.

### ~0:00 — Landing page (light)

> "This is Ajaia Docs — a collaborative document editor. Next.js, TipTap on
> ProseMirror for rich text, SQLite for storage. The login page states the one
> sentence the whole build defends: a document you can write in, that others
> can open, where nothing you type is lost."

### ~0:05 — One-click sign-in as Ada

> "Three seeded accounts, one click each — the buttons hit the real login
> endpoint with the documented demo password. There's no back door that skips
> auth."

### ~0:10 — Document list: search, owned vs shared

> "The list separates what I own from what's shared with me — a structural
> split, not a badge. Search filters instantly, client-side, over title,
> content and owner. Every card shows its role, its last editor, and its
> collaborator count."

### ~0:25 — Editing and autosave

> "Inside a document: headings, bold, italics, lists, quotes, code, links.
> Watch the pill in the header while text is typed — unsaved, saving, saved.
> Autosave is debounced about 900 milliseconds, one request in flight at a
> time, and a keepalive flush on tab close catches the last few seconds. A
> failed save stays dirty and retries — never a green checkmark over lost
> work."

### ~0:45 — Link dialog

> "Links go through a proper dialog that validates the scheme up front — only
> http, https and mailto survive the server-side sanitizer anyway, so the UI
> refuses early instead of failing late."

### ~0:55 — Share dialog

> "Sharing: one owner, viewer and editor levels. Editors deliberately can't
> re-share — the access graph stays exactly what the owner approved."

### ~1:00 — Version history

> "Version history snapshots automatically, at most once a minute — and
> unconditionally whenever a concurrent edit is about to be overwritten.
> Restore writes forward as a new revision, so restoring is itself undoable."

### ~1:05 — Dark mode

> "The whole app is theme-aware — follows the OS preference, toggles in-app,
> applied before first paint."

### ~1:10 — Switch to Alan, read-only enforcement

> "Now the same document as Alan, who has view-only access. No toolbar, no
> Share, no Delete, an explicit read-only notice. And this isn't hidden UI —
> every route re-resolves the role server-side. A hand-crafted PATCH gets a
> 403; a document you can't see at all returns a 404, not a 403, so IDs can't
> be used to probe what exists."

---

## Part 2 — Decisions and AI workflow (record over the repo/docs, ~2–3 min)

### Scope decision

> "The brief could absorb unlimited scope, so I cut deliberately: no comments,
> no images or tables, no email invites, and above all no real-time
> co-editing. A CRDT plus a socket server is a different architecture, not an
> increment — half-built, it corrupts documents. What I built instead is
> honest: every save carries the revision it was based on; if someone else
> saved in between, the server snapshots what it's about to overwrite into
> history *before* applying the write, and tells you. Last-write-wins, but
> nothing is ever silently destroyed."

### Security decisions

> "Content is sanitized on write, not on read — stored data is always safe, so
> a future surface that forgets to sanitize can't reintroduce the hole. The
> allowlist is exactly the set of tags the editor can produce. And
> authorization lives in pure functions with no imports, which is why the full
> role-by-capability matrix is tested exhaustively — including fail-closed on
> unrecognized role data."

### Testing

> "150 tests, weighted where bugs are expensive: the permission matrix, the
> XSS sanitizer, and persistence against a real SQLite built from the actual
> migration files. Beyond the suite, I drove the running production build over
> HTTP as three concurrent users and asserted every permission rule as a
> status code."

### AI workflow

> "The project was built as a paired effort with Claude Code, and I worked in
> the code directly as well. The AI note in the repo is specific about what I
> rejected: invented dependency versions, a regex with raw control bytes that
> only a hexdump revealed, a character-class range that silently ate digits,
> and two failing tests where the test was wrong, not the code. Three real
> bugs passed both review and the whole test suite and only showed up by
> running the app — which is why the verification section is the part of that
> document I'd defend hardest."

### Close

> "What I'd do next, in order: a Playwright end-to-end test of this exact
> journey, verifying the Docker build, a document outline panel, and share
> links with expiry. Thanks for watching."

---

## Recording notes

- The single most persuasive moment is the **owner → viewer cut** (~1:10 in
  the recording). Give it air.
- If recording live, zoom the browser to ~110% and close unrelated tabs.
- If a save indicator seems stuck, restart the server before recording.
- `demo/ajaia-demo.webm` is git-ignored — upload it (or your final edit) as an
  unlisted YouTube/Loom/Drive video and put the URL in `VIDEO.txt`.
