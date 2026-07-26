import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing on Node's built-in scrypt.
 *
 * Deliberately not bcrypt/argon2: both are native addons, and this project's
 * "clone and run" promise is worth more than the marginal difference between
 * scrypt-at-these-parameters and argon2id. Stored format is self-describing so
 * parameters can change without invalidating existing rows.
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// N=2^15 keeps verification around 100 ms on a laptop.
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
// scrypt needs roughly 128 * N * r bytes; Node's default 32 MB cap is below what
// N=2^15, r=8 requires, so raise it explicitly.
const MAX_MEMORY = 128 * COST * BLOCK_SIZE * 2;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Constant-time verification. Returns false for any malformed stored hash rather
 * than throwing, so a corrupt row denies login instead of 500-ing the endpoint.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockRaw, parRaw, saltRaw, hashRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(costRaw);
  const r = Number(blockRaw);
  const p = Number(parRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters from a tampered row instead of trying to honour them.
  if (N < 2 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashRaw, "base64url");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltRaw, "base64url"), expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
