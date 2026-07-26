"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/time";

interface DemoUser {
  email: string;
  name: string;
}

type Mode = "signin" | "signup";

/**
 * Sign-in, sign-up, and one-click switching between the seeded accounts.
 *
 * The one-click buttons submit the real login endpoint with the documented demo
 * password rather than bypassing auth — so there is no second, weaker code path
 * that exists only for the demo. Testing sharing means switching users
 * constantly, and this is the difference between a pleasant review and a tedious
 * one.
 */
export function LoginForm({
  demoUsers,
  demoPassword,
}: {
  demoUsers: DemoUser[];
  demoPassword: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function authenticate(payload: { email: string; password: string; name?: string }) {
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/session";
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      // `refresh()` re-runs the server components so the layout picks up the new
      // session before we navigate.
      startTransition(() => {
        router.replace("/documents");
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function signInAs(user: DemoUser) {
    setMode("signin");
    setEmail(user.email);
    setPassword(demoPassword);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ email: user.email, password: demoPassword }),
      });
      startTransition(() => {
        router.replace("/documents");
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="animate-rise-in rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Demo accounts</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          One click to sign in. Ada owns documents shared with the other two, so switching
          accounts shows the owned/shared split and both permission levels.
        </p>
        <ul className="mt-3 space-y-2">
          {demoUsers.map((user) => (
            <li key={user.email}>
              <button
                type="button"
                onClick={() => void signInAs(user)}
                disabled={busy}
                className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition hover:border-accent-ring hover:bg-accent-soft hover:shadow-sm disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
                  style={{ backgroundColor: avatarColor(user.email) }}
                >
                  {initials(user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-muted">{user.email}</span>
                </span>
                <ArrowRight
                  size={15}
                  aria-hidden="true"
                  className="shrink-0 text-faint opacity-0 transition group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Password for all demo accounts:{" "}
          <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-medium">
            {demoPassword}
          </code>
        </p>
      </section>

      <section
        className="animate-rise-in rounded-2xl border border-line bg-surface p-5 shadow-sm"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {mode === "signin" ? "Sign in" : "Create an account"}
          </h2>
          <button
            type="button"
            className="text-xs font-medium text-accent transition hover:text-accent-hover"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? "Create an account" : "I already have an account"}
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void authenticate(
              mode === "signup" ? { email, password, name } : { email, password },
            );
          }}
        >
          {mode === "signup" && (
            <Field
              label="Name"
              value={name}
              onChange={setName}
              type="text"
              autoComplete="name"
              required
            />
          )}
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
      />
    </label>
  );
}
