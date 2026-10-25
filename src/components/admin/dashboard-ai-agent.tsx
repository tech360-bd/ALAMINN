"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Sparkles,
  Send,
  Loader2,
  Wrench,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Copy,
  Check,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldCheck,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { adminFetch } from "./lib";
import { toast } from "sonner";
import {
  DASHBOARD_AGENTS,
  DASHBOARD_AGENT_BY_ID,
  resolveDashboardAgent,
  type DashboardAgentDefinition,
} from "@/lib/ai/dashboard-agents";

type ToolTrace = {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  durationMs: number;
  imageUrl?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  providerName?: string;
  modelUsed?: string;
  cached?: boolean;
  latencyMs?: number;
  toolTraces?: ToolTrace[];
  generatedImages?: string[];
};

type ChatApiResult = {
  agent: {
    id: string;
    name: string;
    roleTitle: string;
    route: string;
    group: string;
  };
  content: string;
  providerUsed: string;
  providerName: string;
  modelUsed: string;
  tierUsed: string;
  cached: boolean;
  latencyMs: number;
  toolTraces: ToolTrace[];
  generatedImages: string[];
};

const PROVIDER_OPTIONS = [
  { value: "auto", label: "⚡ Auto Router (UnoRouter Primary + Free Fallback)" },
  { value: "unorouter", label: "UnoRouter ⭐ Primary (claude-opus-4-6-thinking)" },
  { value: "groq", label: "Groq Cloud ⭐ (Qwen3 / Llama 3.3)" },
  { value: "gemini", label: "Google AI Studio ⭐ (Gemini 2.5 Flash)" },
  { value: "cerebras", label: "Cerebras ⭐ (Llama 3.3 70B / Qwen3)" },
  { value: "openrouter", label: "OpenRouter (:free Aggregator)" },
  { value: "github", label: "GitHub Models (GPT-4.1-mini / R1)" },
  { value: "cloudflare", label: "Cloudflare Workers AI (10k/day)" },
  { value: "sambanova", label: "SambaNova Cloud (70B Free)" },
  { value: "zhipu", label: "Zhipu AI (GLM-4.5-Flash Free)" },
  { value: "mistral", label: "Mistral La Plateforme (Free Tier)" },
  { value: "chutes", label: "Chutes.ai (DeepSeek-R1 / Qwen3)" },
  { value: "nvidia", label: "NVIDIA NIM (Free Credits)" },
  { value: "huggingface", label: "Hugging Face Serverless" },
  { value: "pollinations", label: "Pollinations.ai ✨ (Zero Key)" },
  { value: "ollama", label: "Ollama Local 🔒 (100% Offline)" },
  { value: "local-grounded", label: "Alaminn Grounded Local ✅ (Instant DB)" },
];

