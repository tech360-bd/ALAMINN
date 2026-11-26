import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson } from "@/lib/admin-api-server";
import { ruleSchema } from "@/lib/automation/schemas";

export const dynamic = "force-dynamic";

/** PUT /api/v1/admin/automation/rules/[id] — update a rule */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.automationRule.findUnique({ where: { id } });
  if (!existing) return fail("Rule not found.", ["not_found"], 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid rule.", ["invalid_rule"]);
  const updated = await db.automationRule.update({
    where: { id },
    data: {
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      conditions: JSON.stringify(parsed.data.conditions),
      actions: JSON.stringify(parsed.data.actions),
      status: parsed.data.status,
    },
  });
  await writeAudit(guard.session, "automation.rule.update", "AutomationRule", id, { name: updated.name });
  return ok(updated, "Rule updated.");
}

/** DELETE /api/v1/admin/automation/rules/[id] — delete a rule (history kept) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const { id } = await ctx.params;
  const existing = await db.automationRule.findUnique({ where: { id } });
  if (!existing) return fail("Rule not found.", ["not_found"], 404);
  await db.automationRunLog.deleteMany({ where: { ruleId: id } }).catch(() => undefined);
  await db.automationRule.delete({ where: { id } });
  await writeAudit(guard.session, "automation.rule.delete", "AutomationRule", id, { name: existing.name });
  return ok({ id }, "Rule deleted.");
}
