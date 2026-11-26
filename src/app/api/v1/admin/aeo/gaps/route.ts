import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit, readJson, pagination } from "@/lib/admin-api-server";

export const dynamic = "force-dynamic";

const gapSchema = z.object({
  topic: z.string().trim().min(3).max(400),
  intent: z.enum(["informational", "commercial", "transactional"]).default("informational"),
  ourCoverage: z.enum(["none", "partial", "full"]).default("none"),
  competitors: z.string().max(2000).optional(),
  recommendation: z.string().max(2000).default(""),
  status: z.enum(["open", "planned", "covered"]).default("open"),
  score: z.number().int().min(0).max(100).default(0),
});

/** GET /api/v1/admin/aeo/gaps — content gap list */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "articles.view");
  if (guard.denied) return guard.response;
  const { skip, take, page, pageSize } = pagination(req);
  const status = new URL(req.url).searchParams.get("status");
  const where = status && ["open", "planned", "covered"].includes(status) ? { status } : {};
  const [items, total] = await Promise.all([
    db.aeoContentGap.findMany({ where, orderBy: [{ status: "asc" }, { score: "desc" }], skip, take }),
    db.aeoContentGap.count({ where }),
  ]);
  return ok(items, "Content gaps loaded.", { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

/** POST /api/v1/admin/aeo/gaps — record a content gap */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "articles.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const parsed = gapSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid gap.", ["invalid_gap"]);
  const existing = await db.aeoContentGap.findUnique({ where: { topic: parsed.data.topic } });
  if (existing) return fail("A gap with this topic already exists.", ["duplicate_topic"]);
  const created = await db.aeoContentGap.create({ data: parsed.data });
  await writeAudit(guard.session, "aeo.gap.create", "AeoContentGap", created.id, { topic: created.topic });
  return ok(created, "Content gap recorded.", {}, 201);
}

/** PUT /api/v1/admin/aeo/gaps — update a gap (status/score) */
export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "articles.update");
  if (guard.denied) return guard.response;
  const body = await readJson(req);
  if (!body) return fail("Invalid JSON body.");
  const updateSchema = gapSchema.partial().extend({ id: z.string().min(1).max(80) });
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid gap update.", ["invalid_gap"]);
  const { id, ...changes } = parsed.data;
  const existing = await db.aeoContentGap.findUnique({ where: { id } });
  if (!existing) return fail("Content gap not found.", ["not_found"], 404);
  const updated = await db.aeoContentGap.update({ where: { id }, data: changes });
  await writeAudit(guard.session, "aeo.gap.update", "AeoContentGap", id, { status: updated.status });
  return ok(updated, "Content gap updated.");
}
