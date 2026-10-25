/**
 * 100% Free AI Services — Smart Multi-Provider Router & Agent Engine
 * ==================================================================
 * Implements the complete $0 AI Agent architecture:
 *   1. Automatic fallback routing (Groq → Gemini → Cerebras → OpenRouter :free
 *      → GitHub → SambaNova → Zhipu → Mistral → Cloudflare → Pollinations
 *      → Local Ollama → ZAI → Grounded Local Engine)
 *   2. Smart complexity tier routing (small/fast models for routine queries,
 *      flagship/reasoning models for complex drafting & audits)
 *   3. LRU + TTL prompt cache to conserve free-tier rate limits
 *   4. Per-provider 429 rate-limit circuit breaker + exponential backoff
 *   5. Multi-step OpenAI-compatible tool-calling loop + pre-flight tool execution
 *   6. Free Embeddings (Gemini / Cloudflare / Mistral / Ollama / 384d Local Hash)
 *   7. Free Speech-to-Text (Groq Whisper / Cloudflare Whisper)
 */

import { createHash } from "crypto";
import type { Session } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { applySafetyGuardrails } from "@/lib/whatsapp/agent";
import {
  FREE_PROVIDER_MAP,
  normalizeOpenAiBaseUrl,
  resolveAllProviderConfigs,
  validateProviderBaseUrl,
  type FreeProviderId,
  type ModelSpeedTier,
  type ResolvedProviderConfig,
} from "./free-providers";
import {
  DASHBOARD_AGENT_BY_ID,
  resolveDashboardAgent,
  type DashboardAgentDefinition,
} from "./dashboard-agents";
import {
  buildDashboardSnapshot,
  buildPollinationsImageUrl,
  executeAgentTool,
  getOpenAiToolsForAgent,
  type OpenAiToolSchema,
  type ToolExecutionTrace,
} from "./free-tools";

export interface ChatTurnMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface FreeRouterCompletionOptions {
  systemPrompt?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  preferredProvider?: FreeProviderId | "auto";
  preferredModel?: string;
  tier?: ModelSpeedTier | "auto";
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  bypassCache?: boolean;
  cacheScope?: {
    userId?: string;
    role?: string;
    agentId?: string;
    extraKey?: string;
  };
  tools?: OpenAiToolSchema[];
  toolExecutor?: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ output: unknown; trace: ToolExecutionTrace }>;
  groundedFallbackContext?: {
    agent?: DashboardAgentDefinition;
    snapshot?: Record<string, unknown>;
    extraToolTraces?: ToolExecutionTrace[];
  };
}

export interface FreeRouterCompletionResult {
  content: string;
  reasoning?: string;
  providerUsed: FreeProviderId;
  providerName: string;
  modelUsed: string;
  tierUsed: ModelSpeedTier;
  cached: boolean;
  latencyMs: number;
  fallbackTrail: Array<{ provider: FreeProviderId; status: "skipped" | "cooldown" | "failed" | "ok"; detail?: string }>;
  toolTraces: ToolExecutionTrace[];
  generatedImages: string[];
}

interface ProviderRuntimeMetric {
  calls: number;
  successes: number;
  failures: number;
  rateLimits: number;
  totalLatencyMs: number;
  lastUsedAt: number | null;
  lastError: string | null;
  cooldownUntil: number;
}

interface CacheEntry {
  result: Omit<FreeRouterCompletionResult, "cached" | "latencyMs">;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 250;
const responseCache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

const providerMetrics = new Map<FreeProviderId, ProviderRuntimeMetric>();

function metricFor(id: FreeProviderId): ProviderRuntimeMetric {
  let m = providerMetrics.get(id);
  if (!m) {
    m = {
      calls: 0,
      successes: 0,
      failures: 0,
      rateLimits: 0,
      totalLatencyMs: 0,
      lastUsedAt: null,
      lastError: null,
      cooldownUntil: 0,
    };
    providerMetrics.set(id, m);
  }
  return m;
}

export function clearFreeRouterCache(): number {
  const count = responseCache.size;
  responseCache.clear();
  return count;
}

export function getFreeRouterTelemetry() {
  const now = Date.now();
  const perProvider: Record<string, unknown> = {};
  for (const [id, m] of providerMetrics.entries()) {
    perProvider[id] = {
      calls: m.calls,
      successes: m.successes,
      failures: m.failures,
      rateLimits: m.rateLimits,
      avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
      lastUsedAt: m.lastUsedAt ? new Date(m.lastUsedAt).toISOString() : null,
      lastError: m.lastError,
      inCooldown: m.cooldownUntil > now,
      cooldownRemainingSec: m.cooldownUntil > now ? Math.ceil((m.cooldownUntil - now) / 1000) : 0,
    };
  }
  return {
    cacheEntries: responseCache.size,
    cacheHits,
    cacheMisses,
    cacheHitRatePct:
      cacheHits + cacheMisses > 0
        ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
        : 0,
    providers: perProvider,
  };
}

/**
 * Classify prompt complexity to choose `fast` vs `flagship` vs `reasoning` model automatically.
 */
export function inferSpeedTier(promptText: string, requested?: ModelSpeedTier | "auto"): ModelSpeedTier {
  if (requested && requested !== "auto") return requested;
  const lower = promptText.toLowerCase();
  if (
    /\b(audit|verify|risk|forensic|policy|architecture|evaluate|compare|deep|reasoning|diff|strategy)\b/.test(
      lower
    ) &&
    promptText.length > 100
  ) {
    return "reasoning";
  }
  if (
    promptText.length > 160 ||
    /\b(draft|write|article|proposal|case study|syllabus|newsletter|plan|briefing|outline)\b/.test(lower)
  ) {
    return "flagship";
  }
  return "fast";
}

function selectModel(cfg: ResolvedProviderConfig, tier: ModelSpeedTier, explicitModel?: string): string {
  if (explicitModel?.trim()) return explicitModel.trim();
  if (cfg.customModel?.trim()) return cfg.customModel.trim();
  return cfg.spec.models[tier] || cfg.spec.models.flagship;
}

/**
 * Strip `<think>...</think>` blocks emitted by Qwen3 / DeepSeek-R1 models,
 * returning clean answer + extracted reasoning trace.
 */
export function splitReasoningTags(raw: string): { content: string; reasoning?: string } {
  const thinkMatches: string[] = [];
  const cleaned = raw
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner: string) => {
      if (inner?.trim()) thinkMatches.push(inner.trim());
      return "";
    })
    .trim();
  return {
    content: cleaned || raw.trim(),
    reasoning: thinkMatches.length > 0 ? thinkMatches.join("\n\n") : undefined,
  };
}

