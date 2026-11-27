import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
import { resolveConflict } from "@/lib/higher-study/intelligence/conflicts";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Conflicts: GET lists open conflicts (every candidate preserved); POST records the human resolution. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "open";
  const take = Math.min(Number(sp.get("take") ?? 50) || 50, 200);
  const [total, conflicts] = await Promise.all([
    db.higherStudyConflict.count({ where: { status } }),
    db.higherStudyConflict.findMany({ where: { status }, orderBy: { detectedAt: "desc" }, take }),
  ]);
  return ok({ total, conflicts, note: "Every candidate value from every source is preserved in `candidates`. The system never selects a value automatically — a human must resolve each conflict." });
}
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ id?: string; chosenSourceUrl?: string; reason?: string }>(req);
  if (!b?.id || !b.chosenSourceUrl || !b.reason?.trim()) return fail("id, chosenSourceUrl and reason are required", ["invalid_resolution"], 400);
  const result = await resolveConflict(b.id, b.chosenSourceUrl, g.session.userId, b.reason.trim());
  if (!result.ok) return fail(result.error ?? "resolution failed", ["resolution_failed"], 422);
  await writeAudit(g.session, "higher_study_conflict_resolved", "HigherStudyConflict", b.id, { chosenSourceUrl: b.chosenSourceUrl });
  return ok({ resolved: true, chosenStatus: result.chosenStatus });
}
