"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { KeyRound, Loader2, Plus, RefreshCw, Trash2, Webhook, Activity } from "lucide-react";

type ApiKey = { id: string; name: string; prefix: string; scopes: string; status: string; rateLimitPerMin: number; lastUsedAt: string | null; createdAt: string };
type Webhook = { id: string; url: string; events: string; status: string; deliveredCount?: number; failedCount?: number; createdAt: string };
type Usage = {
  totals: { allTime: number; windowDays: number; inWindow: number };
  perKey: Array<{ keyId: string; name: string; total: number; errors: number }>;
  topRoutes: Array<{ route: string; count: number }>;
  statusDistribution: Array<{ status: number; count: number }>;
};
const EVENTS = ["contact.created", "contact.updated", "contact.merged", "inquiry.created", "opportunity.stage_changed", "application.created", "lead.imported"];
const SCOPES = ["leads:read", "leads:write", "applications:read", "applications:write", "copilot:invoke", "webhooks:manage", "usage:read"];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export default function AdminApiPlatformPage() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; scopes: string[] }>({ name: "", scopes: ["leads:write"] });
  const [revealed, setRevealed] = useState<{ rawKey: string; name: string } | null>(null);
  const [newHook, setNewHook] = useState<{ url: string; events: string[] }>({ url: "", events: ["contact.created"] });
  const [revealedSecret, setRevealedSecret] = useState<{ signingSecret: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysJson, hooksJson, usageJson] = await Promise.all([
        adminFetch<ApiKey[]>("/api/v1/admin/api-keys?pageSize=100"),
        adminFetch<Webhook[]>("/api/v1/admin/webhooks?pageSize=100"),
        adminFetch<Usage>("/api/v1/admin/usage?days=7"),
      ]);
      setKeys(keysJson.data ?? []);
      setWebhooks(hooksJson.data ?? []);
      setUsage(usageJson.data ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load API platform data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createKey() {
    if (!newKey.name.trim() || !newKey.scopes.length) { toast.error("Key needs a name and at least one scope."); return; }
    setBusy(true);
    try {
      const r = await adminFetch<{ rawKey: string; name: string }>("/api/v1/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKey.name, scopes: newKey.scopes, rateLimitPerMin: 60 }),
      });
      setRevealed({ rawKey: r.data.rawKey, name: r.data.name });
      setNewKey({ name: "", scopes: ["leads:write"] });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create failed."); }
    finally { setBusy(false); }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Requests using it will start failing immediately.")) return;
    try {
      await adminFetch(`/api/v1/admin/api-keys/${id}`, { method: "DELETE" });
      toast.success("Key revoked.");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Revoke failed."); }
  }

  async function createWebhook() {
    if (!newHook.url.startsWith("https://") || !newHook.events.length) { toast.error("Webhooks need an https:// URL and at least one event."); return; }
    setBusy(true);
    try {
      const r = await adminFetch<{ signingSecret: string; url: string }>("/api/v1/admin/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: newHook.url, events: newHook.events }),
      });
      setRevealedSecret({ signingSecret: r.data.signingSecret, url: r.data.url });
      setNewHook({ url: "", events: ["contact.created"] });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create failed."); }
    finally { setBusy(false); }
  }

  async function testWebhook(id: string) {
    try {
      const r = await adminFetch<{ delivered: number; endpoints: number }>(`/api/v1/admin/webhooks/${id}/test`, { method: "POST" });
      toast.success(`Test event: ${r.data.delivered}/${r.data.endpoints} delivered.`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed."); }
  }

  async function deleteWebhook(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    try {
      await adminFetch(`/api/v1/admin/webhooks/${id}`, { method: "DELETE" });
      toast.success("Endpoint deleted.");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed."); }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><KeyRound className="h-6 w-6" /> API Platform</h1>
          <p className="text-sm text-muted-foreground">API keys, outbound webhooks and real usage metrics for the ecosystem bridge (/api/v1/ecosystem/*) and public API.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <>
          {revealed ? (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 space-y-1">
              <p className="text-sm font-medium">New API key for &quot;{revealed.name}&quot; — copy it now, it is shown only once.</p>
              <code className="block break-all rounded bg-white p-2 font-mono text-xs">{revealed.rawKey}</code>
              <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>Done</Button>
            </div>
          ) : null}
          {revealedSecret ? (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 space-y-1">
              <p className="text-sm font-medium">Webhook signing secret for {revealedSecret.url} — copy it now.</p>
              <code className="block break-all rounded bg-white p-2 font-mono text-xs">{revealedSecret.signingSecret}</code>
              <p className="text-xs text-muted-foreground">Verify deliveries with: HMAC-SHA256(secret, `${"{timestamp}"}.${"{rawBody}"}`) in X-ALAMINN-Signature (t=…,v1=…).</p>
              <Button size="sm" variant="outline" onClick={() => setRevealedSecret(null)}>Done</Button>
            </div>
          ) : null}

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="font-medium">API keys</h2>
              {keys.length === 0 ? <p className="text-sm text-muted-foreground">No API keys yet.</p> : keys.map((k) => (
                <div key={k.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="font-medium">{k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span></div>
                    <div className="text-xs text-muted-foreground">{parseJson<string[]>(k.scopes, []).join(", ")} · {k.rateLimitPerMin}/min{k.lastUsedAt ? ` · used ${fmtDate(k.lastUsedAt)}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={k.status === "active" ? "default" : "secondary"}>{k.status}</Badge>
                    {k.status === "active" ? <Button size="icon" variant="ghost" onClick={() => void revokeKey(k.id)}><Trash2 className="h-4 w-4" /></Button> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <h2 className="font-medium">Create key</h2>
              <Input placeholder="Key name (e.g. Activepieces server)" value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} />
              <div className="space-y-1">
                {SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={newKey.scopes.includes(s)} onChange={(e) => setNewKey({ ...newKey, scopes: e.target.checked ? [...newKey.scopes, s] : newKey.scopes.filter((x) => x !== s) })} />
                    {s}
                  </label>
                ))}
              </div>
              <Button size="sm" onClick={() => void createKey()} disabled={busy}><Plus className="h-3 w-3 mr-1" /> Create key</Button>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-medium"><Webhook className="h-4 w-4" /> Webhook endpoints</h2>
              {webhooks.length === 0 ? <p className="text-sm text-muted-foreground">No endpoints yet.</p> : webhooks.map((w) => (
                <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="font-medium break-all">{w.url}</div>
                    <div className="text-xs text-muted-foreground">{parseJson<string[]>(w.events, []).join(", ")} · {w.deliveredCount ?? 0} delivered / {w.failedCount ?? 0} failed</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={w.status === "active" ? "default" : "secondary"}>{w.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => void testWebhook(w.id)}>Test</Button>
                    <Button size="icon" variant="ghost" onClick={() => void deleteWebhook(w.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <h2 className="font-medium">Register endpoint</h2>
              <Input placeholder="https://your-service.example.com/webhooks/alaminn" value={newHook.url} onChange={(e) => setNewHook({ ...newHook, url: e.target.value })} />
              <div className="space-y-1">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={newHook.events.includes(ev)} onChange={(e) => setNewHook({ ...newHook, events: e.target.checked ? [...newHook.events, ev] : newHook.events.filter((x) => x !== ev) })} />
                    {ev}
                  </label>
                ))}
              </div>
              <Button size="sm" onClick={() => void createWebhook()} disabled={busy}><Plus className="h-3 w-3 mr-1" /> Register</Button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-medium"><Activity className="h-4 w-4" /> Usage (last {usage?.totals.windowDays ?? 7} days)</h2>
            {usage ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-semibold">{usage.totals.inWindow}</div>
                  <div className="text-xs text-muted-foreground">requests in window ({usage.totals.allTime} all-time)</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">By key</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {usage.perKey.map((k) => (
                        <tr key={k.keyId} className="border-b last:border-0">
                          <td className="py-1">{k.name}</td>
                          <td className="py-1 text-right">{k.total} <span className="text-muted-foreground">({k.errors} err)</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">Top routes</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {usage.topRoutes.map((r) => (
                        <tr key={r.route} className="border-b last:border-0">
                          <td className="py-1 font-mono">{r.route}</td>
                          <td className="py-1 text-right">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">No usage recorded yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
