import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Monitoring dashboard + source registry. Super Admin scope via higher-study.* permissions. */
export async function GET(req: NextRequest) { const g = await requirePermission(req, "higher-study.dashboard.view"); if (g.denied) return g.response;
  const [lastRun, pending, critical, conflicts, failedSources, sources, unis, courses, schols, faculties, intakes] = await Promise.all([
    db.higherStudyMonitoringRun.findFirst({ orderBy: { startedAt: "desc" } }),
    db.higherStudyDataChange.count({ where: { status: "pending" } }), db.higherStudyDataChange.count({ where: { status: "pending", impact: "CRITICAL" } }),
    db.higherStudyDataChange.count({ where: { changeType: "POSSIBLE_DATA_CONFLICT", status: "pending" } }),
    db.higherStudySourceRecord.count({ where: { lastStatus: "unavailable" } }), db.higherStudySourceRecord.count(),
    db.higherStudyUniversity.count(), db.higherStudyCourse.count(), db.higherStudyScholarship.count(), db.higherStudyFaculty.count(), db.higherStudyCourseIntake.count(),
  ]);
  const recentChanges = await db.higherStudyDataChange.findMany({ orderBy: { detectedAt: "desc" }, take: 30 });
  const status = critical > 0 || conflicts > 0 ? "NEEDS REVIEW" : pending > 0 ? "NEEDS REVIEW" : failedSources > 0 ? "ERROR" : "HEALTHY";
  return ok({ widget: { lastCheck: lastRun?.completedAt || lastRun?.startedAt || null, nextCheck: lastRun?.nextRunAt || null, universities: unis, courses, sources, pendingApproval: pending, critical, failedSources, status }, report: { universitiesChecked: lastRun?.sourcesChecked ?? 0, changesDetected: lastRun?.changesDetected ?? 0, scholarships: schols, faculties, intakes, conflicts, failedSources }, recentChanges }); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "higher-study.import"); if (g.denied) return g.response;
  const b = await readJson<{ url?: string; sourceType?: string; entityType?: string; entityId?: string; owner?: string; title?: string }>(req);
  if (b?.url) { if (!/^https:\/\//.test(b.url)) return fail("Official source URL must be https", ["url_invalid"], 400);
    const s = await db.higherStudySourceRecord.upsert({ where: { url: b.url }, create: { url: b.url, sourceType: b.sourceType || "university-course", entityType: b.entityType || null, entityId: b.entityId || null, owner: b.owner || null, title: b.title || null }, update: { active: true } });
    await writeAudit(g.session, "higher_study_source_registered", "HigherStudySource", s.id, { url: s.url }); return ok(s, "", {}, 201); }
  return fail("url required", ["url_required"], 400); }
