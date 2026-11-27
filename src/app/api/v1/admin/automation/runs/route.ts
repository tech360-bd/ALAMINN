import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, pagination } from "@/lib/admin-api-server";

export const dynamic = "force-dynamic";

/** GET /api/v1/admin/automation/runs — recent automation run logs (evidence trail) */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "contacts.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const ruleId = new URL(req.url).searchParams.get("ruleId");
  const where = ruleId ? { ruleId } : {};
  const [items, total] = await Promise.all([
    db.automationRunLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.automationRunLog.count({ where }),
  ]);
  return ok(items, "Automation run logs loaded.", { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}
