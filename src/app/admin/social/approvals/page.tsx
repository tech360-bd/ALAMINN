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

type Row = { id: string; status: string; createdAt: string; decision: { category: string; confidence: number; risk: string; draft: string | null; reason: string | null } | null; conversation: { participantName: string | null; platform: string; account: { displayName: string } } | null };
export default function ApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]); const [, setLoading] = useState(false); const [edits, setEdits] = useState<Record<string, string>>({});
  async function load() { setLoading(true); try { const e = await adminFetch<Row[]>("/api/v1/admin/social/approvals?status=pending"); setRows(e.data); } catch { /* keep last state */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(id: string, action: string) { try { const e = await adminFetch(`/api/v1/admin/social/approvals/${id}`, { method: "POST", body: JSON.stringify({ action, editedText: edits[id] }) }); toast.success(`${action} done`); load(); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="Approval Queue" subtitle="Low-confidence, high-risk, pricing and sensitive replies wait here. Nothing in this queue has been sent." />
  {rows.map((r) => <Card key={r.id} className="mb-3"><CardContent className="pt-4"><div className="flex gap-2 text-sm flex-wrap"><strong>{r.conversation?.participantName || "Customer"}</strong><Badge variant="outline">{r.conversation?.platform} · {r.conversation?.account.displayName}</Badge><Badge>{r.decision?.category}</Badge><span>confidence {Math.round((r.decision?.confidence || 0) * 100)}%</span><Badge variant="destructive">risk {r.decision?.risk}</Badge><span className="text-muted-foreground">{r.decision?.reason}</span></div>
  <Textarea className="mt-3" value={edits[r.id] ?? r.decision?.draft ?? ""} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} />
  <div className="flex gap-2 mt-2 flex-wrap"><Button size="sm" onClick={() => act(r.id, "approve")}>Approve & send</Button><Button size="sm" variant="outline" onClick={() => act(r.id, "approve")}>Edit & approve (uses text above)</Button><Button size="sm" variant="outline" onClick={() => act(r.id, "regenerate")}>Regenerate</Button><Button size="sm" variant="outline" onClick={() => act(r.id, "escalate")}>Escalate to Al-Amin</Button><Button size="sm" variant="destructive" onClick={() => act(r.id, "reject")}>Reject</Button></div></CardContent></Card>)}
  {rows.length === 0 && <EmptyState message="Approval queue is empty. Held replies will appear here." />}</div>);
}
