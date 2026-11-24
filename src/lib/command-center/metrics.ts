/**
 * Command Center operations metrics.
 *
 * Every value is derived from persisted rows. Provider-only metrics that are
 * not recorded in the database are returned as `Unavailable` rather than
 * invented. This module never returns credentials or provider responses that
 * could contain secrets.
 */
import { db } from "@/lib/db";

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface CommandCenterMetrics {
  generatedAt: string;
  socialAccounts: {
    connected: number;
    needsAttention: number;
  };
  conversations: {
    pending: number;
    unread: number;
  };
  content: {
    drafts: number;
    pendingApprovals: number;
    scheduled: number;
    publishedLast30Days: number;
    failedPublishing: number;
  };
  ai: {
    activeTasks: number;
    failedTasks: number;
    websiteContentAwaitingApproval: number;
  };
  meetings: {
    upcoming: number;
  };
  providerHealth: {
    status: HealthStatus;
    components: { component: string; status: HealthStatus; checkedAt: string | null }[];
    note: string;
  };
  systemHealth: {
    status: HealthStatus;
    note: string;
  };
}

const ACTIVE_AI_TASK_STATUSES = [
  "queued",
  "accepted",
  "researching",
  "processing",
  "quality-review",
  "safety-review",
];

/** Return the most severe status recorded for a set of health rows. */
export function summarizeHealth(
  rows: { status: string }[]
): { status: HealthStatus; note: string } {
  if (rows.length === 0) {
    return { status: "unknown", note: "Unavailable — no health probe has been recorded." };
  }
  const statuses = rows.map((row) => row.status);
  if (statuses.includes("down")) {
    return { status: "down", note: `${rows.length} health record(s), at least one down.` };
  }
  if (statuses.includes("degraded")) {
    return { status: "degraded", note: `${rows.length} health record(s), at least one degraded.` };
  }
  if (statuses.every((status) => status === "ok")) {
    return { status: "ok", note: `${rows.length} health record(s), all ok.` };
  }
  return { status: "unknown", note: `${rows.length} health record(s) with unrecognised status.` };
}

/**
 * Aggregate the Command Center counters. Called only from an authenticated,
 * permission-checked route handler.
 */
export async function getCommandCenterMetrics(): Promise<CommandCenterMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    socialConnected,
    socialNeedsAttention,
    pendingConversations,
    unreadAggregate,
    socialDraftContent,
    emailDraftCampaigns,
    pendingSocialApprovals,
    pendingAiTasks,
    scheduledContent,
    publishedContent,
    failedPublishing,
    activeAiTasks,
    failedAiTasks,
    upcomingMeetings,
    websiteContentAwaitingApproval,
    healthRows,
  ] = await Promise.all([
    db.socialAccount.count({ where: { status: "connected" } }),
    db.socialAccount.count({ where: { status: { in: ["disconnected", "expired", "error"] } } }),
    db.socialConversation.count({ where: { status: { in: ["unread", "pending", "escalated"] } } }),
    db.socialConversation.aggregate({ _sum: { unreadCount: true } }),
    db.socialContent.count({ where: { status: "draft" } }),
    db.emailCampaign.count({ where: { status: "draft" } }),
    db.socialApproval.count({ where: { status: "pending" } }),
    db.aiTask.count({ where: { status: "awaiting-approval" } }),
    db.socialContent.count({ where: { status: "scheduled" } }),
    db.socialContent.count({ where: { status: "published", updatedAt: { gte: thirtyDaysAgo } } }),
    db.socialContentTarget.count({ where: { status: "failed" } }),
    db.aiTask.count({ where: { status: { in: ACTIVE_AI_TASK_STATUSES } } }),
    db.aiTask.count({ where: { status: "failed" } }),
    db.meetingRequest.count({
      where: {
        requestedDate: { gte: startOfToday },
        status: { notIn: ["cancelled", "completed"] },
      },
    }),
    db.article.count({ where: { status: { in: ["draft", "review"] } } }),
    db.systemHealth.findMany({ orderBy: { checkedAt: "desc" }, take: 25 }),
  ]);

  const providerRows = healthRows.filter((row) =>
    /provider|ollama|gateway/i.test(row.component)
  );
  const systemRows = healthRows.filter((row) => !providerRows.includes(row));
  const providerHealth = summarizeHealth(providerRows);
  const systemHealth = summarizeHealth(systemRows);

  return {
    generatedAt: new Date().toISOString(),
    socialAccounts: {
      connected: socialConnected,
      needsAttention: socialNeedsAttention,
    },
    conversations: {
      pending: pendingConversations,
      unread: unreadAggregate._sum.unreadCount ?? 0,
    },
    content: {
      drafts: socialDraftContent + emailDraftCampaigns,
      pendingApprovals: pendingSocialApprovals + pendingAiTasks,
      scheduled: scheduledContent,
      publishedLast30Days: publishedContent,
      failedPublishing,
    },
    ai: {
      activeTasks: activeAiTasks,
      failedTasks: failedAiTasks,
      websiteContentAwaitingApproval: websiteContentAwaitingApproval,
    },
    meetings: { upcoming: upcomingMeetings },
    providerHealth: {
      status: providerHealth.status,
      note: providerHealth.note,
      components: providerRows.map((row) => ({
        component: row.component,
        status:
          row.status === "ok" || row.status === "degraded" || row.status === "down"
            ? row.status
            : "unknown",
        checkedAt: row.checkedAt.toISOString(),
      })),
    },
    systemHealth,
  };
}
