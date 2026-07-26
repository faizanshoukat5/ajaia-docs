"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Demo accounts</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
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
                className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2 text-left transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor(user.email) }}
                >
                  {initials(user.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-[var(--color-muted)]">
                    {user.email}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Password for all demo accounts: <code className="rounded bg-[#f0f2f4] px-1 py-0.5">{demoPassword}</code>
        </p>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {mode === "signin" ? "Sign in" : "Create an account"}
          </h2>
          <button
            type="button"
            className="text-xs font-medium text-[var(--color-accent)] hover:underline"
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
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
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
      <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)]"
      />
    </label>
  );
}