const ACCENT_STYLES: Record<string, { border: string; badge: string; iconBg: string }> = {
  orange: {
    border: "border-orange-200/80 dark:border-orange-900/50",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
    iconBg: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  emerald: {
    border: "border-emerald-200/80 dark:border-emerald-900/50",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  blue: {
    border: "border-blue-200/80 dark:border-blue-900/50",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  purple: {
    border: "border-purple-200/80 dark:border-purple-900/50",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
    iconBg: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  amber: {
    border: "border-amber-200/80 dark:border-amber-900/50",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  rose: {
    border: "border-rose-200/80 dark:border-rose-900/50",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  cyan: {
    border: "border-cyan-200/80 dark:border-cyan-900/50",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300",
    iconBg: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  },
  teal: {
    border: "border-teal-200/80 dark:border-teal-900/50",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
};

export function triggerOpenDashboardAgent(detail?: { agentId?: string; prompt?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("alaminn:open-dashboard-agent", { detail }));
}

export function DashboardAiAgentBannerAndDrawer() {
  const pathname = usePathname() || "/admin";
  const routeAgent = useMemo(() => resolveDashboardAgent(pathname), [pathname]);

  const [overrideAgentId, setOverrideAgentId] = useState<string | null>(null);
  const activeAgent: DashboardAgentDefinition = useMemo(
    () => (overrideAgentId && DASHBOARD_AGENT_BY_ID[overrideAgentId]) || routeAgent,
    [overrideAgentId, routeAgent]
  );

  // Reset override whenever route changes
  useEffect(() => {
    setOverrideAgentId(null);
  }, [pathname]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const [provider, setProvider] = useState("auto");
  const [tier, setTier] = useState<"auto" | "fast" | "flagship" | "reasoning">("auto");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Restore banner collapse state & per-agent chat history from localStorage
  useEffect(() => {
    try {
      const collapsed = localStorage.getItem("alaminn.agentBanner.collapsed");
      if (collapsed === "1") setBannerCollapsed(true);
      const savedMsgs = localStorage.getItem("alaminn.agentChats.v1");
      if (savedMsgs) {
        setMessagesByAgent(JSON.parse(savedMsgs));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const persistMessages = useCallback((next: Record<string, ChatMessage[]>) => {
    setMessagesByAgent(next);
    try {
      localStorage.setItem("alaminn.agentChats.v1", JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  const currentMessages = useMemo(
    () => messagesByAgent[activeAgent.id] || [],
    [messagesByAgent, activeAgent.id]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessages, sending, drawerOpen]);

  const sendPrompt = useCallback(
    async (promptText: string, targetAgentOverride?: DashboardAgentDefinition) => {
      const target = targetAgentOverride || activeAgent;
      const trimmed = promptText.trim();
      if (!trimmed || sending) return;

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      const prevList = messagesByAgent[target.id] || [];
      const updatedWithUser = {
        ...messagesByAgent,
        [target.id]: [...prevList.slice(-18), userMsg],
      };
      persistMessages(updatedWithUser);
      setInput("");
      setSending(true);

      try {
        const env = await adminFetch<ChatApiResult>("/api/v1/admin/ai-agent/chat", {
          method: "POST",
          body: JSON.stringify({
            agentId: target.id,
            pathname,
            message: trimmed,
            history: prevList.slice(-8).map((m) => ({ role: m.role, content: m.content })),
            preferredProvider: provider,
            tier,
          }),
        });

        const d = env.data;
        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: d.content,
          timestamp: new Date().toISOString(),
          providerName: d.providerName,
          modelUsed: d.modelUsed,
          cached: d.cached,
          latencyMs: d.latencyMs,
          toolTraces: d.toolTraces,
          generatedImages: d.generatedImages,
        };

        persistMessages({
          ...updatedWithUser,
          [target.id]: [...updatedWithUser[target.id], assistantMsg],
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Agent request failed.");
      } finally {
        setSending(false);
      }
    },
    [activeAgent, messagesByAgent, pathname, persistMessages, provider, sending, tier]
  );

  // Global keyboard shortcut (Cmd/Ctrl + J) & custom event listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDrawerOpen((o) => !o);
      }
    };
    const onOpenEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ agentId?: string; prompt?: string }>).detail;
      let chosenAgent = activeAgent;
      if (detail?.agentId && DASHBOARD_AGENT_BY_ID[detail.agentId]) {
        setOverrideAgentId(detail.agentId);
        chosenAgent = DASHBOARD_AGENT_BY_ID[detail.agentId];
      }
      setDrawerOpen(true);
      if (detail?.prompt) {
        void sendPrompt(detail.prompt, chosenAgent);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("alaminn:open-dashboard-agent", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("alaminn:open-dashboard-agent", onOpenEvent);
    };
  }, [activeAgent, sendPrompt]);

  function toggleBanner() {
    const next = !bannerCollapsed;
    setBannerCollapsed(next);
    try {
      localStorage.setItem("alaminn.agentBanner.collapsed", next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function clearHistory() {
    const next = { ...messagesByAgent };
    delete next[activeAgent.id];
    persistMessages(next);
    toast.success(`Cleared ${activeAgent.name} conversation.`);
  }

  async function copyMessage(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error("Copy failed.");
    }
  }

  function toggleSpeak(msg: ChatMessage) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Browser Text-to-Speech is not supported in this browser.");
      return;
    }
    if (speakingId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const plain = msg.content.replace(/[#*_`>\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
    const utter = new SpeechSynthesisUtterance(plain.slice(0, 2500));
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    setSpeakingId(msg.id);
    window.speechSynthesis.speak(utter);
  }

  function toggleVoiceDictation() {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error("Browser SpeechRecognition unavailable — try Chrome or Edge, or use the Free AI Studio STT tab.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function sendToApprovalsQueue(msg: ChatMessage) {
    try {
      await adminFetch("/api/v1/admin/ai-tasks", {
        method: "POST",
        body: JSON.stringify({
          workflow: "operations-audit",
          objective: `[${routeAgent.name}] Draft Deliverable`,
          prompt: msg.content.slice(0, 6000),
          sensitivity: "internal",
          approvalRequired: true,
          executeNow: false,
        }),
      });
      toast.success("Saved draft to AI Tasks queue.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save draft.");
    }
  }

  const accent = ACCENT_STYLES[routeAgent.accent] || ACCENT_STYLES.orange;
  const hideInlineBanner = pathname === "/admin/ai-agents";

  return (
    <>
      {/* Contextual Dashboard AI Agent Banner rendered on every Admin Dashboard */}
      {!hideInlineBanner && (
        <div
          className={cn(
            "mb-6 rounded-xl border bg-card/90 backdrop-blur-sm shadow-xs transition-all",
            accent.border
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  accent.iconBg
                )}
              >
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight truncate">
                    {routeAgent.name}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      accent.badge
                    )}
                  >
                    {routeAgent.group} Agent
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono hidden sm:inline-flex">
                    100% Free AI Stack
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {routeAgent.roleTitle} — {routeAgent.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                onClick={() => {
                  setOverrideAgentId(null);
                  setDrawerOpen(true);
                }}
                className="h-8 gap-1.5 text-xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Open Agent
                <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1 py-0.5 text-[10px] font-mono sm:inline">
                  ⌘J
                </kbd>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs hidden md:inline-flex">
                <Link href="/admin/ai-agents">
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  $0 Providers
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={toggleBanner}
                aria-label={bannerCollapsed ? "Expand agent quick actions" : "Collapse agent quick actions"}
              >
                {bannerCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {!bannerCollapsed && (
            <div className="border-t px-4 py-2.5 bg-muted/20 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">
                Quick Actions:
              </span>
              {routeAgent.quickPrompts.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => {
                    setOverrideAgentId(null);
                    setDrawerOpen(true);
                    void sendPrompt(qp.prompt, routeAgent);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted hover:border-foreground/25 transition-colors cursor-pointer"
                >
                  <Zap className="h-3 w-3 text-orange-500" />
                  {qp.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactive Slide-Over Dashboard AI Agent Workspace */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col gap-0"
        >
          <SheetHeader className="border-b px-5 py-4 bg-muted/30 space-y-2">
            <div className="flex items-start justify-between gap-2 pr-6">
              <div>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-orange-500" />
                  {activeAgent.name}
                </SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {activeAgent.roleTitle} · Bound to{" "}
                  <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                    {activeAgent.route}
                  </code>
                </SheetDescription>
              </div>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs shrink-0">
                <Link href="/admin/ai-agents" onClick={() => setDrawerOpen(false)}>
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Free AI Hub
                </Link>
              </Button>
            </div>

            {/* Agent & Free Provider Selector Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <select
                aria-label="Switch dashboard agent"
                value={activeAgent.id}
                onChange={(e) => setOverrideAgentId(e.target.value)}
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                {DASHBOARD_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.group}] {a.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select free AI provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select model speed/depth tier"
                value={tier}
                onChange={(e) =>
                  setTier(e.target.value as "auto" | "fast" | "flagship" | "reasoning")
                }
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="auto">Tier: Smart Auto</option>
                <option value="fast">Tier: Fast (Small Model)</option>
                <option value="flagship">Tier: Flagship (70B / Flash)</option>
                <option value="reasoning">Tier: Deep Reasoning (R1 / Qwen3)</option>
              </select>
            </div>
          </SheetHeader>

          {/* Conversation Stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentMessages.length === 0 ? (
              <div className="space-y-4 py-4">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                    <Sparkles className="h-4 w-4 text-orange-500" />
                    Dedicated AI Copilot for {activeAgent.name}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {activeAgent.description} Every response is grounded in live RBAC-checked
                    platform database snapshots and 100% free AI services with automatic multi-provider
                    fallback.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activeAgent.tools.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] font-mono">
                        🔧 {t}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Starter Prompts for {activeAgent.route}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeAgent.quickPrompts.map((qp) => (
                      <button
                        key={qp.label}
                        type="button"
                        onClick={() => void sendPrompt(qp.prompt)}
                        className="text-left rounded-lg border bg-card p-3 hover:bg-muted/50 hover:border-foreground/25 transition-all cursor-pointer"
                      >
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          {qp.label}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                          {qp.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              currentMessages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-1.5",
                    m.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-xl px-4 py-3 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-card text-card-foreground shadow-2xs"
                    )}
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}

                    {/* Generated Pollinations Image Cards */}
                    {m.generatedImages && m.generatedImages.length > 0 && (
                      <div className="mt-3 space-y-2 border-t pt-2">
                        {m.generatedImages.map((url) => (
                          <div key={url} className="rounded-lg border overflow-hidden bg-muted/30 p-2">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                              <span className="flex items-center gap-1 font-medium">
                                <ImageIcon className="h-3.5 w-3.5" /> Pollinations.ai FLUX ($0)
                              </span>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                Open HD <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Generated Free AI Visual"
                              className="w-full rounded-md object-cover max-h-56"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Telemetry + Actions Footer on Assistant Replies */}
                  {m.role === "assistant" && (
                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      {m.providerName && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {m.providerName} · <code className="ml-1">{m.modelUsed}</code>
                        </Badge>
                      )}
                      {m.latencyMs !== undefined && <span>{m.latencyMs}ms</span>}
                      {m.cached && (
                        <Badge variant="secondary" className="text-[10px]">
                          ⚡ Cached
                        </Badge>
                      )}
                      {m.toolTraces && m.toolTraces.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          <Wrench className="h-2.5 w-2.5" />
                          {m.toolTraces.length} tool{m.toolTraces.length > 1 ? "s" : ""}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => void copyMessage(m)}
                        className="inline-flex items-center gap-0.5 hover:text-foreground ml-1 cursor-pointer"
                        title="Copy markdown"
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleSpeak(m)}
                        className="inline-flex items-center gap-0.5 hover:text-foreground ml-1 cursor-pointer"
                        title="Read aloud (Free TTS)"
                      >
                        {speakingId === m.id ? (
                          <VolumeX className="h-3 w-3 text-orange-500" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => void sendToApprovalsQueue(m)}
                        className="inline-flex items-center gap-0.5 hover:text-foreground ml-1 cursor-pointer"
                        title="Save draft to AI Tasks queue"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        <span>Save Task</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span>
                  {activeAgent.name} is querying live snapshot & routing via Free AI Stack…
                </span>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t p-3 bg-background space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendPrompt(input);
                  }
                }}
                placeholder={`Ask ${activeAgent.name} anything about ${activeAgent.route}…`}
                rows={2}
                className="min-h-[56px] resize-none text-sm"
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant={listening ? "destructive" : "outline"}
                  className="h-8 w-9"
                  onClick={toggleVoiceDictation}
                  title="Free voice dictation (STT)"
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-9"
                  disabled={!input.trim() || sending}
                  onClick={() => void sendPrompt(input)}
                  aria-label="Send message"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for newline · Grounded in live DB</span>
              {currentMessages.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="inline-flex items-center gap-1 hover:text-destructive cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Clear chat
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
