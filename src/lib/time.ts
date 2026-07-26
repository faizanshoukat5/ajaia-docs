/**
 * Relative-time formatting shared by the document list, the save indicator and
 * the history panel.
 *
 * Takes `now` as a parameter rather than calling Date.now() internally so it is
 * deterministic under test, and so a server-rendered value can be computed
 * against a single timestamp for a whole page.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;

  if (diff < 0) return "just now"; // clock skew; do not say "in 3 minutes"
  if (diff < 45 * 1000) return "just now";
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return absoluteDate(timestamp);
}

export function absoluteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function absoluteDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Initials for an avatar chip, e.g. "Ada Lovelace" -> "AL". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

/**
 * Deterministic accent colour per user id, so the same person keeps the same
 * avatar colour across sessions and surfaces without storing one.
 */
export function avatarColor(id: string): string {
  const palette = [
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#ea580c",
    "#059669",
    "#0891b2",
    "#4f46e5",
    "#b45309",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length]!;
}