function sanitizePromptInput(text: string): string {
  return text
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/<\|im_start\|>|<\|im_end\|>/gi, "")
    .slice(0, 12000)
    .trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse an OpenAI-compatible Server-Sent Events (`text/event-stream`) payload
 * (e.g. UnoRouter `stream: true` with `claude-opus-4-6-thinking`).
 */
export function parseSseChatCompletionStream(rawSse: string): {
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
} {
  let content = "";
  let reasoning = "";
  const toolCallMap = new Map<
    number,
    { id: string; type: "function"; function: { name: string; arguments: string } }
  >();

  for (const rawLine of rawSse.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payloadStr = line.slice(5).trim();
    if (!payloadStr || payloadStr === "[DONE]") continue;
    try {
      const chunk = JSON.parse(payloadStr) as {
        choices?: Array<{
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            thinking?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              type?: "function";
              function?: { name?: string; arguments?: string };
            }>;
          };
          message?: {
            content?: string | null;
            reasoning_content?: string | null;
          };
        }>;
      };
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta) {
        if (typeof delta.content === "string") content += delta.content;
        const rChunk = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
        if (typeof rChunk === "string") reasoning += rChunk;
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolCallMap.get(idx) || {
              id: tc.id || `call_${idx}`,
              type: "function" as const,
              function: { name: "", arguments: "" },
            };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.function.name += tc.function.name;
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
            toolCallMap.set(idx, cur);
          }
        }
      } else if (choice?.message?.content) {
        content += choice.message.content;
      }
    } catch {
      // ignore malformed SSE keepalive frames
    }
  }

  const toolCalls = Array.from(toolCallMap.values()).filter((t) => Boolean(t.function.name));
  return {
    content: content.trim(),
    reasoning: reasoning.trim() || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/**
 * Perform an OpenAI-compatible `/chat/completions` call with exponential backoff on 5xx,
 * SSE stream & thinking extraction support, and instant 429 cooldown tagging.
 */
async function callOpenAiCompatibleProvider(
  cfg: ResolvedProviderConfig,
  model: string,
  messages: ChatTurnMessage[],
  opts: {
    temperature: number;
    maxTokens: number;
    stream?: boolean;
    tools?: OpenAiToolSchema[];
    timeoutMs?: number;
  }
): Promise<{
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}> {
  const normalizedBase = normalizeOpenAiBaseUrl(cfg.baseUrl);
  const url = `${normalizedBase}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  if (cfg.spec.id === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "https://alaminn.info";
    headers["X-Title"] = "Alaminn Command Center AI Agent";
  }

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.stream) {
    payload.stream = true;
  }
  if (opts.tools && opts.tools.length > 0 && cfg.spec.supportsToolCalling) {
    payload.tools = opts.tools;
    payload.tool_choice = "auto";
  }

  const maxAttempts = 2;
  let lastErr: Error | null = null;
  const isThinkingModel =
    cfg.spec.id === "unorouter" || /thinking|deepseek-r1|\br1\b/i.test(model);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutMs =
      opts.timeoutMs ||
      (cfg.spec.id === "ollama" ? 6000 : isThinkingModel ? 25000 : 14000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const m = metricFor(cfg.spec.id);
        m.rateLimits++;
        m.cooldownUntil = Date.now() + 45_000;
        throw new Error(`Rate limited (HTTP 429) on ${cfg.spec.name}`);
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        // If tool_choice/tools unsupported by this specific model, retry once without tools
        if (attempt === 0 && payload.tools && (res.status === 400 || res.status === 422)) {
          delete payload.tools;
          delete payload.tool_choice;
          continue;
        }
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          await sleep(350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180) || res.statusText}`);
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/event-stream")) {
        const sseText = await res.text();
        const parsedSse = parseSseChatCompletionStream(sseText);
        if (!parsedSse.content && (!parsedSse.toolCalls || parsedSse.toolCalls.length === 0)) {
          throw new Error("Empty SSE completion stream");
        }
        return parsedSse;
      }

      const rawText = await res.text();
      if (rawText.trimStart().startsWith("data:")) {
        const parsedSse = parseSseChatCompletionStream(rawText);
        if (parsedSse.content || (parsedSse.toolCalls && parsedSse.toolCalls.length > 0)) {
          return parsedSse;
        }
      }

      if (!contentType.includes("json") && cfg.spec.id === "pollinations") {
        return { content: rawText.trim() };
      }

      const data = JSON.parse(rawText) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            thinking?: string | null;
            tool_calls?: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        throw new Error("Empty choices in completion response");
      }

      const extraReasoning = (msg.reasoning_content || msg.reasoning || msg.thinking || "").trim();
      return {
        content: (msg.content || "").trim(),
        reasoning: extraReasoning || undefined,
        toolCalls: msg.tool_calls && msg.tool_calls.length > 0 ? msg.tool_calls : undefined,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1 && !lastErr.message.includes("429")) {
        await sleep(300);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error(`Failed calling ${cfg.spec.name}`);
}

/**
 * Call ZAI SDK (`z-ai-web-dev-sdk`) when available.
 */
