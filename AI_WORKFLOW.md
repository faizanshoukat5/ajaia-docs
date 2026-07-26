# AI workflow note

This project was built as a **paired effort between me and Claude Code (Opus)**,
working together across the codebase — the API layer, the server logic, the
editor front end, and the tests. It was a genuine back-and-forth: I set the
scope and the architecture, we worked through the implementation together, and I
reviewed, corrected and rejected output as we went. I also worked in the code
directly — making adjustments, fixes and tuning by hand throughout the build,
not only reviewing generated diffs.

I have kept this note specific and unflattering where that is accurate. Every
incident below actually happened during the build; none are illustrative
examples.

---

## Tools used

| Tool | Used for |
| --- | --- |
| **Claude Code (Opus)** | Primary pairing tool. Implementation across the API routes, server layer, components and tests, plus running the build/test/server loop and debugging against real output. |
| **npm registry (`npm view`)** | Ground truth for dependency versions, rather than trusting recalled version numbers. |
| **Node one-liners / `curl`** | Our verification harness — driving the running app over real HTTP as three concurrent users. |

No other assistants or code-generation services were involved.

---

## How we split the work

**I owned the decisions.** The scope cut, the data model, the permission model,
and the three calls I would defend in an interview — force-snapshotting on
conflict instead of faking a merge, sanitizing on write rather than on read, and
returning 404 instead of 403 for documents you cannot see. Those came out of
deciding what this product needed to be, not out of a prompt.

**We built the API surface together.** The fourteen route handlers, the request
validation, and the error contract were worked out iteratively: I specified the
behaviour each endpoint needed — including the parts that are easy to get wrong,
like an editor being unable to re-share, imports being dispatched on file
extension rather than the client-supplied MIME type, and every rejection path
returning a message a human can act on — and we shaped them until the responses
matched. Several endpoints changed shape mid-build once we started exercising
them with real requests.

**We built the server and editor logic together.** Autosave semantics, the
revision/conflict handling, the sanitizer allowlist, and the import pipeline all
went through multiple passes. AI moved fastest on the structural work; the
correctness details came from reviewing what it produced against what the product
actually needed.

**I made hands-on adjustments in the code.** Not everything went through a
prompt: I edited files directly where that was faster or where the fix needed
judgment — adjusting behaviour and copy, tuning the UI and styling, correcting
details after each pass, and reshaping pieces of generated code that were
structurally fine but not what the product needed. The design system and its
light/dark theming in particular went through several rounds of this kind of
direct adjustment.

**I owned verification.** Everything in the section below.

---

## Where AI genuinely sped things up

**Volume of correct boilerplate.** The route scaffolding, the Drizzle schema and
its mirroring SQL migration, the Tailwind styling, and the dialog/toolbar
components are the bulk of the line count and close to none of the difficulty.
Moving through them quickly is what left room to spend real time on autosave
semantics, the sanitizer, and the concurrency story.

**Test breadth.** The suite is 150 tests. Inside the timebox I would not have
hand-written the four `javascript:` obfuscation variants, the Unicode
normalisation password case, or the clock-skew session cases — but deciding which
of them mattered, and catching the two that were simply wrong, was fast.

**Debug loop speed.** The cycle of *run the build → read the error → fix → rerun*
was fast enough that we could afford to actually exercise the running app instead
of eyeballing code, which is where most of the real bugs surfaced.

---

## What I changed or rejected

This is the part worth reading. The generated code was strong on structure and
unreliable on facts — the failures clustered in specific, predictable places.

### 1. Invented dependency versions

The first `npm install` failed outright: `@types/react-dom@19.2.4` does not
exist, and `lucide-react` was pinned to `0.27.0` when the real current version is
`1.27.0` — a whole major line off.

**Change:** stopped accepting recalled version numbers and queried the registry
for every pinned dependency. Also downgraded TypeScript from the latest `7.0.2`
to `5.9.3` — TS 7 is the new compiler rewrite, and a take-home is the wrong place
to absorb toolchain risk for no benefit.

