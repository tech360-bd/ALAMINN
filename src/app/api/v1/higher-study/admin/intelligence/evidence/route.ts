import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { canTransition, isIntelligenceStatus } from "@/lib/higher-study/intelligence/statuses";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Evidence browser: GET with filters (entity, status, source org, level); PATCH performs a legal status transition. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  const entityType = sp.get("entityType"); if (entityType) where.entityType = entityType;
  const entityId = sp.get("entityId"); if (entityId) where.entityId = entityId;
  const status = sp.get("status"); if (status) where.status = status;
  const sourceOrgKey = sp.get("sourceOrgKey"); if (sourceOrgKey) where.sourceOrgKey = sourceOrgKey;
  const sourceLevel = sp.get("sourceLevel"); if (sourceLevel) where.sourceLevel = sourceLevel;
  const take = Math.min(Number(sp.get("take") ?? 50) || 50, 200);
  const [total, evidence] = await Promise.all([
    db.higherStudyEvidence.count({ where }),
    db.higherStudyEvidence.findMany({ where, orderBy: { updatedAt: "desc" }, take }),
  ]);
  return ok({ total, evidence, statuses: ["DISCOVERED", "SOURCE_CHECK_REQUIRED", "OFFICIAL_SOURCE_VERIFIED", "CONFLICTING_INFORMATION", "OUTDATED", "UNAVAILABLE", "HUMAN_REVIEW_REQUIRED", "APPROVED_FOR_PUBLICATION"] });
}
export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ id?: string; status?: string; notes?: string }>(req);
  if (!b?.id || !b.status || !isIntelligenceStatus(b.status)) return fail("id and a valid intelligence status are required", ["invalid_transition"], 400);
  const evidence = await db.higherStudyEvidence.findUnique({ where: { id: b.id } });
  if (!evidence) return fail("evidence not found", ["not_found"], 404);
  if (!canTransition(evidence.status, b.status)) return fail(`illegal transition ${evidence.status} → ${b.status}; see the status state machine in the audit document`, ["illegal_transition", evidence.status, b.status], 422);
  // Marking verified requires a Level 1 official source — never granted for Level 2 discoveries.
  if (b.status === "OFFICIAL_SOURCE_VERIFIED" && evidence.sourceLevel !== "L1_OFFICIAL") {
    return fail("only Level 1 official sources can verify a fact; Level 2 discoveries stay SOURCE_CHECK_REQUIRED until an official source confirms them", ["not_l1_source"], 422);
  }
  const updated = await db.higherStudyEvidence.update({
    where: { id: b.id },
    data: {
      status: b.status,
      ...(b.notes !== undefined ? { notes: b.notes } : {}),
      ...(b.status === "OFFICIAL_SOURCE_VERIFIED" ? { lastVerifiedAt: new Date(), verifiedById: g.session.userId } : {}),
    },
  });
  await writeAudit(g.session, "higher_study_evidence_transition", "HigherStudyEvidence", b.id, { from: evidence.status, to: b.status });
  return ok(updated);
}
