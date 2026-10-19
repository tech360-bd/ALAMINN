import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail, readJson, writeAudit, pagination } from "@/lib/admin-api";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "social.view"); if (g.denied) return g.response;
  const [accounts, pending, unread, scheduled, failed, state, autoSent, escalated, suppressed] = await Promise.all([
    db.socialAccount.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, platform: true, displayName: true, status: true, automationEnabled: true, responseMode: true, tokenExpiresAt: true, lastHealthAt: true, healthError: true, capabilities: true } }),
    db.socialApproval.count({ where: { status: "pending" } }), db.socialConversation.count({ where: { status: "unread" } }),
    db.socialContent.count({ where: { status: "scheduled" } }), db.socialMessage.count({ where: { deliveryStatus: "failed" } }),
    db.socialAutomationState.findUnique({ where: { id: "global" } }),
    db.socialReplyDecision.count({ where: { decision: "auto_sent" } }), db.socialReplyDecision.count({ where: { decision: "escalated" } }),
    db.socialWebhookEvent.count({ where: { status: "duplicate" } }).catch(() => 0),
  ]);
  const activity = await db.auditLog.findMany({ where: { action: { startsWith: "social_" } }, orderBy: { createdAt: "desc" }, take: 15 });
  return ok({ automation: state, accounts, counts: { pendingApprovals: pending, unanswered: unread, scheduled, publishingFailures: failed, autoSent, escalated, duplicatesSuppressed: suppressed }, activity });
}
