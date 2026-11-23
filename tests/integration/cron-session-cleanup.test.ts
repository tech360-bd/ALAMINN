import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET as sessionCleanupGet } from "@/app/api/cron/session-cleanup/route";

describe("Task 06 — Cron Session & Password-Reset Cleanup", () => {
  const origCronSecret = process.env.CRON_SECRET;
  const TEST_CRON_SECRET = "cron-cleanup-test-secret-32bytes-long";

  const staffAccountIds: string[] = [];
  const staffSessionIds: string[] = [];
  const resetCodeIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
  });

  afterEach(() => {
    if (origCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origCronSecret;
  });

  afterAll(async () => {
    if (staffSessionIds.length > 0) {
      await db.staffSession.deleteMany({
        where: { id: { in: staffSessionIds } },
      });
    }
    if (resetCodeIds.length > 0) {
      await db.passwordResetCode.deleteMany({
        where: { id: { in: resetCodeIds } },
      });
    }
    if (staffAccountIds.length > 0) {
      await db.staffAccount.deleteMany({
        where: { id: { in: staffAccountIds } },
      });
    }
    if (userIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
    await db.$disconnect();
    rmSync(dirname(isolatedDbPath), { recursive: true, force: true });
  });

  it("rejects unauthorized requests with 401 and fails closed with 503 when CRON_SECRET is unset", async () => {
    const unauthRes = await sessionCleanupGet(
      new NextRequest("http://localhost/api/cron/session-cleanup"),
    );
    expect(unauthRes.status).toBe(401);

    delete process.env.CRON_SECRET;
    const unconfiguredRes = await sessionCleanupGet(
      new NextRequest("http://localhost/api/cron/session-cleanup", {
        headers: { "x-cron-secret": TEST_CRON_SECRET },
      }),
    );
    expect(unconfiguredRes.status).toBe(503);
  });

  it("deletes expired/inactive StaffSessions, expired/exhausted/old-used PasswordResetCodes, and expired User reset tokens while preserving active records", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const activeAccount = await db.staffAccount.create({
      data: {
        email: `active-staff-${suffix}@example.invalid`,
        name: "Active Staff",
        passwordHash: "unused",
        role: "ADMIN",
        isActive: true,
      },
    });
    const inactiveAccount = await db.staffAccount.create({
      data: {
        email: `inactive-staff-${suffix}@example.invalid`,
        name: "Inactive Staff",
        passwordHash: "unused",
        role: "AGENT",
        isActive: false,
      },
    });
    staffAccountIds.push(activeAccount.id, inactiveAccount.id);

    // 1. Expired session on active account -> SHOULD BE DELETED
    const expiredSession = await db.staffSession.create({
      data: {
        accountId: activeAccount.id,
        tokenHash: `hash-expired-${suffix}`,
        expiresAt: new Date(now - 60_000),
      },
    });
    // 2. Non-expired session on inactive account -> SHOULD BE DELETED
    const inactiveAccSession = await db.staffSession.create({
      data: {
        accountId: inactiveAccount.id,
        tokenHash: `hash-inactive-${suffix}`,
        expiresAt: new Date(now + 3600_000),
      },
    });
    // 3. Active non-expired session on active account -> MUST SURVIVE
    const validSession = await db.staffSession.create({
      data: {
        accountId: activeAccount.id,
        tokenHash: `hash-valid-${suffix}`,
        expiresAt: new Date(now + 3600_000),
      },
    });
    staffSessionIds.push(
      expiredSession.id,
      inactiveAccSession.id,
      validSession.id,
    );

    // PasswordResetCode fixtures
    const expiredCode = await db.passwordResetCode.create({
      data: {
        accountId: activeAccount.id,
        codeHash: `code-expired-${suffix}`,
        expiresAt: new Date(now - 60_000),
      },
    });
    const exhaustedCode = await db.passwordResetCode.create({
      data: {
        accountId: activeAccount.id,
        codeHash: `code-exhausted-${suffix}`,
        expiresAt: new Date(now + 900_000),
        attempts: 5,
      },
    });
    const oldUsedCode = await db.passwordResetCode.create({
      data: {
        accountId: activeAccount.id,
        codeHash: `code-old-used-${suffix}`,
        expiresAt: new Date(now + 900_000),
        usedAt: new Date(now - 48 * 3600_000), // 48h ago (> 24h retention)
      },
    });
    const activeCode = await db.passwordResetCode.create({
      data: {
        accountId: activeAccount.id,
        codeHash: `code-active-${suffix}`,
        expiresAt: new Date(now + 900_000),
        attempts: 1,
      },
    });
    resetCodeIds.push(
      expiredCode.id,
      exhaustedCode.id,
      oldUsedCode.id,
      activeCode.id,
    );

    // User password reset token fixtures
    const userExpiredReset = await db.user.create({
      data: {
        email: `user-expired-reset-${suffix}@example.invalid`,
        name: "Expired Reset User",
        passwordHash: "unused",
        role: "VIEWER",
        passwordResetToken: `tok-exp-${suffix}`,
        passwordResetExpiresAt: new Date(now - 60_000),
      },
    });
    const userActiveReset = await db.user.create({
      data: {
        email: `user-active-reset-${suffix}@example.invalid`,
        name: "Active Reset User",
        passwordHash: "unused",
        role: "VIEWER",
        passwordResetToken: `tok-act-${suffix}`,
        passwordResetExpiresAt: new Date(now + 3600_000),
      },
    });
    userIds.push(userExpiredReset.id, userActiveReset.id);

    // Execute cron cleanup
    const res = await sessionCleanupGet(
      new NextRequest("http://localhost/api/cron/session-cleanup", {
        headers: { "x-cron-secret": TEST_CRON_SECRET },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.expiredStaffSessions).toBeGreaterThanOrEqual(1);
    expect(json.data.inactiveAccountSessions).toBeGreaterThanOrEqual(1);
    expect(json.data.expiredOrUsedResetCodes).toBeGreaterThanOrEqual(3);
    expect(json.data.expiredUserResetTokens).toBeGreaterThanOrEqual(1);

    // Verify DB state
    expect(
      await db.staffSession.findUnique({ where: { id: expiredSession.id } }),
    ).toBeNull();
    expect(
      await db.staffSession.findUnique({
        where: { id: inactiveAccSession.id },
      }),
    ).toBeNull();
    expect(
      await db.staffSession.findUnique({ where: { id: validSession.id } }),
    ).not.toBeNull();

    expect(
      await db.passwordResetCode.findUnique({ where: { id: expiredCode.id } }),
    ).toBeNull();
    expect(
      await db.passwordResetCode.findUnique({
        where: { id: exhaustedCode.id },
      }),
    ).toBeNull();
    expect(
      await db.passwordResetCode.findUnique({ where: { id: oldUsedCode.id } }),
    ).toBeNull();
    expect(
      await db.passwordResetCode.findUnique({ where: { id: activeCode.id } }),
    ).not.toBeNull();

    const updatedExpiredUser = await db.user.findUnique({
      where: { id: userExpiredReset.id },
    });
    expect(updatedExpiredUser?.passwordResetToken).toBeNull();
    expect(updatedExpiredUser?.passwordResetExpiresAt).toBeNull();

    const updatedActiveUser = await db.user.findUnique({
      where: { id: userActiveReset.id },
    });
    expect(updatedActiveUser?.passwordResetToken).toBe(`tok-act-${suffix}`);
  });
});
