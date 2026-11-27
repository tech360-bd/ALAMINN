import { NextRequest } from "next/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { dirname } from "node:path";

const { isolatedDbPath } = vi.hoisted(() => {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const file = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], { encoding: "utf8" }).trim();
  process.env.DATABASE_URL = `file:${file}`;
  return { isolatedDbPath: file };
});
import { db } from "@/lib/db";
import { staffTokenHash } from "@/lib/auth/staff-token-session";
import { proxy } from "@/proxy";
import { createToken, verifyToken, AUTH_COOKIE } from "@/lib/auth/jwt";
import { signToken, SESSION_COOKIE } from "@/lib/auth/token";
import { resolveAuthSecret, resolveStaffSecret } from "@/lib/auth/secret";
import { encryptToken, decryptToken } from "@/lib/social/crypto";

afterAll(async () => {
  await db.$disconnect();
  rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
});

describe("Task 07 — Proxy Dual-Auth Gating, RBAC, Security Headers & Secret Enforcement", () => {
  const origJwtSecret = process.env.JWT_SECRET;
  const origAuthSecret = process.env.AUTH_SECRET;
  const origSessionSecret = process.env.SESSION_SECRET;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (origJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = origJwtSecret;
    if (origAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = origAuthSecret;
    if (origSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = origSessionSecret;
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  function assertSecurityHeaders(headers: Headers) {
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBeTruthy();
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  }

  it("gates all Command Center admin API prefixes with 401 JSON + security headers when unauthenticated", async () => {
    const adminApiPaths = [
      "/api/v1/admin/dashboard",
      "/api/v1/higher-study/admin/universities",
      "/api/v1/english-learning/admin/courses",
      "/api/v1/meetings/admin",
      "/api/v1/whatsapp/admin/stats",
    ];

    for (const pathname of adminApiPaths) {
      const req = new NextRequest(`http://localhost${pathname}`);
      const res = await proxy(req);
      expect(res.status, `${pathname} should return 401`).toBe(401);
      assertSecurityHeaders(res.headers);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.errors).toContain("unauthenticated");
    }
  });

  it("allows Command Center admin API requests through proxy when a valid auth_token JWT is present", async () => {
    const jwt = await createToken("admin-user-1", "OWNER", {
      email: "owner@alaminn.info",
      name: "Owner",
    });

    const payload = await verifyToken(jwt);
    await db.user.create({ data: { id: "admin-user-1", email: "owner@alaminn.info", name: "Owner", role: "OWNER" } });
    await db.adminSession.create({ data: { id: payload!.sessionId, userId: "admin-user-1", expiresAt: new Date(Date.now() + 3600_000) } });
    const req = new NextRequest(
      "http://localhost/api/v1/higher-study/admin/universities",
      {
        headers: {
          cookie: `${AUTH_COOKIE}=${jwt}`,
        },
      },
    );
    const res = await proxy(req);
    expect(res.status).toBe(200);
    assertSecurityHeaders(res.headers);
  });

  it("attaches security headers to staffGate 401, 403, and redirect responses and enforces role boundaries", async () => {
    // 1. Unauthenticated API call to staff-gated route -> 401 + security headers
    const unauthApi = await proxy(
      new NextRequest("http://localhost/api/staff"),
    );
    expect(unauthApi.status).toBe(401);
    assertSecurityHeaders(unauthApi.headers);

    // 2. Unauthenticated page request to /dashboard -> 307 redirect to /login + security headers
    const unauthPage = await proxy(
      new NextRequest("http://localhost/dashboard"),
    );
    expect(unauthPage.status).toBe(307);
    expect(unauthPage.headers.get("location")).toContain("/login?next=%2Fdashboard");
    assertSecurityHeaders(unauthPage.headers);

    // 3. VIEWER role attempting to access /api/staff (ADMIN only) -> 403 + security headers
    const secret = resolveStaffSecret()!;
    const viewerToken = await signToken(
      {
        sid: "sess-viewer-1",
        uid: "staff-viewer-1",
        role: "VIEWER",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    await db.staffAccount.create({ data: { id: "staff-viewer-1", email: "viewer@example.invalid", name: "Viewer", passwordHash: "unused", role: "VIEWER" } });
    await db.staffSession.create({ data: { id: "sess-viewer-1", accountId: "staff-viewer-1", tokenHash: staffTokenHash(viewerToken), expiresAt: new Date(Date.now() + 3600_000) } });
    const viewerStaffRes = await proxy(
      new NextRequest("http://localhost/api/staff", {
        headers: { cookie: `${SESSION_COOKIE}=${viewerToken}` },
      }),
    );
    expect(viewerStaffRes.status).toBe(403);
    assertSecurityHeaders(viewerStaffRes.headers);

    // 4. VIEWER role attempting to access /api/uci/audit (ADMIN, EDITOR only) -> 403 + security headers
    const viewerAuditRes = await proxy(
      new NextRequest("http://localhost/api/uci/audit", {
        headers: { cookie: `${SESSION_COOKIE}=${viewerToken}` },
      }),
    );
    expect(viewerAuditRes.status).toBe(403);
    assertSecurityHeaders(viewerAuditRes.headers);

    // 5. ADMIN role accessing /api/staff -> allowed (200 pass-through) + security headers
    const adminToken = await signToken(
      {
        sid: "sess-admin-1",
        uid: "staff-admin-1",
        role: "ADMIN",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    await db.staffAccount.create({ data: { id: "staff-admin-1", email: "admin@example.invalid", name: "Admin", passwordHash: "unused", role: "ADMIN" } });
    await db.staffSession.create({ data: { id: "sess-admin-1", accountId: "staff-admin-1", tokenHash: staffTokenHash(adminToken), expiresAt: new Date(Date.now() + 3600_000) } });
    const adminStaffRes = await proxy(
      new NextRequest("http://localhost/api/staff", {
        headers: { cookie: `${SESSION_COOKIE}=${adminToken}` },
      }),
    );
    expect(adminStaffRes.status).toBe(200);
    assertSecurityHeaders(adminStaffRes.headers);
    await db.staffSession.delete({ where: { id: "sess-admin-1" } });
    const revoked = await proxy(new NextRequest("http://localhost/api/staff", {
      headers: { cookie: `${SESSION_COOKIE}=${adminToken}` },
    }));
    expect(revoked.status).toBe(401);
  });

  it("fails closed in production when JWT_SECRET / AUTH_SECRET / SESSION_SECRET are missing or too short", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.SESSION_SECRET;

    expect(() => resolveAuthSecret()).toThrow(/at least 32 bytes/i);
    expect(resolveStaffSecret()).toBeNull();
    expect(() => encryptToken("sensitive-oauth-token")).toThrow(/at least 32 bytes/i);

    process.env.AUTH_SECRET = "a".repeat(32);
    const cipher = encryptToken("sensitive-oauth-token");
    expect(decryptToken(cipher)).toBe("sensitive-oauth-token");
  });
});