async function callZaiProvider(messages: ChatTurnMessage[], temperature: number, maxTokens: number): Promise<string> {
  const ZAI = await import("z-ai-web-dev-sdk").catch(() => null);
  if (!ZAI?.default) {
    throw new Error("z-ai-web-dev-sdk not available");
  }
  const zai = await ZAI.default.create();
  const completion = await zai.chat.completions.create({
    messages: messages
      .filter((m) => m.role === "system" || m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
    temperature,
    max_tokens: maxTokens,
  });
  const text =
    typeof completion === "string"
      ? completion
      : completion?.choices?.[0]?.message?.content || completion?.content || "";
  if (!text.trim()) throw new Error("Empty response from ZAI SDK");
  return text.trim();
}

/**
 * Built-in Zero-Key Grounded Local Executive Synthesis Engine (`local-grounded`).
 * Produces structured, data-grounded markdown responses directly from live platform
 * database snapshots, executed tool outputs, and domain-specific executive playbooks —
 * guaranteeing 100% availability even offline or before external API keys are entered.
 */
function buildGroundedLocalResponse(
  userPrompt: string,
  agent?: DashboardAgentDefinition,
  snapshot?: Record<string, unknown>,
  traces: ToolExecutionTrace[] = [],
  toolOutputs: Array<{ tool: string; output: unknown }> = []
): string {
  const title = agent ? `${agent.name} — Executive Synthesis` : "Alaminn Free AI Agent — Synthesis";
  const sections: string[] = [`### ${title}`];

  // 1. Live Platform Snapshot Analysis
  if (snapshot && Object.keys(snapshot).length > 0) {
    const kpiLines: string[] = [];
    for (const [key, val] of Object.entries(snapshot)) {
      if (val === null || val === undefined) continue;
      if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") {
        kpiLines.push(`- **${formatHumanKey(key)}:** \`${String(val)}\``);
      } else if (Array.isArray(val)) {
        if (val.length === 0) {
          kpiLines.push(`- **${formatHumanKey(key)}:** _0 records currently in database_`);
        } else {
          const sample = val
            .slice(0, 4)
            .map((item) => summarizeRecord(item))
            .filter(Boolean)
            .join(" · ");
          kpiLines.push(`- **${formatHumanKey(key)} (${val.length} shown):** ${sample || "Available"}`);
        }
      } else if (typeof val === "object") {
        const subPairs = Object.entries(val as Record<string, unknown>)
          .map(([k, v]) => `${formatHumanKey(k)}: **${String(v)}**`)
          .join(" | ");
        if (subPairs) kpiLines.push(`- **${formatHumanKey(key)}:** ${subPairs}`);
      }
    }
    if (kpiLines.length > 0) {
      sections.push(`#### Live Dashboard Snapshot (\`${agent?.route || "/admin"}\`)\n${kpiLines.join("\n")}`);
    }
  }

  // 2. Executed Tool Results (Images, Weather, Wikipedia, Research, Created Tasks)
  const imageEmbeds: string[] = [];
  const toolSummaries: string[] = [];
  for (const item of toolOutputs) {
    const out = item.output as Record<string, unknown> | null;
    if (!out) continue;
    if (item.tool === "generate_free_image" && typeof out.imageUrl === "string") {
      imageEmbeds.push(`![Generated Free Visual](${out.imageUrl})\n- **Direct Pollinations FLUX URL ($0, No Key):** ${out.imageUrl}`);
    } else if (item.tool === "get_weather") {
      if (out.temperatureC !== undefined && out.temperatureC !== null) {
        toolSummaries.push(
          `- **Live Weather (${out.location}):** ${out.temperatureC}°C, Wind ${out.windSpeedKmh} km/h, Humidity ${out.humidityPct}% _(via Open-Meteo)_`
        );
      } else if (out.note) {
        toolSummaries.push(`- **Weather Lookup:** ${String(out.note)}`);
      }
    } else if (item.tool === "wikipedia_lookup") {
      toolSummaries.push(
        `- **Wikipedia (${out.title || "Lookup"}):** ${String(out.summary || out.note || "No extract")}`
      );
    } else if (item.tool === "academic_research_lookup") {
      const works = Array.isArray(out.works) ? out.works : [];
      if (works.length > 0) {
        toolSummaries.push(
          `- **OpenAlex Academic Works (${works.length}):** ` +
            works
              .map((w: Record<string, unknown>) => `"${w.title}" (${w.year || "n/a"}, ${w.citations || 0} citations)`)
              .join("; ")
        );
      } else if (out.note) {
        toolSummaries.push(`- **OpenAlex Research:** ${String(out.note)}`);
      }
    } else if (item.tool === "queue_governed_ai_task" && out.taskId) {
      toolSummaries.push(
        `- **Queued Governed AI Task:** \`${String(out.taskId)}\` (workflow: \`${String(out.workflow)}\`, status: \`${String(out.status)}\`)`
      );
    } else if (item.tool === "create_followup_task" && out.taskId) {
      toolSummaries.push(
        `- **Created Operational Task:** **${String(out.title)}** (\`${String(out.priority)}\` priority, ID \`${String(out.taskId)}\`)`
      );
    } else if (item.tool === "search_dashboard_records") {
      toolSummaries.push(`- **Database Search Results:** \`${JSON.stringify(out).slice(0, 360)}\``);
    }
  }

  if (imageEmbeds.length > 0) {
    sections.push(`#### Generated Free Visual Asset\n${imageEmbeds.join("\n\n")}`);
  }
  if (toolSummaries.length > 0) {
    sections.push(`#### Executed Agent Tools\n${toolSummaries.join("\n")}`);
  }

  // 3. Domain-Specific Actionable Guidance tailored to user's prompt & active dashboard
  sections.push(buildDomainGuidance(userPrompt, agent, snapshot));

  // 4. Tip on connecting cloud keys if running purely local
  if (traces.length >= 0) {
    sections.push(
      `> **Engine Note:** Answered via **Alaminn Grounded Local Engine** ($0, zero external API calls). Add any free API key (**Groq**, **Google AI Studio Gemini**, **Cerebras**, or **OpenRouter \`:free\`**) in **[Free AI Agents Hub](/admin/ai-agents)** to unlock 70B+ / 1M-context generative cloud models with automatic fallback.`
    );
  }

  return sections.join("\n\n");
}

