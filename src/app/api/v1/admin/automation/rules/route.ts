import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, pagination } from "@/lib/admin-api-server";
import { ruleSchema } from "@/lib/automation/schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/automation/rules — list rules */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    db.automationRule.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    db.automationRule.count(),
  ]);
  return ok(items, "Rules loaded.", { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

/** POST /api/v1/admin/automation/rules — create a rule */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid rule.", ["invalid_rule"]);
  const created = await db.automationRule.create({
    data: {
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      conditions: JSON.stringify(parsed.data.conditions),
      actions: JSON.stringify(parsed.data.actions),
      status: parsed.data.status,
      createdBy: guard.session.userId,
    },
  });
  await writeAudit(guard.session, "automation.rule.create", "AutomationRule", created.id, { name: created.name });
  return ok(created, "Rule created.", {}, 201);
}
