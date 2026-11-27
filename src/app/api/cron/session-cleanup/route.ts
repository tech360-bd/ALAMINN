import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/session-cleanup
 *
 * Cleans up server-side authentication and password-recovery artifacts:
 *   1. Expired `StaffSession` rows (`expiresAt <= now`).
 *   2. `StaffSession` rows belonging to deactivated `StaffAccount` records
 *      (`account.isActive = false`).
 *   3. Expired, attempt-exhausted (`attempts >= 5`), or consumed
 *      `PasswordResetCode` rows older than the retention window
 *      (`RESET_CODE_RETENTION_HOURS`, default 24h; 0 = immediate cleanup of used codes).
 *   4. Expired `User.passwordResetToken` / `passwordResetExpiresAt` fields
 *      on Command Center `User` records (`passwordResetExpiresAt <= now`).
 *
 * Active, non-expired sessions and active password-reset challenges remain untouched.
 *
 * Auth: requires `x-cron-secret` header (or `?secret=` query) matching
 * `CRON_SECRET`. Returns 401 on auth failure, 503 if unconfigured.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized",
        data: null,
        meta: {},
        errors: [auth.error],
      },
      { status: auth.status }
    );
  }

  try {
    const now = new Date();
    const retentionHoursRaw = Number(process.env.RESET_CODE_RETENTION_HOURS ?? "24");
    const retentionHours =
      Number.isFinite(retentionHoursRaw) && retentionHoursRaw >= 0
        ? retentionHoursRaw
        : 24;
    const usedCodeCutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);

    const [
      expiredSessionsResult,
      inactiveSessionsResult,
      resetCodesResult,
      expiredUserResetResult,
      expiredAdminSessionsResult,
    ] = await db.$transaction([
      db.staffSession.deleteMany({
        where: {
          expiresAt: { lte: now },
        },
      }),
      db.staffSession.deleteMany({
        where: {
          account: { isActive: false },
        },
      }),
      db.passwordResetCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: now } },
            { attempts: { gte: 5 } },
            { usedAt: { not: null, lte: usedCodeCutoff } },
          ],
        },
      }),
      db.user.updateMany({
        where: {
          passwordResetExpiresAt: { lte: now },
        },
        data: {
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      }),
      db.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { user: { status: { not: "active" } } }] } }),
    ]);

    const expiredStaffSessions = expiredSessionsResult.count;
    const inactiveAccountSessions = inactiveSessionsResult.count;
    const expiredOrUsedResetCodes = resetCodesResult.count;
    const expiredUserResetTokens = expiredUserResetResult.count;
    const expiredAdminSessions = expiredAdminSessionsResult.count;
    const cleaned =
      expiredStaffSessions +
      inactiveAccountSessions +
      expiredOrUsedResetCodes +
      expiredUserResetTokens + expiredAdminSessions;

    return NextResponse.json({
      success: true,
      message: "Session and password-reset cleanup completed.",
      data: {
        cleaned,
        expiredStaffSessions,
        inactiveAccountSessions,
        expiredOrUsedResetCodes,
        expiredUserResetTokens,
        expiredAdminSessions,
      },
      meta: {
        scannedAt: now.toISOString(),
        resetCodeRetentionHours: retentionHours,
      },
      errors: [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Cron job failed",
        data: null,
        meta: {},
        errors: [error instanceof Error ? error.message : "cleanup_failed"],
      },
      { status: 500 }
    );
  }
}
