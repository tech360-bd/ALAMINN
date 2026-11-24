"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive, Bot, Loader2, Pencil, Plus, Search, Send, Square, Trash2, User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch } from "@/components/admin/lib";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string;
  provider: string;
  model: string;
  archived: boolean;
  updatedAt: string;
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  error: string | null;
  createdAt: string;
};

export default function AiChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("auto");
  const [model, setModel] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async (q = "") => {
    try {
      const env = await adminFetch<{ conversations: Conversation[] }>(
        `/api/v1/admin/ai-chat/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`
      );
      setConversations(env.data.conversations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load conversations.");
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setStreaming("");
    setError(null);
    try {
      const env = await adminFetch<{ conversation: Conversation; messages: ChatMessage[] }>(
        `/api/v1/admin/ai-chat/conversations/${id}`
      );
      setMessages(env.data.messages);
      setProvider(env.data.conversation.provider || "auto");
      setModel(env.data.conversation.model || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load conversation.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadConversations(); });
    return () => { cancelled = true; };
  }, [loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function createConversation() {
    try {
      const env = await adminFetch<{ conversation: Conversation }>("/api/v1/admin/ai-chat/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "New conversation", provider, model }),
      });
      setConversations((current) => [env.data.conversation, ...current]);
      await openConversation(env.data.conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create conversation.");
    }
  }

  async function updateConversation(id: string, patch: { title?: string; archived?: boolean }) {
    try {
      await adminFetch(`/api/v1/admin/ai-chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadConversations(search);
      if (patch.archived && activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update conversation.");
    }
  }

  async function deleteConversation(id: string) {
    try {
      await adminFetch(`/api/v1/admin/ai-chat/conversations/${id}`, { method: "DELETE" });
      if (activeId === id) { setActiveId(null); setMessages([]); }
      await loadConversations(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete conversation.");
    }
  }

  async function sendMessage() {
    if (!activeId || !input.trim() || busy) return;
    const content = input.trim();
    setInput("");
    setBusy(true);
    setStreaming("");
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [...current, {
      id: `local-${Date.now()}`, role: "user", content, provider: null, model: null, error: null,
      createdAt: new Date().toISOString(),
    }]);

    try {
      const res = await fetch(`/api/v1/admin/ai-chat/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ content, provider, model }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
          const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(7).trim();
          let payload: Record<string, unknown> = {};
          try { payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>; } catch { continue; }
          if (event === "delta") setStreaming((current) => current + String(payload.text ?? ""));
          if (event === "error") setError(String(payload.message ?? "Generation failed."));
          if (event === "done") { completed = true; setStreaming(String(payload.content ?? "")); }
        }
      }
      if (completed || streaming === "") {
        // The server persists the message; refresh from source of truth.
        await openConversation(activeId);
      } else {
        await openConversation(activeId);
      }
      setStreaming("");
      await loadConversations(search);
    } catch (e) {
      if (controller.signal.aborted) {
        await openConversation(activeId);
        setStreaming("");
      } else {
        setError(e instanceof Error ? e.message : "Unable to generate a response.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  if (error && conversations.length === 0) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="AI Chat" subtitle="Persistent, private conversations through the provider gateway" />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-[70vh]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Conversations
              <Button size="sm" variant="outline" onClick={() => void createConversation()} aria-label="New conversation">
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); void loadConversations(e.target.value); }}
                placeholder="Search conversations"
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
            {conversations.length === 0 && <p className="text-xs text-muted-foreground">No conversations yet.</p>}
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn("rounded-lg border p-2", conversation.id === activeId ? "border-orange-400 bg-orange-50/60" : "border-transparent hover:bg-muted/50")}
              >
                <button type="button" onClick={() => void openConversation(conversation.id)} className="block w-full truncate text-left text-xs font-medium">
                  {conversation.title}
                </button>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="truncate">{conversation.provider}</span>
                  <button type="button" onClick={() => void updateConversation(conversation.id, { archived: true })} aria-label="Archive" className="ml-auto hover:text-foreground"><Archive className="h-3 w-3" /></button>
                  <button type="button" onClick={() => {
                    const title = window.prompt("Rename conversation", conversation.title);
                    if (title?.trim()) void updateConversation(conversation.id, { title: title.trim() });
                  }} aria-label="Rename" className="hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                  <button type="button" onClick={() => void deleteConversation(conversation.id)} aria-label="Delete" className="hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="flex h-[70vh] flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b pb-3">
            <CardTitle className="text-base">{conversations.find((c) => c.id === activeId)?.title || "Select a conversation"}</CardTitle>
            <div className="flex items-center gap-2">
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-lg border bg-background px-2 py-1 text-xs" aria-label="Provider">
                <option value="auto">auto</option>
                {["unorouter", "groq", "openrouter", "gemini", "ollama"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model (optional)" className="w-32 rounded-lg border bg-background px-2 py-1 text-xs" aria-label="Model" />
            </div>
          </CardHeader>
          <CardContent ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-4">
            {!activeId && <p className="text-sm text-muted-foreground">Create or select a conversation to begin.</p>}
            {messages.map((message) => (
              <div key={message.id} className={cn("flex gap-2 text-sm", message.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2", message.role === "user" ? "bg-orange-100 text-orange-950" : "bg-muted", message.error && "bg-red-50 text-red-800")}>
                  <span className="mb-1 block text-[10px] uppercase tracking-wide opacity-70">{message.role === "user" ? <User className="inline h-3 w-3" /> : <Bot className="inline h-3 w-3" />} {message.provider || message.error || "local"}</span>
                  {message.content || (message.error ? `Error: ${message.error}` : "")}
                </div>
              </div>
            ))}
            {streaming && <div className="whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm">{streaming}</div>}
            {busy && !streaming && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for provider…</p>}
          </CardContent>
          <div className="border-t p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                placeholder="Ask a question…"
                rows={2}
                className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                disabled={!activeId || busy}
              />
              {busy ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop generation"><Square className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={() => void sendMessage()} disabled={!activeId || !input.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
