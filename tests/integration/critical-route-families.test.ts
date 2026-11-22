import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { isolatedDbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const file = execFileSync(process.execPath, ["tests/fixtures/init-sqlite.mjs"], {
    encoding: "utf8",
  }).trim();
  process.env.DATABASE_URL = `file:${file}`;
  return { isolatedDbPath: file };
});

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createToken, AUTH_COOKIE } from "@/lib/auth/jwt";
import { hashPassword as hashStaffPassword } from "@/lib/auth/password";
import { signToken, SESSION_COOKIE } from "@/lib/auth/token";
import { staffTokenHash } from "@/lib/auth/staff-token-session";
import { resolveStaffSecret } from "@/lib/auth/secret";
import { POST as ccLoginPost } from "@/app/api/v1/auth/login/route";
import { GET as ccSessionGet } from "@/app/api/v1/auth/session/route";
import { POST as ccForgotPasswordPost } from "@/app/api/v1/auth/forgot-password/route";
import { GET as adminDashboardGet } from "@/app/api/v1/admin/dashboard/route";
import {
  GET as hsAdminUniversitiesGet,
  POST as hsAdminUniversitiesPost,
} from "@/app/api/v1/higher-study/admin/universities/route";
import {
  GET as elAdminCoursesGet,
  POST as elAdminCoursesPost,
} from "@/app/api/v1/english-learning/admin/courses/route";
import { GET as whatsappAdminStatsGet } from "@/app/api/v1/whatsapp/admin/stats/route";
import { GET as uciAuditGet } from "@/app/api/uci/audit/route";
import { GET as healthGet } from "@/app/api/health/route";
import {
  GET as healthReadyGet,
  POST as healthReadyPost,
} from "@/app/api/health/ready/route";

const mockCookies = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mockCookies.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      mockCookies.set(name, value);
    },
  }),
}));

