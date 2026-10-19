/**
 * Event-driven inbound pipeline (spec §7): dedup → conversation →
 * classify → knowledge → draft → policy → (auto-send with FINAL recheck |
 * approval queue | escalate). Own/system messages never answered.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { classifyMessage } from "./classifier";
import { getProfileForAccount, retrieveApprovedKnowledge, generateSocialReply } from "./personality";
import { assertAutomationAllowedNow } from "./policy-server";
import { getAdapter } from "./adapters";

export type InboundEvent = { platform: string; providerEventId: string; accountExternalId: string; participantId: string; participantName?: string; text: string; kind?: string; isOwn?: boolean };

export async function processSocialEvent(ev: InboundEvent): Promise<{ outcome: string; decisionId?: string }> {
  const payloadHash = createHash("sha256").update(JSON.stringify(ev)).digest("hex").slice(0, 32);
  // 1) Dedup — unique (provider, providerEventId); duplicate returns immediately.
  const existing = await db.socialWebhookEvent.findUnique({ where: { provider_providerEventId: { provider: ev.platform, providerEventId: ev.providerEventId } } }).catch(() => null);
  if (existing) return { outcome: "duplicate_suppressed" };
  const account = await db.socialAccount.findUnique({ where: { platform_externalId: { platform: ev.platform, externalId: ev.accountExternalId } } }).catch(() => null);
  await db.socialWebhookEvent.create({ data: { provider: ev.platform, providerEventId: ev.providerEventId, accountId: account?.id ?? null, payloadHash, status: account ? "received" : "ignored" } }).catch(() => null);
  if (!account || ev.isOwn || !ev.text.trim()) return { outcome: "ignored" };
  // Loop guard: never reply to our own outbound participant id.
  if (ev.participantId === account.externalId) return { outcome: "ignored_own" };

  const conv = await db.socialConversation.upsert({
    where: { accountId_externalThreadId: { accountId: account.id, externalThreadId: ev.participantId } },
    create: { accountId: account.id, platform: ev.platform, externalThreadId: ev.participantId, participantId: ev.participantId, participantName: ev.participantName, unreadCount: 1 },
    update: { participantName: ev.participantName ?? undefined, unreadCount: { increment: 1 }, lastMessageAt: new Date(), status: "unread" },
  });
  const msg = await db.socialMessage.create({ data: { conversationId: conv.id, providerMessageId: ev.providerEventId, direction: "inbound", kind: ev.kind || "message", senderId: ev.participantId, senderName: ev.participantName, body: ev.text.slice(0, 8000) } }).catch(() => null);
  if (!msg) return { outcome: "duplicate_suppressed" }; // unique providerMessageId race

  const cls = classifyMessage(ev.text);
  const knowledge = cls.category === "spam" ? [] : await retrieveApprovedKnowledge(ev.text);
  const profile = await getProfileForAccount(account.id);
  const { text: draft, modelUsed } = cls.category === "spam"
    ? { text: "", modelUsed: "spam-filter" }
    : await generateSocialReply({ profile, platform: ev.platform, message: ev.text, knowledge });

  const { verdict, version } = await assertAutomationAllowedNow({ accountId: account.id, category: cls.category, confidence: cls.confidence, risk: cls.risk });
  const decision = await db.socialReplyDecision.create({ data: {
    conversationId: conv.id, messageId: msg.id, category: cls.category, language: cls.language,
    confidence: cls.confidence, risk: cls.risk, draft, modelUsed,
    decision: verdict.route === "ignore" ? "rejected" : verdict.route === "escalate" ? "escalated" : verdict.allowAutoSend ? "held" : "held",
    reason: verdict.reason, knowledgeRefs: JSON.stringify(knowledge.map((k) => k.id)), automationVersion: version,
  }});

  if (verdict.route === "ignore") { await mark(decision.id, "rejected", verdict.reason); return { outcome: "ignored_spam", decisionId: decision.id }; }
  if (verdict.route === "escalate") {
    await db.$transaction([db.socialApproval.create({ data: { decisionId: decision.id, status: "escalated" } }), db.socialConversation.update({ where: { id: conv.id }, data: { status: "escalated", priority: "high" } })]);
    return { outcome: "escalated", decisionId: decision.id };
  }
  if (!verdict.allowAutoSend) {
    await db.socialApproval.create({ data: { decisionId: decision.id, status: "pending" } });
    await db.socialConversation.update({ where: { id: conv.id }, data: { status: "pending" } });
    return { outcome: "held_for_approval", decisionId: decision.id };
  }
  return deliverAutoReply({ account, conv, decisionId: decision.id, draft, category: cls.category, confidence: cls.confidence, risk: cls.risk });
}

/** Single send boundary for automated replies — rechecks policy IMMEDIATELY before send (spec §5.4). */
export async function deliverAutoReply(opts: { account: { id: string; platform: string; externalId: string; tokenEncrypted: string | null }; conv: { id: string; participantId: string }; decisionId: string; draft: string; category: string; confidence: number; risk: string }): Promise<{ outcome: string; decisionId: string }> {
  const recheck = await assertAutomationAllowedNow({ accountId: opts.account.id, category: opts.category, confidence: opts.confidence, risk: opts.risk });
  if (!recheck.verdict.allowAutoSend) { await mark(opts.decisionId, "suppressed_off", recheck.verdict.reason); await db.socialApproval.upsert({ where: { decisionId: opts.decisionId }, create: { decisionId: opts.decisionId, status: "pending" }, update: {} }); return { outcome: "suppressed_at_send_boundary", decisionId: opts.decisionId }; }
  const out = await db.socialMessage.create({ data: { conversationId: opts.conv.id, direction: "outbound", body: opts.draft, isOwn: true, deliveryStatus: "sending" } });
  const res = await getAdapter(opts.account.platform).sendReply(opts.account, opts.conv.participantId, opts.draft);
  await db.$transaction([
    db.socialMessage.update({ where: { id: out.id }, data: { deliveryStatus: res.status === "sent" ? "sent" : res.status === "dev_pending" ? "queued" : "failed", providerMessageId: res.providerId } }),
    db.socialReplyDecision.update({ where: { id: opts.decisionId }, data: { decision: res.status === "failed" ? "failed" : "auto_sent", finalText: opts.draft } }),
  ]);
  return { outcome: res.status === "failed" ? "send_failed" : "auto_sent", decisionId: opts.decisionId };
}
async function mark(id: string, decision: string, reason: string) { await db.socialReplyDecision.update({ where: { id }, data: { decision, reason } }).catch(() => null); }
