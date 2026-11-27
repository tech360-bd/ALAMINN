import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Unified human-review queue: GET lists tasks; PATCH assigns / moves a task through its status. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const type = sp.get("type");
  const take = Math.min(Number(sp.get("take") ?? 50) || 50, 200);
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  else where.status = { in: ["pending", "in-review"] };
  if (type) where.type = type;
  const [total, tasks] = await Promise.all([
    db.higherStudyReviewTask.count({ where }),
    db.higherStudyReviewTask.findMany({ where, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take }),
  ]);
  return ok({ total, tasks, types: ["verify-evidence", "resolve-conflict", "review-duplicate", "check-missing-official-url", "review-outdated", "approve-publication", "verify-discovery"] });
}
export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.universities.verify");
  if (g.denied) return g.response;
  const b = await readJson<{ id?: string; status?: string; assignedTo?: string; resolution?: string }>(req);
  const validStatus = ["pending", "in-review", "resolved", "escalated", "dismissed"];
  if (!b?.id) return fail("id is required", ["missing_id"], 400);
  if (b.status && !validStatus.includes(b.status)) return fail(`status must be one of ${validStatus.join(", ")}`, ["invalid_status"], 400);
  const task = await db.higherStudyReviewTask.findUnique({ where: { id: b.id } });
  if (!task) return fail("task not found", ["not_found"], 404);
  const resolved = b.status === "resolved" || b.status === "dismissed";
  const updated = await db.higherStudyReviewTask.update({
    where: { id: b.id },
    data: {
      ...(b.status ? { status: b.status } : {}),
      ...(b.assignedTo !== undefined ? { assignedTo: b.assignedTo } : {}),
      ...(b.resolution !== undefined ? { resolution: b.resolution } : {}),
      ...(resolved ? { decidedById: g.session.userId, decidedAt: new Date() } : {}),
    },
  });
  await writeAudit(g.session, "higher_study_review_task_updated", "HigherStudyReviewTask", b.id, { status: b.status ?? task.status });
  return ok(updated);
}
