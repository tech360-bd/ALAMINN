"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageCircle,
  Bot,
  Users,
  AlertTriangle,
  Clock,
  Activity,
  Send,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/components/admin/lib";

type WhatsappAccountOption = { id: string; platform: string; displayName: string; externalId: string; status: string; hasToken: boolean };

type StatusData = {
  status: string;
  statusLabel: string;
  statusColor: string;
  aiMode: string;
  aiModeLabel: string;
  webhookVerifyToken: string | null;
  metrics: {
    messagesToday: number | null;
    leadsCreated: number | null;
    humanHandoffs: number | null;
    aiConversations: number | null;
    failedMessages: number | null;
    averageResponseTimeMs: number | null;
    apiErrors: number | null;
    totalEvents: number | null;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    fromSuffix: string | null;
    intent: string | null;
    status: string | null;
    error: string | null;
    createdAt: string;
  }>;
};

const STATUS_COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  amber: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  rose: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  orange: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  slate: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700",
};

const ACTION_LABELS: Record<string, string> = {
  whatsapp_message_received: "Message Received",
  whatsapp_message_sent: "Message Sent",
  whatsapp_message_failed: "Message Failed",
  whatsapp_intent_detected: "Intent Detected",
  whatsapp_knowledge_retrieved: "Knowledge Retrieved",
  whatsapp_lead_created: "Lead Created",
  whatsapp_human_handoff: "Human Handoff",
  whatsapp_api_error: "API Error",
  whatsapp_manual_send: "Manual Send",
};

