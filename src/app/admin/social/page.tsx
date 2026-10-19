"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ErrorState, EmptyState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { toast } from "sonner";

type Data = { automation: { engagementEnabled: boolean; publishingEnabled: boolean; generationEnabled: boolean; version: number; changedByName: string | null } | null; accounts: { id: string; platform: string; displayName: string; status: string; automationEnabled: boolean; responseMode: string; tokenExpiresAt: string | null }[]; counts: Record<string, number>; activity: { id: string; action: string; createdAt: string }[] };
export default function SocialOverview() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { adminFetch<Data>("/api/v1/admin/social").then((e) => setD(e.data)).catch((e) => setErr(String(e.message || e))); }, []);
  if (err) return <div className="p-6"><ErrorState message={err} /></div>;
  if (!d) return <div className="p-6 text-sm text-muted-foreground">Loading Social Command Center…</div>;
  const cards = [["Pending approvals", d.counts.pendingApprovals], ["Unanswered conversations", d.counts.unanswered], ["Scheduled posts", d.counts.scheduled], ["Publishing / send failures", d.counts.publishingFailures], ["Auto replies sent", d.counts.autoSent], ["Escalations", d.counts.escalated]] as const;
  return (<div className="p-6"><PageHeader title="Social Command Center" subtitle="One dashboard, multiple accounts, one AI identity. Automation is enforced server-side at the send boundary." />
    <Card className="mb-6"><CardContent className="pt-6 flex flex-wrap gap-6 text-sm">
      <span>Auto-reply: <Badge variant={d.automation?.engagementEnabled ? "default" : "destructive"}>{d.automation?.engagementEnabled ? "ON" : "OFF"}</Badge></span>
      <span>Publishing: <Badge variant={d.automation?.publishingEnabled ? "default" : "secondary"}>{d.automation?.publishingEnabled ? "ON" : "OFF"}</Badge></span>
      <span>Content generation: <Badge variant="outline">{d.automation?.generationEnabled ? "ON" : "OFF"}</Badge></span>
      <span className="text-muted-foreground">Switch v{d.automation?.version ?? "—"}{d.automation?.changedByName ? ` · last changed by ${d.automation.changedByName}` : ""}. OFF blocks automated sends only — manual replies always work. Delivered messages cannot be recalled.</span>
    </CardContent></Card>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">{cards.map(([k, v]) => <Card key={k}><CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{v ?? 0}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Connected accounts</CardTitle></CardHeader><CardContent>{d.accounts.length === 0 ? <EmptyState message="No accounts connected yet. Add one under Connected Accounts — Facebook Pages, WhatsApp Business numbers, Instagram professional accounts." /> : d.accounts.map((a) => <div key={a.id} className="flex justify-between border-b py-2 text-sm"><span>{a.displayName} <Badge variant="outline">{a.platform}</Badge></span><span>{a.status} · auto {a.automationEnabled ? "on" : "off"} · {a.responseMode}{a.tokenExpiresAt ? ` · token exp ${fmtDate(a.tokenExpiresAt)}` : ""}</span></div>)}</CardContent></Card>
  </div>);
}