describe("Task 12 — Critical Route Families Integration Coverage Matrix", () => {
  const createdUserIds: string[] = [];
  const createdStaffAccountIds: string[] = [];
  const createdStaffSessionIds: string[] = [];

  beforeEach(() => {
    mockCookies.clear();
  });

  afterAll(async () => {
    if (createdStaffSessionIds.length > 0) {
      await db.staffSession.deleteMany({
        where: { id: { in: createdStaffSessionIds } },
      });
    }
    if (createdStaffAccountIds.length > 0) {
      await db.staffAccount.deleteMany({
        where: { id: { in: createdStaffAccountIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await db.$disconnect();
    rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
  });

  it("authenticates Command Center Users via /api/v1/auth/login, validates /api/v1/auth/session, and never logs reset tokens in /api/v1/auth/forgot-password", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const email = `cc-test-${suffix}@alaminn.info`;
    const password = "CommandCenterPassword#2026!";

    const user = await db.user.create({
      data: {
        email,
        name: "CC Test Owner",
        passwordHash: await hashPassword(password),
        role: "OWNER",
        status: "active",
      },
    });
    createdUserIds.push(user.id);

    // 1. Wrong password -> 401
    const badLoginRes = await ccLoginPost(
      new NextRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.11",
        },
        body: JSON.stringify({ email, password: "WrongPassword123!" }),
      }),
    );
    expect(badLoginRes.status).toBe(401);

    // 2. Valid login -> 200 + sets auth_token cookie
    const okLoginRes = await ccLoginPost(
      new NextRequest("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.12",
        },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(okLoginRes.status).toBe(200);
    const issuedJwt = mockCookies.get(AUTH_COOKIE);
    expect(issuedJwt).toBeTruthy();

    // 3. Session endpoint returns authenticated user
    const sessionRes = await ccSessionGet(
      new NextRequest("http://localhost/api/v1/auth/session", {
        headers: { cookie: `${AUTH_COOKIE}=${issuedJwt}` },
      }),
    );
    expect(sessionRes.status).toBe(200);
    const sessionJson = await sessionRes.json();
    expect(sessionJson.success).toBe(true);
    expect(sessionJson.data.user.email).toBe(email);

    // 4. Forgot password never logs raw reset token to console.log
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const forgotRes = await ccForgotPasswordPost(
        new NextRequest("http://localhost/api/v1/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.13",
          },
          body: JSON.stringify({ email }),
        }),
      );
      expect(forgotRes.status).toBe(200);
      const updatedUser = await db.user.findUnique({ where: { id: user.id } });
      expect(updatedUser?.passwordResetToken).toBeTruthy();

      const loggedText = logSpy.mock.calls.flat().join(" ");
      expect(loggedText).not.toContain(updatedUser!.passwordResetToken!);
      expect(loggedText).not.toContain("PASSWORD RESET TOKEN");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("enforces fine-grained RBAC across Command Center, Higher Study Admin, English Learning Admin, and WhatsApp Admin APIs", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const viewerUser = await db.user.create({
      data: {
        email: `viewer-${suffix}@alaminn.info`,
        name: "Viewer User",
        passwordHash: "unused",
        role: "VIEWER",
        status: "active",
      },
    });
    const ownerUser = await db.user.create({
      data: {
        email: `owner-${suffix}@alaminn.info`,
        name: "Owner User",
        passwordHash: "unused",
        role: "OWNER",
        status: "active",
      },
    });
    createdUserIds.push(viewerUser.id, ownerUser.id);

    const viewerJwt = await createToken(viewerUser.id, "VIEWER", {
      email: viewerUser.email,
      name: viewerUser.name,
    });
    const ownerJwt = await createToken(ownerUser.id, "OWNER", {
      email: ownerUser.email,
      name: ownerUser.name,
    });

    // Unauthenticated -> 401 on all admin routes
    expect(
      (
        await adminDashboardGet(
          new NextRequest("http://localhost/api/v1/admin/dashboard"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await hsAdminUniversitiesGet(
          new NextRequest(
            "http://localhost/api/v1/higher-study/admin/universities",
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await elAdminCoursesGet(
          new NextRequest(
            "http://localhost/api/v1/english-learning/admin/courses",
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await whatsappAdminStatsGet(
          new NextRequest("http://localhost/api/v1/whatsapp/admin/stats"),
        )
      ).status,
    ).toBe(401);

    // VIEWER cannot create Higher Study universities or English Learning courses -> 403
    const viewerCreateUniRes = await hsAdminUniversitiesPost(
      new NextRequest(
        "http://localhost/api/v1/higher-study/admin/universities",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${AUTH_COOKIE}=${viewerJwt}`,
          },
          body: JSON.stringify({ name: "Unauthorized University" }),
        },
      ),
    );
    expect(viewerCreateUniRes.status).toBe(403);

    const viewerCreateCourseRes = await elAdminCoursesPost(
      new NextRequest(
        "http://localhost/api/v1/english-learning/admin/courses",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${AUTH_COOKIE}=${viewerJwt}`,
          },
          body: JSON.stringify({ title: "Unauthorized Course" }),
        },
      ),
    );
    expect(viewerCreateCourseRes.status).toBe(403);

    // OWNER can read admin dashboard, Higher Study admin list, English Learning admin list, and WhatsApp stats -> 200
    expect(
      (
        await adminDashboardGet(
          new NextRequest("http://localhost/api/v1/admin/dashboard", {
            headers: { cookie: `${AUTH_COOKIE}=${ownerJwt}` },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await hsAdminUniversitiesGet(
          new NextRequest(
            "http://localhost/api/v1/higher-study/admin/universities",
            {
              headers: { cookie: `${AUTH_COOKIE}=${ownerJwt}` },
            },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await elAdminCoursesGet(
          new NextRequest(
            "http://localhost/api/v1/english-learning/admin/courses",
            {
              headers: { cookie: `${AUTH_COOKIE}=${ownerJwt}` },
            },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await whatsappAdminStatsGet(
          new NextRequest("http://localhost/api/v1/whatsapp/admin/stats", {
            headers: { cookie: `${AUTH_COOKIE}=${ownerJwt}` },
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("enforces StaffSession RBAC on /api/uci/audit and resolves scripts/audit/alo_dataset.json via portable path", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const secret = resolveStaffSecret()!;

    // 1. Unauthenticated -> 401
    mockCookies.clear();
    expect((await uciAuditGet()).status).toBe(401);

    // 2. AGENT role (does not have audit.view) -> 403
    const agentAccount = await db.staffAccount.create({
      data: {
        email: `agent-${suffix}@example.invalid`,
        name: "Staff Agent",
        passwordHash: await hashStaffPassword("StaffAgentPass#2026!"),
        role: "AGENT",
        isActive: true,
      },
    });
    createdStaffAccountIds.push(agentAccount.id);

    const agentSessionId = randomUUID();
    const agentToken = await signToken(
      {
        sid: agentSessionId,
        uid: agentAccount.id,
        role: "AGENT",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    await db.staffSession.create({
      data: {
        id: agentSessionId,
        accountId: agentAccount.id,
        tokenHash: staffTokenHash(agentToken),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    createdStaffSessionIds.push(agentSessionId);

    mockCookies.set(SESSION_COOKIE, agentToken);
    expect((await uciAuditGet()).status).toBe(403);

    // 3. ADMIN role -> 200 and loads phase1 dataset summary from scripts/audit/alo_dataset.json
    const adminAccount = await db.staffAccount.create({
      data: {
        email: `admin-${suffix}@example.invalid`,
        name: "Staff Admin",
        passwordHash: "unused",
        role: "ADMIN",
        isActive: true,
      },
    });
    createdStaffAccountIds.push(adminAccount.id);

    const adminSessionId = randomUUID();
    const adminToken = await signToken(
      {
        sid: adminSessionId,
        uid: adminAccount.id,
        role: "ADMIN",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    await db.staffSession.create({
      data: {
        id: adminSessionId,
        accountId: adminAccount.id,
        tokenHash: staffTokenHash(adminToken),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    createdStaffSessionIds.push(adminSessionId);

    mockCookies.set(SESSION_COOKIE, adminToken);
    const auditRes = await uciAuditGet();
    expect(auditRes.status).toBe(200);
    const auditJson = await auditRes.json();
    expect(Array.isArray(auditJson.logs)).toBe(true);
    expect(auditJson.phase1).not.toBeNull();
    expect(auditJson.phase1.summary).toBeDefined();
  });

  it("verifies /api/health and /api/health/ready liveness, readiness, and authenticated write probe", async () => {
    const livenessRes = await healthGet();
    expect(livenessRes.status).toBe(200);

    const readyRes = await healthReadyGet(
      new NextRequest("http://localhost/api/health/ready"),
    );
    expect(readyRes.status).toBe(200);

    const origCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "health-ready-write-probe-secret-32b";
    try {
      const unauthWriteRes = await healthReadyPost(
        new NextRequest("http://localhost/api/health/ready", {
          method: "POST",
        }),
      );
      expect(unauthWriteRes.status).toBe(401);

      const authWriteRes = await healthReadyPost(
        new NextRequest("http://localhost/api/health/ready", {
          method: "POST",
          headers: {
            authorization: "Bearer health-ready-write-probe-secret-32b",
          },
        }),
      );
      expect(authWriteRes.status).toBe(200);
    } finally {
      if (origCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = origCron;
    }
  });
});
