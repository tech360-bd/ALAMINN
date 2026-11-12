/**
 * GET /api/v1/higher-study/proposal/review/[id]
 * POST /api/v1/higher-study/proposal/review/[id]
 * =================================================
 * Admin detail + decision endpoint for an individual SOP / research-
 * proposal draft task.
 *
 *  - GET:    full AiTask row (prompt, result, requester). Requires
 *            `ai_approvals.view`.
 *  - POST:   { decision: "approved" | "rejected" | "revision",
 *              note?: string }
 *            Creates an AiApproval + flips the task status, in a
 *            single `db.$transaction`. Requires `ai_approvals.decide`.
 *            Audit-logs the decision.
 *
 * Decision → status mapping matches /api/v1/ai/approvals:
 *   approved  → "approved"
 *   rejected  → "rejected"
 *   revision  → "revision-requested"
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const DECISION_STATUS: Record<string, string> = {
  approved: "approved",
  rejected: "rejected",
  revision: "revision-requested",
};
const VALID_DECISIONS = new Set(Object.keys(DECISION_STATUS));

const REVIEW_WORKFLOWS = ["sop-draft", "research-proposal-draft"] as const;

// ─── GET: full task details ───────────────────────────────────────
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_approvals.view");
  if (guard.denied) return guard.response;

  const { id } = await ctx.params;
  try {
    const task = await db.aiTask.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approvals: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { reviewer: { select: { name: true, email: true } } },
        },
      },
    });
    if (!task) return fail("Task not found.", ["not_found"], 404);
    if (!REVIEW_WORKFLOWS.includes(task.workflow as (typeof REVIEW_WORKFLOWS)[number])) {
      return fail("Task is not a SOP/proposal draft.", ["wrong_workflow"], 400);
    }
    return ok(task, "Task fetched.");
  } catch (e) {
    console.error("[proposal/review/[id]] GET error", e);
    return fail("Internal error.", ["server_error"], 500);
  }
}

// ─── POST: record decision + update task status (transactional) ───
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_approvals.decide");
  if (guard.denied) return guard.response;
  const reviewer = guard.session;

  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return fail("Invalid request body.");

    const decision = String((body as Record<string, unknown>).decision || "").trim();
    const note = (body as Record<string, unknown>).note
      ? String((body as Record<string, unknown>).note)
      : null;

    if (!decision) return fail("decision_required", ["decision_required"], 422);
    if (!VALID_DECISIONS.has(decision)) {
      return fail("decision_invalid", ["decision_invalid"], 422);
    }

    const existing = await db.aiTask.findUnique({ where: { id } });
    if (!existing) return fail("Task not found.", ["not_found"], 404);
    if (!REVIEW_WORKFLOWS.includes(existing.workflow as (typeof REVIEW_WORKFLOWS)[number])) {
      return fail("Task is not a SOP/proposal draft.", ["wrong_workflow"], 400);
    }

    const newStatus = DECISION_STATUS[decision];

    // Single transaction: AiApproval create + AiTask status flip.
    // The callback form is used so TypeScript keeps the typed return
    // values (the array form widens to PrismaPromise<unknown>[]).
    const { updatedTask, approval } = await db.$transaction(async (tx) => {
      const approval = await tx.aiApproval.create({
        data: {
          taskId: id,
          reviewerId: reviewer.userId,
          decision,
          note,
        } as never,
      });
      const updatedTask = await tx.aiTask.update({
        where: { id },
        data: {
          status: newStatus,
          reviewerId: reviewer.userId,
        } as never,
      });
      return { updatedTask, approval };
    });

    // Audit log (best-effort — never throws the request)
    await writeAudit(reviewer, `proposal_review.${decision}`, "ai-task", id, {
      workflow: existing.workflow,
      previousStatus: existing.status,
      newStatus,
      approvalId: approval.id,
      reviewerEmail: reviewer.email,
    }).catch(() => null);

    return ok(
      {
        id: updatedTask.id,
        workflow: updatedTask.workflow,
        status: updatedTask.status,
        decision,
        approvalId: approval.id,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewer.email,
      },
      `Task ${decision}.`,
    );
  } catch (e) {
    console.error("[proposal/review/[id]] POST error", e);
    return fail("Internal error.", ["server_error"], 500);
  }
}
