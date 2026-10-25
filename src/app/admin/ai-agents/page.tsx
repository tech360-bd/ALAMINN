"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/admin/page-primitives";
import { adminFetch } from "@/components/admin/lib";
import { triggerOpenDashboardAgent } from "@/components/admin/dashboard-ai-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Bot,
  Sparkles,
  KeyRound,
  Cpu,
  Wand2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Zap,
  RefreshCw,
  Image as ImageIcon,
  Mic,
  Square,
  Volume2,
  ArrowUpRight,
  ShieldCheck,
  Database,
  Globe2,
} from "lucide-react";

type AgentSummary = {
  id: string;
  route: string;
  matchPrefix?: string;
  group: string;
  name: string;
  roleTitle: string;
  description: string;
  accent: string;
  defaultTier: string;
  hasAccess: boolean;
  tools: string[];
  quickPrompts: { label: string; prompt: string }[];
};

type ProviderModelInfo = {
  id: string;
  label: string;
  tier: string;
  contextWindow: string;
  supportsTools: boolean;
};

type ProviderConfigView = {
  id: string;
  name: string;
  category: string;
  recommended: boolean;
  noCreditCard: boolean;
  requiresKey: boolean;
  signupUrl: string;
  freeLimitsSummary: string;
  notes: string;
  enabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string;
  baseUrl: string;
  accountId: string;
  selectedModel: string;
  ready: boolean;
  models: ProviderModelInfo[];
};

type GlobalConfigView = {
  preferredProvider: string;
  fallbackOrder: string[];
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  smartTierRouting: boolean;
  enableExternalFreeTools: boolean;
  enablePollinationsTextFallback: boolean;
  tavilyApiKeyMasked: string;
  hasTavilyKey: boolean;
  braveSearchApiKeyMasked: string;
  hasBraveKey: boolean;
};

type HubData = {
  agents: AgentSummary[];
  groups: string[];
  providers: ProviderConfigView[];
  global: GlobalConfigView;
  telemetry: {
    cacheEntries: number;
    cooldowns: Record<string, { remainingSeconds: number; reason: string }>;
  };
  canManageProviders: boolean;
};

type EditableProviderDraft = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  accountId: string;
  selectedModel: string;
};

