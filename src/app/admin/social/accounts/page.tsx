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

type Acc = { id: string; platform: string; externalId: string; displayName: string; username: string | null; status: string; hasToken: boolean; automationEnabled: boolean; responseMode: string; tokenExpiresAt: string | null; healthError: string | null; capabilities: string | null };
export default function AccountsPage() {
  const [rows, setRows] = useState<Acc[]>([]); const [, setLoading] = useState(false); const [f, setF] = useState({ platform: "facebook", externalId: "", displayName: "", username: "", accessToken: "", responseMode: "approval" });
  async function load() { setLoading(true); try { const e = await adminFetch<Acc[]>("/api/v1/admin/social/accounts"); setRows(e.data); } catch { toast.error("Failed to load accounts"); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function add(e: React.FormEvent) { e.preventDefault(); try { await adminFetch("/api/v1/admin/social/accounts", { method: "POST", body: JSON.stringify(f) }); toast.success("Account saved (token encrypted at rest)."); setF({ ...f, externalId: "", displayName: "", accessToken: "" }); load(); } catch (err) { toast.error(String(err)); } }
  async function act(a: Acc, body: object, msg: string) { try { await adminFetch(`/api/v1/admin/social/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify(body) }); toast.success(msg); load(); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="Connected Accounts" subtitle="Official APIs only. Tokens are AES-256-GCM encrypted server-side and never shown. Capabilities per platform are detected, not assumed." />
    <Card className="mb-6"><CardHeader><CardTitle>Connect account</CardTitle></CardHeader><CardContent><form onSubmit={add} className="grid md:grid-cols-3 gap-3">
      <Select value={f.platform} onValueChange={(v) => setF({ ...f, platform: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["facebook", "whatsapp", "instagram", "youtube", "linkedin", "tiktok"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
      <Input placeholder="External ID (Page ID / phone_number_id / IG user id)" value={f.externalId} onChange={(e) => setF({ ...f, externalId: e.target.value })} required />
      <Input placeholder="Display name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required />
      <Input placeholder="Username (optional)" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      <Input type="password" placeholder="Access token (stored encrypted)" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} />
      <Select value={f.responseMode} onValueChange={(v) => setF({ ...f, responseMode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual (AI drafts only)</SelectItem><SelectItem value="approval">Approval required</SelectItem><SelectItem value="controlled">Controlled automation</SelectItem></SelectContent></Select>
      <Button type="submit">Connect</Button></form>
      <p className="text-xs text-muted-foreground mt-3">WhatsApp publishing is unavailable (no feed API) and is shown as such. YouTube/LinkedIn/TikTok adapters are registered but not enabled until official API access is granted.</p></CardContent></Card>
    {rows.map((a) => <Card key={a.id} className="mb-3"><CardContent className="pt-4 flex flex-wrap items-center gap-3 text-sm"><strong>{a.displayName}</strong><Badge>{a.platform}</Badge><Badge variant="outline">{a.status}</Badge><span>token: {a.hasToken ? "stored" : "missing"}</span><span>mode: {a.responseMode}</span>{a.healthError ? <span className="text-destructive">{a.healthError}</span> : null}
      <span className="flex items-center gap-2 ml-auto">Auto <Switch checked={a.automationEnabled} onCheckedChange={(v) => act(a, { automationEnabled: v }, "Account automation updated")} /></span>
      <Button size="sm" variant="outline" onClick={() => act(a, { test: true }, "Health check done")}>Test</Button>
      <Button size="sm" variant="outline" onClick={() => act(a, { disconnect: true }, "Disconnected — automation stopped for this account")}>Disconnect</Button></CardContent></Card>)}
    {rows.length === 0 && <EmptyState message="No connected accounts." />}</div>);
}
