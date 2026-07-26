# Walkthrough video script (3–5 minutes)

A shot-by-shot script keyed to the actual UI. Timings are a guide; the whole
thing runs comfortably in about 4:15 at a normal speaking pace.

## Before you record

```bash
npm run db:reset && npm run setup   # clean, known-good demo state
npm run dev
```

- Have **two browser profiles** (or one normal + one incognito) open side by
  side, so you can be Ada and Alan simultaneously without signing in and out.
- Zoom the browser to ~110% so text is legible in the recording.
- Have a `.docx` or `.md` file on your desktop, ready to drag. Any Word document
  with a heading works.
- Close unrelated tabs and notifications.

---

## 0:00–0:25 — What it is and the one decision that shaped it

> "This is Ajaia Docs — a collaborative document editor built as a timeboxed
> take-home. Next.js, TipTap for rich text, SQLite for storage.
>
> The brief could absorb unlimited scope, so I picked one sentence to defend: a
> document you can actually write in, that other people can actually open, where
> nothing you type is ever lost. I'll show you those three things, then tell you
> what I deliberately didn't build."

**On screen:** the login page.

---

## 0:25–0:45 — Sign in

> "Three seeded accounts, one click each — because testing sharing means
> switching users constantly, and I didn't want reviewers typing credentials.
> These buttons hit the real login endpoint with the documented demo password;
> there's no back door that bypasses auth."

**Do:** click **Ada Lovelace**.

---

## 0:45–1:15 — The document list

> "The list separates what I own from what's been shared with me. That's a
> structural split rather than a badge you have to scan for — and each row still
> shows its role and owner, so the information isn't only in the tab."

**Do:** click **Shared with me**, point at *File import — spec* — "shared by
Grace, view-only." Return to **My documents**.

---

## 1:15–2:00 — Editing and autosave

**Do:** open **Q3 Productivity Roadmap**.

> "Standard rich text — headings, bold, italic, underline, lists, quotes, code,
> links. It's ProseMirror underneath, so this is a real document model, not
> contenteditable guesswork."

**Do:** select a line → make it **Heading 2**. Bold a word. Add a bullet.

> "Watch the header while I type."

**Do:** type a sentence. Point at the indicator moving through *Unsaved changes →
Saving… → Saved just now*.

> "Autosave is debounced about 900 milliseconds. The part I actually spent time
> on is the failure cases: one request in flight at a time, edits during a save
> get coalesced, a failed save stays dirty and retries instead of showing a green
> checkmark over lost work — and closing the tab mid-edit fires a keepalive
> request so the last few seconds still land."

**Do:** rename the document in the header. Point at it saving.

---

## 2:00–2:40 — File import

> "Import is the file-handling piece. Supported types are stated in the UI, not
> just the README — .txt, .md, .markdown and .docx, up to 5 MB."

**Do:** back to the list → **Import a file** → pick your `.docx`.

> "It converts to the editor's format, and titles the document from the file's
> first heading rather than calling it 'notes.docx'."

**Do:** if warnings appear, point at the banner.

> "Word styles that don't map onto this editor get reported rather than silently
> dropped — I'd rather tell you something was lost than pretend it wasn't."

**Optional (fast):** show the **Import** button inside a document — "same parser,
but here you can append to a draft or replace it."

---

## 2:40–3:30 — Sharing and permissions (the important part)

**Do:** open the roadmap → **Share**.

> "One owner, and two access levels: can-view and can-edit. Editors deliberately
> can't re-share — that keeps the access graph to what the owner actually
> approved."

**Do:** point out Grace as editor, Alan as viewer.

**Switch to the second browser window, signed in as Alan.** Open the same
document.

> "Same document as Alan, who only has view access. No formatting toolbar, the
> body isn't editable, and Share and Delete aren't there."

> "And this isn't just hidden UI — every route re-checks the role server-side. If
> you hand-craft the PATCH request, you get a 403. If you don't have access at
> all you get a 404, not a 403, so document IDs can't be used to probe what
> exists."

---

## 3:30–4:00 — Concurrent edits: the honest answer

> "Here's the thing I want to be straight about. Real-time co-editing needs a
> CRDT and a socket server — that's a different architecture, not an increment,
> and half-built it corrupts documents. So I didn't build it. Here's what I built
> instead."

**Do:** as Ada, type into the roadmap. As Alan — *if you granted him edit access*
— type into the same document. (Or narrate over the version history panel.)

**Do:** open **History**.

> "Every save carries the revision the client was editing. If someone else saved
> in between, the server snapshots the content it's about to overwrite *before*
> applying the write, and tells you. Last-write-wins — but nothing is ever
> silently destroyed, and you get a link straight to the version that was
> replaced."

**Do:** click a version, show the preview, mention **Restore**.

> "Restore writes forward as a new revision, so restoring is itself undoable."

---

## 4:00–4:15 — Scope and close

> "What I cut, on purpose: comments, images, tables, PDF export, email invites,
> and real-time collaboration. Each one is in the architecture note with the
> reasoning.
>
> On testing — 150 tests, weighted toward the permission matrix, the HTML
> sanitizer and the persistence layer. The database tests run against real SQLite
> built from the actual migrations, and the .docx tests build a real Word file
> and run it through the parser.
>
> Three of the real bugs I found only showed up by running the app — including
> config that validated at first login instead of at boot, and exports printing
> the title twice. Those are written up in the AI workflow note, along with what
> I rejected from the generated code."

---

## Notes

- **Don't demo the signup form** unless you have spare time — it works, but it
  is not what is being evaluated.
- **If a save indicator seems stuck**, it is likely a stale dev server. Restart
  before recording.
- The single most persuasive 20 seconds is the **side-by-side owner/viewer
  comparison**. Do not rush it.
- If you run long, cut the import section to just the list-page flow.