export default function FreeAiAgentsHubPage() {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Directory filters
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("All");

  // Provider edits
  const [providerDrafts, setProviderDrafts] = useState<Record<string, EditableProviderDraft>>({});
  const [globalDraft, setGlobalDraft] = useState<GlobalConfigView | null>(null);
  const [tavilyKeyInput, setTavilyKeyInput] = useState("");
  const [braveKeyInput, setBraveKeyInput] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; latencyMs: number; message: string; modelUsed: string }>
  >({});

  // Live OpenRouter :free model discovery
  const [discoveringOr, setDiscoveringOr] = useState(false);
  const [orFreeModels, setOrFreeModels] = useState<
    { id: string; name: string; contextLength: number }[]
  >([]);

  // Studio Tab states
  const [imgPrompt, setImgPrompt] = useState(
    "Minimalist executive technology command center overlooking Dhaka skyline at golden hour, architectural photography"
  );
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  const [embInput, setEmbInput] = useState(
    "Full scholarship for MSc Computer Science in Germany\nDAAD funded master's program in artificial intelligence\nEnterprise WhatsApp CRM lead automation workflow"
  );
  const [embProvider, setEmbProvider] = useState("auto");
  const [embLoading, setEmbLoading] = useState(false);
  const [embResult, setEmbResult] = useState<{
    providerUsed: string;
    modelUsed: string;
    dimensions: number;
    latencyMs: number;
    similarityPairs: { a: number; b: number; cosine: number }[];
  } | null>(null);

  const [toolName, setToolName] = useState("get_weather");
  const [toolQuery, setToolQuery] = useState("Dhaka");
  const [toolLoading, setToolLoading] = useState(false);
  const [toolOutput, setToolOutput] = useState<string | null>(null);

  // Voice STT / TTS Studio
  const [recording, setRecording] = useState(false);
  const [sttLoading, setSttLoading] = useState(false);
  const [sttTranscript, setSttTranscript] = useState("");
  const [ttsSample, setTtsSample] = useState(
    "Welcome to Alaminn Command Center. All fifty-two admin dashboard AI agents are online and running on zero-cost free AI services."
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const loadHub = useCallback(async () => {
    setLoading(true);
    try {
      const env = await adminFetch<HubData>("/api/v1/admin/ai-agent");
      setData(env.data);
      const drafts: Record<string, EditableProviderDraft> = {};
      for (const p of env.data.providers) {
        drafts[p.id] = {
          enabled: p.enabled,
          apiKey: p.maskedApiKey || "",
          baseUrl: p.baseUrl,
          accountId: p.accountId || "",
          selectedModel: p.selectedModel,
        };
      }
      setProviderDrafts(drafts);
      setGlobalDraft(env.data.global);
      setTavilyKeyInput(env.data.global.tavilyApiKeyMasked || "");
      setBraveKeyInput(env.data.global.braveSearchApiKeyMasked || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Free AI Agents Hub.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    const q = agentSearch.trim().toLowerCase();
    return data.agents.filter((a) => {
      if (selectedGroup !== "All" && a.group !== selectedGroup) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.route.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.roleTitle.toLowerCase().includes(q)
      );
    });
  }, [data, agentSearch, selectedGroup]);

  const readyCount = useMemo(
    () => (data ? data.providers.filter((p) => p.ready && p.enabled).length : 0),
    [data]
  );

  async function saveAllSettings() {
    if (!globalDraft) return;
    setSaving(true);
    try {
      await adminFetch("/api/v1/admin/ai-agent/providers", {
        method: "PUT",
        body: JSON.stringify({
          global: {
            preferredProvider: globalDraft.preferredProvider,
            fallbackOrder: globalDraft.fallbackOrder,
            cacheEnabled: globalDraft.cacheEnabled,
            cacheTtlSeconds: globalDraft.cacheTtlSeconds,
            smartTierRouting: globalDraft.smartTierRouting,
            enableExternalFreeTools: globalDraft.enableExternalFreeTools,
            enablePollinationsTextFallback: globalDraft.enablePollinationsTextFallback,
            tavilyApiKey: tavilyKeyInput,
            braveSearchApiKey: braveKeyInput,
          },
          providers: providerDrafts,
        }),
      });
      toast.success("Free AI provider & router configuration saved.");
      await loadHub();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testProvider(providerId: string) {
    setTestingId(providerId);
    const draft = providerDrafts[providerId];
    try {
      const env = await adminFetch<{
        ok: boolean;
        latencyMs: number;
        message: string;
        modelUsed: string;
      }>("/api/v1/admin/ai-agent/providers", {
        method: "POST",
        body: JSON.stringify({
          action: "test_provider",
          providerId,
          model: draft?.selectedModel,
          apiKeyOverride:
            draft?.apiKey && !draft.apiKey.includes("••••") ? draft.apiKey : undefined,
          baseUrlOverride: draft?.baseUrl,
          accountIdOverride: draft?.accountId,
        }),
      });
      setTestResults((prev) => ({ ...prev, [providerId]: env.data }));
      if (env.data.ok) {
        toast.success(`${providerId} responded in ${env.data.latencyMs}ms!`);
      } else {
        toast.error(env.data.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provider test failed.");
    } finally {
      setTestingId(null);
    }
  }

  async function discoverOpenRouterFreeModels() {
    setDiscoveringOr(true);
    try {
      const env = await adminFetch<{
        count: number;
        models: { id: string; name: string; contextLength: number }[];
      }>("/api/v1/admin/ai-agent/providers", {
        method: "POST",
        body: JSON.stringify({ action: "discover_openrouter_free" }),
      });
      setOrFreeModels(env.data.models.slice(0, 30));
      toast.success(`Discovered ${env.data.count} live :free models on OpenRouter.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fetch OpenRouter :free list.");
    } finally {
      setDiscoveringOr(false);
    }
  }

  async function clearCache() {
    try {
      await adminFetch("/api/v1/admin/ai-agent/providers", {
        method: "POST",
        body: JSON.stringify({ action: "clear_cache" }),
      });
      toast.success("Free AI Router cache cleared.");
      await loadHub();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear cache.");
    }
  }

  async function generateStudioImage() {
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    try {
      const env = await adminFetch<{ url: string }>("/api/v1/admin/ai-agent/tools", {
        method: "POST",
        body: JSON.stringify({
          mode: "image",
          prompt: imgPrompt,
          width: 1024,
          height: 576,
          model: "flux",
        }),
      });
      setImgUrl(env.data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      setImgLoading(false);
    }
  }

  async function runStudioEmbeddings() {
    const lines = embInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setEmbLoading(true);
    try {
      const env = await adminFetch<{
        providerUsed: string;
        modelUsed: string;
        dimensions: number;
        latencyMs: number;
        similarityPairs: { a: number; b: number; cosine: number }[];
      }>("/api/v1/admin/ai-agent/tools", {
        method: "POST",
        body: JSON.stringify({
          mode: "embeddings",
          texts: lines,
          provider: embProvider,
        }),
      });
      setEmbResult(env.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Embedding computation failed.");
    } finally {
      setEmbLoading(false);
    }
  }

  async function runResearchTool() {
    if (!toolQuery.trim()) return;
    setToolLoading(true);
    try {
      const args =
        toolName === "get_weather"
          ? { city: toolQuery }
          : toolName === "wikipedia_lookup"
          ? { topic: toolQuery }
          : { query: toolQuery };

      const env = await adminFetch<{ result: unknown }>("/api/v1/admin/ai-agent/tools", {
        method: "POST",
        body: JSON.stringify({ mode: "tool", tool: toolName, args }),
      });
      setToolOutput(JSON.stringify(env.data.result, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tool call failed.");
    } finally {
      setToolLoading(false);
    }
  }

  async function startOrStopRecording() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAudioForStt(blob, "recording.webm");
      };
      mediaRecorderRef.current = recorder;
      setRecording(true);
      recorder.start();
    } catch {
      toast.error("Microphone permission denied or unavailable.");
    }
  }

  async function uploadAudioForStt(blob: Blob, filename: string) {
    setSttLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const res = await fetch("/api/v1/admin/ai-agent/tools", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "STT transcription failed.");
      }
      setSttTranscript(json.data.text || "");
      toast.success(`Transcribed via ${json.data.providerUsed} (${json.data.latencyMs}ms).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "STT failed.");
    } finally {
      setSttLoading(false);
    }
  }

  function speakSampleText() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Browser speechSynthesis not available.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(ttsSample);
    window.speechSynthesis.speak(u);
  }

  return (
    <AdminShell>
      <PageHeader
        title="Free AI Agents & $0 Provider Hub"
        subtitle="Every admin dashboard has its own specialized AI agent powered by 100% free AI services — Groq, OpenRouter :free, Google AI Studio, Cerebras, GitHub Models, Cloudflare Workers AI, Pollinations, Ollama, and Grounded Local Synthesis."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadHub()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => triggerOpenDashboardAgent()}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              Launch Agent Drawer (⌘J)
            </Button>
          </div>
        }
      />

      {/* Executive KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Dedicated Dashboard Agents</span>
              <Bot className="h-4 w-4 text-orange-500" />
            </CardDescription>
            <CardTitle className="text-2xl">{data?.agents.length ?? 52}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            100% coverage across all 8 Admin Command groups
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Ready Free Providers</span>
              <KeyRound className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl">
              {readyCount} <span className="text-sm font-normal text-muted-foreground">/ {data?.providers.length ?? 18}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Auto-failover + zero-key fallback always online
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>LRU Response Cache</span>
              <Database className="h-4 w-4 text-blue-500" />
            </CardDescription>
            <CardTitle className="text-2xl">{data?.telemetry.cacheEntries ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Protects daily free RPD quotas</span>
            <button
              type="button"
              onClick={() => void clearCache()}
              className="text-primary hover:underline cursor-pointer"
            >
              Clear
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Monthly API Spend</span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">$0.00</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            No credit card required across core stack
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="agents" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="h-4 w-4" />
            All Dashboard Agents ({data?.agents.length ?? 52})
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5">
            <KeyRound className="h-4 w-4" />
            Free AI Providers & Keys ({data?.providers.length ?? 18})
          </TabsTrigger>
          <TabsTrigger value="router" className="gap-1.5">
            <Cpu className="h-4 w-4" />
            Smart Fallback & Guardrails
          </TabsTrigger>
          <TabsTrigger value="studio" className="gap-1.5">
            <Wand2 className="h-4 w-4" />
            Multimodal Free AI Studio
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ALL 52 ADMIN DASHBOARD AGENTS */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="Search 52 dashboard agents by name, route, or role…"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["All", ...(data?.groups || [])].map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={selectedGroup === g ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setSelectedGroup(g)}
                >
                  {g}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <Card key={agent.id} className="flex flex-col justify-between">
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      {agent.group}
                    </Badge>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {agent.route}
                    </code>
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-orange-500 shrink-0" />
                      {agent.name}
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-foreground/80 mt-0.5">
                      {agent.roleTitle}
                    </CardDescription>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {agent.description}
                  </p>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="flex flex-wrap gap-1">
                    {agent.quickPrompts.slice(0, 2).map((qp) => (
                      <button
                        key={qp.label}
                        type="button"
                        onClick={() =>
                          triggerOpenDashboardAgent({ agentId: agent.id, prompt: qp.prompt })
                        }
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Zap className="h-2.5 w-2.5 text-orange-500" />
                        {qp.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => triggerOpenDashboardAgent({ agentId: agent.id })}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Chat with Agent
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                      <Link href={agent.route}>
                        Dashboard <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: AI PROVIDERS & API KEYS (UNOROUTER PRIMARY + FREE STACK) */}
        <TabsContent value="providers" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold">
                Configure AI Provider Keys (UnoRouter `claude-opus-4-6-thinking` Primary + Groq, Gemini, Cerebras, OpenRouter :free & More)
              </h2>
              <p className="text-xs text-muted-foreground">
                UnoRouter (`https://api.unorouter.com/v1/chat/completions`) is set as the primary preferred gateway. Keys saved here are encrypted at rest with AES-256-GCM, and the router cascades automatically across configured fallback providers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void discoverOpenRouterFreeModels()}
                disabled={discoveringOr}
              >
                {discoveringOr ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Globe2 className="h-4 w-4 mr-1.5" />
                )}
                Fetch Live OpenRouter :free List
              </Button>
              {data?.canManageProviders && (
                <Button size="sm" onClick={() => void saveAllSettings()} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save All Provider Keys
                </Button>
              )}
            </div>
          </div>

          {orFreeModels.length > 0 && (
            <Card className="border-emerald-300/60 dark:border-emerald-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Live OpenRouter `:free` Models ({orFreeModels.length} shown)
                </CardTitle>
                <CardDescription className="text-xs">
                  Click any model ID below to assign it as your active OpenRouter free model.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {orFreeModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setProviderDrafts((prev) => ({
                        ...prev,
                        openrouter: {
                          ...prev.openrouter,
                          selectedModel: m.id,
                        },
                      }));
                      toast.success(`Selected ${m.id} for OpenRouter.`);
                    }}
                    className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] font-mono hover:bg-emerald-500/10 hover:border-emerald-500/40 cursor-pointer"
                  >
                    {m.id}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {(data?.providers || []).map((p) => {
              const draft = providerDrafts[p.id] || {
                enabled: p.enabled,
                apiKey: "",
                baseUrl: p.baseUrl,
                accountId: "",
                selectedModel: p.selectedModel,
              };
              const testRes = testResults[p.id];

              return (
                <Card key={p.id} className={p.recommended ? "border-orange-300/60 dark:border-orange-900/50" : ""}>
                  <CardHeader className="pb-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        {p.recommended && (
                          <Badge className="bg-orange-500 text-white text-[10px]">⭐ Top Pick</Badge>
                        )}
                        {p.noCreditCard && (
                          <Badge variant="secondary" className="text-[10px]">
                            No Credit Card
                          </Badge>
                        )}
                        {p.ready ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                          >
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Needs Free Key
                          </Badge>
                        )}
                      </div>

                      <Switch
                        checked={draft.enabled}
                        onCheckedChange={(checked) =>
                          setProviderDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...draft, enabled: checked },
                          }))
                        }
                        disabled={p.id === "local-grounded" || !data?.canManageProviders}
                      />
                    </div>
                    <CardDescription className="text-xs">
                      <span className="font-medium text-foreground">{p.freeLimitsSummary}</span> —{" "}
                      {p.notes}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {p.requiresKey && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Free API Key</Label>
                            {p.signupUrl.startsWith("http") && (
                              <a
                                href={p.signupUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                Get Free Key <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <Input
                            type="password"
                            value={draft.apiKey}
                            onChange={(e) =>
                              setProviderDrafts((prev) => ({
                                ...prev,
                                [p.id]: { ...draft, apiKey: e.target.value },
                              }))
                            }
                            placeholder={`Paste ${p.name} key…`}
                            className="h-8 text-xs font-mono"
                            disabled={!data?.canManageProviders}
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">Default Free Model</Label>
                        <select
                          aria-label={`${p.name} model`}
                          value={draft.selectedModel}
                          onChange={(e) =>
                            setProviderDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, selectedModel: e.target.value },
                            }))
                          }
                          className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                          disabled={!data?.canManageProviders}
                        >
                          {p.models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label} ({m.id})
                            </option>
                          ))}
                          {!p.models.some((m) => m.id === draft.selectedModel) && (
                            <option value={draft.selectedModel}>{draft.selectedModel}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    {p.id === "cloudflare" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Cloudflare Account ID</Label>
                        <Input
                          value={draft.accountId}
                          onChange={(e) =>
                            setProviderDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, accountId: e.target.value },
                            }))
                          }
                          placeholder="Cloudflare 32-char Account ID"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}

                    {p.id === "ollama" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Ollama Local OpenAI Endpoint</Label>
                        <Input
                          value={draft.baseUrl}
                          onChange={(e) =>
                            setProviderDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, baseUrl: e.target.value },
                            }))
                          }
                          placeholder="http://localhost:11434/v1"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={testingId === p.id}
                        onClick={() => void testProvider(p.id)}
                      >
                        {testingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 mr-1 text-orange-500" />
                        )}
                        Test Live
                      </Button>

                      {testRes && (
                        <div className="flex items-center gap-1.5 text-xs truncate">
                          {testRes.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          )}
                          <span className="truncate text-muted-foreground">
                            {testRes.latencyMs}ms · {testRes.message}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 3: SMART FALLBACK ROUTER & PRO-TIP GUARDRAILS */}
        <TabsContent value="router" className="space-y-4">
          {globalDraft && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Multi-Provider Fallback & Tiering Policy
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Implements the 5 Golden Rules for $0 AI Builders: automatic fallback across
                    providers, small-model routing for fast tasks, LRU caching, and 429 backoff.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Primary Preferred Provider</Label>
                    <select
                      aria-label="Primary preferred provider"
                      value={globalDraft.preferredProvider}
                      onChange={(e) =>
                        setGlobalDraft({ ...globalDraft, preferredProvider: e.target.value })
                      }
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="auto">Auto $0 Cascade (Follow Fallback Order)</option>
                      {(data?.providers || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Fallback Cascade Order (comma-separated provider IDs)
                    </Label>
                    <Input
                      value={globalDraft.fallbackOrder.join(", ")}
                      onChange={(e) =>
                        setGlobalDraft({
                          ...globalDraft,
                          fallbackOrder: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">Smart Model Tier Routing</div>
                      <div className="text-xs text-muted-foreground">
                        Use fast 8B/Flash-Lite models for short triage and 70B/R1 for deep strategy
                      </div>
                    </div>
                    <Switch
                      checked={globalDraft.smartTierRouting}
                      onCheckedChange={(v) =>
                        setGlobalDraft({ ...globalDraft, smartTierRouting: v })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">LRU Response Caching</div>
                      <div className="text-xs text-muted-foreground">
                        Deduplicate identical prompts to stretch daily free RPD quotas
                      </div>
                    </div>
                    <Switch
                      checked={globalDraft.cacheEnabled}
                      onCheckedChange={(v) => setGlobalDraft({ ...globalDraft, cacheEnabled: v })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Cache TTL (seconds)</Label>
                    <Input
                      type="number"
                      min={15}
                      max={86400}
                      value={globalDraft.cacheTtlSeconds}
                      onChange={(e) =>
                        setGlobalDraft({
                          ...globalDraft,
                          cacheTtlSeconds: Number(e.target.value) || 300,
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Zero-Key Fallback & Optional Free Search Keys
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Optional free search keys enrich web research tools (Tavily 1,000/mo free,
                    Brave Search 2,000/mo free). Wikipedia, Open-Meteo, OpenAlex, and DuckDuckGo
                    require no key.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">Enable External Free Agent Tools</div>
                      <div className="text-xs text-muted-foreground">
                        Open-Meteo Weather, Wikipedia, OpenAlex Research, Pollinations FLUX
                      </div>
                    </div>
                    <Switch
                      checked={globalDraft.enableExternalFreeTools}
                      onCheckedChange={(v) =>
                        setGlobalDraft({ ...globalDraft, enableExternalFreeTools: v })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">
                        Pollinations.ai Zero-Key Text Fallback
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Try keyless `text.pollinations.ai` when no cloud API keys are configured
                      </div>
                    </div>
                    <Switch
                      checked={globalDraft.enablePollinationsTextFallback}
                      onCheckedChange={(v) =>
                        setGlobalDraft({ ...globalDraft, enablePollinationsTextFallback: v })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Tavily AI Search Free Key (1,000 searches/mo)</Label>
                    <Input
                      type="password"
                      value={tavilyKeyInput}
                      onChange={(e) => setTavilyKeyInput(e.target.value)}
                      placeholder="tvly-..."
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Brave Search Free Key (2,000 queries/mo)</Label>
                    <Input
                      type="password"
                      value={braveKeyInput}
                      onChange={(e) => setBraveKeyInput(e.target.value)}
                      placeholder="BSA..."
                      className="font-mono text-xs"
                    />
                  </div>

                  {data?.canManageProviders && (
                    <Button onClick={() => void saveAllSettings()} disabled={saving} className="w-full">
                      {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Save Router & Tool Settings
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* TAB 4: MULTIMODAL FREE AI STUDIO */}
        <TabsContent value="studio" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Pollinations.ai Zero-Key Image Generator */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-orange-500" />
                  Pollinations.ai FLUX Image Studio ($0 · Zero Key)
                </CardTitle>
                <CardDescription className="text-xs">
                  Generate editorial thumbnails, hero visuals, and social graphics via{" "}
                  <code>image.pollinations.ai</code> with zero signup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the visual you want to generate…"
                />
                <Button onClick={() => void generateStudioImage()} disabled={imgLoading} size="sm">
                  {imgLoading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-1.5" />
                  )}
                  Generate Free FLUX Image
                </Button>
                {imgUrl && (
                  <div className="rounded-lg border p-2 bg-muted/20 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imgUrl}
                      alt="Pollinations FLUX output"
                      className="w-full rounded-md object-cover max-h-64"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <code className="truncate max-w-[75%] text-[11px]">{imgUrl}</code>
                      <a
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Free Embeddings & Cosine Similarity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  Free Vector Embeddings & Semantic Similarity Lab
                </CardTitle>
                <CardDescription className="text-xs">
                  Test Gemini `text-embedding-004`, Cloudflare `bge-base-en-v1.5`, HuggingFace
                  `all-MiniLM-L6-v2`, Ollama `nomic-embed-text`, or Local 384d Hash vectors.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={embInput}
                  onChange={(e) => setEmbInput(e.target.value)}
                  rows={3}
                  placeholder="Enter one sentence per line to compare semantic similarity…"
                />
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Embedding provider"
                    value={embProvider}
                    onChange={(e) => setEmbProvider(e.target.value)}
                    className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  >
                    <option value="auto">Auto Free Cascade</option>
                    <option value="gemini">Google Gemini (text-embedding-004)</option>
                    <option value="cloudflare">Cloudflare (@cf/baai/bge-base-en-v1.5)</option>
                    <option value="huggingface">HuggingFace (all-MiniLM-L6-v2)</option>
                    <option value="ollama">Ollama Local (nomic-embed-text)</option>
                    <option value="local-hash">Local Deterministic Hash (384d)</option>
                  </select>
                  <Button onClick={() => void runStudioEmbeddings()} disabled={embLoading} size="sm">
                    {embLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Compute Vectors
                  </Button>
                </div>

                {embResult && (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {embResult.providerUsed} · {embResult.modelUsed}
                      </Badge>
                      <Badge variant="secondary">{embResult.dimensions} dimensions</Badge>
                      <span className="text-muted-foreground">{embResult.latencyMs}ms</span>
                    </div>
                    <div className="space-y-1">
                      {embResult.similarityPairs.map((pair) => (
                        <div
                          key={`${pair.a}-${pair.b}`}
                          className="flex items-center justify-between font-mono text-[11px]"
                        >
                          <span>
                            Line #{pair.a + 1} ↔ Line #{pair.b + 1}
                          </span>
                          <span className="font-semibold">{pair.cosine}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Free Voice STT (Groq Whisper) & Browser TTS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mic className="h-4 w-4 text-emerald-500" />
                  Free Speech-to-Text (Groq Whisper) & TTS Studio
                </CardTitle>
                <CardDescription className="text-xs">
                  Transcribe audio via Groq `whisper-large-v3-turbo` / HuggingFace Whisper, and
                  synthesize zero-cost voice responses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={recording ? "destructive" : "outline"}
                    onClick={() => void startOrStopRecording()}
                    disabled={sttLoading}
                  >
                    {recording ? (
                      <>
                        <Square className="h-3.5 w-3.5 mr-1.5" /> Stop & Transcribe
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5 mr-1.5" /> Record Mic (Whisper)
                      </>
                    )}
                  </Button>

                  <label className="inline-flex items-center">
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAudioForStt(f, f.name);
                      }}
                    />
                    <span className="inline-flex items-center h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted cursor-pointer">
                      Upload Audio File
                    </span>
                  </label>
                </div>

                {sttTranscript && (
                  <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
                    <div className="font-semibold mb-1">Whisper Transcript:</div>
                    <p>{sttTranscript}</p>
                  </div>
                )}

                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs">Free Browser / Edge Neural TTS Preview</Label>
                  <div className="flex gap-2">
                    <Input
                      value={ttsSample}
                      onChange={(e) => setTtsSample(e.target.value)}
                      className="text-xs"
                    />
                    <Button size="sm" variant="secondary" onClick={speakSampleText}>
                      <Volume2 className="h-4 w-4 mr-1" /> Speak
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 4. Free External Agent Tools Sandbox */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe2 className="h-4 w-4 text-purple-500" />
                  Free Agent Research APIs ($0 · No Key Needed)
                </CardTitle>
                <CardDescription className="text-xs">
                  Test live Open-Meteo Weather, Wikipedia Summary, OpenAlex Academic Research, and
                  Instant Web Search tools available to your dashboard agents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Free research tool"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  >
                    <option value="get_weather">Open-Meteo Weather (get_weather)</option>
                    <option value="wikipedia_lookup">Wikipedia REST (wikipedia_lookup)</option>
                    <option value="academic_research_lookup">
                      OpenAlex Papers (academic_research_lookup)
                    </option>
                    <option value="web_instant_search">
                      Free Web Search (web_instant_search)
                    </option>
                  </select>
                  <Input
                    value={toolQuery}
                    onChange={(e) => setToolQuery(e.target.value)}
                    placeholder="City, topic, or research query…"
                    className="h-9 text-xs"
                  />
                  <Button size="sm" onClick={() => void runResearchTool()} disabled={toolLoading}>
                    {toolLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Run
                  </Button>
                </div>

                {toolOutput && (
                  <pre className="rounded-lg border bg-muted/40 p-3 text-[11px] font-mono max-h-52 overflow-auto">
                    {toolOutput}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
