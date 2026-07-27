# YouTube description

Paste everything between the lines into the video's Description field.

---

Ajaia Docs — a lightweight collaborative document editor built as a full-stack take-home. Rich-text editing, file import, role-based sharing, version history, and honest handling of concurrent edits.

Captions in the video explain each step as it happens.

🔗 Live app: https://ajaia-docs.up.railway.app
💻 Source: https://github.com/faizanshoukat5/ajaia-docs

Sign in with one click as any demo account (password: password123)
• ada@ajaia.test — owns two shared documents
• grace@ajaia.test — editor on Ada's roadmap
• alan@ajaia.test — viewer, to see read-only enforced

── STACK ──
Next.js 16 (App Router) · React 19 · TypeScript · TipTap 3 (ProseMirror) · SQLite + Drizzle ORM · Tailwind 4 · Vitest · Docker on Railway

── THE DECISION THAT SHAPED IT ──
The brief could absorb unlimited scope, so I picked one sentence to defend: a document you can actually write in, that other people can actually open, where nothing you type is ever lost. Everything outside that was cut on purpose.

The biggest cut was real-time co-editing. It needs a CRDT and a stateful socket server — a different architecture, not an increment, and half-built it corrupts documents. Instead, every save carries the revision it was based on. If someone else saved in between, the server snapshots the content it is about to overwrite into version history *before* applying the write, then tells you where it went. Last-write-wins, but nothing is ever silently destroyed. That is shown for real at 2:52.

── CHAPTERS ──
0:00 Landing page and demo accounts
0:16 Document list — owned vs shared, roles
0:37 Instant search
0:44 Create, rename, and autosave states
1:06 Rich-text formatting
1:36 Link dialog with scheme validation
1:48 Undo history and live word count
2:01 File import — append or replace
2:12 Export and delete
2:27 Import creates a document, titled from its first heading
2:36 Unsupported file rejected with an actionable message
2:43 Presence — a second user in the same document
2:52 Concurrent edit conflict, handled honestly
3:20 Version history and restore
3:33 Sharing, viewer and editor roles
3:48 Dark mode
3:55 Read-only enforcement as a viewer
4:37 Close

── ENGINEERING NOTES ──
• Authorization is pure functions with no imports, so the full role × capability matrix is tested exhaustively — including fail-closed behaviour on unrecognized role data.
• Content is sanitized on write, not on read, so stored data is always safe and a future surface that forgets to sanitize cannot reintroduce the hole.
• A document you cannot see returns 404, not 403 — an ID should never confirm that a document exists.
• 150 tests, weighted toward permissions, XSS sanitization, and persistence against a real SQLite built from the actual migration files.

Architecture note, AI workflow note, and the full list of deliberate cuts are in the repo.

---

## Notes for you

- **Visibility:** set to **Unlisted** or **Public** — the brief accepts either, but never Private (reviewers cannot open it).
- **Subtitles:** upload `demo/ajaia-demo-full.srt` under Subtitles → Add → Upload file → *Without timing? No, with timing*. The captions are also burned into the picture, so this is a bonus for accessibility and search.
- **Chapters** work automatically because the list starts at `0:00` and each entry is at least 10 seconds long.
- If you record a voice-over covering decisions and the AI workflow (see
  `docs/WALKTHROUGH_SCRIPT.md`, Part 2), add its timestamps to the chapter list.
