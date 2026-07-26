import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { users, type UserRow } from "@/db/schema";
import { unauthorized } from "@/lib/errors";

/**
 * Cookie sessions, signed but not encrypted.
 *
 * The cookie holds `userId.issuedAt.hmac`. There is no server-side session table:
 * for this scope the tradeoff (no individual revocation) is acceptable and it
 * keeps the deployment stateless apart from the document store. Rotating
 * SESSION_SECRET invalidates every session at once.
 */

const COOKIE_NAME = "ajaia_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * In development we fall back to a fixed secret so `npm run dev` works with no
 * .env file. In production an unset secret is a hard failure rather than a silent
 * downgrade to a publicly-known signing key.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production. Generate one with: openssl rand -base64 32",
    );
  }
  return "dev-only-insecure-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the user id encoded in a token, or null if the token is malformed,
 * mis-signed, or expired.
 */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtRaw, signature] = parts as [string, string, string];
  if (userId.length === 0) return null;

  const expected = sign(`${userId}.${issuedAtRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > MAX_AGE_SECONDS * 1000) return null;
  // A token issued in the future means a tampered/clock-skewed value; allow a
  // small skew, reject the rest.
  if (issuedAt - now > 60 * 1000) return null;

  return userId;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type SessionUser = Pick<UserRow, "id" | "email" | "name">;

export function findUserById(db: Db, userId: string): SessionUser | null {
  const row = db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row ?? null;
}

/**
 * The signed-in user, or null. Also returns null when the cookie is valid but the
 * user has since been deleted, so a stale cookie behaves like being signed out.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = readSessionToken(store.get(COOKIE_NAME)?.value);
  if (!userId) return null;
  return findUserById(getDb(), userId);
}

/** Same as `getCurrentUser`, but throws a 401 for API routes. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}