export default function WhatsappAiPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoursBack, setHoursBack] = useState(24);
  const [sendTo, setSendTo] = useState("");
  const [sendText, setSendText] = useState("");
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsappAccountOption[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [sendAccountId, setSendAccountId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminFetch<StatusData>(`/api/v1/whatsapp/admin/stats?hours=${hoursBack}`);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WhatsApp AI stats");
    } finally {
      setLoading(false);
    }
  }, [hoursBack]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adminFetch<WhatsappAccountOption[]>("/api/v1/admin/social/accounts")
      .then((result) => {
        const accounts = result.data.filter((account) => account.platform === "whatsapp");
        setWhatsappAccounts(accounts);
        setAccountsLoaded(true);
        const firstReady = accounts.find((account) => account.status === "connected" && account.hasToken);
        if (firstReady) setSendAccountId((current) => current || firstReady.id);
      })
      .catch(() => { setWhatsappAccounts([]); setAccountsLoaded(false); });
  }, []);

  const handleSend = async () => {
    if (!sendAccountId || !sendTo.trim() || !sendText.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const json = await adminFetch<{ messageId: string | null; status: string; actuallySent: boolean; accountLabel: string }>(
        "/api/v1/whatsapp/send",
        {
          method: "POST",
          body: JSON.stringify({ accountId: sendAccountId, to: sendTo, text: sendText }),
        }
      );
      setSendResult(
        `✅ ${json.message} (Account: ${json.data.accountLabel}, status: ${json.data.status}, ID: ${json.data.messageId || "n/a"})`
      );
      setSendTo("");
      setSendText("");
    } catch (err) {
      setSendResult(`❌ ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-7 w-7 text-[#25D366]" />
            WhatsApp AI Agent
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Account-scoped WhatsApp Business messaging. Choose the exact connected sender for every manual message.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hoursBack}
            onChange={(e) => setHoursBack(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            aria-label="Time range"
          >
            <option value={1}>Last hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
          <p className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        </Card>
      )}

      {/* Status card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", STATUS_COLOR_MAP[data?.statusColor || "slate"])}>
              <Bot className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Agent Status</h2>
                <Badge className={cn("border", STATUS_COLOR_MAP[data?.statusColor || "slate"])}>
                  {data?.statusLabel || "Loading..."}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {data?.aiModeLabel || "—"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Connected WhatsApp Accounts</div>
              <div className="flex items-center gap-1 font-medium">
                {accountsLoaded ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {whatsappAccounts.filter((account) => account.status === "connected" && account.hasToken).length}</>
                ) : (
                  <><XCircle className="h-4 w-4 text-amber-500" /> Unavailable</>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Webhook Token</div>
              <div className="flex items-center gap-1 font-medium">
                {data?.webhookVerifyToken ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Set</>
                ) : (
                  <><XCircle className="h-4 w-4 text-rose-500" /> Missing</>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={MessageCircle}
          label="Messages Today"
          value={data?.metrics.messagesToday}
          color="blue"
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Leads Created"
          value={data?.metrics.leadsCreated}
          color="emerald"
          loading={loading}
        />
        <MetricCard
          icon={Bot}
          label="AI Conversations"
          value={data?.metrics.aiConversations}
          color="purple"
          loading={loading}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Human Handoffs"
          value={data?.metrics.humanHandoffs}
          color="orange"
          loading={loading}
        />
        <MetricCard
          icon={Activity}
          label="Total Events"
          value={data?.metrics.totalEvents}
          color="cyan"
          loading={loading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Failed Messages"
          value={data?.metrics.failedMessages}
          color="rose"
          loading={loading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="API Errors"
          value={data?.metrics.apiErrors}
          color="rose"
          loading={loading}
        />
        <MetricCard
          icon={Clock}
          label="Avg Response Time"
          value={data?.metrics.averageResponseTimeMs != null ? `${data.metrics.averageResponseTimeMs}ms` : null}
          color="teal"
          loading={loading}
        />
      </div>

      {/* Manual send + Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Manual send */}
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Send className="h-4 w-4" />
            Send Message Manually
          </h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="send-account" className="mb-1 block text-xs font-medium text-muted-foreground">
                Sending WhatsApp Business Account
              </label>
              <select
                id="send-account"
                value={sendAccountId}
                onChange={(e) => setSendAccountId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Select a sending account…</option>
                {whatsappAccounts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.status !== "connected" || !account.hasToken}>
                    {account.displayName} — {account.status === "connected" && account.hasToken ? "connected" : "not connected"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">The selected number is the only number this send can use. WhatsApp consent, template, and customer-service-window rules still apply.</p>
            </div>
            <div>
              <label htmlFor="send-to" className="mb-1 block text-xs font-medium text-muted-foreground">
                Recipient WhatsApp Number
              </label>
              <Input
                id="send-to"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="e.g. 01716609554 or +8801716609554"
              />
            </div>
            <div>
              <label htmlFor="send-text" className="mb-1 block text-xs font-medium text-muted-foreground">
                Message
              </label>
              <Textarea
                id="send-text"
                value={sendText}
                onChange={(e) => setSendText(e.target.value)}
                placeholder="Type your message..."
                rows={4}
                maxLength={4096}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {sendText.length} / 4096
              </div>
            </div>
            <Button
              onClick={handleSend}
              disabled={!sendAccountId || !sendTo.trim() || !sendText.trim() || sending}
              className="w-full bg-[#25D366] hover:bg-[#1da851]"
            >
              {sending ? (
                <><RefreshCw className="h-4 w-4 animate-spin mr-1" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Send</>
              )}
            </Button>
            {sendResult && (
              <p className="text-sm text-muted-foreground">{sendResult}</p>
            )}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4" />
            Recent Activity
          </h3>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : data?.recentActivity && data.recentActivity.length > 0 ? (
              data.recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    log.action.includes("failed") || log.action.includes("error")
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                      : log.action.includes("lead") || log.action.includes("sent")
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  )}>
                    {log.action.includes("failed") || log.action.includes("error") ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {log.fromSuffix && `From: ...${log.fromSuffix}`}
                      {log.intent && ` · Intent: ${log.intent}`}
                      {log.status && ` · Status: ${log.status}`}
                      {log.error && ` · Error: ${log.error}`}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No recent activity. Send a test message or wait for inbound WhatsApp messages.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Configuration info */}
      <Card className="p-6">
        <h3 className="mb-3 text-base font-semibold">Configuration</h3>
        <div className="space-y-2 text-sm">
          {!accountsLoaded ? (
            <p className="text-muted-foreground">WhatsApp account status is unavailable.</p>
          ) : whatsappAccounts.length === 0 ? (
            <p className="text-muted-foreground">No WhatsApp Business accounts have been added.</p>
          ) : whatsappAccounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <strong>{account.displayName}</strong>
              <span className="text-muted-foreground">{account.externalId}</span>
              <Badge variant="outline">{account.status}</Badge>
              <span className="text-muted-foreground">Credentials: {account.hasToken ? "stored encrypted" : "missing"}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>
            <strong>Webhook URL:</strong> <code>POST /api/v1/whatsapp/webhook</code>
            <br />
            Configure the callback and verify token in Meta WhatsApp Business Manager. The server validates webhook HMAC signatures and routes each inbound message using its phone_number_id.
          </p>
          <p className="mt-2">
            Add each phone_number_id and its own access token under Connected Accounts, then use Test to verify the official API connection. Tokens stay encrypted server-side. The selected account is mandatory for manual sending; free-form messages outside the 24-hour customer-service window are blocked because approved-template sending is not yet implemented.
          </p>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: number | string | null | undefined;
  color: string;
  loading: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
    cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    teal: "bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : value !== null && value !== undefined ? (
          value
        ) : (
          <span className="text-sm font-normal text-muted-foreground">Data unavailable</span>
        )}
      </div>
    </Card>
  );
}
