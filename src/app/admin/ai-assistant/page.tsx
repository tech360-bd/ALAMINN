"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, EmptyState } from "@/components/admin/page-primitives";
import { adminFetch, fmtDate } from "@/components/admin/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Sparkles, Play, Loader2, Settings2 } from "lucide-react";

type AiTask = {
  id: string;
  workflow: string;
  objective: string;
  prompt: string;
  status: string;
  result: string | null;
  sensitivity: string;
  approvalRequired: boolean;
  createdAt: string;
};

const WORKFLOWS = [
  { value: "article-draft", label: "Article Draft" },
  { value: "case-study-draft", label: "Case Study Draft" },
  { value: "executive-summary", label: "Executive Summary" },
  { value: "proposal-draft", label: "Client Proposal Draft" },
  { value: "seo-brief", label: "SEO Brief" },
  { value: "social-post", label: "Social Post (LinkedIn)" },
  { value: "operations-audit", label: "Operations Audit" },
  { value: "university-research", label: "Higher Study: University Research" },
  { value: "scholarship-guide", label: "Higher Study: Scholarship Guide" },
  { value: "sop-draft", label: "Higher Study: Statement of Purpose" },
  { value: "supervisor-outreach", label: "Higher Study: Supervisor Cold Email" },
  { value: "visa-checklist", label: "Higher Study: Visa Checklist" },
  { value: "ielts-lesson", label: "English Learning: IELTS Lesson Plan" },
  { value: "practice-questions", label: "English Learning: Practice Questions" },
  { value: "speaking-cue-card", label: "English Learning: Speaking Cue Card" },
  { value: "writing-feedback", label: "English Learning: Writing Band Rubric" },
  { value: "vocabulary-pack", label: "English Learning: Academic Vocabulary Pack" },
];

const FREE_PROVIDERS = [
  { value: "auto", label: "⚡ Auto Router (UnoRouter Primary + Free Fallback)" },
  { value: "unorouter", label: "UnoRouter ⭐ Primary (claude-opus-4-6-thinking)" },
  { value: "groq", label: "Groq Cloud ⭐ (Qwen3 / Llama 3.3)" },
  { value: "gemini", label: "Google AI Studio ⭐ (Gemini 2.5 Flash)" },
  { value: "cerebras", label: "Cerebras ⭐ (Llama 3.3 70B / Qwen3)" },
  { value: "openrouter", label: "OpenRouter (:free Models)" },
  { value: "github", label: "GitHub Models (GPT-4.1-mini / R1)" },
  { value: "cloudflare", label: "Cloudflare Workers AI" },
  { value: "sambanova", label: "SambaNova Cloud" },
  { value: "zhipu", label: "Zhipu AI (GLM-4.5-Flash)" },
  { value: "pollinations", label: "Pollinations.ai ✨ (Zero Key)" },
  { value: "ollama", label: "Ollama Local 🔒" },
  { value: "local-grounded", label: "Alaminn Grounded Local ✅" },
];

export default function AiAssistantPage() {
  return (
    <AdminShell>
      <AiAssistantInner />
    </AdminShell>
  );
}

function AiAssistantInner() {
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflow, setWorkflow] = useState("article-draft");
  const [preferredProvider, setPreferredProvider] = useState("auto");
  const [objective, setObjective] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sensitivity, setSensitivity] = useState("internal");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const env = await adminFetch<AiTask[]>("/api/v1/admin/ai-tasks?pageSize=50");
      setTasks(env.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load AI tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!objective.trim() || !prompt.trim()) {
      toast.error("Objective and prompt are required");
      return;
    }
    setSubmitting(true);
    try {
      const env = await adminFetch<AiTask>("/api/v1/admin/ai-tasks", {
        method: "POST",
        body: JSON.stringify({
          workflow,
          objective,
          prompt,
          sensitivity,
          approvalRequired,
          preferredProvider,
          executeNow: true,
        }),
      });
      toast.success(env.message || "AI workflow executed via Free AI Stack.");
      setObjective("");
      setPrompt("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function rerunTask(id: string) {
    setRunningId(id);
    try {
      const env = await adminFetch<AiTask>(`/api/v1/admin/ai-tasks/${id}`, {
        method: "POST",
        body: JSON.stringify({ preferredProvider }),
      });
      toast.success(env.message || "Task executed.");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Assistant & Governed Workflows"
        subtitle="Execute governed content, research, CRM, Higher Study, and IELTS workflows immediately on the 100% Free AI Stack with human approval gates."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ai-agents">
              <Settings2 className="h-4 w-4 mr-1.5" />
              Configure $0 Providers & 52 Agents
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Run Free AI Workflow
            </CardTitle>
            <CardDescription className="text-xs">
              Executes immediately via your configured $0 AI Router (Groq, Gemini, Cerebras,
              OpenRouter :free, GitHub Models, Pollinations, or Grounded Local) and routes to
              Approvals if enabled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Workflow</Label>
                  <select
                    aria-label="Workflow"
                    value={workflow}
                    onChange={(e) => setWorkflow(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {WORKFLOWS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Free AI Provider</Label>
                  <select
                    aria-label="Free AI Provider"
                    value={preferredProvider}
                    onChange={(e) => setPreferredProvider(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {FREE_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Objective *</Label>
                <Input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="One-line outcome expected"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prompt / Brief *</Label>
                <Textarea
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Context, audience, constraints, facts to include…"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sensitivity</Label>
                  <select
                    aria-label="Sensitivity"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={approvalRequired}
                      onChange={(e) => setApprovalRequired(e.target.checked)}
                    />
                    Require human approval
                  </label>
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating via Free AI Stack…
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4 mr-2" />
                    Execute Workflow ($0 Free AI)
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks & Deliverables</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tasks.length === 0 ? (
              <EmptyState message="No AI tasks yet — run your first $0 workflow on the left." />
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {tasks.map((t) => (
                  <div key={t.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {t.workflow}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {t.status}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={runningId === t.id}
                        onClick={() => void rerunTask(t.id)}
                      >
                        {runningId === t.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        {t.result ? "Re-run" : "Run"}
                      </Button>
                    </div>
                    <p className="text-sm font-medium line-clamp-1">{t.objective}</p>
                    {t.result && (
                      <pre className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded max-h-44 overflow-y-auto whitespace-pre-wrap">
                        {t.result}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
