import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { getAdapter } from "@/lib/social/adapters";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.view"); if (g.denied) return g.response; const { id } = await ctx.params;
  const conv = await db.socialConversation.findUnique({ where: { id }, include: { account: true, messages: { orderBy: { createdAt: "asc" }, take: 100 } } }); if (!conv) return fail("Not found", ["not_found"], 404);
  const decisions = await db.socialReplyDecision.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 10 });
  return ok({ ...conv, account: { ...conv.account, tokenEncrypted: undefined }, decisions }); }
/** Manual reply — ALWAYS available, even when global automation is OFF (spec §5). Never blocked by the automation switch. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.inbox.reply"); if (g.denied) return g.response; const { id } = await ctx.params;
  const b = await readJson<{ text?: string; action?: string; assignedUserId?: string; status?: string }>(req);
  const conv = await db.socialConversation.findUnique({ where: { id }, include: { account: true } }); if (!conv) return fail("Not found", ["not_found"], 404);
  if (b?.action === "assign" || b?.action === "status") { const u = await db.socialConversation.update({ where: { id }, data: { assignedUserId: b.assignedUserId ?? conv.assignedUserId, status: b.status ?? conv.status } }); return ok(u); }
  if (!b?.text?.trim()) return fail("text required", ["text_required"], 400);
  const out = await db.socialMessage.create({ data: { conversationId: id, direction: "outbound", body: b.text.slice(0, 8000), isOwn: true, deliveryStatus: "sending" } });
  const res = await getAdapter(conv.platform).sendReply(conv.account, conv.participantId, b.text);
  await db.socialMessage.update({ where: { id: out.id }, data: { deliveryStatus: res.status === "sent" ? "sent" : res.status === "dev_pending" ? "queued" : "failed", providerMessageId: res.providerId } });
  await db.socialConversation.update({ where: { id }, data: { unreadCount: 0, lastMessageAt: new Date() } });
  await db.socialReplyDecision.create({ data: { conversationId: id, category: "general", confidence: 1, risk: "low", finalText: b.text, decision: "manual_sent", reason: "manual_reply_automation_switch_not_applicable" } });
  await writeAudit(g.session, "social_manual_reply", "SocialConversation", id, { actuallySent: res.actuallySent, status: res.status });
  return ok({ sent: res.actuallySent, status: res.status, error: res.error }); }
