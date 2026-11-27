import { describe, expect, it } from "vitest";
import { validateAdminPassword } from "@/lib/auth/password-policy";
import { hashPassword, verifyPassword } from "@/lib/auth";

describe("executive password policy", () => {
  it("rejects short passwords", () => expect(validateAdminPassword("short")?.code).toBe("password_too_short"));
  it("accepts a valid password", () => expect(validateAdminPassword("a-good-password")).toBeNull());
  it("uses UTF-8 bytes rather than JavaScript character count", () => {
    expect(validateAdminPassword("é".repeat(36))).toBeNull();
    expect(validateAdminPassword("é".repeat(37))?.code).toBe("password_too_long");
    expect(() => hashPassword("é".repeat(37))).toThrow(/72-byte/);
  });
  it("keeps existing bcrypt hashes verifiable", () => {
    expect(verifyPassword("existing-password", hashPassword("existing-password"))).toBe(true);
  });
});