function formatHumanKey(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarizeRecord(rec: unknown): string {
  if (!rec || typeof rec !== "object") return String(rec);
  const r = rec as Record<string, unknown>;
  const label =
    r.title ||
    r.officialName ||
    r.fullName ||
    r.name ||
    r.studentName ||
    r.displayName ||
    r.reference ||
    r.action ||
    r.eventName ||
    r.filename ||
    r.slug;
  const sub =
    r.status ||
    r.stage ||
    r.verificationStatus ||
    r.category ||
    r.level ||
    r.role ||
    r.priority;
  if (label && sub) return `${String(label)} (${String(sub)})`;
  if (label) return String(label);
  return JSON.stringify(r).slice(0, 60);
}

function buildDomainGuidance(
  prompt: string,
  agent?: DashboardAgentDefinition,
  snapshot?: Record<string, unknown>
): string {
  const lower = prompt.toLowerCase();
  const domain = agent?.group || "Overview";
  const agentRole = agent?.roleTitle || "Executive Advisor";

  if (/\b(draft|write|template|copy|post|outline|lesson|question|mcq|sop)\b/.test(lower)) {
    return [
      `#### Structured Draft (${agentRole})`,
      `**Objective:** ${prompt.slice(0, 180)}`,
      `1. **Executive Hook / Opening:** Lead with a concrete observation grounded in verified operational reality — avoid generic buzzwords.`,
      `2. **Core Framework (${domain}):**`,
      `   - **Context & Baseline:** Reference verified facts and current ${agent?.name || "platform"} state.`,
      `   - **Intervention / Structure:** Define clear ownership, measurable checkpoints, and verification criteria.`,
      `   - **Next Step / CTA:** Close with a single low-friction action (e.g., book a discovery consultation, verify official source URL, or submit for human approval).`,
      `3. **Governance Check:** Ensure no unverified statistics or admission/visa/scholarship outcome guarantees appear before publishing.`,
    ].join("\n");
  }

  const recommendations: Record<string, string[]> = {
    Overview: [
      "Clear any `awaiting-approval` AI tasks first so content and outreach pipelines stay unblocked.",
      "Review new inbound inquiries within a <24h executive SLA and convert qualified leads into tracked Opportunities.",
      "Audit due/overdue operational tasks and assign concrete owners before end of day.",
    ],
    CRM: [
      "Prioritize contacts and inquiries in `new` or `review-required` state before nurturing older cohorts.",
      "Log structured call notes immediately after discovery sessions and attach a dated follow-up task.",
      "Verify explicit privacy & communication consent flags before initiating WhatsApp or referral handoffs.",
    ],
    Content: [
      "Balance bottom-of-funnel case studies with executive authority articles across AI, CRM, and international education.",
      "Ensure every project and case study carries an explicit `evidenceStatus` and appropriate `confidentiality` tier.",
      "Attach descriptive WCAG alt-text and Pollinations/brand cover visuals before switching `draft` → `published`.",
    ],
    "Higher Study": [
      "Cross-check time-sensitive fields (tuition fees, IELTS waivers, intake deadlines, scholarship amounts) against `officialSourceUrl` and stamp `lastVerifiedAt`.",
      "Prioritize HIGH and CRITICAL pending items in Higher Study 7-day source monitoring before bulk catalogue edits.",
      "Maintain strict compliance: frame eligibility as preliminary guidance — final admission, scholarship, and visa decisions rest with official authorities.",
    ],
    "English Learning": [
      "Align course modules, lessons, and practice tests clearly by target exam/band (`IELTS`, `TOEFL`, `PTE`, `DET`, `CEFR`).",
      "Include detailed answer explanations on every practice question so learners understand why distractors are incorrect.",
      "Keep at least 1–2 `isFreePreview` lessons per published course to drive organic student enrollment.",
    ],
    "AI & Insights": [
      "Configure at least two zero-card providers (e.g., Groq + Google AI Studio Gemini + OpenRouter `:free`) for instant automatic failover.",
      "Keep `Approval Required` enabled on external-facing workflows so human reviewers sign off on every deliverable.",
      "Monitor first-party UTM event trends weekly to double down on highest-intent referral channels.",
    ],
    "Social Command": [
      "Keep high-risk categories (pricing, complaints, visa/admission questions) routed to `approval` or `escalate`.",
      "Check connected account token expiration dates proactively to prevent silent webhook/send interruptions.",
      "Remember: toggling global automation OFF blocks automated replies immediately at the send boundary while preserving manual inbox replies.",
    ],
    System: [
      "Enforce least-privilege RBAC roles — reserve `SUPER_ADMIN` and `OWNER` strictly for core principals.",
      "Review audit logs regularly for role changes, settings updates, and integration errors.",
      "Verify SPF/DKIM/SMTP test delivery and backup retention (`BACKUP_RETENTION_COUNT`) before major releases.",
    ],
  };

  const bullets = (recommendations[domain] || recommendations.Overview)
    .map((b, idx) => `${idx + 1}. ${b}`)
    .join("\n");

  const snapEmptyHint =
    snapshot && JSON.stringify(snapshot).includes(":0")
      ? "\n\n_Tip: Several counters in this module are currently `0` — use the **Create / Add** button on this dashboard or run `npm run db:seed` to populate starter records._"
      : "";

  return `#### Recommended Executive Actions (${domain})\n${bullets}${snapEmptyHint}`;
}

/**
 * Core multi-provider router execution with caching, fallback, and tool-calling loop.
 */
export async function runFreeAiRouter(
  opts: FreeRouterCompletionOptions
): Promise<FreeRouterCompletionResult> {
  const startedAt = Date.now();
  const { providers, global } = await resolveAllProviderConfigs();

  const lastUserMsg =
    [...opts.messages].reverse().find((m) => m.role === "user")?.content || "";
  const resolvedSystemPrompt =
    opts.systemPrompt ||
    opts.messages.find((m) => m.role === "system")?.content ||
    "You are an executive assistant for Alaminn.info.";
  const sanitizedUser = sanitizePromptInput(lastUserMsg);
  const tierUsed = global.smartTierRouting
    ? inferSpeedTier(sanitizedUser, opts.tier)
    : opts.tier && opts.tier !== "auto"
      ? opts.tier
      : "flagship";

  const temperature = opts.temperature ?? 0.35;
  const maxTokens = opts.maxTokens ?? 1400;

  // Check cache (skip if user asks to create/queue a task or bypassCache=true)
  const isMutatingPrompt = /\b(create_followup_task|queue_governed_ai_task|create a task|queue .* task)\b/i.test(
    sanitizedUser
  );
  // Isolate cache strictly by userId + role + agentId + full systemPrompt + conversation history (SEC-02)
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        uid: opts.cacheScope?.userId || "anon",
        role: opts.cacheScope?.role || "none",
        agent: opts.cacheScope?.agentId || opts.groundedFallbackContext?.agent?.id || "global",
        extra: opts.cacheScope?.extraKey || "",
        sys: resolvedSystemPrompt,
        msgs: opts.messages,
        pref: opts.preferredProvider || global.preferredProvider,
        model: opts.preferredModel || "",
        tier: tierUsed,
      })
    )
    .digest("hex");

  const didExecuteMutatingTool = (traces: ToolExecutionTrace[]) =>
    traces.some(
      (t) => t.tool === "create_followup_task" || t.tool === "queue_governed_ai_task"
    );

  if (global.cacheEnabled && !opts.bypassCache && !isMutatingPrompt) {
    const hit = responseCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      cacheHits++;
      return {
        ...hit.result,
        cached: true,
        latencyMs: Date.now() - startedAt,
      };
    }
    cacheMisses++;
  }

  // Build ordered candidate provider list
  const requestedProvider =
    opts.preferredProvider && opts.preferredProvider !== "auto"
      ? opts.preferredProvider
      : global.preferredProvider !== "auto"
        ? global.preferredProvider
        : null;

  const providerById = new Map(providers.map((p) => [p.spec.id, p]));
  const orderedIds: FreeProviderId[] = [];
  if (requestedProvider && providerById.has(requestedProvider)) {
    orderedIds.push(requestedProvider);
  }
  for (const id of global.fallbackOrder) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }
  if (!orderedIds.includes("local-grounded")) {
    orderedIds.push("local-grounded");
  }

  const fallbackTrail: FreeRouterCompletionResult["fallbackTrail"] = [];
  const allToolTraces: ToolExecutionTrace[] = [
    ...(opts.groundedFallbackContext?.extraToolTraces || []),
  ];
  const collectedToolOutputs: Array<{ tool: string; output: unknown }> = [];
  const generatedImages: string[] = [];

  // Pre-execute free image tool if prompt explicitly asks for an image/banner/graphic/visual
  // so EVERY provider (even text-only or local-grounded) delivers a working Pollinations image!
  if (
    opts.toolExecutor &&
    opts.tools?.some((t) => t.function.name === "generate_free_image") &&
    /\b(generate_free_image|generate .*image|create .*image|create .*banner|generate .*banner|cover image|illustration|graphic|visual)\b/i.test(
      sanitizedUser
    )
  ) {
    const imgRes = await opts.toolExecutor("generate_free_image", {
      prompt: sanitizedUser.replace(/use generate_free_image to/i, "").trim(),
      aspect: "landscape",
    });
    allToolTraces.push(imgRes.trace);
    collectedToolOutputs.push({ tool: "generate_free_image", output: imgRes.output });
    if (imgRes.trace.imageUrl) generatedImages.push(imgRes.trace.imageUrl);
  }

  // Pre-execute weather if explicitly requested
  const weatherMatch =
    opts.toolExecutor &&
    opts.tools?.some((t) => t.function.name === "get_weather") &&
    sanitizedUser.match(/\bweather\s+(?:in|for|at)\s+([A-Za-z][A-Za-z\s-]{1,30})/i);
  if (weatherMatch && opts.toolExecutor) {
    const city = weatherMatch[1].replace(/\b(and|right now|today|for|to)\b.*$/i, "").trim();
    if (city) {
      const wRes = await opts.toolExecutor("get_weather", { city });
      allToolTraces.push(wRes.trace);
      collectedToolOutputs.push({ tool: "get_weather", output: wRes.output });
    }
  }

  const now = Date.now();

  for (const providerId of orderedIds) {
    const cfg = providerById.get(providerId);
    if (!cfg) continue;

    if (!cfg.enabled && providerId !== requestedProvider && providerId !== "local-grounded") {
      fallbackTrail.push({ provider: providerId, status: "skipped", detail: "Disabled" });
      continue;
    }

    if (!cfg.configured && providerId !== "local-grounded") {
      fallbackTrail.push({ provider: providerId, status: "skipped", detail: "API key not configured" });
      continue;
    }

    const metric = metricFor(providerId);
    if (metric.cooldownUntil > now) {
      fallbackTrail.push({ provider: providerId, status: "cooldown", detail: "429 rate-limit cooldown" });
      continue;
    }

    // Built-in Grounded Local Engine (final guaranteed $0 fallback)
    if (providerId === "local-grounded") {
      const callStart = Date.now();
      metric.calls++;
      const grounded = buildGroundedLocalResponse(
        sanitizedUser,
        opts.groundedFallbackContext?.agent,
        opts.groundedFallbackContext?.snapshot,
        allToolTraces,
        collectedToolOutputs
      );
      const safeContent = applySafetyGuardrails(grounded);
      metric.successes++;
      metric.lastUsedAt = Date.now();
      metric.totalLatencyMs += Date.now() - callStart;
      fallbackTrail.push({ provider: "local-grounded", status: "ok" });

      const finalResult: Omit<FreeRouterCompletionResult, "cached" | "latencyMs"> = {
        content: safeContent,
        providerUsed: "local-grounded",
        providerName: cfg.spec.name,
        modelUsed: cfg.spec.models.flagship,
        tierUsed,
        fallbackTrail,
        toolTraces: allToolTraces,
        generatedImages,
      };
      if (
        global.cacheEnabled &&
        !opts.bypassCache &&
        !isMutatingPrompt &&
        !didExecuteMutatingTool(allToolTraces)
      ) {
        if (responseCache.size >= MAX_CACHE_ENTRIES) {
          const oldest = responseCache.keys().next().value;
          if (oldest) responseCache.delete(oldest);
        }
        responseCache.set(cacheKey, {
          result: finalResult,
          expiresAt: Date.now() + global.cacheTtlSeconds * 1000,
        });
      }
      return {
        ...finalResult,
        cached: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    const modelToUse = selectModel(
      cfg,
      tierUsed,
      providerId === requestedProvider ? opts.preferredModel : undefined
    );
    const callStart = Date.now();
    metric.calls++;

    try {
      let rawOutput = "";
      let upstreamReasoning: string | undefined;

      if (providerId === "zai") {
        const turnMessages: ChatTurnMessage[] = [
          { role: "system", content: resolvedSystemPrompt },
          ...opts.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role,
              content: sanitizePromptInput(m.content),
            })),
        ];
        rawOutput = await callZaiProvider(turnMessages, temperature, maxTokens);
      } else {
        // OpenAI-compatible multi-step tool loop (up to 4 iterations)
        const conversation: ChatTurnMessage[] = [
          { role: "system", content: resolvedSystemPrompt },
          ...opts.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role,
              content: sanitizePromptInput(m.content),
            })),
        ];
        if (collectedToolOutputs.length > 0) {
          conversation.push({
            role: "system",
            content: `PRE-EXECUTED TOOL CONTEXT:\n${JSON.stringify(collectedToolOutputs, null, 2)}`,
          });
        }

        for (let step = 0; step < 4; step++) {
          const resp = await callOpenAiCompatibleProvider(cfg, modelToUse, conversation, {
            temperature,
            maxTokens,
            stream: opts.stream,
            tools: opts.toolExecutor ? opts.tools : undefined,
          });
          if (resp.reasoning) {
            upstreamReasoning = upstreamReasoning
              ? `${upstreamReasoning}\n\n${resp.reasoning}`
              : resp.reasoning;
          }

          if (!resp.toolCalls || resp.toolCalls.length === 0 || !opts.toolExecutor) {
            rawOutput = resp.content;
            break;
          }

          conversation.push({
            role: "assistant",
            content: resp.content || "",
            tool_calls: resp.toolCalls,
          });

          for (const tc of resp.toolCalls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              parsedArgs = {};
            }
            const executed = await opts.toolExecutor(tc.function.name, parsedArgs);
            allToolTraces.push(executed.trace);
            collectedToolOutputs.push({ tool: tc.function.name, output: executed.output });
            if (executed.trace.imageUrl) {
              generatedImages.push(executed.trace.imageUrl);
            }
            conversation.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(executed.output).slice(0, 4000),
            });
          }
        }
      }

      if (!rawOutput.trim()) {
        throw new Error("Empty model output");
      }

      const { content: cleanedContent, reasoning: tagReasoning } = splitReasoningTags(rawOutput);
      const reasoning =
        [upstreamReasoning, tagReasoning].filter(Boolean).join("\n\n") || undefined;
      let finalContent = applySafetyGuardrails(cleanedContent);
      // Append markdown image preview if an image was generated during tool calling and not yet embedded
      for (const imgUrl of generatedImages) {
        if (!finalContent.includes(imgUrl)) {
          finalContent += `\n\n![Generated Visual](${imgUrl})`;
        }
      }

      metric.successes++;
      metric.lastUsedAt = Date.now();
      metric.totalLatencyMs += Date.now() - callStart;
      metric.lastError = null;
      fallbackTrail.push({ provider: providerId, status: "ok" });

      const resultObj: Omit<FreeRouterCompletionResult, "cached" | "latencyMs"> = {
        content: finalContent,
        reasoning,
        providerUsed: providerId,
        providerName: cfg.spec.name,
        modelUsed: modelToUse,
        tierUsed,
        fallbackTrail,
        toolTraces: allToolTraces,
        generatedImages,
      };

      if (
        global.cacheEnabled &&
        !opts.bypassCache &&
        !isMutatingPrompt &&
        !didExecuteMutatingTool(allToolTraces)
      ) {
        if (responseCache.size >= MAX_CACHE_ENTRIES) {
          const oldest = responseCache.keys().next().value;
          if (oldest) responseCache.delete(oldest);
        }
        responseCache.set(cacheKey, {
          result: resultObj,
          expiresAt: Date.now() + global.cacheTtlSeconds * 1000,
        });
      }

      return {
        ...resultObj,
        cached: false,
        latencyMs: Date.now() - startedAt,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      metric.failures++;
      metric.lastError = errMsg.slice(0, 200);
      metric.totalLatencyMs += Date.now() - callStart;
      fallbackTrail.push({ provider: providerId, status: "failed", detail: errMsg.slice(0, 140) });
    }
  }

  // Unreachable because local-grounded is always appended, but TypeScript-safe fallback:
  return {
    content: "Alaminn AI Agent ready.",
    providerUsed: "local-grounded",
    providerName: FREE_PROVIDER_MAP["local-grounded"].name,
    modelUsed: "alaminn-grounded-v1",
    tierUsed,
    cached: false,
    latencyMs: Date.now() - startedAt,
    fallbackTrail,
    toolTraces: allToolTraces,
    generatedImages,
  };
}

