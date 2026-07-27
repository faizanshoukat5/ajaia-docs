# Deployment guide — exact steps

The app is one Next.js server plus one SQLite file. The only hard requirement
is **a writable, persistent disk** for that file. On first boot against an
empty database the server migrates and seeds itself, so a fresh deployment is
reviewable immediately with no shell access.

Three routes, in order of recommendation for this project. (Pricing checked
July 2026 — Fly removed its free tier for accounts created after Oct 2024, and
Render's free tier cannot attach persistent disks.)

| Route | Cost | Persistent data | Cold starts | Needs GitHub? | Needs local Docker? |
| --- | --- | --- | --- | --- | --- |
| **A. Fly.io** | ~$2–4/mo, card required after a short trial | ✅ volume | none | ❌ deploys your local folder | ❌ builds remotely |
| **B. Railway** | ~$5 one-time trial credit (≈ covers a review window), then $5/mo | ✅ volume | none | optional | ❌ |
| **C. Render free** | $0 | ❌ ephemeral — data resets | ~1 min after 15 min idle | ✅ | ❌ |

**If you need truly $0:** Railway's trial credit is the better zero-cost option
(real volume, no spin-down while credited). Render free works only with the
caveats in its section below.

---

## Option A — Fly.io (recommended)

The cleanest fit: persistent volumes, no idle spin-down, `fly deploy` builds
the Docker image **on Fly's remote builders** (no local Docker), and it deploys
the folder on your disk directly (no GitHub needed).

**Cost reality (2026):** accounts created after Oct 2024 have no free tier —
sign-up gives a short trial, then a credit card and pay-as-you-go billing are
required. This app's footprint (one `shared-cpu-1x` 512 MB machine with
`auto_stop_machines` suspending it when idle + a 1 GB volume) lands around
**$2–4/month**, less if the machine is suspended most of the time.

All commands are PowerShell, run from the project root.

### 1. Install the CLI and sign in

```powershell
iwr https://fly.io/install.ps1 -useb | iex
# Close and reopen the terminal so flyctl is on PATH, then:
fly auth signup        # or: fly auth login
```

Sign-up gives a short trial; before or shortly after the first deploy Fly will
ask for a credit card (their post-2024 policy — see the cost note above).

### 2. Create the app (no deploy yet)

```powershell
fly launch --no-deploy --copy-config --name <your-unique-app-name>
```

- `--copy-config` keeps the checked-in `fly.toml` (port, volume mount,
  `DATABASE_PATH=/data/ajaia.db`, single-machine settings).
- The name must be globally unique — `ajaia-docs-<yourname>` works. Accept the
  suggested region or pass `--region iad`.
- If it asks to overwrite `fly.toml`, say **no**.

### 3. Create the volume (same region as the app)

```powershell
fly volumes create ajaia_data --size 1 --region iad
```

The name `ajaia_data` must match the `[[mounts]]` block in `fly.toml` — it
already does.

### 4. Set the session secret

No `openssl` on Windows? Use Node:

```powershell
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
fly secrets set SESSION_SECRET="$secret"
```

The server **refuses to boot in production without this** — by design.

### 5. Deploy

```powershell
fly deploy
```

This uploads the source and builds the `Dockerfile` remotely. First build
takes a few minutes.

> The Dockerfile is proven — it is the image running in production on Railway.
> If a remote build fails, `fly logs` shows why.

### 6. Verify

```powershell
fly status          # machine should be started
fly logs            # look for "database ready at /data/ajaia.db"
fly open            # opens https://<app>.fly.dev
```

Then, in the browser:

1. `/login` shows the three demo accounts → one-click sign in as **Ada**
   (proves boot-time self-migration + self-seeding worked).
2. Open *Q3 Productivity Roadmap*, type a line, watch the save pill.
3. Sign out → sign in as **Alan** → open the same document → confirm the
   read-only banner and missing Share/Delete.
4. Optional persistence check: create a document, then
   `fly machine restart`, reload — the document must still be there **and**
   the seeder must not have re-run.

### Fly troubleshooting

| Symptom | Fix |
| --- | --- |
| `Error: name already taken` | Pick another `--name`. |
| Build fails in `npm ci` | Remote builder hiccup — re-run `fly deploy`. |
| App boots then exits with a SESSION_SECRET message | Step 4 was skipped or the secret didn't apply — `fly secrets list`. |
| Data gone after redeploy | Volume not mounted — `fly volumes list`, and confirm `[[mounts]]` in `fly.toml`. |

---

## Option B — Railway (best $0-for-now option)

Railway grants a one-time ~$5 trial credit, supports **volumes** (real
persistence), and has no idle spin-down while credited — which comfortably
covers a take-home review window. After the credit it's Hobby at $5/mo.

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
   (or install their CLI and `railway up` to push the local folder without
   GitHub).
2. It auto-detects Next.js (`npm ci && npm run build` / `npm start`).
3. Add a **Volume** in the service settings, mounted at `/data`.
4. Variables: `SESSION_SECRET` (generate as in Option A step 4) and
   `DATABASE_PATH=/data/ajaia.db`.
5. **Settings → Networking → Generate Domain**, then run the 4-step
   verification from Option A step 6.

---

## Option C — Render free tier (works, with real caveats)

**The two limits that matter here:**

- **No persistent disk on free services** — the SQLite file lives on an
  ephemeral filesystem. The app self-reseeds an empty database on boot, so the
  demo accounts and seed documents always come back, but **anything a reviewer
  creates or edits disappears** whenever the service restarts or spins down.
- **Idle spin-down after 15 minutes** — the first request afterwards takes up
  to ~1 minute while the instance cold-starts. A reviewer's first click may hit
  that wall.

Acceptable for a demo **if you state it in the submission** ("free-tier
hosting: data resets on idle; run locally for persistence") and ideally ping
the URL shortly before a review. For full persistence on Render you need the
Starter instance (~$7/mo) plus a disk — at that price Fly is cheaper.

Render deploys from a Git repo, so push to GitHub first:

```powershell
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/ajaia-docs.git
git push -u origin main
```

Then:

1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**.
2. Connect the GitHub repo. Render reads the checked-in `render.yaml`
   (build `npm ci && npm run build`, start `npm start`, `SESSION_SECRET`
   auto-generated, disk at `/var/data`).
3. **Free plan?** Persistent disks are paid. Either accept the Starter plan
   (~$7/mo) as configured, or delete the `disk:` block and the
   `DATABASE_PATH` env var from `render.yaml` before applying — the app then
   runs free, self-reseeds on every cold start, and reviewer-created
   documents do not survive restarts. State that caveat in your submission if
   you take it.
4. Apply, wait for the deploy, open the `onrender.com` URL, and run the same
   4-step verification as Option A.

---

## Do not deploy to Vercel as-is

Serverless filesystems are ephemeral — the SQLite file is discarded between
invocations. Moving to hosted Postgres is the contained change described in
[ARCHITECTURE.md](../ARCHITECTURE.md#if-this-needed-to-scale).

## After deploying — finish the submission

1. Paste the live URL into `SUBMISSION.md`, `README.md`, and
   `docs/SUBMISSION_FORM.md` (the `[PASTE DEPLOYMENT URL]` placeholder).
2. Record/upload the walkthrough video (`docs/WALKTHROUGH_SCRIPT.md`) and put
   the link in `VIDEO.txt` and the submission form.
3. Re-run the 4-step verification against the **live** URL right before
   submitting — a reviewer's first click should never be the first time it's
   been tried.
