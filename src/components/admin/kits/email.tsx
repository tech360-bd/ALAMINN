"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Send, ShieldAlert, AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
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
  Modal,
} from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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

type EmailProviderRow = {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

export default function EmailKit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<EmailProviderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ to: "", subject: "", text: "", html: "", contactId: "", preferredProvider: "auto" });
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
      const email = (json.data.integrations || []).filter((i) => i.category === "Messaging & SMS" || i.id.startsWith("email") || i.id === "sparkpost" || i.id === "mailgun" || i.id === "sendgrid" || i.id === "mailjet" || i.id === "sendinblue" || i.id === "sendpulse" || i.id === "pepipost" || i.id === "elasticemail" || i.id === "resend" || i.id === "smtp");
      setProviders(
        email.map((i) => ({
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
      }>("/api/v1/email/send", {
        method: "POST",
        body: JSON.stringify({
          to: form.to || undefined,
          subject: form.subject,
          text: form.text,
          html: form.html || form.text,
          contactId: form.contactId || undefined,
          preferredProvider: form.preferredProvider,
        }),
      });
      setLastResult(json.data);
      setOpen(false);
      toast.success(json.data.actuallySent ? "Email sent." : "Email queued (dev mode).");
      setForm({ to: "", subject: "", text: "", html: "", contactId: "", preferredProvider: "auto" });
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
        title="Email Failover Gateway"
        description="Send consent-based email through a free provider loop: SparkPost → Mailgun → SendGrid → Mailjet → SendinBlue → SendPulse → Pepipost → ElasticEmail → Resend → SMTP → dev mode. If one provider hits its free limit, the next one takes over automatically."
        badge="Email"
      >
        {!anyConfigured && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Mail className="mr-2 size-3.5" />Configure a provider
          </Button>
        )}
      </KitHeading>

      <Panel title="Email providers" description="Connection state is managed on the Integrations page. Providers are tried in failover order; a rate-limited or failed provider automatically falls over to the next.">
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
                        <Mail className="size-3.5 text-muted-foreground" />
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
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No email providers registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!anyConfigured && (
          <Notice tone="warning">
            <ShieldAlert className="mr-2 size-3.5 shrink-0" />
            No email provider is configured yet. Add a free provider key (SparkPost, Mailgun, SendGrid, Mailjet,
            SendinBlue, SendPulse, Pepipost, ElasticEmail, Resend, or SMTP) on the
            <a href="/admin/integrations" className="underline">Integrations</a> page, or enable dev mode to test without sending.
          </Notice>
        )}
      </Panel>

      <Panel title="Send Email" description="Only send to recipients who have given explicit marketing consent. Dev mode logs instead of delivering when no real provider is configured.">
        <form onSubmit={send} className="space-y-4">
          <Field label="To (email address)">
            <Input
              required
              placeholder="user@example.com"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </Field>
          <Field label="Subject">
            <Input
              required
              placeholder="Your subject line"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </Field>
          <Field label="Message (plain text)">
            <Textarea
              required
              rows={3}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Your message here…"
            />
          </Field>
          <Field label="HTML body (optional)">
            <Textarea
              rows={3}
              value={form.html}
              onChange={(e) => setForm({ ...form, html: e.target.value })}
              placeholder="Falls back to plain text if blank"
            />
          </Field>
          <Field label="Contact ID (optional)">
            <Input
              placeholder="Enforce marketing consent + active status"
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            />
          </Field>
          <Field label="Provider">
            <SelectField
              value={form.preferredProvider}
              onChange={(v) => setForm({ ...form, preferredProvider: v })}
              options={[
                { value: "auto", label: "Auto failover (SparkPost → Mailgun → SendGrid → Mailjet → SendinBlue → SendPulse → Pepipost → ElasticEmail → Resend → SMTP → dev)" },
                { value: "sparkpost", label: "SparkPost only" },
                { value: "mailgun", label: "Mailgun only" },
                { value: "sendgrid", label: "SendGrid only" },
                { value: "mailjet", label: "Mailjet only" },
                { value: "sendinblue", label: "SendinBlue only" },
                { value: "sendpulse", label: "SendPulse only" },
                { value: "pepipost", label: "Pepipost only" },
                { value: "elasticemail", label: "Elastic Email only" },
                { value: "resend", label: "Resend only" },
                { value: "smtp", label: "SMTP only" },
              ]}
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            <Send className={`mr-2 size-3.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Sending…" : "Send Email"}
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
