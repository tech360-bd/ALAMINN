/**
 * tests/lib/auth.test.ts — password hashing primitives
 *
 * Covers the pure-Node password primitives in src/lib/auth.ts:
 *   - hashPassword returns a bcrypt hash (Rule 1b)
 *   - verifyPassword accepts the correct password
 *   - verifyPassword rejects an incorrect password
 *   - different salts produce different stored hashes for the same password
 *   - legacy `scrypt$salt$hash` hashes still verify (transparent migration)
 *
 * These tests deliberately avoid touching `next/headers`, the cookie store,
 * or the DB — `hashPassword` / `verifyPassword` are pure functions over
 * Node's `crypto` module. Importing `auth.ts` does pull in `db` and
 * `next/headers`, but neither is invoked at module load.
 *
 * bcrypt cost 12 is intentionally slow (~250 ms per hash), so we keep the
 * number of hashes per test minimal.
 */
import { describe, it, expect } from "vitest";
import { scryptSync } from "crypto";
import { hashPassword, verifyPassword, needsPasswordRehash } from "@/lib/auth";

describe("hashPassword — output format", () => {
  it("returns a bcrypt hash with cost 12", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(typeof stored).toBe("string");
    expect(stored).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("produces a different salt on every call (randomness)", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    // bcrypt layout: $2b$12$<22-char salt><31-char hash>
    expect(a.slice(0, 29)).not.toBe(b.slice(0, 29));
  });
});

describe("legacy scrypt hashes", () => {
  it("still verify, and are flagged for rehash", () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const legacy = `scrypt$${salt}$${scryptSync("old-password", salt, 64).toString("hex")}`;
    expect(verifyPassword("old-password", legacy)).toBe(true);
    expect(verifyPassword("wrong", legacy)).toBe(false);
    expect(needsPasswordRehash(legacy)).toBe(true);
    expect(needsPasswordRehash(hashPassword("new"))).toBe(false);
  });
});

describe("verifyPassword — correct password", () => {
  it("returns true for the original password", () => {
    const password = "Tr0ub4dor&3";
    const stored = hashPassword(password);
    expect(verifyPassword(password, stored)).toBe(true);
  });

  it("accepts 72 UTF-8 bytes but refuses to create silently truncated hashes", () => {
    const password = "a".repeat(72);
    const stored = hashPassword(password);
    expect(verifyPassword(password, stored)).toBe(true);
    expect(() => hashPassword("a".repeat(200))).toThrow(/72-byte/);
  });

  it("returns true for a password with unicode", () => {
    const password = "пароль-🔐-123";
    const stored = hashPassword(password);
    expect(verifyPassword(password, stored)).toBe(true);
  });
});

describe("verifyPassword — wrong password", () => {
  it("returns false for a completely different password", () => {
    const stored = hashPassword("correct-password");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("returns false for a near-miss password", () => {
    const stored = hashPassword("correct-password");
    expect(verifyPassword("correct-passw0rd", stored)).toBe(false);
    expect(verifyPassword("Correct-password", stored)).toBe(false);
    expect(verifyPassword("correct-password ", stored)).toBe(false);
  });

  it("returns false for an empty password", () => {
    const stored = hashPassword("real-password");
    expect(verifyPassword("", stored)).toBe(false);
  });
});

describe("verifyPassword — different salts produce different hashes", () => {
  it("two hashes for the same password are not equal", () => {
    const password = "shared-secret";
    const h1 = hashPassword(password);
    const h2 = hashPassword(password);
    expect(h1).not.toBe(h2);
    // ...but both verify against the original password.
    expect(verifyPassword(password, h1)).toBe(true);
    expect(verifyPassword(password, h2)).toBe(true);
    // bcrypt layout: $2b$12$<22-char salt><31-char digest>
    expect(h1.split("$")[3].slice(0, 22)).not.toBe(h2.split("$")[3].slice(0, 22));
    expect(h1.split("$")[3].slice(22)).not.toBe(h2.split("$")[3].slice(22));
  });

  it("a hash generated with one salt does not verify against a re-hash with a different salt", () => {
    // Sanity: re-hashing the same password produces a different stored
    // string, but both should still verify the password independently.
    const password = "salt-test-123";
    const stored = hashPassword(password);
    const otherStored = hashPassword(password);
    // Verifying the same password against either stored hash works.
    expect(verifyPassword(password, stored)).toBe(true);
    expect(verifyPassword(password, otherStored)).toBe(true);
    // A wrong password fails against both.
    expect(verifyPassword("nope", stored)).toBe(false);
    expect(verifyPassword("nope", otherStored)).toBe(false);
  });
});

describe("verifyPassword — malformed stored strings", () => {
  it("returns false for a stored string with the wrong scheme prefix", () => {
    expect(verifyPassword("anything", "bcrypt$salt$hash")).toBe(false);
  });

  it("returns false for a stored string missing parts", () => {
    expect(verifyPassword("anything", "scrypt$onlyonepart")).toBe(false);
    expect(verifyPassword("anything", "scrypt$")).toBe(false);
    expect(verifyPassword("anything", "$$")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("returns false for a stored string with non-hex salt/hash", () => {
    // The split shape is correct, but the salt and hash contain non-hex
    // characters. scryptSync will throw, which verifyPassword swallows.
    expect(verifyPassword("anything", "scrypt$zzzz$yyyy")).toBe(false);
  });

  it("returns false for non-string stored values (defensive)", () => {
    // verifyPassword is typed to accept string, but we verify that passing
    // odd values via a cast doesn't crash the process.
    expect(verifyPassword("anything", null as unknown as string)).toBe(false);
    expect(verifyPassword("anything", undefined as unknown as string)).toBe(false);
    expect(verifyPassword("anything", 42 as unknown as string)).toBe(false);
  });
});
