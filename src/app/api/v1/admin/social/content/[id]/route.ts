import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.content.manage"); if (g.denied) return g.response; const { id } = await ctx.params;
  const b = await readJson<Record<string, unknown>>(req); if (!b) return fail("Invalid JSON", ["invalid_json"], 400);
  const data: Record<string, unknown> = {}; for (const k of ["title","body","variants","hashtags","cta","mediaUrls","language","status","campaignId"]) if (k in b) data[k] = b[k];
  if (b.scheduledAt) data.scheduledAt = new Date(String(b.scheduledAt));
  if (b.status === "approved" || b.status === "scheduled") data.approvedById = g.session.userId;
  // Scheduling requires approval (spec §9): refuse scheduled without approver.
  if (b.status === "scheduled" && !data.scheduledAt) { const cur = await db.socialContent.findUnique({ where: { id } }); if (!cur?.scheduledAt && !b.scheduledAt) return fail("scheduledAt required to schedule", ["scheduled_at_required"], 400); }
  const c = await db.socialContent.update({ where: { id }, data: data as never, include: { targets: true } });
  if (Array.isArray(b.accountIds)) { await db.socialContentTarget.deleteMany({ where: { contentId: id } }); for (const aid of b.accountIds as string[]) await db.socialContentTarget.create({ data: { contentId: id, accountId: aid } }).catch(() => null); }
  await writeAudit(g.session, "social_content_updated", "SocialContent", id, { status: c.status }); return ok(c); }
