import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { ensureSourceRegistry } from "@/lib/higher-study/intelligence/pipeline";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Intelligence dashboard: source registry status, collection jobs, verification queues, conflicts, duplicates, staleness. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  await ensureSourceRegistry().catch(() => null);
  const [
    sources, jobsFailed, jobsSkipped, jobsRecent, evidenceByStatus,
    openConflicts, openDuplicates, pendingTasks, tasksByType, lastRun,
  ] = await Promise.all([
    db.higherStudySourceOrg.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }] }),
    db.higherStudyCollectionJob.count({ where: { status: "failed" } }),
    db.higherStudyCollectionJob.count({ where: { status: "skipped-permissions" } }),
    db.higherStudyCollectionJob.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    db.higherStudyEvidence.groupBy({ by: ["status"], _count: { _all: true } }),
    db.higherStudyConflict.count({ where: { status: "open" } }),
    db.higherStudyDuplicateFlag.count({ where: { status: "open" } }),
    db.higherStudyReviewTask.count({ where: { status: { in: ["pending", "in-review"] } } }),
    db.higherStudyReviewTask.groupBy({ by: ["type"], where: { status: { in: ["pending", "in-review"] } }, _count: { _all: true } }),
    db.higherStudyMonitoringRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const evidenceCounts = Object.fromEntries(evidenceByStatus.map((e) => [e.status, e._count._all]));
  const queueCounts = Object.fromEntries(tasksByType.map((t) => [t.type, t._count._all]));
  return ok({
    sources, jobs: { failed: jobsFailed, skippedPermissions: jobsSkipped, recent: jobsRecent },
    evidence: { byStatus: evidenceCounts, total: evidenceByStatus.reduce((n, e) => n + e._count._all, 0) },
    queues: {
      conflicts: openConflicts, duplicates: openDuplicates, reviewTasks: pendingTasks, byType: queueCounts,
    },
    lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.startedAt, completedAt: lastRun.completedAt, nextRunAt: lastRun.nextRunAt } : null,
    policy: {
      note: "Level 2 sources discover; Level 1 official sources verify. Conflicting, unverified or outdated facts are never auto-published — human review at every step. Sources whose robots.txt disallows our agent are skipped and recorded (skipped-permissions), never bypassed.",
    },
  });
}
