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

type C = { id: string; title: string; body: string; status: string; scheduledAt: string | null; language: string; targets: { id: string; status: string; error: string | null; account: { displayName: string; platform: string } }[] };
type Acc = { id: string; platform: string; displayName: string };
export default function ContentPage() {
  const [rows, setRows] = useState<C[]>([]); const [, setLoading] = useState(false); const [accs, setAccs] = useState<Acc[]>([]); const [f, setF] = useState({ title: "", body: "", scheduledAt: "", accountIds: [] as string[] });
  async function load() { setLoading(true); try { const [a, b] = await Promise.all([adminFetch<{ contents: C[] }>("/api/v1/admin/social/content"), adminFetch<Acc[]>("/api/v1/admin/social/accounts")]); setRows(a.data.contents); setAccs(b.data); } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function create(e: React.FormEvent) { e.preventDefault(); try { await adminFetch("/api/v1/admin/social/content", { method: "POST", body: JSON.stringify({ ...f, status: f.scheduledAt ? "scheduled" : "draft", scheduledAt: f.scheduledAt || null }) }); toast.success(f.scheduledAt ? "Scheduled — publishing switch + approval checked again at publish time (cron: /api/cron/social-publish)." : "Draft saved."); setF({ title: "", body: "", scheduledAt: "", accountIds: [] }); load(); } catch (err) { toast.error(String(err)); } }
  async function setStatus(c: C, status: string) { try { await adminFetch(`/api/v1/admin/social/content/${c.id}`, { method: "PATCH", body: JSON.stringify({ status, scheduledAt: c.scheduledAt }) }); toast.success(`Status → ${status}`); load(); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="Content Studio & Calendar" subtitle="Draft → review → approve → schedule → publish. Unapproved content is never published; publishing has its own switch, separate from auto-replies." />
  <Card className="mb-6"><CardHeader><CardTitle>New post</CardTitle></CardHeader><CardContent><form onSubmit={create} className="space-y-2"><Input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /><Textarea placeholder="Post copy (EN / BN / Banglish) — add #hashtags and a call to action" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required />
  <div className="flex gap-2 flex-wrap items-center"><Input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className="w-64" />
  {accs.map((a) => <label key={a.id} className="text-sm flex gap-1 items-center"><input type="checkbox" checked={f.accountIds.includes(a.id)} onChange={(e) => setF({ ...f, accountIds: e.target.checked ? [...f.accountIds, a.id] : f.accountIds.filter((x) => x !== a.id) })} />{a.displayName} ({a.platform})</label>)}
  <Button type="submit">{f.scheduledAt ? "Approve & schedule" : "Save draft"}</Button></div></form></CardContent></Card>
  {rows.map((c) => <Card key={c.id} className="mb-2"><CardContent className="pt-4"><div className="flex gap-2 flex-wrap text-sm"><strong>{c.title}</strong><Badge>{c.status}</Badge><span>{c.language}</span>{c.scheduledAt && <span>{fmtDate(c.scheduledAt)}</span>}{c.targets.map((t) => <Badge key={t.id} variant="outline">{t.account.displayName}: {t.status}{t.error ? ` (${t.error})` : ""}</Badge>)}</div><p className="text-sm text-muted-foreground mt-1">{c.body.slice(0, 220)}</p>
  <div className="flex gap-2 mt-2">{c.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus(c, "approved")}>Approve</Button>}{c.status === "approved" && <Button size="sm" variant="outline" onClick={() => setStatus(c, "scheduled")}>Schedule (needs date)</Button>}</div></CardContent></Card>)}
  {rows.length === 0 && <EmptyState message="No content yet. Create a draft above." />}</div>);
}
