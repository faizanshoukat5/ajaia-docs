import { describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "@/server/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { newId } from "@/lib/ids";

/**
 * Session tokens are the only thing standing between a request and someone else's
 * documents, so forgery and expiry are worth testing directly rather than only
 * through the login route.
 */

describe("session tokens", () => {
  it("round-trips a user id", () => {
    const token = createSessionToken("user-123");
    expect(readSessionToken(token)).toBe("user-123");
  });

  it("rejects a token with a tampered user id", () => {
    const token = createSessionToken("user-123");
    const [, issuedAt, signature] = token.split(".");
    expect(readSessionToken(`victim.${issuedAt}.${signature}`)).toBeNull();
  });

  it("rejects a token with a tampered timestamp", () => {
    const token = createSessionToken("user-123", Date.now() - 1000);
    const [userId, , signature] = token.split(".");
    expect(readSessionToken(`${userId}.${Date.now()}.${signature}`)).toBeNull();
  });

  it("rejects an unsigned or malformed token", () => {
    expect(readSessionToken("user-123")).toBeNull();
    expect(readSessionToken("user-123.123")).toBeNull();
    expect(readSessionToken("a.b.c.d")).toBeNull();
    expect(readSessionToken("")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  it("rejects an empty user id", () => {
    const token = createSessionToken("");
    expect(readSessionToken(token)).toBeNull();
  });

  it("expires after the maximum age", () => {
    const now = Date.now();
    const old = createSessionToken("user-123", now - 31 * 24 * 60 * 60 * 1000);
    expect(readSessionToken(old, now)).toBeNull();
  });

  it("accepts a token that is old but still inside the window", () => {
    const now = Date.now();
    const token = createSessionToken("user-123", now - 29 * 24 * 60 * 60 * 1000);
    expect(readSessionToken(token, now)).toBe("user-123");
  });

  it("rejects a token issued implausibly far in the future", () => {
    const now = Date.now();
    const token = createSessionToken("user-123", now + 10 * 60 * 1000);
    expect(readSessionToken(token, now)).toBeNull();
  });

  it("tolerates small clock skew", () => {
    const now = Date.now();
    const token = createSessionToken("user-123", now + 5_000);
    expect(readSessionToken(token, now)).toBe("user-123");
  });
});

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("correct");
    expect(verifyPassword("incorrect", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
  });

  it("salts, so identical passwords hash differently", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("normalizes unicode so the same typed password verifies", () => {
    // U+00E9 vs. e + U+0301 — visually identical, different bytes.
    const hash = hashPassword("café");
    expect(verifyPassword("café", hash)).toBe(true);
  });

  it("returns false for a malformed stored hash instead of throwing", () => {
    for (const bad of ["", "notahash", "scrypt$1", "bcrypt$1$2$3$4$5", "scrypt$a$b$c$d$e"]) {
      expect(verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("refuses absurd parameters from a tampered row", () => {
    // A huge N would otherwise let a tampered row turn a login into a DoS.
    expect(verifyPassword("x", "scrypt$99999999$8$1$c2FsdA$aGFzaA")).toBe(false);
  });
});

describe("id generation", () => {
  it("produces unique ids of the requested length", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
    expect(newId()).toHaveLength(16);
    expect(newId(8)).toHaveLength(8);
  });

  it("uses an unambiguous alphabet", () => {
    // No I, L, O or U — they are easy to misread in a shared link.
    for (let i = 0; i < 200; i++) {
      expect(newId()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
    }
  });
});
