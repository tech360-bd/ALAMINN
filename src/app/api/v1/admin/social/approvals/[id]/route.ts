import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { getAdapter } from "@/lib/social/adapters";
import { assertAutomationAllowedNow } from "@/lib/social/policy-server";
/** Approve / edit-approve / reject / escalate / resolve. Approval-send rechecks account connectivity (manual action: not blocked by global OFF). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const g = await requirePermission(req, "social.approvals.decide"); if (g.denied) return g.response; const { id } = await ctx.params;
  const b = await readJson<{ action?: string; editedText?: string }>(req); const action = b?.action || "approve";
  const appr = await db.socialApproval.findUnique({ where: { id } }); if (!appr || appr.status !== "pending" && appr.status !== "escalated") return fail("Approval not actionable", ["not_actionable"], 409);
  const dec = await db.socialReplyDecision.findUnique({ where: { id: appr.decisionId } }); if (!dec) return fail("Decision missing", ["missing"], 404);
  const conv = await db.socialConversation.findUnique({ where: { id: dec.conversationId }, include: { account: true } }); if (!conv) return fail("Conversation missing", ["missing"], 404);
  if (action === "reject") { await db.$transaction([db.socialApproval.update({ where: { id }, data: { status: "rejected", decidedById: g.session.userId, decidedAt: new Date() } }), db.socialReplyDecision.update({ where: { id: dec.id }, data: { decision: "rejected" } })]); return ok({ action }); }
  if (action === "escalate") { await db.$transaction([db.socialApproval.update({ where: { id }, data: { status: "escalated", decidedById: g.session.userId, decidedAt: new Date() } }), db.socialConversation.update({ where: { id: conv.id }, data: { status: "escalated", priority: "urgent" } })]); return ok({ action }); }
  if (action === "regenerate") { const { retrieveApprovedKnowledge, generateSocialReply, getProfileForAccount } = await import("@/lib/social/personality"); const k = await retrieveApprovedKnowledge(dec.draft || ""); const p = await getProfileForAccount(conv.accountId); const lastIn = await db.socialMessage.findFirst({ where: { conversationId: conv.id, direction: "inbound" }, orderBy: { createdAt: "desc" } }); const r = await generateSocialReply({ profile: p, platform: conv.platform, message: lastIn?.body || "", knowledge: k }); await db.socialReplyDecision.update({ where: { id: dec.id }, data: { draft: r.text, modelUsed: r.modelUsed } }); return ok({ action, draft: r.text }); }
  const text = (b?.editedText?.trim() || dec.draft || "").slice(0, 8000); if (!text) return fail("No reply text", ["empty"], 400);
  const outMsg = await db.socialMessage.create({ data: { conversationId: conv.id, direction: "outbound", body: text, isOwn: true, deliveryStatus: "sending" } });
  const res = await getAdapter(conv.platform).sendReply(conv.account, conv.participantId, text);
  await db.$transaction([db.socialMessage.update({ where: { id: outMsg.id }, data: { deliveryStatus: res.status === "sent" ? "sent" : res.status === "dev_pending" ? "queued" : "failed", providerMessageId: res.providerId } }), db.socialApproval.update({ where: { id }, data: { status: b?.editedText ? "edited_approved" : "approved", editedText: b?.editedText || null, decidedById: g.session.userId, decidedAt: new Date() } }), db.socialReplyDecision.update({ where: { id: dec.id }, data: { decision: b?.editedText ? "edited_sent" : "approved_sent", finalText: text } }), db.socialConversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } })]);
  await writeAudit(g.session, "social_approval_" + action, "SocialApproval", id, { actuallySent: res.actuallySent });
  return ok({ action, sent: res.actuallySent, status: res.status, error: res.error }); }
