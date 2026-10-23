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

type Rule = { id: string; name: string; accountId: string | null; category: string | null; action: string; minConfidence: number; enabled: boolean };
type State = { engagementEnabled: boolean; publishingEnabled: boolean; generationEnabled: boolean; version: number; changedByName: string | null; updatedAt: string };
export default function RulesPage() {
  const [rows, setRows] = useState<Rule[]>([]); const [, setLoading] = useState(false); const [st, setSt] = useState<State | null>(null); const [f, setF] = useState({ name: "", category: "", action: "approval", minConfidence: "0.85" });
  async function load() { setLoading(true); try { const [a, b] = await Promise.all([adminFetch<Rule[]>("/api/v1/admin/social/rules"), adminFetch<State>("/api/v1/admin/social/automation")]); setRows(a.data); setSt(b.data); } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveSwitch(k: string, v: boolean) { try { const e = await adminFetch<State>("/api/v1/admin/social/automation", { method: "PUT", body: JSON.stringify({ [k]: v }) }); setSt(e.data); toast.success("Saved — enforced server-side immediately."); } catch (err) { toast.error("Requires social.automation.manage (OWNER/SUPER_ADMIN)."); } }
  async function add(e: React.FormEvent) { e.preventDefault(); try { await adminFetch("/api/v1/admin/social/rules", { method: "POST", body: JSON.stringify({ ...f, minConfidence: Number(f.minConfidence) }) }); toast.success("Rule saved"); load(); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="Automation Rules & Switches" subtitle="Engagement, publishing and generation are separate controls. Turning engagement OFF suppresses queued unsent replies; delivered messages cannot be recalled." />
  {st && <Card className="mb-6"><CardContent className="pt-6 space-y-3 text-sm">
    <div className="flex justify-between"><span>Global auto-reply (engagement)</span><Switch checked={st.engagementEnabled} onCheckedChange={(v) => saveSwitch("engagementEnabled", v)} /></div>
    <div className="flex justify-between"><span>Scheduled publishing</span><Switch checked={st.publishingEnabled} onCheckedChange={(v) => saveSwitch("publishingEnabled", v)} /></div>
    <div className="flex justify-between"><span>AI content generation</span><Switch checked={st.generationEnabled} onCheckedChange={(v) => saveSwitch("generationEnabled", v)} /></div>
    <p className="text-muted-foreground">Version {st.version} · last changed by {st.changedByName || "—"} · {fmtDate(st.updatedAt)}. If state cannot be verified, the backend defaults to no automated send.</p></CardContent></Card>}
  <Card className="mb-6"><CardHeader><CardTitle>New rule</CardTitle></CardHeader><CardContent><form onSubmit={add} className="flex gap-2 flex-wrap"><Input placeholder="Rule name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /><Input placeholder="Category (blank = any)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /><Select value={f.action} onValueChange={(v) => setF({ ...f, action: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{["auto_reply", "approval", "escalate", "ignore"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select><Input placeholder="Min confidence 0-1" value={f.minConfidence} onChange={(e) => setF({ ...f, minConfidence: e.target.value })} /><Button type="submit">Save rule</Button></form></CardContent></Card>
  {rows.map((r) => <div key={r.id} className="flex gap-3 border-b py-2 text-sm"><strong>{r.name}</strong><span>{r.category || "any category"}</span><Badge>{r.action}</Badge><span>min confidence {r.minConfidence}</span><Badge variant={r.enabled ? "default" : "secondary"}>{r.enabled ? "enabled" : "disabled"}</Badge></div>)}
  {rows.length === 0 && <EmptyState message="No rules yet. Default: approval mode, high-risk categories always escalate." />}</div>);
}
