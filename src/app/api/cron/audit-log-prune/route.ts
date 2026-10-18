import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/audit-log-prune
 *
 * Prunes audit-log rows older than the retention window. Enforces the
 * operational retention policy without growing the audit tables unbounded.
 *
 * Tables pruned: AuditLog, HigherStudyAuditLog, EnglishLearningAuditLog,
 * AnalyticsEvent (raw behavioural events), SystemHealth (health snapshots).
 *
 * Retention window: `AUDIT_LOG_RETENTION_DAYS` env var, default 365 days.
 * NEVER prunes users, contacts, inquiries, referrals, or any business record —
 * only log/event tables.
 *
 * Recommended cPanel cron schedule: `30 4 * * 0` (weekly, Sunday 04:30).
 *
 * Auth: requires `x-cron-secret` header (or `?secret=` query) matching
 * `CRON_SECRET`. Returns 401 on auth failure, 503 if unconfigured.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", data: null, meta: {}, errors: [auth.error] },
      { status: auth.status }
    );
  }

  const retentionDays = Math.max(
    30, // hard floor — never prune more aggressively than 30 days
    Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 365
  );
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    // deleteMany per table — bounded work per run, safe to retry.
    const [core, higherStudy, englishLearning, analytics, systemHealth] =
      await Promise.all([
        db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        db.higherStudyAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        db.englishLearningAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        db.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        db.systemHealth.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
      ]);

    const result = {
      retentionDays,
      cutoff: cutoff.toISOString(),
      pruned: {
        auditLogs: core.count,
        higherStudyAuditLogs: higherStudy.count,
        englishLearningAuditLogs: englishLearning.count,
        analyticsEvents: analytics.count,
        systemHealth: systemHealth.count,
      },
    };

    return NextResponse.json({
      success: true,
      message: "Audit-log retention pruning complete.",
      data: result,
      meta: {},
      errors: [],
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: "Audit-log pruning failed.",
        data: null,
        meta: {},
        errors: [(e as Error).message.slice(0, 200)],
      },
      { status: 500 }
    );
  }
}
