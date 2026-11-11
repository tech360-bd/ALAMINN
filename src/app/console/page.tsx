'use client';

/**
 * AGENT CONSOLE — the human agent workspace for the Universal Messaging
 * Channel (AgentConsole adapter surface, builtin-socket provider).
 *
 * Identity rules: tenant and agent identities are selected at runtime from
 * what the service reports — nothing here is hard-coded to any tenant,
 * brand, project or domain.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

const API = '/api/umc';
const QS = 'XTransformPort=3010';

type Tenant = { id: string; name: string; slug: string; timezone: string; messagingStart: number; messagingEnd: number; languages: string; aiAutoReply: boolean };
type User = { id: string; displayName: string; role: string; locale: string; isBanned: boolean; isVerifiedBusiness: boolean; lastSeenAt?: string | null; externalRef?: string | null };
type Tag = { id: string; label: string };
type Participant = { userId: string; role: string; user: User };
type Conversation = {
  id: string; type: string; title?: string | null; mode: string; visibility: string;
  aiMode: boolean; status: string; unread: number; handoffTrigger?: string | null;
  participants: Participant[]; tags: Tag[];
};
type MessagePayload = {
  question?: string;
  options?: { text: string; votes: string[] }[];
  kind?: string;
  dataUrl?: string;
  name?: string;
  size?: number;
  text?: string;
  lang?: string;
  [key: string]: unknown;
};
type Message = {
  id: string; conversationId: string; senderId?: string | null; type: string; body: string;
  payload?: MessagePayload; mentions: string[]; sentAt?: string | null; scheduledFor?: string | null;
  expiresAt?: string | null; createdAt: string;
  sender?: { id: string; displayName: string; role: string; isVerifiedBusiness: boolean } | null;
  starredBy?: string[]; receipts?: { userId: string; deliveredAt: string | null; readAt: string | null }[];
  translation?: { text: string; lang: string };
};
type Compliance = {
  localHourNow?: number;
  tenant?: { messagingStart: number; messagingEnd: number; timezone: string; languages: string; aiAutoReply: boolean } | null;
  users?: { id: string; displayName: string; role: string; isBanned: boolean; lastSeenAt?: string | null }[];
  reports?: { id: string; status: string; reason: string }[];
  suppressions?: { id: string; channel: string; value: string; reason?: string | null }[];
  consents?: { id: string; channel: string; subjectRef: string; purpose?: string | null; grantedAt?: string | null; revokedAt?: string | null }[];
  moderationWords?: { id: string; word: string; severity?: string }[];
  auditEvents?: { id: string; actor: string; action: string; at?: string; createdAt?: string; type?: string; detail?: string }[];
};
type SocketAuthError = { reason?: string };
type SocketNotify = { title?: string; body?: string };
type SocketHandoff = { trigger?: string };
type Handoff = { id: string; conversationId: string; trigger: string; status: string; detail?: string | null; createdAt: string; conversation?: { title?: string | null; type: string } };
type Notification = { id: number; title: string; body: string };

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${path}${sep}${QS}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

const QUICK_EMOJIS = ['👍', '🙏', '✅', '😊', '🙂', '❤️', '📞', '⏰', '💰', '🔔'];

export default function AgentConsole() {
  // identity (runtime-selected; never hard-coded)
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [agentId, setAgentId] = useState<string>('');

  // data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [compliance, setCompliance] = useState<Compliance | null>(null);

  // composer state
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>('');
  const [ttl, setTtl] = useState<string>('off');
  const [starredOnly, setStarredOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [aiThinking, setAiThinking] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);

  // dialogs
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState('Option A\nOption B');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState('');
  const [newConvType, setNewConvType] = useState('direct');
  const [newConvMembers, setNewConvMembers] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const noteId = useRef(0);

  const _agent = users.find((u) => u.id === agentId) || null;
  const current = conversations.find((c) => c.id === activeConv) || null;

  const notify = useCallback((title: string, body: string) => {
    noteId.current += 1;
    const n = { id: noteId.current, title, body };
    setNotifications((prev) => [...prev.slice(-3), n]);
    setTimeout(() => setNotifications((prev) => prev.filter((x) => x.id !== n.id)), 6000);
  }, []);

  // ── boot: tenants + socket ──
  useEffect(() => {
    api<{ tenants: Tenant[] }>('GET', '/tenants').then((r) => {
      setTenants(r.tenants);
      if (r.tenants[0]) setTenantId(r.tenants[0].id);
    }).catch((e) => setError(String(e.message)));

    // Realtime endpoint: NEXT_PUBLIC_UMC_SOCKET_URL (direct to the messaging
    // service) when set; otherwise same-origin through the gateway
    // (XTransformPort query → reverse proxy), matching the deployment rules.
    const socketBase = process.env.NEXT_PUBLIC_UMC_SOCKET_URL ?? '';
    const s = io(socketBase ? `${socketBase}/` : `/?${QS}`, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('auth:ok', () => {});
    s.on('auth:error', (p: SocketAuthError) => setError(`Socket auth failed: ${p?.reason}`));
    s.on('notify', (p: SocketNotify) => notify(p.title ?? 'Notification', p.body ?? ''));
    s.on('handoff:new', (p: SocketHandoff) => notify('Human handoff requested', `Trigger: ${p.trigger}`));
    return () => { s.disconnect(); };
  }, [notify]);

  // ── tenant switch: users + auth socket ──
  useEffect(() => {
    if (!tenantId) return;
    api<{ users: User[] }>('GET', `/tenants/${tenantId}/users`).then((r) => {
      setUsers(r.users);
      const staff = r.users.find((u) => (u.role === 'agent' || u.role === 'admin') && !u.isBanned);
      if (staff) setAgentId(staff.id);
    }).catch((e) => setError(String(e.message)));
    api<Compliance>('GET', `/tenants/${tenantId}/compliance`).then(setCompliance).catch(() => {});
    api<{ handoffs: Handoff[] }>('GET', `/tenants/${tenantId}/handoffs`).then((r) => setHandoffs(r.handoffs)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    if (socketRef.current && agentId) socketRef.current.emit('auth', { userId: agentId });
  }, [agentId]);

  // ── conversations loader ──
  const loadConversations = useCallback(() => {
    if (!tenantId || !agentId) return;
    api<{ conversations: Conversation[] }>('GET', `/tenants/${tenantId}/conversations?userId=${agentId}`)
      .then((r) => setConversations(r.conversations))
      .catch(() => {});
  }, [tenantId, agentId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const refreshThread = useCallback(() => {
    if (!activeConv) return;
    const q = starredOnly && agentId ? `starredBy=${agentId}` : search ? `search=${encodeURIComponent(search)}` : '';
    api<{ messages: Message[] }>('GET', `/conversations/${activeConv}/messages${q ? `?${q}` : ''}`)
      .then((r) => setMessages(r.messages))
      .catch((e) => setError(String(e.message)));
  }, [activeConv, starredOnly, search, agentId]);

  useEffect(() => { refreshThread(); }, [refreshThread]);

  // ── realtime events ──
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    const onMessageNew = (m: Message) => {
      if (m.conversationId === activeConv) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        api('POST', `/conversations/${m.conversationId}/read`, { tenantId, userId: agentId, upToMessageId: m.id }).catch(() => {});
        if (m.sender?.role === 'customer') {
          setAiThinking(true);
          setTimeout(() => setAiThinking(false), 9000);
        }
      }
      loadConversations();
    };
    const onTyping = (p: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (p.userId === agentId) return;
      setTypingUsers((prev) => ({ ...prev, [p.userId]: p.isTyping }));
    };
    const onHandoffUpdate = () => {
      api<{ handoffs: Handoff[] }>('GET', `/tenants/${tenantId}/handoffs`).then((r) => setHandoffs(r.handoffs)).catch(() => {});
      loadConversations();
    };
    const onExpired = (p: { conversationId: string }) => {
      if (p.conversationId === activeConv) setMessages((prev) => prev);
      refreshThread();
    };
    s.on('message:new', onMessageNew);
    s.on('typing', onTyping);
    s.on('handoff:update', onHandoffUpdate);
    s.on('conversation:burnout', () => { loadConversations(); refreshThread(); });
    s.on('message:expired', onExpired);
    return () => {
      s.off('message:new', onMessageNew);
      s.off('typing', onTyping);
      s.off('handoff:update', onHandoffUpdate);
    };
  }, [activeConv, agentId, tenantId, loadConversations, notify, refreshThread]);

  // ── thread loader ──
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const openConversation = (c: Conversation) => {
    setActiveConv(c.id);
    setStarredOnly(false);
    setSearch('');
    socketRef.current?.emit('conversation:join', { conversationId: c.id });
  };

  // ── send ──
  const doSend = async (extra: Record<string, unknown> = {}) => {
    if (!current || !agentId || (!draft.trim() && !Object.keys(extra).length)) return;
    setSending(true);
    setError('');
    try {
      await api('POST', `/conversations/${current.id}/messages`, {
        tenantId, senderId: agentId, body: draft.trim(), ...extra,
      });
      setDraft('');
      setTtl('off');
      refreshThread();
      loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    if (current && socketRef.current) {
      socketRef.current.emit('typing', { conversationId: current.id, isTyping: true });
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        socketRef.current?.emit('typing', { conversationId: current.id, isTyping: false });
      }, 1500);
    }
  };

  // ── message actions ──
  const starMessage = async (m: Message) => {
    if (m.starredBy?.includes(agentId)) {
      await fetch(`${API}/messages/${m.id}/star?${QS}&userId=${agentId}`, { method: 'DELETE' });
    } else {
      await api('POST', `/messages/${m.id}/star`, { userId: agentId, tenantId });
    }
    refreshThread();
  };

  const translateMessage = async (m: Message, target: string) => {
    try {
      const r = await api<{ translation: { text: string; lang: string } }>('POST', `/messages/${m.id}/translate`, { target });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, translation: r.translation } as Message : x)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const votePoll = async (m: Message, optionIndex: number) => {
    await api('POST', `/messages/${m.id}/vote`, { userId: agentId, optionIndex });
    refreshThread();
  };

  // ── handoff actions ──
  const raiseHandoff = async () => {
    if (!current) return;
    await api('POST', `/conversations/${current.id}/handoff`, { tenantId, trigger: 'manual', detail: 'Raised from agent console' });
    notify('Handoff raised', 'Conversation flagged for human takeover');
    loadConversations();
  };
  const claimHandoff = async (h: Handoff) => {
    await api('POST', `/handoffs/${h.id}/claim`, { agentId });
    api<{ handoffs: Handoff[] }>('GET', `/tenants/${tenantId}/handoffs`).then((r) => setHandoffs(r.handoffs));
    loadConversations();
  };
  const resolveHandoff = async (h: Handoff) => {
    await api('POST', `/handoffs/${h.id}/resolve`, {});
    api<{ handoffs: Handoff[] }>('GET', `/tenants/${tenantId}/handoffs`).then((r) => setHandoffs(r.handoffs));
    loadConversations();
  };

  // ── compliance actions ──
  const reloadCompliance = () => api<Compliance>('GET', `/tenants/${tenantId}/compliance`).then(setCompliance);
  const updateTenantHours = async (start: number, end: number) => {
    await api('PATCH', `/tenants/${tenantId}`, { messagingStart: start, messagingEnd: end });
    reloadCompliance();
    api<{ tenants: Tenant[] }>('GET', '/tenants').then((r) => setTenants(r.tenants));
    notify('Compliance updated', `Messaging window ${start}:00–${end}:00 (${tenants.find((t) => t.id === tenantId)?.timezone ?? ''})`);
  };

  const statusBadge = (c: Conversation) => {
    if (c.status === 'needs_human') return <Badge className="bg-amber-500/90 text-black">needs human</Badge>;
    if (c.status === 'closed') return <Badge variant="secondary">closed</Badge>;
    return <Badge className="bg-emerald-600/80">active</Badge>;
  };

  const typingNames = useMemo(() => {
    if (!current) return [];
    return current.participants.filter((p) => typingUsers[p.userId]).map((p) => p.user.displayName);
  }, [current, typingUsers]);

  const mark = (m: Message) => {
    if (m.senderId !== agentId) return null;
    const others = (m.receipts ?? []).filter((r) => r.userId !== agentId);
    if (others.length > 0 && others.every((r) => r.readAt)) return <span className="text-sky-500">✓✓</span>;
    if (others.length > 0 && others.some((r) => r.deliveredAt)) return <span className="text-muted-foreground">✓✓</span>;
    return <span className="text-muted-foreground">✓</span>;
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold">U</div>
          <div>
            <div className="text-sm font-semibold leading-tight">Universal Messaging Channel — Agent Console</div>
            <div className="text-[11px] text-zinc-400">
              {tenants.find((t) => t.id === tenantId)?.name ?? '—'} · {tenants.find((t) => t.id === tenantId)?.timezone ?? ''} ·{' '}
              <span className={connected ? 'text-emerald-400' : 'text-red-400'}>{connected ? 'realtime connected' : 'connecting…'}</span>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setActiveConv(''); }}>
            <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700"><SelectValue placeholder="Tenant" /></SelectTrigger>
            <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700"><SelectValue placeholder="Signed in as" /></SelectTrigger>
            <SelectContent>
              {users.filter((u) => u.role === 'agent' || u.role === 'admin').map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.displayName} ({u.role})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/70 text-red-200 text-sm px-4 py-2 border-b border-red-900 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} className="text-xs underline">dismiss</button>
        </div>
      )}

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 flex flex-col">
        <Tabs defaultValue="conversations" className="flex-1 flex flex-col">
          <TabsList className="bg-zinc-900 border border-zinc-800 w-fit">
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="handoffs">Handoffs {handoffs.some((h) => h.status === 'open') && <span className="ml-1 h-2 w-2 rounded-full bg-amber-400 inline-block" />}</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          {/* ──────────────── CONVERSATIONS TAB ──────────────── */}
          <TabsContent value="conversations" className="flex-1 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_260px] gap-3 h-full">
              {/* left: list */}
              <Card className="bg-zinc-900/60 border-zinc-800 flex flex-col max-h-[72vh]">
                <CardHeader className="py-3 px-3 flex-row items-center justify-between">
                  <CardTitle className="text-sm">Conversations</CardTitle>
                  <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
                    <DialogTrigger asChild><Button size="sm" variant="secondary">+ New</Button></DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-zinc-700">
                      <DialogHeader><DialogTitle>New conversation</DialogTitle></DialogHeader>
                      <Select value={newConvType} onValueChange={setNewConvType}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="group">Group</SelectItem>
                          <SelectItem value="channel">Public channel (one-way)</SelectItem>
                        </SelectContent>
                      </Select>
                      {newConvType !== 'direct' && (
                        <Input placeholder="Title" value={newConvTitle} onChange={(e) => setNewConvTitle(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                      )}
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {users.filter((u) => u.id !== agentId && u.role === 'customer').map((u) => (
                          <label key={u.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={newConvMembers.includes(u.id)} onChange={(e) => setNewConvMembers((p) => e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id))} />
                            {u.displayName}
                          </label>
                        ))}
                      </div>
                      <DialogFooter>
                        <Button onClick={async () => {
                          const memberIds = newConvType === 'direct' ? [newConvMembers[0], agentId] : [...newConvMembers, agentId];
                          const r = await api<{ conversation: Conversation }>('POST', `/tenants/${tenantId}/conversations`, {
                            type: newConvType, title: newConvTitle || undefined,
                            mode: newConvType === 'channel' ? 'one_way' : 'two_way',
                            visibility: newConvType === 'channel' ? 'public' : 'private',
                            memberIds: memberIds.filter(Boolean), aiMode: false,
                          });
                          setNewConvOpen(false); setNewConvMembers([]); setNewConvTitle('');
                          loadConversations(); openConversation(r.conversation);
                        }}>Create</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="p-2 flex-1 overflow-y-auto">
                  {conversations.length === 0 && <p className="text-xs text-zinc-500 p-2">No conversations yet.</p>}
                  {conversations.map((c) => {
                    const other = c.participants.find((p) => p.userId !== agentId)?.user;
                    const label = c.type === 'direct' ? (other?.displayName ?? 'Direct') : (c.title ?? c.type);
                    return (
                      <button key={c.id} onClick={() => openConversation(c)}
                        className={`w-full text-left px-3 py-2 rounded-lg mb-1 border ${activeConv === c.id ? 'bg-zinc-800 border-zinc-600' : 'border-transparent hover:bg-zinc-800/60'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate flex-1">{label}</span>
                          {c.unread > 0 && <Badge className="bg-emerald-600 text-xs">{c.unread}</Badge>}
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {statusBadge(c)}
                          {c.type !== 'direct' && <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">{c.type}</Badge>}
                          {c.type === 'channel' && <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">{c.mode}</Badge>}
                          {c.tags.map((t) => <Badge key={t.id} variant="outline" className="text-[10px] border-emerald-700 text-emerald-400">{t.label}</Badge>)}
                          {c.handoffTrigger && <Badge className="text-[10px] bg-amber-500 text-black">⚑ {c.handoffTrigger.replace('_', ' ')}</Badge>}
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {/* center: thread */}
              <Card className="bg-zinc-900/60 border-zinc-800 flex flex-col max-h-[72vh]">
                <CardHeader className="py-3 px-3 flex-row items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{current ? (current.type === 'direct' ? (current.participants.find((p) => p.userId !== agentId)?.user.displayName ?? 'Direct') : (current.title ?? current.type)) : 'Select a conversation'}</CardTitle>
                    {current?.status === 'needs_human' && <Badge className="bg-amber-500 text-black">needs human</Badge>}
                    {current?.handoffTrigger && <Badge variant="outline" className="border-amber-600 text-amber-400 text-[10px]">{current.handoffTrigger.replace('_', ' ')}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {current && (
                      <>
                        <label className="flex items-center gap-1 text-xs text-zinc-400">AI <Switch checked={current.aiMode} onCheckedChange={async (v) => { await api('PATCH', `/conversations/${current.id}`, { aiMode: v }); loadConversations(); }} /></label>
                        <Button size="sm" variant="outline" className="h-7 border-zinc-700" onClick={raiseHandoff}>⚑ Handoff</Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                  <div className="px-3 pb-2 flex gap-2 flex-wrap items-center">
                    <Input placeholder="Search exact words…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 flex-1 bg-zinc-900 border-zinc-700" />
                    <Button size="sm" variant={starredOnly ? 'default' : 'outline'} className={`h-8 ${starredOnly ? 'bg-amber-500 text-black' : 'border-zinc-700'}`} onClick={() => setStarredOnly((v) => !v)}>★ Starred</Button>
                  </div>
                  <ScrollArea className="flex-1 px-3 pb-2 min-h-0">
                    <div className="space-y-2">
                      {messages.map((m) => {
                        const mine = m.senderId === agentId;
                        const _isStaff = m.sender?.role === 'agent' || m.sender?.role === 'admin';
                        return (
                          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm border ${mine ? 'bg-emerald-900/40 border-emerald-800' : m.sender?.role === 'ai' ? 'bg-violet-950/50 border-violet-800' : 'bg-zinc-800/70 border-zinc-700'}`}>
                              <div className="flex items-center gap-1 text-[11px] mb-1">
                                <span className="font-semibold">{m.sender?.displayName ?? 'System'}</span>
                                {m.sender?.role === 'ai' && <Badge className="text-[9px] bg-violet-700">AI</Badge>}
                                {m.sender?.isVerifiedBusiness && <Badge variant="outline" className="text-[9px] border-emerald-600 text-emerald-400">verified</Badge>}
                                {m.type === 'admin' && <Badge className="text-[9px] bg-amber-500 text-black">admin</Badge>}
                                {m.type === 'attachment' && <Badge variant="outline" className="text-[9px] border-zinc-600">attachment</Badge>}
                                {m.scheduledFor && <Badge variant="outline" className="text-[9px] border-sky-700 text-sky-400">scheduled</Badge>}
                                {m.expiresAt && <Badge variant="outline" className="text-[9px] border-red-700 text-red-400">disappearing</Badge>}
                              </div>
                              {m.type === 'poll' && m.payload?.options ? (
                                <div className="space-y-1">
                                  <p className="font-medium">{m.payload?.question}</p>
                                  {m.payload?.options?.map((o, i) => (
                                    <button key={i} onClick={() => votePoll(m, i)} className="block w-full text-left px-2 py-1 rounded border border-zinc-600 hover:bg-zinc-700 text-xs">
                                      {o.text} — {o.votes.length} vote(s)
                                    </button>
                                  ))}
                                </div>
                              ) : m.type === 'attachment' && m.payload?.kind === 'image' && m.payload?.dataUrl ? (
                                <figure><img src={m.payload.dataUrl} alt={m.payload.name ?? 'image'} className="rounded-lg max-h-48" /><figcaption className="text-[10px] text-zinc-400 mt-1">{m.payload.name}</figcaption></figure>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              )}
                              {m.payload?.kind === 'file' && (
                                <div className="text-xs text-zinc-300 border border-zinc-600 rounded px-2 py-1 mt-1">📄 {m.payload.name} <span className="text-zinc-500">({m.payload.size ?? '?'} bytes)</span></div>
                              )}
                              {m.translation && (
                                <div className="mt-1 border-t border-zinc-700 pt-1 text-xs text-emerald-300">🌐 {m.translation.text}</div>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                                <span>{new Date(m.sentAt ?? m.createdAt).toLocaleTimeString()}</span>
                                {mark(m)}
                                <button className="hover:text-amber-400" onClick={() => starMessage(m)}>{m.starredBy?.includes(agentId) ? '★' : '☆'}</button>
                                <button className="hover:text-emerald-400" onClick={() => translateMessage(m, m.body && /[\u0980-\u09FF]/.test(m.body) ? 'en' : 'bn')}>🌐</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {aiThinking && <div className="text-xs text-violet-300 pl-2">AI Assistant is composing…</div>}
                      {typingNames.length > 0 && <div className="text-xs text-zinc-400 pl-2">{typingNames.join(', ')} typing…</div>}
                      <div ref={bottomRef} />
                    </div>
                  </ScrollArea>
                  <Separator className="bg-zinc-800" />
                  {current && (
                    <div className="p-3 space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        {QUICK_EMOJIS.map((e) => (
                          <button key={e} className="text-lg hover:scale-110 transition" onClick={() => onDraftChange(draft + e)}>{e}</button>
                        ))}
                        {current.participants.filter((p) => p.userId !== agentId).map((p) => (
                          <button key={p.userId} className="text-xs border border-zinc-700 rounded-full px-2 hover:bg-zinc-800" onClick={() => onDraftChange(draft + `@${p.user.displayName} `)}>@{p.user.displayName.split(' ')[0]}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Textarea rows={2} value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder="Type a message… (@mention, emoji, or send with options)" className="bg-zinc-900 border-zinc-700 text-sm" />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" disabled={sending || !draft.trim()} onClick={() => doSend()} className="bg-emerald-600 hover:bg-emerald-500">Send</Button>
                          <Select value={ttl} onValueChange={setTtl}>
                            <SelectTrigger className="h-8 w-24 text-xs bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="off">Keep</SelectItem>
                              <SelectItem value="60">Disappear 1m</SelectItem>
                              <SelectItem value="3600">Disappear 1h</SelectItem>
                              <SelectItem value="86400">Disappear 24h</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap text-xs">
                        <Button size="sm" variant="outline" className="h-7 border-zinc-700" onClick={() => setPollOpen(true)}>📊 Poll</Button>
                        <Button size="sm" variant="outline" className="h-7 border-zinc-700" onClick={() => setScheduleOpen(true)}>⏰ Schedule</Button>
                        <label className="flex items-center gap-1 border border-zinc-700 rounded px-2 h-7 cursor-pointer hover:bg-zinc-800">
                          📎 <input type="file" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > 1_400_000) { setError('Attachment too large for this deployment (max ~1.4MB)'); return; }
                            const reader = new FileReader();
                            reader.onload = () => doSend({ type: 'attachment', body: f.name, payload: { kind: f.type.startsWith('image/') ? 'image' : 'file', name: f.name, size: f.size, dataUrl: reader.result } });
                            reader.readAsDataURL(f);
                          }} />
                        </label>
                        {current.type === 'channel' && current.mode === 'one_way' && (
                          <Button size="sm" variant="outline" className="h-7 border-amber-700 text-amber-400" onClick={() => doSend({ type: 'admin' })}>📣 Send as admin</Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* right: info + compliance quick view */}
              <div className="space-y-3">
                {current && (
                  <Card className="bg-zinc-900/60 border-zinc-800">
                    <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Participants</CardTitle></CardHeader>
                    <CardContent className="px-3 pb-3 space-y-1 text-xs">
                      {current.participants.map((p) => (
                        <div key={p.userId} className="flex items-center gap-2">
                          <span className="flex-1 truncate">{p.user.displayName}</span>
                          <Badge variant="outline" className="text-[9px] border-zinc-600">{p.user.role}</Badge>
                          {p.user.isBanned && <Badge className="text-[9px] bg-red-800">banned</Badge>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                <Card className="bg-zinc-900/60 border-zinc-800">
                  <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Compliance quick view</CardTitle></CardHeader>
                  <CardContent className="px-3 pb-3 text-xs text-zinc-300 space-y-1">
                    <p>Messaging window: <b>{compliance?.tenant?.messagingStart}:00 – {compliance?.tenant?.messagingEnd}:00</b> ({compliance?.tenant?.timezone})</p>
                    <p>Local hour now: <b>{compliance?.localHourNow ?? '—'}</b></p>
                    <p>Suppressions: <b>{compliance?.suppressions?.length ?? 0}</b> · Consents: <b>{compliance?.consents?.length ?? 0}</b></p>
                    <p>Moderation terms: <b>{compliance?.moderationWords?.length ?? 0}</b> · Open reports: <b>{compliance?.reports?.filter((r) => r.status === 'open').length ?? 0}</b></p>
                    <p className="text-zinc-500">Telephony: no transport configured — dial attempts are refused, never simulated.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ──────────────── HANDOFFS TAB ──────────────── */}
          <TabsContent value="handoffs" className="mt-3">
            <Card className="bg-zinc-900/60 border-zinc-800 max-h-[70vh] overflow-y-auto">
              <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Human handoffs</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {handoffs.length === 0 && <p className="text-xs text-zinc-500">No handoff events.</p>}
                {handoffs.map((h) => (
                  <div key={h.id} className="border border-zinc-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
                    <Badge className={h.status === 'open' ? 'bg-amber-500 text-black' : h.status === 'claimed' ? 'bg-sky-700' : 'bg-emerald-700'}>{h.status}</Badge>
                    <span className="text-xs font-medium">{h.trigger.replace('_', ' ')}</span>
                    <span className="text-xs text-zinc-400 flex-1 truncate">{h.conversation?.title ?? h.conversationId} — {h.detail}</span>
                    <span className="text-[10px] text-zinc-500">{new Date(h.createdAt).toLocaleString()}</span>
                    {h.status === 'open' && <Button size="sm" className="h-7 bg-emerald-600" onClick={() => claimHandoff(h)}>Claim</Button>}
                    {h.status === 'claimed' && <Button size="sm" variant="outline" className="h-7 border-zinc-700" onClick={() => resolveHandoff(h)}>Resolve</Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ──────────────── COMPLIANCE TAB ──────────────── */}
          <TabsContent value="compliance" className="mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="bg-zinc-900/60 border-zinc-800">
                <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Messaging window ({compliance?.tenant?.timezone})</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 flex items-end gap-2">
                  <div><p className="text-[11px] text-zinc-400 mb-1">Start hour</p>
                    <Select value={String(compliance?.tenant?.messagingStart ?? 9)} onValueChange={(v) => updateTenantHours(Number(v), compliance?.tenant?.messagingEnd ?? 21)}>
                      <SelectTrigger className="w-20 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 24 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}:00</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div><p className="text-[11px] text-zinc-400 mb-1">End hour</p>
                    <Select value={String(compliance?.tenant?.messagingEnd ?? 21)} onValueChange={(v) => updateTenantHours(compliance?.tenant?.messagingStart ?? 9, Number(v))}>
                      <SelectTrigger className="w-20 bg-zinc-900 border-zinc-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 24 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}:00</SelectItem>)}</SelectContent>
                    </Select></div>
                  <p className="text-[11px] text-zinc-500 pb-2">Proactive agent outbound outside this window is refused (session replies always allowed).</p>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/60 border-zinc-800">
                <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Suppression list</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.target as HTMLFormElement); await api('POST', `/tenants/${tenantId}/suppressions`, { value: f.get('value'), channel: f.get('channel'), reason: f.get('reason') }); (e.target as HTMLFormElement).reset(); reloadCompliance(); }}>
                    <input name="value" required placeholder="phone / ref" className="bg-zinc-900 border border-zinc-700 rounded px-2 text-xs h-8" />
                    <select name="channel" className="bg-zinc-900 border border-zinc-700 rounded px-1 text-xs h-8"><option>chat</option><option>all</option></select>
                    <input name="reason" placeholder="reason" className="bg-zinc-900 border border-zinc-700 rounded px-2 text-xs h-8" />
                    <Button size="sm" type="submit" className="h-8 bg-red-800">Add</Button>
                  </form>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {compliance?.suppressions?.map((s) => (
                      <div key={s.id} className="text-xs flex items-center gap-2 border border-zinc-800 rounded px-2 py-1">
                        <b>{s.value}</b> <span className="text-zinc-500">{s.channel} · {s.reason}</span>
                        <button className="ml-auto text-red-400 hover:underline" onClick={async () => { await fetch(`${API}/tenants/${tenantId}/suppressions?${QS}&value=${encodeURIComponent(s.value)}`, { method: 'DELETE' }); reloadCompliance(); }}>remove</button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/60 border-zinc-800">
                <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Marketing consents (chat)</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.target as HTMLFormElement); await api('POST', `/tenants/${tenantId}/consents`, { subjectRef: f.get('subjectRef'), channel: 'chat', purpose: 'marketing', granted: true, proofRef: f.get('proofRef') }); (e.target as HTMLFormElement).reset(); reloadCompliance(); }}>
                    <input name="subjectRef" required placeholder="subject ref" className="bg-zinc-900 border border-zinc-700 rounded px-2 text-xs h-8" />
                    <input name="proofRef" placeholder="proof" className="bg-zinc-900 border border-zinc-700 rounded px-2 text-xs h-8" />
                    <Button size="sm" type="submit" className="h-8 bg-emerald-700">Grant</Button>
                  </form>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {compliance?.consents?.map((c) => (
                      <div key={c.id} className="text-xs flex items-center gap-2 border border-zinc-800 rounded px-2 py-1">
                        <b>{c.subjectRef}</b><span className="text-zinc-500">{c.purpose}</span>
                        {c.grantedAt && !c.revokedAt ? <Badge className="text-[9px] bg-emerald-700">granted</Badge> : <Badge variant="secondary" className="text-[9px]">revoked</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/60 border-zinc-800">
                <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Moderation terms</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.target as HTMLFormElement); await api('POST', `/tenants/${tenantId}/moderation-words`, { word: f.get('word'), severity: f.get('severity') }); (e.target as HTMLFormElement).reset(); reloadCompliance(); }}>
                    <input name="word" required placeholder="term" className="bg-zinc-900 border border-zinc-700 rounded px-2 text-xs h-8" />
                    <select name="severity" className="bg-zinc-900 border border-zinc-700 rounded px-1 text-xs h-8"><option>block</option><option>flag</option></select>
                    <Button size="sm" type="submit" className="h-8">Add</Button>
                  </form>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {compliance?.moderationWords?.map((w) => (
                      <span key={w.id} className={`text-xs border rounded px-2 py-0.5 ${w.severity === 'block' ? 'border-red-800 text-red-300' : 'border-amber-700 text-amber-300'}`}>
                        {w.word} <button onClick={async () => { await fetch(`${API}/tenants/${tenantId}/moderation-words?${QS}&word=${encodeURIComponent(w.word)}`, { method: 'DELETE' }); reloadCompliance(); }}>×</button>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900/60 border-zinc-800 lg:col-span-2">
                <CardHeader className="py-3 px-3"><CardTitle className="text-sm">Audit trail (latest enforcement decisions)</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 max-h-48 overflow-y-auto space-y-1">
                  {compliance?.auditEvents?.slice(0, 30).map((e) => (
                    <div key={e.id} className="text-[11px] flex gap-2 border-b border-zinc-900 pb-1">
                      <span className="text-zinc-500">{new Date(e.at ?? e.createdAt ?? Date.now()).toLocaleTimeString()}</span>
                      <b className="w-44 shrink-0">{e.type}</b>
                      <span className="text-zinc-400 truncate">{e.detail}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* in-app notifications */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 w-80">
        {notifications.map((n) => (
          <div key={n.id} className="bg-zinc-900 border border-emerald-800 rounded-lg p-3 shadow-lg text-sm">
            <p className="font-semibold text-emerald-300">{n.title}</p>
            <p className="text-zinc-300 text-xs">{n.body}</p>
          </div>
        ))}
      </div>

      {/* poll dialog */}
      <Dialog open={pollOpen} onOpenChange={setPollOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader><DialogTitle>Create poll</DialogTitle></DialogHeader>
          <Input placeholder="Question" value={pollQ} onChange={(e) => setPollQ(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          <Textarea rows={3} value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} className="bg-zinc-900 border-zinc-700" placeholder="One option per line" />
          <DialogFooter>
            <Button className="bg-emerald-600" onClick={() => { setPollOpen(false); doSend({ type: 'poll', body: pollQ, payload: { question: pollQ, options: pollOpts.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, votes: [] })) } }); setPollQ(''); setPollOpts('Option A\nOption B'); }}>Send poll</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader><DialogTitle>Schedule message</DialogTitle></DialogHeader>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="bg-zinc-900 border-zinc-700" />
          <DialogFooter>
            <Button className="bg-emerald-600" disabled={!scheduleAt} onClick={() => { setScheduleOpen(false); doSend({ scheduledFor: new Date(scheduleAt).toISOString() }); setScheduleAt(''); }}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
