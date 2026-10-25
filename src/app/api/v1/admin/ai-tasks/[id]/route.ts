import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { executeAiTaskWithFreeRouter } from "@/lib/ai/workflow-executor";
import type { FreeProviderId, ModelSpeedTier } from "@/lib/ai/free-providers";

export const dynamic = "force-dynamic";

interface RouteCtx { params: Promise<{ id: string }> }

const APPROVAL_PROTECTED_STATUSES = new Set(["approved", "rejected", "delivered"]);

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_tasks.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const item = await db.aiTask.findUnique({
    where: { id },
    include: { requester: true, approvals: { include: { reviewer: true } } },
  });
  if (!item) return fail("AI task not found.", ["not_found"], 404);
  return ok(item);
}

/** POST /api/v1/admin/ai-tasks/[id] — Execute / re-run task via AI Router */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_tasks.create");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const body = (await readJson<Record<string, unknown>>(req)) || {};

  const existing = await db.aiTask.findUnique({ where: { id } });
  if (!existing) return fail("AI task not found.", ["not_found"], 404);

  // Prevent overwriting already-approved/delivered tasks unless caller has approval authority and explicitly forces rerun (SEC-09)
  if (existing.status === "approved" || existing.status === "delivered") {
    const canDecide = hasPermission(guard.session.role, "ai_approvals.decide");
    if (!canDecide || body.forceRerun !== true) {
      return fail(
        "Cannot overwrite an approved or delivered AI task without `ai_approvals.decide` permission and `forceRerun: true`.",
        ["approval_locked"],
        409
      );
    }
  }

  try {
    const executed = await executeAiTaskWithFreeRouter(id, {
      preferredProvider: (body.preferredProvider
        ? String(body.preferredProvider)
        : undefined) as FreeProviderId | "auto" | undefined,
      preferredModel: body.preferredModel ? String(body.preferredModel) : undefined,
      tier: (body.tier ? String(body.tier) : "flagship") as ModelSpeedTier | "auto",
    });
    await writeAudit(guard.session, "ai_task.execute", "AiTask", id, {
      providerUsed: executed.providerUsed,
      modelUsed: executed.modelUsed,
    });
    return ok(
      executed.task,
      `Task executed via ${executed.providerName} (${executed.modelUsed}).`
    );
  } catch (e) {
    return fail("Failed to execute AI task.", [(e as Error).message], 500);
  }
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_tasks.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const b = body as Record<string, unknown>;

  // Enforce `ai_approvals.decide` before allowing direct approval/rejection/delivery status transitions (SEC-09)
  if (b.status !== undefined && APPROVAL_PROTECTED_STATUSES.has(String(b.status))) {
    if (!hasPermission(guard.session.role, "ai_approvals.decide")) {
      return fail(
        "Forbidden — missing permission: ai_approvals.decide",
        ["insufficient_permissions"],
        403
      );
    }
  }
  if (b.reviewerId !== undefined && !hasPermission(guard.session.role, "ai_approvals.decide")) {
    return fail(
      "Forbidden — missing permission: ai_approvals.decide",
      ["insufficient_permissions"],
      403
    );
  }

  try {
    const existing = await db.aiTask.findUnique({ where: { id } });
    if (!existing) return fail("AI task not found.", ["not_found"], 404);
    if (
      (existing.status === "approved" || existing.status === "delivered") &&
      !hasPermission(guard.session.role, "ai_approvals.decide")
    ) {
      return fail(
        "Approved or delivered AI tasks cannot be modified without `ai_approvals.decide`.",
        ["approval_locked"],
        403
      );
    }

    const updated = await db.aiTask.update({
      where: { id },
      data: {
        ...(b.status !== undefined ? { status: String(b.status) } : {}),
        ...(b.result !== undefined ? { result: b.result ? String(b.result) : null } : {}),
        ...(b.objective !== undefined ? { objective: String(b.objective) } : {}),
        ...(b.prompt !== undefined ? { prompt: String(b.prompt) } : {}),
        ...(b.reviewerId !== undefined ? { reviewerId: b.reviewerId ? String(b.reviewerId) : null } : {}),
        ...(b.completedAt !== undefined ? { completedAt: b.completedAt ? new Date(String(b.completedAt)) : null } : {}),
      },
    });
    await writeAudit(guard.session, "ai_task.update", "AiTask", id, {
      status: updated.status,
    });
    return ok(updated, "AI task updated.");
  } catch (e) {
    return fail("Failed to update AI task.", [(e as Error).message], 500);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const guard = await requirePermission(req, "ai_tasks.delete");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  try {
    await db.aiTask.delete({ where: { id } });
    await writeAudit(guard.session, "ai_task.delete", "AiTask", id);
    return NextResponse.json({ success: true, message: "AI task deleted.", data: null, meta: {}, errors: [] });
  } catch (e) {
    return fail("Failed to delete AI task.", [(e as Error).message], 500);
  }
}
