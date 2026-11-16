import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit } from "@/lib/admin-api-server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "social.content.manage"); if (guard.denied) return guard.response;
  const { id } = await ctx.params; const body = await readJson(req);
  const parsed = z.object({ status: z.enum(["draft", "review", "approved", "scheduled"]), title: z.string().min(1).max(160).optional(), body: z.string().min(1).max(5000).optional(), scheduledAt: z.string().datetime().nullable().optional() }).safeParse(body);
  if (!parsed.success) return fail("Invalid post update.", [], 422);
  const current = await db.socialContent.findUnique({ where: { id }, include: { targets: true } }); if (!current) return fail("Post not found.", [], 404);
  if (!["draft", "review", "approved", "scheduled"].includes(current.status)) return fail("Published or in-flight posts cannot be edited.", [], 409);
  const b = parsed.data; const scheduledAt = b.scheduledAt !== undefined ? b.scheduledAt : current.scheduledAt?.toISOString();
  if (["approved", "scheduled"].includes(b.status)) { const approval = await requirePermission(req, "social.content.publish"); if (approval.denied) return approval.response; }
  if (b.status === "scheduled") { if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) return fail("A future schedule is required."); if (!current.targets.length) return fail("Add publishing targets in the Social Scheduler."); const accounts = await db.socialAccount.findMany({ where: { id: { in: current.targets.map(t => t.accountId) } } }); let media: string[] = []; try { media = JSON.parse(current.mediaUrls || "[]"); } catch { /* empty */ } const { validateTargets } = await import("@/lib/kits/social"); const issue = await validateTargets(accounts.map(a => a.id), media); if (issue) return fail(issue); }
  const changed = b.body !== undefined || b.title !== undefined;
  if (changed && ["approved", "scheduled"].includes(current.status)) {
    const approval = await requirePermission(req, "social.content.publish"); if (approval.denied) return approval.response;
    await db.socialContentTarget.updateMany({ where: { contentId: id, status: { not: "published" } }, data: { status: "pending", error: null, providerPostId: null, publishedAt: null } });
  }
  const row = await db.socialContent.update({ where: { id }, data: { status: b.status, title: b.title, body: b.body, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, approvedById: ["approved", "scheduled"].includes(b.status) ? guard.session.userId : null } });
  if (changed) await db.socialContentTarget.updateMany({ where: { contentId: id, status: { not: "published" } }, data: { status: "pending", error: null } });
  await writeAudit(guard.session, "social_content_updated", "SocialContent", id, { status: row.status }); return ok(row);
}