**Lesson applied throughout:** treat model-recalled version numbers and API
surfaces as guesses to verify, never as facts.

### 2. Raw control bytes written into source files

The generated `toFilename` regex contained **actual NUL, 0x1F and 0x7F bytes** in
the character class instead of the `\x00`-style escapes it appeared to contain.
The editor rendered them as innocuous-looking spaces, so it read as correct and
the first two attempts to patch it failed with "string not found."

Only a hexdump showed what was really on disk:

```
0000000    . r e p l a c e ( / [  \0   -  037 177   <   >   :   "   /  ...
```

**Change:** rewrote the function to be pure ASCII, using a Unicode property class
(`/[\p{C}<>:"/\\|?*]+/gu`) instead of hex ranges, then added a repo-wide scan for
stray control bytes across every source file. This is a failure mode I had not
seen before and would not have caught by reading.

### 3. A character-class range that silently ate digits

The same regex was written as `[ -<>:"/\\|?*]`. Inside a character class, `` -<``
is a **range** from `0x20` to `0x3C` — which includes every digit. A document
titled *"2026 Q3 Plan"* would have exported as `Q3-Plan.md` with the year
silently gone.

**Change:** fixed the class, and added a regression test named for the bug so it
cannot come back:

```ts
it("keeps digits — a character-class range bug here once ate them", () => {
  expect(toFilename("2026 Q3 Plan", "md")).toBe("2026-Q3-Plan.md");
});
```

### 4. Duplicate editor extensions, avoided by checking

The plan was to add `@tiptap/extension-underline` and `@tiptap/extension-link`.
Rather than trust that, we introspected the installed package:

```
blockquote, bold, bulletList, code, codeBlock, ..., underline, undoRedo
```

StarterKit v3 already bundles both. Registering them again causes duplicate-name
warnings and unpredictable behaviour.

**Change:** dropped both dependencies and configured them through StarterKit
instead.

### 5. Unsafe type casts and generated nonsense

Two things I rejected on review:

- `tx as unknown as Db` casts, used to pass a transaction handle into helper
  functions. Replaced with a real `DbLike = Db | DbTx` type derived from
  Drizzle's own signature, so transactions compose without lying to the compiler.
- A genuinely meaningless line in the seed file:
  `const count = (table: Parameters<typeof tx.select>[0] extends never ? never : never) => count;`
  — syntactically valid, completely inert. Deleted, along with an unused
  `editors` variable propped up by a `void editors;`.

These are the kind of thing that compiles, passes tests, and quietly rots a
codebase. Reading the diff is the only defence.

### 6. Two wrong tests — where I fixed the test, not the code

The first full run was 148/150. Both failures were **bad assertions**, not bugs:

- Turndown emits `-   a` (padded marker) for list items; the test asserted
  `- a`. Valid markdown either way — the assertion was too literal, so I matched
  on structure (`/^-\s+a$/m`) instead.
- A test named *"prefers the first heading"* asserted that `inferTitle` returns
  the leading **paragraph**. The test contradicted its own name. The code's
  behaviour (a heading wins wherever it appears — Word documents often open with
  a date line) was the better product behaviour, so I renamed the test and fixed
  the expectation.

Worth stating explicitly: the temptation with a red suite is to change the code
until it goes green. Both of these needed the opposite.

---

## Bugs that only running it could find

Three real defects survived code review and the entire test suite. All three were
caught by exercising the actual running application:

**1. Config validated too late.** Logging in with the *correct* password returned
a 500 while a *wrong* password correctly returned 401 — the production
`SESSION_SECRET` guard was throwing inside the login handler. The check existed;
it just ran at the wrong moment. Fixed by moving validation to boot
(`src/instrumentation-node.ts`) so the server refuses to start with a clear
message instead of serving a broken login. Verified by booting without the secret
and confirming exit code 1.

