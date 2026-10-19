import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { APPROVABLE_FIELDS } from "@/lib/higher-study/monitoring/engine";
import { runMonitoringCycle } from "@/lib/higher-study/monitoring/runner";
/**
 * Approve = apply ONLY the allow-listed field to the catalogue row, preserve
 * old value in the change record + HigherStudyAuditLog. Reject/recheck never mutate.
 * Recheck re-runs a bounded monitoring cycle for fresh evidence.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "higher-study.universities.verify"); if (g.denied) return g.response; const { id } = await ctx.params;
  const b = await readJson<{ action?: string }>(req); const action = b?.action || "approve";
  const ch = await db.higherStudyDataChange.findUnique({ where: { id } }); if (!ch) return fail("Not found", ["not_found"], 404);
  if (action === "recheck") { await db.higherStudyDataChange.update({ where: { id }, data: { status: "recheck-requested" } }); const r = await runMonitoringCycle(10); await writeAudit(g.session, "higher_study_recheck", "HigherStudyDataChange", id, { runId: r.runId }); return ok({ action, run: r, note: "Source re-fetched; compare the new pending change before approving. Unresolved uncertainty stays NEEDS_MANUAL_REVIEW." }); }
  if (ch.status !== "pending" && ch.status !== "needs-review" && ch.status !== "recheck-requested") return fail("Change already decided", ["already_decided"], 409);
  if (action === "reject") { const u = await db.higherStudyDataChange.update({ where: { id }, data: { status: "rejected", decidedById: g.session.userId, decidedAt: new Date() } }); await writeAudit(g.session, "higher_study_change_rejected", "HigherStudyDataChange", id, {}); return ok(u); }
  if (action === "mark-verified") { const u = await db.higherStudyDataChange.update({ where: { id }, data: { status: "approved", decidedById: g.session.userId, decidedAt: new Date() } }); return ok(u); }
  // approve + apply
  const allowed = APPROVABLE_FIELDS[ch.entityType] || [];
  if (!ch.entityId || !ch.field || !allowed.includes(ch.field)) { const u = await db.higherStudyDataChange.update({ where: { id }, data: { status: "needs-review", aiSummary: (ch.aiSummary || "") + " | Not auto-appliable: field not in allow-list — manual edit required in catalogue admin." } }); return ok({ ...u, applied: false, reason: "field_not_allowlisted" }); }
  const data: Record<string, unknown> = { [ch.field]: ch.field === "tuitionFee" ? Number(String(ch.newValue || "").replace(/[^0-9.]/g, "")) || null : ch.newValue, lastVerifiedAt: new Date(), lastVerifiedBy: g.session.userId, verificationStatus: "verified" };
  try {
    if (ch.entityType === "course") await db.higherStudyCourse.update({ where: { id: ch.entityId }, data: data as never });
    else if (ch.entityType === "university") await db.higherStudyUniversity.update({ where: { id: ch.entityId }, data: data as never });
    else if (ch.entityType === "scholarship") await db.higherStudyScholarship.update({ where: { id: ch.entityId }, data: data as never });
    else return fail("Entity type not appliable", ["entity"], 400);
  } catch { return fail("Apply failed — record may have been deleted. Nothing was changed.", ["apply_failed"], 409); }
  const u = await db.higherStudyDataChange.update({ where: { id }, data: { status: "approved", decidedById: g.session.userId, decidedAt: new Date() } });
  await writeAudit(g.session, ch.entityType === "course" ? "COURSE_DATA_APPROVED" : "UNIVERSITY_DATA_APPROVED", "HigherStudyDataChange", id, { field: ch.field, oldValue: (ch.oldValue || "").slice(0, 200), newValue: (ch.newValue || "").slice(0, 200), source: ch.sourceUrl });
  return ok({ ...u, applied: true }); }
