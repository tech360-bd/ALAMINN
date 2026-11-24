"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, CalendarClock, CheckCircle2, GitBranch, MessageSquare,
  PenLine, Send, ShieldAlert, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/components/admin/lib";

type Metrics = {
  generatedAt: string;
  socialAccounts: { connected: number; needsAttention: number };
  conversations: { pending: number; unread: number };
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
  meetings: { upcoming: number };
  providerHealth: {
    status: "ok" | "degraded" | "down" | "unknown";
    note: string;
    components: { component: string; status: string; checkedAt: string | null }[];
  };
  systemHealth: { status: "ok" | "degraded" | "down" | "unknown"; note: string };
};

const GROUPS = [
  {
    title: "Accounts & conversations",
    href: "/admin/social/accounts",
    items: (m: Metrics) => [
      { label: "Connected accounts", value: m.socialAccounts.connected, icon: Users },
      { label: "Accounts needing attention", value: m.socialAccounts.needsAttention, icon: ShieldAlert },
      { label: "Pending conversations", value: m.conversations.pending, icon: MessageSquare },
      { label: "Unread messages", value: m.conversations.unread, icon: MessageSquare },
    ],
  },
  {
    title: "Content pipeline",
    href: "/admin/social/content",
    items: (m: Metrics) => [
      { label: "Drafts", value: m.content.drafts, icon: PenLine },
      { label: "Pending approvals", value: m.content.pendingApprovals, icon: CheckCircle2 },
      { label: "Scheduled posts", value: m.content.scheduled, icon: CalendarClock },
      { label: "Published (30d)", value: m.content.publishedLast30Days, icon: Send },
      { label: "Failed publishing", value: m.content.failedPublishing, icon: ShieldAlert },
    ],
  },
  {
    title: "AI & operations",
    href: "/admin/ai-agents",
    items: (m: Metrics) => [
      { label: "Active AI tasks", value: m.ai.activeTasks, icon: Activity },
      { label: "Failed AI tasks", value: m.ai.failedTasks, icon: ShieldAlert },
      { label: "Site content in review", value: m.ai.websiteContentAwaitingApproval, icon: PenLine },
      { label: "Upcoming meetings", value: m.meetings.upcoming, icon: CalendarClock },
    ],
  },
];

export function CommandCenterOverview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const env = await adminFetch<Metrics>("/api/v1/admin/command-center");
        if (!cancelled) setMetrics(env.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Metrics unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <Card className="mb-8 border-amber-300 bg-amber-50/40">
        <CardContent className="p-5 text-sm text-amber-900">
          Command Center counters are unavailable right now. Existing dashboard data below is unaffected.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="cc-overview-title" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="cc-overview-title" className="text-lg font-semibold">Command Center operations</h2>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Live database counters</Badge>
        {metrics && (
          <span className="text-[11px] text-muted-foreground">
            Generated {new Date(metrics.generatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span>{group.title}</span>
                <Link href={group.href} className="text-[11px] font-normal text-muted-foreground hover:text-foreground">
                  Open →
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!metrics
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)
                : group.items(metrics).map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {item.label}
                        </span>
                        <span className="font-semibold tabular-nums">{item.value}</span>
                      </div>
                    );
                  })}
            </CardContent>
          </Card>
        ))}
      </div>
      {metrics && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span><GitBranch className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Provider health: <strong className="font-medium text-foreground">{metrics.providerHealth.status}</strong> — {metrics.providerHealth.note}</span>
          <span><Activity className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />System health: <strong className="font-medium text-foreground">{metrics.systemHealth.status}</strong> — {metrics.systemHealth.note}</span>
        </div>
      )}
    </section>
  );
}
