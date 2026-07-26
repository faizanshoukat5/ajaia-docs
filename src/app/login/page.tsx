import { redirect } from "next/navigation";
import { Check, FileText, History, Shield, Users } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SEED_PASSWORD, SEED_USERS } from "@/lib/demo-accounts";
import { getCurrentUser } from "@/server/session";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/documents");

  return (
    <main className="flex min-h-screen">
      {/* Brand panel — hidden on small screens where the form is the whole story. */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        {/* Aurora backdrop: layered gradients, two of them drifting slowly. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, #4f46e5 0%, #4338ca 45%, #312e81 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="animate-float-slower pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, #818cf8, transparent 65%)" }}
        />
        <div
          aria-hidden="true"
          className="animate-float-slow pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 65%)" }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <FileText size={17} aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">Ajaia Docs</span>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            A document you can write in, that others can open, where nothing you type is lost.
          </h1>

          {/* Product preview — a stylized miniature of the real editor. */}
          <div className="relative mt-10 max-w-md" aria-hidden="true">
            {/* Back card, peeking out for depth. */}
            <div
              className="absolute -right-4 -top-4 h-full w-full rounded-2xl border border-white/10 bg-white/5"
              style={{ transform: "rotate(2deg)" }}
            />
            <div className="animate-float-slow relative rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
              {/* Mini title bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                  <Check size={9} /> Saved just now
                </span>
              </div>
              {/* Mini toolbar */}
              <div className="mt-3 flex gap-1.5">
                <span className="h-5 w-14 rounded-md bg-white/15" />
                <span className="h-5 w-5 rounded-md bg-white/25" />
                <span className="h-5 w-5 rounded-md bg-white/15" />
                <span className="h-5 w-5 rounded-md bg-white/15" />
                <span className="h-5 w-5 rounded-md bg-white/15" />
              </div>
              {/* Skeleton document lines */}
              <div className="mt-4 space-y-2.5">
                <span className="block h-3.5 w-2/3 rounded bg-white/40" />
                <span className="block h-2 w-full rounded bg-white/20" />
                <span className="block h-2 w-11/12 rounded bg-white/20" />
                <span className="block h-2 w-4/5 rounded bg-white/15" />
                <span className="mt-3 block h-2 w-1/2 rounded bg-white/25" />
                <span className="block h-2 w-3/4 rounded bg-white/15" />
              </div>
              {/* Presence row */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex -space-x-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-300 text-[8px] font-bold text-indigo-900 ring-2 ring-white/20">
                    AL
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-300 text-[8px] font-bold text-violet-900 ring-2 ring-white/20">
                    GH
                  </span>
                </div>
                <span className="text-[10px] text-white/50">2 people here</span>
              </div>
            </div>
          </div>

          <ul className="mt-10 space-y-3.5 text-sm text-white/85">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12">
                <Users size={15} aria-hidden="true" />
              </span>
              Viewer / editor sharing, enforced server-side on every route
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12">
                <History size={15} aria-hidden="true" />
              </span>
              Automatic version history — concurrent edits are never lost
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12">
                <Shield size={15} aria-hidden="true" />
              </span>
              Every write sanitized against a strict allowlist
            </li>
          </ul>
        </div>

        {/* Proof chips instead of a plain feature line. */}
        <div className="relative flex flex-wrap gap-2 text-[11px] font-medium">
          {["150 tests passing", "3 access roles", "Light + dark", ".docx / .md import"].map(
            (chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-white/80 backdrop-blur"
              >
                {chip}
              </span>
            ),
          )}
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative flex flex-1 flex-col justify-center px-5 py-12">
        {/* Faint wash so the panel is not a flat void. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(40rem 20rem at 110% -10%, var(--accent-soft), transparent 60%)",
          }}
        />

        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-on-accent shadow-sm"
                style={{ background: "linear-gradient(135deg, var(--accent), #7c3aed)" }}
              >
                <FileText size={17} aria-hidden="true" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">Ajaia Docs</h1>
            </div>
            <p className="mt-2 text-sm text-muted">
              A lightweight collaborative document editor.
            </p>
          </div>

          <LoginForm
            demoUsers={SEED_USERS.map((u) => ({ email: u.email, name: u.name }))}
            demoPassword={SEED_PASSWORD}
          />
        </div>
      </div>
    </main>
  );
}