export class AgentPermissionError extends Error {
  public readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "AgentPermissionError";
  }
}

/**
 * High-level orchestrator for any Admin Dashboard's own AI Agent!
 */
export async function runDashboardAgentChat(params: {
  session: Session;
  agentId?: string;
  pathname?: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  preferredProvider?: FreeProviderId | "auto";
  preferredModel?: string;
  tier?: ModelSpeedTier | "auto";
  bypassCache?: boolean;
}) {
  const agent =
    (params.agentId && DASHBOARD_AGENT_BY_ID[params.agentId]) ||
    resolveDashboardAgent(params.pathname || "/admin");

  if (!hasPermission(params.session.role, agent.requiredPermission)) {
    throw new AgentPermissionError(
      `Forbidden: role ${params.session.role} lacks required permission ${agent.requiredPermission} for ${agent.name}.`
    );
  }

  const { global } = await resolveAllProviderConfigs();

  // Always pull live RBAC-checked dashboard snapshot so the agent is grounded in real data
  const snapshotStart = Date.now();
  const snapshot = await buildDashboardSnapshot(agent.id, params.session);
  const snapshotTrace: ToolExecutionTrace = {
    tool: "get_dashboard_snapshot",
    args: { dashboardId: agent.id },
    ok: true,
    summary: `Loaded live ${agent.name} database snapshot`,
    durationMs: Date.now() - snapshotStart,
  };

  const fullSystemPrompt = [
    agent.systemPrompt,
    `CURRENT ADMIN DASHBOARD: ${agent.name} (${agent.route}) — Module: ${agent.group}`,
    `CURRENT ADMIN CALLER: ${params.session.name} (Role: ${params.session.role})`,
    `TODAY'S DATE: ${new Date().toISOString().split("T")[0]}`,
    `LIVE VERIFIED DATABASE SNAPSHOT:\n${JSON.stringify(snapshot, null, 2).slice(0, 5000)}`,
  ].join("\n\n");

  const tools = getOpenAiToolsForAgent(agent, global.enableExternalFreeTools);

  const historyMessages = (params.history || []).slice(-8).map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const routerResult = await runFreeAiRouter({
    systemPrompt: fullSystemPrompt,
    messages: [...historyMessages, { role: "user", content: params.message }],
    preferredProvider: params.preferredProvider,
    preferredModel: params.preferredModel,
    tier: params.tier && params.tier !== "auto" ? params.tier : agent.recommendedTier,
    bypassCache: params.bypassCache,
    cacheScope: {
      userId: params.session.userId,
      role: params.session.role,
      agentId: agent.id,
    },
    tools,
    toolExecutor: (toolName, args) =>
      executeAgentTool(toolName as Parameters<typeof executeAgentTool>[0], args, {
        session: params.session,
        agent,
      }),
    groundedFallbackContext: {
      agent,
      snapshot,
      extraToolTraces: [snapshotTrace],
    },
  });

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      roleTitle: agent.roleTitle,
      route: agent.route,
      group: agent.group,
    },
    snapshot,
    ...routerResult,
  };
}

