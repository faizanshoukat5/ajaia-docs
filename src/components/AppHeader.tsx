"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/time";
import { ThemeToggle } from "./ThemeToggle";
import type { SessionUser } from "@/server/session";

/**
 * App chrome: product mark, an optional middle slot for page-specific controls,
 * the theme toggle, and the account menu.
 */
export function AppHeader({
  user,
  children,
}: {
  user: SessionUser;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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
    // Frosted-glass bar with a gradient hairline instead of a hard border — the
    // sticky-nav pattern of current product sites, kept subtle.
    <header className="no-print sticky top-0 z-20 bg-surface/70 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link
          href="/documents"
          className="group flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-accent shadow-sm transition group-hover:scale-105"
            style={{
              background: "linear-gradient(135deg, var(--accent), #7c3aed)",
            }}
          >
            <FileText size={14} aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">Ajaia Docs</span>
        </Link>

        <div className="min-w-0 flex-1">{children}</div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1.5 transition hover:bg-surface-2 md:pl-2"
            >
              {/* Which demo account is active matters here — reviewers switch
                  constantly, so the name stays visible, not only in the menu. */}
              <span className="hidden text-right md:block">
                <span className="block max-w-40 truncate text-xs font-medium leading-tight">
                  {user.name}
                </span>
                <span className="block max-w-40 truncate text-[10px] leading-tight text-muted">
                  {user.email}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
                style={{ backgroundColor: avatarColor(user.id) }}
              >
                {initials(user.name)}
              </span>
              <ChevronDown
                size={13}
                aria-hidden="true"
                className={`text-faint transition-transform ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="animate-pop-in absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-2 transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    <LogOut size={14} aria-hidden="true" />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Gradient hairline: fades out toward the edges instead of a full-width rule. */}
      <div
        aria-hidden="true"
        className="h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--line) 15%, var(--line) 85%, transparent)",
        }}
      />
    </header>
  );
}
