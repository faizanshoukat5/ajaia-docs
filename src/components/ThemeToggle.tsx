"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark switch. The inline script in layout.tsx applies the theme before
 * first paint; this component only reflects and updates it, so it renders
 * nothing until mounted to avoid disagreeing with what is already on <html>.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ajaia-theme", next);
    } catch {
      // Storage being unavailable only loses persistence, not the toggle.
    }
    setTheme(next);
  }

  // Reserve the footprint pre-mount so the header doesn't shift.
  if (theme === null) return <span className="h-8 w-8" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      {theme === "dark" ? (
        <Sun size={15} aria-hidden="true" />
      ) : (
        <Moon size={15} aria-hidden="true" />
      )}
    </button>
  );
}