// ─── Free Embeddings (RAG / Memory) ───────────────────────────────────

/**
 * Deterministic 384-dimensional L2-normalized local feature-hashing embedding.
 * Gives meaningful lexical/n-gram cosine similarity at $0 with zero network calls.
 */
export function computeLocalHashEmbedding(text: string, dim = 384): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const features = [tokens[i]];
    if (i + 1 < tokens.length) features.push(`${tokens[i]}_${tokens[i + 1]}`);
    for (const feat of features) {
      let h = 2166136261;
      for (let c = 0; c < feat.length; c++) {
        h ^= feat.charCodeAt(c);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dim;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? Number((dot / denom).toFixed(4)) : 0;
}

export async function generateFreeEmbeddings(
  texts: string[],
  preferredProvider?: string
): Promise<{
  embeddings: number[][];
  providerUsed: string;
  modelUsed: string;
}> {
  const cleanTexts = texts.map((t) => t.slice(0, 4000));
  if (preferredProvider === "local-grounded") {
    return {
      embeddings: cleanTexts.map((t) => computeLocalHashEmbedding(t, 384)),
      providerUsed: "local-grounded",
      modelUsed: "alaminn-hash-embed-384",
    };
  }

  const { providers } = await resolveAllProviderConfigs();

  const embedCandidates = providers.filter(
    (p) =>
      p.enabled &&
      p.configured &&
      p.spec.supportsEmbeddings &&
      p.spec.id !== "local-grounded" &&
      p.spec.models.embeddings &&
      p.spec.models.embeddings.length > 0
  );

  if (preferredProvider && preferredProvider !== "auto") {
    embedCandidates.sort((a, b) =>
      a.spec.id === preferredProvider ? -1 : b.spec.id === preferredProvider ? 1 : 0
    );
  }

  for (const cfg of embedCandidates) {
    const model = cfg.spec.models.embeddings![0];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${normalizeOpenAiBaseUrl(cfg.baseUrl)}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: cleanTexts }),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const vectors = (json.data || []).map((d) => d.embedding || []).filter((v) => v.length > 0);
      if (vectors.length === cleanTexts.length) {
        return {
          embeddings: vectors,
          providerUsed: cfg.spec.id,
          modelUsed: model,
        };
      }
    } catch {
      // fall through to next free embedding provider
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    embeddings: cleanTexts.map((t) => computeLocalHashEmbedding(t, 384)),
    providerUsed: "local-grounded",
    modelUsed: "alaminn-hash-embed-384",
  };
}

