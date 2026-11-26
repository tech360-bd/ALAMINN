import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, pagination } from "@/lib/admin-api-server";
import { sequenceSchema } from "@/lib/automation/sequences";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/automation/sequences — list sequences with live enrollment counts */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const [items, total] = await Promise.all([
    db.automationSequence.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
    db.automationSequence.count(),
  ]);
  const withCounts = await Promise.all(
    items.map(async (s) => {
      const active = await db.sequenceEnrollment.count({ where: { sequenceId: s.id, status: "active" } });
      const completed = await db.sequenceEnrollment.count({ where: { sequenceId: s.id, status: "completed" } });
      return { ...s, activeEnrollments: active, completedEnrollments: completed };
    })
  );
  return ok(withCounts, "Sequences loaded.", { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

/** POST /api/v1/admin/automation/sequences — create a sequence */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = sequenceSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid sequence.", ["invalid_sequence"]);
  const created = await db.automationSequence.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      trigger: parsed.data.trigger,
      status: parsed.data.status,
      steps: JSON.stringify(parsed.data.steps),
      createdBy: guard.session.userId,
    },
  });
  await writeAudit(guard.session, "automation.sequence.create", "AutomationSequence", created.id, { name: created.name });
  return ok(created, "Sequence created.", {}, 201);
}
