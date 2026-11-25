"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Phone, Send, ShieldAlert, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { adminFetch } from "@/components/admin/lib";
import { errorMessage } from "./shared";
import {
  KitHeading,
  Panel,
  Field,
  Notice,
  KitLoading,
  KitError,
  SelectField,
  StatusBadge,
} from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IntegrationConnection = {
  id: string;
  name: string;
  category: string;
  mode: string;
  configured: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  values: Record<string, string>;
};

type SmsProviderRow = {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

export default function SmsKit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<SmsProviderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ to: "", text: "", contactId: "", preferredProvider: "auto" });
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    status: string;
    providerUsed: string;
    providerName: string;
    actuallySent: boolean;
    messageId: string | null;
    error: string | null;
    fallbackTrail: Array<{ provider: string; status: string; detail?: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await adminFetch<{ integrations: IntegrationConnection[] }>("/api/v1/admin/integrations");
      const sms = (json.data.integrations || []).filter((i) => i.category === "Messaging & SMS");
      setProviders(
        sms.map((i) => ({
          id: i.id,
          name: i.name,
          configured: i.configured,
          enabled: i.enabled,
          lastTestOk: i.lastTestOk,
          lastTestMessage: i.lastTestMessage,
        }))
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const json = await adminFetch<{
        ok: boolean;
        status: string;
        providerUsed: string;
        providerName: string;
        actuallySent: boolean;
        messageId: string | null;
        error: string | null;
        consentChecked: boolean;
        fallbackTrail: Array<{ provider: string; status: string; detail?: string }>;
      }>("/api/v1/sms/send", {
        method: "POST",
        body: JSON.stringify({
          to: form.to || undefined,
          text: form.text,
          contactId: form.contactId || undefined,
          preferredProvider: form.preferredProvider,
        }),
      });
      setLastResult(json.data);
      toast.success(json.data.actuallySent ? "SMS sent." : "SMS queued (dev mode).");
      setForm({ to: "", text: "", contactId: "", preferredProvider: "auto" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async (id: string) => {
    try {
      await adminFetch(`/api/v1/admin/integrations/${id}/test`, { method: "POST" });
      toast.success("Connection test started — check the Integrations page for the result.");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const anyConfigured = providers.some((p) => p.configured);

  if (loading) return <KitLoading />;
  if (error) return <KitError message={error} retry={load} />;

  return (
    <div className="space-y-6">
      <KitHeading
        title="SMS Failover Gateway"
        description="Send consent-based SMS through a free provider loop: httpSMS → Textbelt → Twilio → Plivo → dev mode. If one provider hits its free limit, the next one takes over automatically."
        badge="SMS"
      >
        {!anyConfigured && (
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/integrations">
              <Phone className="mr-2 size-3.5" />Configure a provider
            </Link>
          </Button>
        )}
      </KitHeading>

      <Panel title="SMS providers" description="Connection state is managed on the Integrations page. Providers are tried in failover order; a rate-limited or failed provider automatically falls over to the next.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 text-muted-foreground">Provider</th>
                <th className="text-left pb-2 text-muted-foreground">Configured</th>
                <th className="text-left pb-2 text-muted-foreground">Last test</th>
                <th className="text-right pb-2 text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {providers.length ? (
                providers.map((p) => (
                  <tr key={p.id} className="group hover:bg-muted/50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5 text-muted-foreground" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={p.configured ? "configured" : "not-configured"} />
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">
                      {p.lastTestOk === null ? "Not tested" : p.lastTestOk ? "Passed" : "Failed"}
                      {p.lastTestMessage ? ` — ${p.lastTestMessage}` : ""}
                    </td>
                    <td className="py-3 text-right">
                      {!p.configured && (
                        <Button size="sm" variant="outline" onClick={() => testConnection(p.id)}>
                          Test
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No SMS providers registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!anyConfigured && (
          <Notice tone="warning">
            <ShieldAlert className="mr-2 size-3.5 shrink-0" />
            No SMS provider is configured yet. Add httpSMS (self-hosted Android gateway) or a Textbelt key on the
            <a href="/admin/integrations" className="underline">Integrations</a> page, or enable dev mode to test without sending.
          </Notice>
        )}
      </Panel>

      <Panel title="Send SMS" description="Only send to recipients who have given explicit communications consent. Dev mode logs instead of delivering when no real provider is configured.">
        <form onSubmit={send} className="space-y-4">
          <Field label="To (phone number)">
            <Input
              required
              placeholder="+8801716609554"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </Field>
          <Field label="Message">
            <Textarea
              required
              rows={3}
              maxLength={1600}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Your message here…"
            />
          </Field>
          <Field label="Contact ID (optional)">
            <Input
              placeholder="Enforce comms consent + active status"
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            />
          </Field>
          <Field label="Provider">
            <SelectField
              value={form.preferredProvider}
              onChange={(v) => setForm({ ...form, preferredProvider: v })}
              options={[
                { value: "auto", label: "Auto failover (httpSMS → Textbelt → Twilio → Plivo → dev)" },
                { value: "httpsms", label: "httpSMS only" },
                { value: "textbelt", label: "Textbelt only" },
                { value: "twilio", label: "Twilio only" },
                { value: "plivo", label: "Plivo only" },
              ]}
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            <Send className={`mr-2 size-3.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Sending…" : "Send SMS"}
          </Button>
        </form>
      </Panel>

      {lastResult && (
        <Panel title="Last send result" className="border-l-2 border-emerald-500">
          <div className="grid sm:grid-cols-4 gap-3 text-xs mb-3">
            <div>
              <div className="text-muted-foreground">Status</div>
              <StatusBadge status={lastResult.status} />
            </div>
            <div>
              <div className="text-muted-foreground">Provider</div>
              <div className="font-medium">{lastResult.providerName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Actually sent</div>
              <div className="font-medium">{lastResult.actuallySent ? "Yes" : "No (dev mode)"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Message ID</div>
              <div className="font-medium font-mono text-[10px]">{lastResult.messageId || "—"}</div>
            </div>
          </div>
          {lastResult.error && (
            <Notice tone="error"><AlertCircle className="mr-2 size-3.5 shrink-0" />{lastResult.error}</Notice>
          )}
          {lastResult.fallbackTrail && lastResult.fallbackTrail.length > 1 && (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs text-muted-foreground mb-1">Failover trail</div>
              <div className="flex items-center gap-1 text-xs">
                {lastResult.fallbackTrail.map((step, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <span className={`font-medium ${step.status === "ok" ? "text-emerald-700 dark:text-emerald-300" : step.status === "cooldown" || step.status === "skipped" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>
                      {step.provider}
                    </span>
                    <span className="text-muted-foreground text-[10px]">({step.status})</span>
                    {step.detail && <span className="text-muted-foreground text-[10px] ml-1">{step.detail}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