**2. `output: "standalone"` silently broke `npm start`.** Set for the Docker
image, it made the normal start command serve a stale build. Next warned about it
in a log line nobody would have read. Made it conditional on a `BUILD_STANDALONE`
flag that only the Dockerfile sets.

**3. Exports printed the title twice.** The export route prepended `# {title}`,
but imported documents already begin with their own `<h1>` — because the importer
derives the title *from* that heading. Every exported file had a duplicated
header. Invisible in code review, obvious the moment we read the actual output.

There is also a process lesson here: after fixing #3, the export *still* looked
broken. The cause was a stale server — `pkill -f "next start"` does not match the
process on Windows, so the old build was still serving. I nearly concluded the
fix had failed. Confirming what is actually running is part of verifying a fix.

A fourth, found by running `npm run dev` rather than only `npm run build`: Next
compiles `instrumentation.ts` for the Edge runtime too, so `node:crypto` and
`process.exit` produced eight "not supported in the Edge Runtime" errors — on the
very first command in the README. Split into `instrumentation.ts` (runtime check
only) and `instrumentation-node.ts` (the actual work), which took it to zero.

---

## How correctness was verified

**Automated — 150 tests, weighted toward risk.** The permission matrix is tested
exhaustively rather than by example, including fail-closed behaviour on corrupt
role data. Database tests run against a real in-memory SQLite built from the
actual migration files, so foreign keys, cascades and unique indexes are
genuinely exercised. The `.docx` tests build a real OOXML zip and run it through
mammoth rather than mocking the parser.

**Manual — the real app over real HTTP.** With the production build running, I
drove the full journey with `curl` across three concurrent sessions:

- Every permission rule from the README table, asserted as an HTTP status:
  viewer edit → 403, viewer delete → 403, editor re-share → 403, non-collaborator
  read → 404.
- Import of `.txt`, `.md`, and a genuine `.docx` — plus every rejection path
  (`.png` → 415, renamed `.doc` → 400, binary-as-`.txt` → 400, oversize → 413).
- A `<script>` payload through the markdown importer, then inspecting the stored
  HTML to confirm it was gone.
- The full sharing lifecycle: grant → verify → downgrade → verify enforcement →
  revoke → confirm 404.
- Concurrent edits from two sessions against the same stale revision, confirming
  the overwritten content really did land in version history.
- Validation limits: oversized body, 300-char title, malformed JSON, empty patch,
  invalid role, duplicate signup — and the login rate limiter tripping at 16
  attempts.
- Server-rendered HTML asserted per role: the viewer's page contains the
  read-only notice and contains **no** Delete control.

A final 17-check regression pass over the running build came back green.

**Deployment safety, tested rather than assumed.** Booted against no database at
all to confirm a fresh deploy migrates and seeds itself; then created a document,
restarted, and confirmed the data survived and the seeder did **not** re-run.
That guard protects against wiping real data, so assuming it worked was not good
enough.

---

## Honest assessment

Pairing this way made the deliverable roughly 3–4× larger than I could have
hand-written in the same window, and the quality floor for boilerplate was high.
But the distribution of errors was distinctly non-human: fluent and structurally
sound while being confidently wrong about package versions, occasionally emitting
bytes that were not what they appeared to be, and generating plausible code with
no meaning. None of those look like mistakes a developer makes, which is exactly
why skim-reading generated code is not review.

The parts of this project I would actually defend in an interview — the
force-snapshot-on-conflict decision, sanitizing on write rather than read,
404-instead-of-403, boot-time config validation, the choice *not* to attempt
real-time collaboration — are decisions, not code. They came from the product
side of the pairing, and the implementation followed once they were made.

The genuine limit of the approach: AI will confidently build whatever it is
pointed at. It has no opinion about whether the thing is worth building. The
scoping in [ARCHITECTURE.md](./ARCHITECTURE.md) is the part that had to be human,
and it is the part the brief is really testing.
