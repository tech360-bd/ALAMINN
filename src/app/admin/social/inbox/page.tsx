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

type Conv = { id: string; platform: string; participantName: string | null; participantId: string; status: string; priority: string; unreadCount: number; lastMessageAt: string; account: { displayName: string }; messages: { body: string }[] };
type Detail = { id: string; participantName: string | null; platform: string; messages: { id: string; direction: string; kind: string; body: string; deliveryStatus: string; createdAt: string }[]; decisions: { id: string; category: string; confidence: number; risk: string; decision: string; draft: string | null }[] };
export default function InboxPage() {
  const [rows, setRows] = useState<Conv[]>([]); const [, setLoading] = useState(false); const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [sel, setSel] = useState<Detail | null>(null); const [reply, setReply] = useState("");
  async function load() { setLoading(true); try { const p = new URLSearchParams(); if (q) p.set("q", q); if (status !== "all") p.set("status", status); const e = await adminFetch<Conv[]>(`/api/v1/admin/social/inbox?${p}`); setRows(e.data); } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function open(id: string) { const e = await adminFetch<Detail>(`/api/v1/admin/social/inbox/${id}`); setSel(e.data); }
  async function send() { if (!sel || !reply.trim()) return; try { const e = await adminFetch<{ status: string }>(`/api/v1/admin/social/inbox/${sel.id}`, { method: "POST", body: JSON.stringify({ text: reply }) }); toast.success(`Manual reply: ${e.data.status} (works regardless of automation switch)`); setReply(""); open(sel.id); load(); } catch (err) { toast.error(String(err)); } }
  return (<div className="p-6"><PageHeader title="Unified Inbox" subtitle="All accounts, one inbox. AI suggestions are labelled as drafts — only approved knowledge is treated as verified business fact." />
  <div className="flex gap-2 mb-4"><Input placeholder="Search name / id…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
  <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{["all", "unread", "pending", "resolved", "escalated"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
  <div className="grid lg:grid-cols-2 gap-4"><div>{rows.map((c) => <Card key={c.id} className="mb-2 cursor-pointer" ><CardContent className="pt-4" onClick={() => open(c.id)}><div className="flex justify-between text-sm"><strong>{c.participantName || c.participantId}</strong><Badge variant="outline">{c.platform} · {c.account.displayName}</Badge></div><p className="text-sm text-muted-foreground truncate">{c.messages[0]?.body || "—"}</p><p className="text-xs">{c.status} · {c.priority} · unread {c.unreadCount} · {fmtDate(c.lastMessageAt)}</p></CardContent></Card>)}{rows.length === 0 && <EmptyState message="No conversations yet. Inbound webhook events will appear here." />}</div>
  <div>{sel ? <Card><CardHeader><CardTitle>{sel.participantName || "Conversation"} — {sel.platform}</CardTitle></CardHeader><CardContent>
    {sel.decisions[0] && <p className="text-xs mb-3">Latest AI decision: <Badge>{sel.decisions[0].decision}</Badge> category {sel.decisions[0].category} · confidence {Math.round(sel.decisions[0].confidence * 100)}% · risk {sel.decisions[0].risk}{sel.decisions[0].draft ? ` · draft: “${sel.decisions[0].draft.slice(0, 160)}”` : ""}</p>}
    <div className="space-y-2 max-h-96 overflow-auto mb-3">{sel.messages.map((m) => <div key={m.id} className={`text-sm p-2 rounded ${m.direction === "outbound" ? "bg-primary/10 ml-8" : "bg-muted mr-8"}`}><p>{m.body}</p><p className="text-xs text-muted-foreground">{m.kind} · {m.deliveryStatus} · {fmtDate(m.createdAt)}</p></div>)}</div>
    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a manual reply (always allowed, even when automation is OFF)…" /><Button className="mt-2" onClick={send}>Send manual reply</Button>
  </CardContent></Card> : <EmptyState message="Select a conversation to read history, see the AI decision, and reply manually." />}</div></div></div>);
}
