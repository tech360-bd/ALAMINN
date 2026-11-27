import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { decideDuplicate, detectDuplicateCourses, detectDuplicateUniversities } from "@/lib/higher-study/intelligence/duplicates";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Duplicates: GET lists flags; POST runs detection; PATCH records the human decision (merge actions are never automatic). */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "open";
  const take = Math.min(Number(sp.get("take") ?? 50) || 50, 200);
  const [total, duplicates] = await Promise.all([
    db.higherStudyDuplicateFlag.count({ where: { status } }),
    db.higherStudyDuplicateFlag.findMany({ where: { status }, orderBy: { detectedAt: "desc" }, take }),
  ]);
  return ok({ total, duplicates, note: "Both records of every flagged pair are preserved. Merging is a human decision performed from the record edit screens; this flag only tracks the review." });
}
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const [unis, courses] = await Promise.all([detectDuplicateUniversities(), detectDuplicateCourses()]);
  await writeAudit(g.session, "higher_study_duplicate_scan", "HigherStudyDuplicateFlag", undefined, unis);
  return ok({ universities: unis, courses });
}
export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ id?: string; decision?: "merged" | "dismissed" | "false-positive" }>(req);
  if (!b?.id || !b.decision || !["merged", "dismissed", "false-positive"].includes(b.decision)) return fail("id and a valid decision (merged|dismissed|false-positive) are required", ["invalid_decision"], 400);
  const result = await decideDuplicate(b.id, b.decision, g.session.userId);
  if (!result.ok) return fail(result.error ?? "decision failed", ["decision_failed"], 422);
  await writeAudit(g.session, "higher_study_duplicate_decided", "HigherStudyDuplicateFlag", b.id, { decision: b.decision });
  return ok({ decided: true });
}
