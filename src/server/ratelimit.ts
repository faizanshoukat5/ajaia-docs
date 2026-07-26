import { AppError } from "@/lib/errors";

/**
 * A fixed-window counter for the login endpoint.
 *
 * Deliberately in-process: it is ~20 lines, needs no infrastructure, and stops
 * the obvious case (someone hammering the seeded accounts). Its limits are real
 * and worth stating — it does not survive a restart and does not coordinate
 * across instances, so a horizontally-scaled deployment would need Redis or the
 * platform's own rate limiter. Not a substitute for that; just better than
 * nothing on an endpoint that verifies passwords.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 15;

const windows = new Map<string, Window>();

export function checkLoginAttempt(key: string, now = Date.now()): void {
  // Opportunistically drop expired windows so the map cannot grow without bound
  // from one-off keys.
  if (windows.size > 5_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  existing.count += 1;
  if (existing.count > MAX_ATTEMPTS) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    throw new AppError(
      429,
      "too_many_requests",
      `Too many sign-in attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    );
  }
}

/** Called on a successful sign-in so a legitimate user is not penalised. */
export function clearLoginAttempts(key: string): void {
  windows.delete(key);
}

/** Test seam. */
export function resetRateLimiter(): void {
  windows.clear();
}
