import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { INTEGRATION_BY_ID } from "@/lib/integrations/registry";
import { readConnectionPublic } from "@/lib/integrations/store";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";

/**
 * GET /api/v1/higher-study/admin/overview
 * --------------------------------------------------------------------
 * Higher Education admin overview — the landing surface at
 * /admin/higher-study (previously a 404). Real database counts only:
 *
 *  - ALO Education connection state (source-of-truth partner): the
 *    masked integration-store record (enabled / configured / last
 *    connection test + result). No secrets, no live fetch per render —
 *    the connection test runs on demand from /admin/integrations.
 *  - Referral pipeline counts by status (created | transferred |
 *    completed | failed | expired) — the ALAMINN.INFO → ALO Education
 *    application handoff, the only route students' applications follow.
 *  - Catalogue totals (universities / courses / scholarships /
 *    supervisors / research projects) for the public discovery layer.
 *  - Latest weekly monitoring run (checks official sources every 7 days).
 *
 * Super Admin scope via higher-study.dashboard.view.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;

  const aloDef = INTEGRATION_BY_ID["alo-education"];
  const [aloConnection, referralGroups, unis, courses, schols, supervisors, researchProjects, lastRun] = await Promise.all([
    aloDef ? readConnectionPublic(aloDef) : null,
    db.higherStudyReferral.groupBy({ by: ["status"], _count: { _all: true } }),
    db.higherStudyUniversity.count(),
    db.higherStudyCourse.count(),
    db.higherStudyScholarship.count(),
    db.higherStudySupervisor.count(),
    db.higherStudyResearchProject.count(),
    db.higherStudyMonitoringRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const referralsByStatus: Record<string, number> = {};
  let referralsTotal = 0;
  for (const row of referralGroups) {
    const n = row._count._all;
    referralsByStatus[row.status] = n;
    referralsTotal += n;
  }

  return ok({
    aloEducation: aloConnection
      ? {
          id: aloConnection.id,
          enabled: aloConnection.enabled,
          configured: aloConnection.configured,
          lastTestAt: aloConnection.lastTestAt,
          lastTestOk: aloConnection.lastTestOk,
          lastTestMessage: aloConnection.lastTestMessage,
          testEndpoint: "/api/v1/admin/integrations/alo-education/test",
        }
      : null,
    referrals: { total: referralsTotal, byStatus: referralsByStatus },
    catalogue: { universities: unis, courses, scholarships: schols, supervisors, researchProjects },
    monitoring: lastRun
      ? {
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          nextRunAt: lastRun.nextRunAt,
          sourcesChecked: lastRun.sourcesChecked,
          sourcesFailed: lastRun.sourcesFailed,
          changesDetected: lastRun.changesDetected,
        }
      : null,
  });
}
