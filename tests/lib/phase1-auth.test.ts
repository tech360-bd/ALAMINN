/**
 * tests/lib/phase1-auth.test.ts — Phase 1 JWT + role hierarchy
 *
 * Locks down the Rule 1 contract:
 *   - createToken / verifyToken round-trip (jose HS256)
 *   - 24 hour expiry
 *   - tampered, missing, and wrong-secret tokens are rejected
 *   - requireRole enforces SUPER_ADMIN > OWNER > *_MANAGER > AI_REVIEWER > VIEWER
 *
 * No DB or cookie store is touched, so these tests are fast.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createToken, verifyToken, TOKEN_TTL_SECONDS } from "@/lib/auth/jwt";
import { requireRole, hasMinimumRole } from "@/lib/rbac";

const ORIGINAL_SECRET = process.env.JWT_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe("createToken / verifyToken", () => {
  it("round-trips userId and role", async () => {
    const token = await createToken("user_123", "CRM_MANAGER", {
      email: "crm@alaminn.info",
      name: "CRM Manager",
    });
    expect(token.split(".")).toHaveLength(3); // JWT structure

    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user_123");
    expect(payload?.role).toBe("CRM_MANAGER");
    expect(payload?.email).toBe("crm@alaminn.info");
    expect(payload?.name).toBe("CRM Manager");
  });

  it("issues a 24 hour expiry (Rule 1b)", async () => {
    const token = await createToken("user_123", "VIEWER");
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    const ttl = (payload!.expiresAt as number) - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(TOKEN_TTL_SECONDS - 30);
    expect(ttl).toBeLessThanOrEqual(TOKEN_TTL_SECONDS);
  });

  it("rejects a tampered token", async () => {
    const token = await createToken("user_123", "VIEWER");
    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "SUPER_ADMIN" })
    ).toString("base64url");
    expect(await verifyToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    process.env.JWT_SECRET = "a".repeat(64);
    const token = await createToken("user_123", "OWNER");
    process.env.JWT_SECRET = "b".repeat(64);
    expect(await verifyToken(token)).toBeNull();
  });

  it("rejects missing / malformed / unknown-role input without throwing", async () => {
    expect(await verifyToken(undefined)).toBeNull();
    expect(await verifyToken("")).toBeNull();
    expect(await verifyToken("not-a-jwt")).toBeNull();
    expect(await verifyToken("a.b.c")).toBeNull();
    await expect(createToken("user_123", "NOT_A_ROLE")).rejects.toThrow(/invalid role/);
  });
});

describe("requireRole — hierarchy", () => {
  it("allows a role at or above the minimum", () => {
    expect(requireRole("OWNER", "CRM_MANAGER").ok).toBe(true);
    expect(requireRole("SUPER_ADMIN", "OWNER").ok).toBe(true);
    expect(requireRole("CRM_MANAGER", "VIEWER").ok).toBe(true);
    expect(requireRole("AI_REVIEWER", "VIEWER").ok).toBe(true);
  });

  it("denies a role below the minimum with 403", () => {
    const check = requireRole("VIEWER", "CRM_MANAGER");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error.status).toBe(403);
  });

  it("denies a missing/invalid role with 401", () => {
    for (const role of [null, undefined, "", "HACKER"]) {
      const check = requireRole(role as never, "VIEWER");
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.error.status).toBe(401);
    }
  });

  it("ranks the documented hierarchy", () => {
    expect(hasMinimumRole("SUPER_ADMIN", "OWNER")).toBe(true);
    expect(hasMinimumRole("OWNER", "SUPER_ADMIN")).toBe(false);
    expect(hasMinimumRole("OWNER", "CONTENT_MANAGER")).toBe(true);
    expect(hasMinimumRole("AI_REVIEWER", "CONTENT_MANAGER")).toBe(false);
    expect(hasMinimumRole("AI_REVIEWER", "VIEWER")).toBe(true);
    expect(hasMinimumRole("VIEWER", "AI_REVIEWER")).toBe(false);
    expect(hasMinimumRole("VIEWER", "VIEWER")).toBe(true);
  });
});
