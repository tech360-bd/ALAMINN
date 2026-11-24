"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot, CheckCircle2, CirclePause, Hand, Loader2, Send, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { cn } from "@/lib/utils";

type CommunicationMode = "HUMAN_OPERATOR" | "AI_ASSISTED" | "AI_AUTONOMOUS" | "PAUSED";

type Controls = {
  mode: CommunicationMode;
  sendThroughPlatform: boolean;
  effective: {
    globalEngagementEnabled: boolean;
    globalPublishingEnabled: boolean;
    automationVersion: number;
  };
  accounts: {
    id: string;
    platform: string;
    displayName: string;
    status: string;
    automationEnabled: boolean;
    responseMode: string;
    tokenExpiresAt: string | null;
  }[];
  enforcement: string;
};

const MODES: {
  id: CommunicationMode;
  title: string;
  description: string;
  icon: typeof Hand;
}[] = [
  {
    id: "HUMAN_OPERATOR",
    title: "Human operator",
    description: "AI may summarize and draft. All outbound messages are sent by a person.",
    icon: Hand,
  },
  {
    id: "AI_ASSISTED",
    title: "AI assisted",
    description: "AI prepares replies. A human must approve and may edit before sending.",
    icon: Bot,
  },
  {
    id: "AI_AUTONOMOUS",
    title: "AI autonomous",
    description: "Existing per-account and rule policies decide. Global pause still overrides.",
    icon: CheckCircle2,
  },
  {
    id: "PAUSED",
    title: "Paused",
    description: "Inbound keeps flowing. All automated outbound stops until resumed.",
    icon: CirclePause,
  },
];

export default function CommunicationControlsPage() {
  const [data, setData] = useState<Controls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const env = await adminFetch<Controls>("/api/v1/admin/communication-controls");
      setData(env.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load controls.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  async function save(update: Partial<Pick<Controls, "mode" | "sendThroughPlatform">>) {
    setSaving(true);
    setError(null);
    try {
      const env = await adminFetch<Controls>("/api/v1/admin/communication-controls", {
        method: "PUT",
        body: JSON.stringify(update),
      });
      setData(env.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save controls.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Communication Controls"
        subtitle="One control plane for human, assisted, autonomous and paused communication"
      />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading controls…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              const active = data.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={saving}
                  aria-pressed={active}
                  onClick={() => void save({ mode: mode.id })}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                    active
                      ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                      : "border-ink-200 bg-card hover:border-orange-300"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-orange-600" : "text-muted-foreground")} />
                  <p className="mt-2 text-sm font-semibold">{mode.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mode.description}</p>
                  {active && <Badge className="mt-3 text-[10px]">ACTIVE</Badge>}
                </button>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Send through connected platform</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  When enabled, approved replies are sent through the selected official account.
                  When disabled, replies are stored as internal notes and nothing is sent externally.
                </p>
                <Switch
                  checked={data.sendThroughPlatform}
                  disabled={saving}
                  onCheckedChange={(value) => void save({ sendThroughPlatform: value })}
                  aria-label="Send through connected platform"
                />
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Global engagement switch: <strong className="text-foreground">{data.effective.globalEngagementEnabled ? "ON" : "OFF"}</strong></span>
                <span>Publishing switch: <strong className="text-foreground">{data.effective.globalPublishingEnabled ? "ON" : "OFF"}</strong></span>
                <span>Policy version: <strong className="text-foreground">{data.effective.automationVersion}</strong></span>
              </div>
              <p className="rounded-lg bg-muted/50 p-3 text-xs">{data.enforcement}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Per-account modes</CardTitle>
            </CardHeader>
            <CardContent>
              {data.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No social accounts are configured yet. Existing accounts appear here automatically.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="py-2">Account</th><th>Platform</th><th>Status</th><th>Mode</th><th>Automation</th><th>Token expiry</th></tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((account) => (
                        <tr key={account.id} className="border-t">
                          <td className="py-2 font-medium">{account.displayName}</td>
                          <td>{account.platform}</td>
                          <td><Badge variant="outline">{account.status}</Badge></td>
                          <td>{account.responseMode}</td>
                          <td>{account.automationEnabled ? "enabled" : "disabled"}</td>
                          <td>{account.tokenExpiresAt ? fmtDate(account.tokenExpiresAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Every mode change is written to the audit log.
            <Send className="ml-2 h-3.5 w-3.5" /> Manual human replies remain available in all modes except when external sending is disabled.
          </p>
        </div>
      )}
    </div>
  );
}
