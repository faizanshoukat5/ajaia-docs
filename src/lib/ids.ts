import { randomBytes } from "node:crypto";

// Crockford-style base32 without I, L, O, U — short, URL-safe, and hard to
// misread in a shared link.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A random opaque id. 16 chars of a 32-symbol alphabet is 80 bits, which is far
 * beyond collision risk at this scale while staying short enough to read aloud.
 *
 * Ids are unguessable on purpose: a document URL is not a capability here (every
 * request is still authorized server-side), but it should not be enumerable.
 */
export function newId(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    // `bytes[i]` is always defined for i < length; the assertion satisfies
    // noUncheckedIndexedAccess without a runtime branch.
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
