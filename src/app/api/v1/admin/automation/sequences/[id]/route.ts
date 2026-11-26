import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { sequenceSchema } from "@/lib/automation/sequences";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/automation/sequences/[id] — one sequence (with enrollments) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const sequence = await db.automationSequence.findUnique({ where: { id } });
  if (!sequence) return fail("Sequence not found.", ["not_found"], 404);
  const enrollments = await db.sequenceEnrollment.findMany({
    where: { sequenceId: id },
    orderBy: { nextStepAt: "asc" },
    take: 50,
  });
  return ok({ ...sequence, enrollments }, "Sequence loaded.");
}

/** PUT /api/v1/admin/automation/sequences/[id] — update */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.automationSequence.findUnique({ where: { id } });
  if (!existing) return fail("Sequence not found.", ["not_found"], 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = sequenceSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid sequence.", ["invalid_sequence"]);
  const updated = await db.automationSequence.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      trigger: parsed.data.trigger,
      status: parsed.data.status,
      steps: JSON.stringify(parsed.data.steps),
    },
  });
  await writeAudit(guard.session, "automation.sequence.update", "AutomationSequence", id, { name: updated.name });
  return ok(updated, "Sequence updated.");
}

/** DELETE /api/v1/admin/automation/sequences/[id] — delete if unused */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const active = await db.sequenceEnrollment.count({ where: { sequenceId: id, status: "active" } });
  if (active > 0) {
    return fail(`This sequence has ${active} active enrollment(s). Pause it instead of deleting.`, ["sequence_in_use"]);
  }
  await db.sequenceEnrollment.deleteMany({ where: { sequenceId: id } }).catch(() => undefined);
  const deleted = await db.automationSequence.delete({ where: { id } }).catch(() => null);
  if (!deleted) return fail("Sequence not found.", ["not_found"], 404);
  await writeAudit(guard.session, "automation.sequence.delete", "AutomationSequence", id, {});
  return ok({ id }, "Sequence deleted.");
}
