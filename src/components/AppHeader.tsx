"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/time";
import type { SessionUser } from "@/server/session";

/**
 * App chrome: product name, an optional middle slot for page-specific controls,
 * and the account menu.
 */
export function AppHeader({
  user,
  children,
}: {
  user: SessionUser;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/session", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="no-print sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/documents" className="shrink-0 text-sm font-semibold tracking-tight">
          Ajaia Docs
        </Link>

        <div className="min-w-0 flex-1">{children}</div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-right sm:block">
            <span className="block text-xs font-medium leading-tight">{user.name}</span>
            <span className="block text-[11px] leading-tight text-[var(--color-muted)]">
              {user.email}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: avatarColor(user.id) }}
            title={user.name}
          >
            {initials(user.name)}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-xs font-medium transition hover:bg-[var(--color-canvas)] disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
