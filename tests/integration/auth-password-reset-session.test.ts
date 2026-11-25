import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const dbMock = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const sendTransactionalMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/email", () => ({ sendTransactional: sendTransactionalMock }));
vi.mock("@/lib/env", () => ({
  env: () => ({
    siteUrl: "https://alaminn.info",
    emailConfigured: true,
  }),
}));

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("auth forgot/reset/session/logout routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMock.auditLog.create.mockResolvedValue({});
    dbMock.user.update.mockResolvedValue({});
    sendTransactionalMock.mockResolvedValue({ ok: true });
  });

  it("forgot-password returns non-enumerating success for unknown email", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/auth/forgot-password/route");
    const res = await POST(req("http://localhost/api/v1/auth/forgot-password", { email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/If the email exists/i);
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });

  it("forgot-password issues reset token for known user and does not leak token in response", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: "u1", email: "user@example.com", name: "User" });
    const { POST } = await import("@/app/api/v1/auth/forgot-password/route");
    const res = await POST(req("http://localhost/api/v1/auth/forgot-password", { email: "user@example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/If the email exists/i);
    expect(json).not.toHaveProperty("token");
    expect(dbMock.user.update).toHaveBeenCalledTimes(1);
    const update = dbMock.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "u1" });
    expect(typeof update.data.passwordResetToken).toBe("string");
    expect(update.data.passwordResetToken.length).toBeGreaterThan(20);
    expect(update.data.passwordResetExpiresAt instanceof Date).toBe(true);
  });

  it("reset-password rejects invalid or expired token", async () => {
    dbMock.user.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/auth/reset-password/route");
    const res = await POST(req("http://localhost/api/v1/auth/reset-password", { token: "bad-token", password: "new-password-123" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errors).toContain("token_invalid");
  });

  it("reset-password rejects malformed payload and short password", async () => {
    const { POST } = await import("@/app/api/v1/auth/reset-password/route");
    const bad = await POST(req("http://localhost/api/v1/auth/reset-password", "not-object"));
    expect(bad.status).toBe(400);
    const short = await POST(req("http://localhost/api/v1/auth/reset-password", { token: "t", password: "short" }));
    expect(short.status).toBe(422);
    const shortJson = await short.json();
    expect(shortJson.errors).toContain("password_too_short");
  });

  it("reset-password stores hashed password and clears single-use token", async () => {
    dbMock.user.findFirst.mockResolvedValue({ id: "u1", email: "user@example.com" });
    const { POST } = await import("@/app/api/v1/auth/reset-password/route");
    const res = await POST(req("http://localhost/api/v1/auth/reset-password", { token: "valid-token", password: "new-password-123" }));
    expect(res.status).toBe(200);
    expect(dbMock.user.update).toHaveBeenCalledTimes(1);
    const update = dbMock.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "u1" });
    expect(update.data.passwordResetToken).toBeNull();
    expect(update.data.passwordResetExpiresAt).toBeNull();
    expect(typeof update.data.passwordHash).toBe("string");
    expect(update.data.passwordHash).not.toBe("new-password-123");
  });

  it("reset-password rejects reused token after it has been cleared", async () => {
    dbMock.user.findFirst.mockResolvedValueOnce({ id: "u1", email: "user@example.com" });
    const { POST } = await import("@/app/api/v1/auth/reset-password/route");
    const first = await POST(req("http://localhost/api/v1/auth/reset-password", { token: "valid-token", password: "new-password-123" }));
    expect(first.status).toBe(200);

    dbMock.user.findFirst.mockResolvedValueOnce(null);
    const reused = await POST(req("http://localhost/api/v1/auth/reset-password", { token: "valid-token", password: "another-password-123" }));
    expect(reused.status).toBe(400);
    const json = await reused.json();
    expect(json.errors).toContain("token_invalid");
  });
});

describe("auth session/logout routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("session returns 401 when no session", async () => {
    vi.doMock("@/lib/auth", () => ({ getSessionFromRequest: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("@/app/api/v1/auth/session/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/auth/session"));
    expect(res.status).toBe(401);
  });

  it("logout clears auth cookie and returns ok", async () => {
    const clearSessionCookie = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/auth", () => ({
      getSessionFromRequest: vi.fn().mockResolvedValue({ userId: "u1", role: "OWNER" }),
      clearSessionCookie,
    }));
    vi.doMock("@/lib/db", () => ({ db: { auditLog: { create: vi.fn().mockResolvedValue({}) } } }));
    const { POST } = await import("@/app/api/v1/auth/logout/route");
    const res = await POST(new NextRequest("http://localhost/api/v1/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});