// ─── Free Speech-to-Text (Groq Whisper / Cloudflare Whisper) ──────────

export async function transcribeFreeSpeech(
  audioBlob: Blob,
  filename = "audio.webm"
): Promise<{ text: string; providerUsed: string; modelUsed: string }> {
  const { providers } = await resolveAllProviderConfigs();
  const groq = providers.find((p) => p.spec.id === "groq" && p.configured && p.enabled);

  if (groq) {
    const form = new FormData();
    form.append("file", audioBlob, filename);
    form.append("model", "whisper-large-v3-turbo");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${normalizeOpenAiBaseUrl(groq.baseUrl)}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${groq.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text) {
          return {
            text: data.text.trim(),
            providerUsed: "groq",
            modelUsed: "whisper-large-v3-turbo",
          };
        }
      }
    } catch {
      // fall through to Cloudflare Whisper if configured
    } finally {
      clearTimeout(timer);
    }
  }

  const cf = providers.find(
    (p) => p.spec.id === "cloudflare" && p.configured && p.enabled && p.accountId
  );
  if (cf) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const bytes = await audioBlob.arrayBuffer();
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
          cf.accountId
        )}/ai/run/@cf/openai/whisper`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cf.apiKey}`,
            "Content-Type": "application/octet-stream",
          },
          body: bytes,
          signal: controller.signal,
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { result?: { text?: string }; text?: string };
        const text = (data.result?.text || data.text || "").trim();
        if (text) {
          return {
            text,
            providerUsed: "cloudflare",
            modelUsed: "@cf/openai/whisper",
          };
        }
      }
    } catch {
      // fall through
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    "Cloud STT requires GROQ_API_KEY (whisper-large-v3-turbo) or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (@cf/openai/whisper). Tip: Browser microphone transcription works immediately in Chrome/Edge with zero API keys."
  );
}

/**
 * Test a specific AI Provider connection live (supports ephemeral unsaved UI overrides safely).
 */
