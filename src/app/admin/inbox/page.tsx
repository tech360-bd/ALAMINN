"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Send, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string; channel: string; accountId: string; externalThreadId: string;
  contactId: string | null; subject: string | null; status: string; priority: string;
  assignedUserId: string | null; unreadCount: number; tags: string | string[];
  lastMessageAt: string;
};
type Message = {
  id: string; direction: string; kind: string; body: string; senderType: string;
  deliveryStatus: string; error: string | null; createdAt: string;
  attachments: { name: string; url: string; mimeType?: string; size?: number }[];
};

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: "", status: "", channel: "" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: Conversation; messages: Message[]; audit: { action: string; createdAt: string }[]; contact: { displayName: string; email: string | null } | null } | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filters.q) params.set("q", filters.q);
      if (filters.status) params.set("status", filters.status);
      if (filters.channel) params.set("channel", filters.channel);
      const env = await adminFetch<{ conversations: Conversation[]; total: number }>(`/api/v1/admin/inbox/conversations?${params}`);
      setConversations(env.data.conversations);
      setTotal(env.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load inbox.");
    }
  }, [page, filters]);

  const open = useCallback(async (id: string) => {
    setActiveId(id);
    setError(null);
    try {
      const env = await adminFetch<typeof detail>(`/api/v1/admin/inbox/conversations/${id}`);
      setDetail(env.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open conversation.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  async function patch(p: Record<string, unknown>) {
    if (!activeId) return;
    setBusy(true);
    try {
      await adminFetch(`/api/v1/admin/inbox/conversations/${activeId}`, { method: "PATCH", body: JSON.stringify(p) });
      await open(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update conversation.");
    } finally { setBusy(false); }
  }

  async function submit(kind: "reply" | "note") {
    if (!activeId) return;
    const body = (kind === "reply" ? reply : note).trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/api/v1/admin/inbox/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ kind, body, automated: false, idempotencyKey: `${activeId}:${Date.now()}` }),
      });
      if (kind === "reply") setReply(""); else setNote("");
      await open(activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save message.");
    } finally { setBusy(false); }
  }

  if (error && conversations.length === 0) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Cross-Channel Inbox" subtitle="One operator workspace for email, WhatsApp, Messenger, Instagram and website chat" />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_240px]">
        <Card className="h-[75vh] overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">Conversations <Badge variant="outline">{total}</Badge></CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={filters.q} onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }} placeholder="Search" className="w-full bg-transparent text-xs outline-none" />
            </div>
            <div className="flex gap-1.5">
              <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} className="flex-1 rounded-lg border bg-background px-1.5 py-1 text-[11px]" aria-label="Status filter">
                <option value="">All statuses</option>
                {["unread", "open", "pending", "resolved", "escalated", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.channel} onChange={(e) => { setFilters({ ...filters, channel: e.target.value }); setPage(1); }} className="flex-1 rounded-lg border bg-background px-1.5 py-1 text-[11px]" aria-label="Channel filter">
                <option value="">All channels</option>
                {["email", "whatsapp", "messenger", "instagram", "website_chat", "social"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            {conversations.length === 0 && <p className="text-xs text-muted-foreground">No conversations match these filters.</p>}
            {conversations.map((conversation) => {
              const tags = Array.isArray(conversation.tags) ? conversation.tags : [];
              return (
                <button key={conversation.id} type="button" onClick={() => void open(conversation.id)}
                  className={cn("block w-full rounded-lg border p-2 text-left", conversation.id === activeId ? "border-orange-400 bg-orange-50/60" : "border-transparent hover:bg-muted/50")}>
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Badge variant="outline">{conversation.channel}</Badge>
                    <span className="truncate">{conversation.subject || conversation.externalThreadId}</span>
                    {conversation.unreadCount > 0 && <Badge>{conversation.unreadCount}</Badge>}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{conversation.status} · {fmtDate(conversation.lastMessageAt)} {tags.join(", ")}</span>
                </button>
              );
            })}
            <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">← Previous</button>
              <span>Page {page}</span>
              <button type="button" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">Next →</button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-[75vh] flex-col">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">{detail?.conversation.subject || detail?.conversation.externalThreadId || "Select a conversation"}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-y-auto py-3">
            {!detail && <p className="text-sm text-muted-foreground">Select a conversation to view messages.</p>}
            {detail?.messages.map((message) => (
              <div key={message.id} className={cn("rounded-xl p-3 text-sm", message.direction === "internal_note" ? "bg-amber-50" : message.direction === "outbound" ? "bg-orange-50" : "bg-muted")}>
                <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {message.direction} · {message.senderType} · {message.deliveryStatus} · {fmtDate(message.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{message.body}</p>
                {message.error && <p className="mt-1 text-xs text-red-700">{message.error}</p>}
                {message.attachments?.length > 0 && (
                  <p className="mt-1 text-xs">Attachments: {message.attachments.map((item) => <a key={item.url} href={item.url} className="mr-2 underline">{item.name}</a>)}</p>
                )}
              </div>
            ))}
          </CardContent>
          <div className="space-y-2 border-t p-3">
            <div className="flex gap-2">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Reply (human operated)" className="flex-1 resize-none rounded-lg border bg-background px-2 py-1.5 text-sm" disabled={!activeId || busy} />
              <Button onClick={() => void submit("reply")} disabled={!activeId || !reply.trim() || busy} aria-label="Send reply"><Send className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-2">
              <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} className="max-w-[180px] text-[11px]" aria-label="Private attachment" />
              {attachment && activeId && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void (async () => { const form = new FormData(); form.set("file", attachment); form.set("conversationId", activeId); try { const response = await fetch("/api/v1/admin/inbox/attachments", { method: "POST", credentials: "include", body: form }); const payload = await response.json() as { success?: boolean; message?: string }; if (!response.ok || !payload.success) throw new Error(payload.message || `HTTP ${response.status}`); setAttachment(null); await open(activeId); } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } })(); }}>Attach</Button>}
            </div>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (never sent externally)" className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs" disabled={!activeId || busy} />
              <Button variant="outline" onClick={() => void submit("note")} disabled={!activeId || !note.trim() || busy} aria-label="Add internal note"><StickyNote className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>

        <Card className="h-[75vh] overflow-y-auto">
          <CardHeader className="pb-2"><CardTitle className="text-base">Conversation details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            {!detail ? <p className="text-muted-foreground">No conversation selected.</p> : (
              <>
                <div><p className="font-medium">Contact</p><p className="text-muted-foreground">{detail.contact?.displayName || "Unmatched"}{detail.contact?.email ? ` · ${detail.contact.email}` : ""}</p></div>
                <label className="block">Status
                  <select value={detail.conversation.status} disabled={busy} onChange={(e) => void patch({ status: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5">
                    {["unread", "open", "pending", "resolved", "escalated", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">Priority
                  <select value={detail.conversation.priority} disabled={busy} onChange={(e) => void patch({ priority: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5">
                    {["low", "normal", "high", "urgent"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void patch({ markRead: true })}>Mark read</Button>
                <div><p className="font-medium">Audit history</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {detail.audit.slice(0, 8).map((entry, i) => <li key={i}>{entry.action} · {fmtDate(entry.createdAt)}</li>)}
                  </ul>
                </div>
                {busy && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
