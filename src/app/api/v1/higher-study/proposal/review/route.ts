/**
 * GET /api/v1/higher-study/proposal/review
 * ==========================================
 * Admin listing of AI-generated SOP + research-proposal drafts that
 * are awaiting human academic review.
 *
 * - Requires permission `ai_approvals.decide` (signed session cookie).
 * - Returns AiTask rows where workflow IN ("sop-draft",
 *   "research-proposal-draft") AND status="awaiting-approval".
 * - Light payload: id, workflow, objective, sensitivity, createdAt,
 *   requesterName.
 *
 * Companion to /api/v1/ai/approvals — this route is scoped to the two
 * higher-study drafting workflows so the proposal/SOP review queue is
 * surfaced separately from the broader AI approvals inbox.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const REVIEW_WORKFLOWS = ["sop-draft", "research-proposal-draft"] as const;

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "ai_approvals.decide");
  if (guard.denied) return guard.response;

  try {
    const tasks = await db.aiTask.findMany({
      where: {
        workflow: { in: [...REVIEW_WORKFLOWS] },
        status: "awaiting-approval",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { requester: { select: { name: true, email: true } } },
    });

    const data = tasks.map((t) => ({
      id: t.id,
      workflow: t.workflow,
      objective: t.objective,
      sensitivity: t.sensitivity,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      requesterName: t.requester?.name || null,
      requesterEmail: t.requester?.email || null,
    }));

    return ok(
      { tasks: data },
      "SOP/proposal drafts awaiting review.",
      { count: data.length },
    );
  } catch (e) {
    console.error("[higher-study/proposal/review] error", e);
    return fail("Internal error.", ["server_error"], 500);
  }
}