export async function testFreeProviderConnection(
  providerId: FreeProviderId,
  overrides?: {
    model?: string;
    apiKeyOverride?: string;
    baseUrlOverride?: string;
    accountIdOverride?: string;
  }
): Promise<{
  ok: boolean;
  providerId: FreeProviderId;
  providerName: string;
  modelTested: string;
  modelUsed: string;
  latencyMs: number;
  sampleReply?: string;
  error?: string;
}> {
  const started = Date.now();
  const { providers } = await resolveAllProviderConfigs();
  const baseCfg = providers.find((p) => p.spec.id === providerId);
  if (!baseCfg) {
    return {
      ok: false,
      providerId,
      providerName: providerId,
      modelTested: "n/a",
      modelUsed: "n/a",
      latencyMs: 0,
      error: "Unknown provider ID.",
    };
  }

  let effectiveBaseUrl = baseCfg.baseUrl;
  const trimmedBaseOverride = overrides?.baseUrlOverride?.trim();
  if (trimmedBaseOverride) {
    const check = validateProviderBaseUrl(providerId, trimmedBaseOverride);
    if (!check.ok) {
      return {
        ok: false,
        providerId,
        providerName: baseCfg.spec.name,
        modelTested: overrides?.model || baseCfg.customModel || baseCfg.spec.models.fast,
        modelUsed: overrides?.model || baseCfg.customModel || baseCfg.spec.models.fast,
        latencyMs: Date.now() - started,
        error: check.error || "Invalid base URL.",
      };
    }
    if (check.normalizedUrl) {
      effectiveBaseUrl = check.normalizedUrl;
    }
  }

  const trimmedKeyOverride =
    overrides?.apiKeyOverride && !overrides.apiKeyOverride.includes("••••")
      ? overrides.apiKeyOverride.trim()
      : "";
  const trimmedAccountOverride =
    overrides?.accountIdOverride && !overrides.accountIdOverride.includes("••••")
      ? overrides.accountIdOverride.trim()
      : "";

  const effectiveAccountId = trimmedAccountOverride || baseCfg.accountId;
  if (providerId === "cloudflare" && effectiveAccountId) {
    effectiveBaseUrl = effectiveBaseUrl.replace("{accountId}", effectiveAccountId);
  }

  // Never send stored/env API keys to a non-official host supplied via `baseUrlOverride` (SEC-03)
  let effectiveApiKey = trimmedKeyOverride || baseCfg.apiKey;
  if (!trimmedKeyOverride && effectiveApiKey && baseCfg.spec.defaultBaseUrl.startsWith("https://")) {
    try {
      const officialHost = new URL(
        baseCfg.spec.defaultBaseUrl.replace("{accountId}", "account")
      ).hostname;
      const targetHost = new URL(effectiveBaseUrl.replace("{accountId}", "account")).hostname;
      if (officialHost !== targetHost) {
        return {
          ok: false,
          providerId,
          providerName: baseCfg.spec.name,
          modelTested: overrides?.model || baseCfg.customModel || baseCfg.spec.models.fast,
          modelUsed: overrides?.model || baseCfg.customModel || baseCfg.spec.models.fast,
          latencyMs: Date.now() - started,
          error:
            "Supply an explicit API key when testing a custom non-default host (existing server keys are never sent to custom hosts).",
        };
      }
    } catch {
      return {
        ok: false,
        providerId,
        providerName: baseCfg.spec.name,
        modelTested: baseCfg.spec.models.fast,
        modelUsed: baseCfg.spec.models.fast,
        latencyMs: Date.now() - started,
        error: "Invalid base URL.",
      };
    }
  }

  const isConfigured = !baseCfg.spec.requiresKey
    ? providerId === "ollama"
      ? Boolean(baseCfg.configured || trimmedBaseOverride)
      : true
    : baseCfg.spec.requiresAccountId
      ? Boolean(effectiveApiKey && effectiveAccountId)
      : Boolean(effectiveApiKey);

  const cfg: ResolvedProviderConfig = {
    ...baseCfg,
    apiKey: effectiveApiKey,
    baseUrl: effectiveBaseUrl,
    accountId: effectiveAccountId,
    configured: isConfigured,
  };

  if (providerId === "local-grounded") {
    return {
      ok: true,
      providerId,
      providerName: cfg.spec.name,
      modelTested: cfg.spec.models.fast,
      modelUsed: cfg.spec.models.fast,
      latencyMs: Date.now() - started,
      sampleReply: "Alaminn Grounded Local Engine online and ready ($0, zero external dependencies).",
    };
  }

  const model = overrides?.model?.trim() || cfg.customModel || cfg.spec.models.fast;

  if (!cfg.configured) {
    return {
      ok: false,
      providerId,
      providerName: cfg.spec.name,
      modelTested: model,
      modelUsed: model,
      latencyMs: Date.now() - started,
      error: cfg.spec.requiresAccountId
        ? "API Token and Account ID are required."
        : cfg.spec.id === "ollama"
          ? "Enable Ollama and ensure `ollama serve` is running locally."
          : "API key not configured yet.",
    };
  }

  try {
    if (providerId === "zai") {
      const reply = await callZaiProvider(
        [{ role: "user", content: "Reply with the exact phrase: Connection verified." }],
        0.1,
        32
      );
      return {
        ok: true,
        providerId,
        providerName: cfg.spec.name,
        modelTested: model,
        modelUsed: model,
        latencyMs: Date.now() - started,
        sampleReply: reply.slice(0, 160),
      };
    }

    const res = await callOpenAiCompatibleProvider(
      cfg,
      model,
      [{ role: "user", content: "Reply briefly in one sentence confirming you are online." }],
      {
        temperature: 0.1,
        maxTokens: 96,
        timeoutMs: providerId === "unorouter" || /thinking/i.test(model) ? 20000 : 10000,
      }
    );
    const { content } = splitReasoningTags(res.content);
    return {
      ok: true,
      providerId,
      providerName: cfg.spec.name,
      modelTested: model,
      modelUsed: model,
      latencyMs: Date.now() - started,
      sampleReply: (content || "Connected (thinking trace received).").slice(0, 200),
    };
  } catch (e) {
    return {
      ok: false,
      providerId,
      providerName: cfg.spec.name,
      modelTested: model,
      modelUsed: model,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export { buildPollinationsImageUrl };
