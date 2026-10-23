import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response; return ok(await db.socialAutomationRule.findMany({ orderBy: { createdAt: "asc" } })); }
export async function POST(req: NextRequest) { const g = await requirePermission(req, "social.automation.manage"); if (g.denied) return g.response;
  const b = await readJson<Record<string, unknown>>(req); if (!b?.name) return fail("name required", ["name_required"], 400);
  if (b.id) { const { id, ...rest } = b as Record<string, unknown> & { id: string }; return ok(await db.socialAutomationRule.update({ where: { id: String(id) }, data: rest as never })); }
  const r = await db.socialAutomationRule.create({ data: { name: String(b.name), accountId: (b.accountId as string) || null, platform: (b.platform as string) || null, category: (b.category as string) || null, action: String(b.action || "approval"), minConfidence: Number(b.minConfidence ?? 0.85), enabled: b.enabled !== false } });
  await writeAudit(g.session, "social_rule_saved", "SocialAutomationRule", r.id, {}); return ok(r, "", {}, 201); }
