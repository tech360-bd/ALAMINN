import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DASHBOARD_AGENTS,
  DASHBOARD_AGENT_BY_ID,
  DASHBOARD_AGENT_GROUPS,
  resolveDashboardAgent,
  buildAgentSystemPrompt,
} from "@/lib/ai/dashboard-agents";
import {
  FREE_AI_PROVIDERS,
  FREE_PROVIDER_MAP,
  DEFAULT_FALLBACK_ORDER,
  decryptStoredAiSecret,
  encryptStoredAiSecret,
  invalidateFreeAiSettingsCache,
  maskSecret,
  normalizeOpenAiBaseUrl,
  resolveAllProviderConfigs,
  validateProviderBaseUrl,
} from "@/lib/ai/free-providers";
import {
  AgentPermissionError,
  inferSpeedTier,
  parseSseChatCompletionStream,
  splitReasoningTags,
  computeLocalHashEmbedding,
  cosineSimilarity,
  runDashboardAgentChat,
  runFreeAiRouter,
  clearFreeRouterCache,
} from "@/lib/ai/free-router";
import { buildPollinationsImageUrl, executeAgentTool } from "@/lib/ai/free-tools";
import { WORKFLOW_PROMPTS } from "@/lib/ai/workflow-executor";
import { hasPermission } from "@/lib/rbac";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.UNOROUTER_API_KEY;
  delete process.env.UNOROUTER_BASE_URL;
  delete process.env.FREE_AI_PREFERRED_PROVIDER;
  delete process.env.AI_PREFERRED_PROVIDER;
  invalidateFreeAiSettingsCache();
  clearFreeRouterCache();
});

function collectAdminRoutes(dir: string, prefix = "/admin"): string[] {
  const routes: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectAdminRoutes(full, `${prefix}/${entry.name}`));
    } else if (entry.name === "page.tsx") {
      routes.push(prefix);
    }
  }
  return routes;
}

const PUBLIC_ADMIN_AUTH_ROUTES = new Set([
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
]);

describe("Admin Dashboard AI Agents Registry (all 52 dashboards)", () => {
  it("registers 52 unique dashboard agents across all 8 module groups", () => {
    expect(DASHBOARD_AGENTS.length).toBe(52);
    const ids = new Set(DASHBOARD_AGENTS.map((a) => a.id));
    const routes = new Set(DASHBOARD_AGENTS.map((a) => a.route));
    expect(ids.size).toBe(52);
    expect(routes.size).toBe(52);
    expect(DASHBOARD_AGENT_GROUPS.length).toBe(8);
  });

  it("maps every authenticated /admin/**/page.tsx in the repository to its own dedicated agent", () => {
    const adminDir = path.resolve(process.cwd(), "src/app/admin");
    const pageRoutes = collectAdminRoutes(adminDir).filter(
      (r) => !PUBLIC_ADMIN_AUTH_ROUTES.has(r)
    );
    expect(pageRoutes.length).toBe(52);

    for (const route of pageRoutes) {
      const normalizedSample = route.replace(/\[[^\]]+\]/g, "sample-id");
      const agent = resolveDashboardAgent(normalizedSample);
      expect(agent).toBeDefined();
      if (!route.includes("[")) {
        expect(agent.route).toBe(route);
      } else {
        expect(normalizedSample.startsWith(agent.route)).toBe(true);
      }
    }
  });

  it("builds complete guardrailed system prompts and starter prompts for every agent", () => {
    for (const agent of DASHBOARD_AGENTS) {
      expect(DASHBOARD_AGENT_BY_ID[agent.id]).toBe(agent);
      expect(agent.quickPrompts.length).toBeGreaterThanOrEqual(3);
      expect(agent.tools.includes("get_dashboard_snapshot")).toBe(true);
      const sys = buildAgentSystemPrompt(agent, '{"totalContacts": 42}');
      expect(sys).toContain(agent.name);
      expect(sys).toContain(agent.route);
      expect(sys).toContain("totalContacts");
    }
  });
});

describe("UnoRouter Primary Gateway + Free AI Provider Catalog", () => {
  it("prioritizes UnoRouter (claude-opus-4-6-thinking) first and includes all 18 fallback providers", async () => {
    const requiredIds = [
      "unorouter",
      "groq",
      "openrouter",
      "gemini",
      "cerebras",
      "github",
      "cloudflare",
      "sambanova",
      "chutes",
      "zhipu",
      "modelscope",
      "siliconflow",
      "mistral",
      "nvidia",
      "huggingface",
      "pollinations",
      "ollama",
      "zai",
      "local-grounded",
    ] as const;

    for (const id of requiredIds) {
      expect(FREE_PROVIDER_MAP[id]).toBeDefined();
      expect(FREE_PROVIDER_MAP[id].models.all.length).toBeGreaterThan(0);
    }
    expect(FREE_AI_PROVIDERS.length).toBe(19);
    expect(DEFAULT_FALLBACK_ORDER[0]).toBe("unorouter");
    expect(DEFAULT_FALLBACK_ORDER[DEFAULT_FALLBACK_ORDER.length - 1]).toBe("local-grounded");

    const uno = FREE_PROVIDER_MAP.unorouter;
    expect(uno.defaultBaseUrl).toBe("https://api.unorouter.com/v1");
    expect(uno.models.flagship).toBe("claude-opus-4-6-thinking");
    expect(uno.models.reasoning).toBe("claude-opus-4-6-thinking");

    const resolved = await resolveAllProviderConfigs();
    expect(resolved.global.preferredProvider).toBe("unorouter");
  });

  it("calls UnoRouter https://api.unorouter.com/v1/chat/completions with claude-opus-4-6-thinking and parses SSE streams", async () => {
    process.env.UNOROUTER_API_KEY = "uno_test_key_placeholder_do_not_expose";
    // Even if user pastes the full endpoint URL from UnoRouter docs, router normalizes it cleanly
    process.env.UNOROUTER_BASE_URL = "https://api.unorouter.com/v1/chat/completions";
    invalidateFreeAiSettingsCache();
    clearFreeRouterCache();

    const sseBody = [
      'data: {"choices":[{"delta":{"reasoning_content":"Evaluating pipeline metrics first."}}]}',
      'data: {"choices":[{"delta":{"content":"UnoRouter online — "}}]}',
      'data: {"choices":[{"delta":{"content":"executive summary ready."}}]}',
      "data: [DONE]",
    ].join("\n\n");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );

    const res = await runFreeAiRouter({
      messages: [{ role: "user", content: "Hello!" }],
      stream: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.unorouter.com/v1/chat/completions");
    const parsedPayload = JSON.parse(String(calledInit?.body));
    expect(parsedPayload.model).toBe("claude-opus-4-6-thinking");
    expect(parsedPayload.stream).toBe(true);

    expect(res.providerUsed).toBe("unorouter");
    expect(res.modelUsed).toBe("claude-opus-4-6-thinking");
    expect(res.content).toBe("UnoRouter online — executive summary ready.");
    expect(res.reasoning).toContain("Evaluating pipeline metrics first.");
  });

  it("masks API keys safely and encrypts stored secrets with AES-256-GCM", () => {
    const raw = "gsk_1234567890abcdefghijklmnop";
    const masked = maskSecret(raw);
    expect(masked).toBe("gsk_••••mnop");
    expect(masked).not.toContain("567890");
    expect(maskSecret("")).toBe("");
    expect(maskSecret("short")).toBe("••••••••");

    const encrypted = encryptStoredAiSecret("uno_sample_secret_value");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain("uno_sample_secret_value");
    expect(decryptStoredAiSecret(encrypted)).toBe("uno_sample_secret_value");
  });

  it("validates custom base URLs against SSRF and normalizes /chat/completions suffix", () => {
    expect(
      normalizeOpenAiBaseUrl("https://api.unorouter.com/v1/chat/completions/")
    ).toBe("https://api.unorouter.com/v1");

    expect(
      validateProviderBaseUrl("unorouter", "https://api.unorouter.com/v1/chat/completions")
    ).toEqual({
      ok: true,
      normalizedUrl: "https://api.unorouter.com/v1",
    });

    // Block SSRF targets & cleartext HTTP on cloud providers
    expect(validateProviderBaseUrl("unorouter", "http://api.unorouter.com/v1").ok).toBe(false);
    expect(validateProviderBaseUrl("groq", "https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateProviderBaseUrl("groq", "https://127.0.0.1:8080/v1").ok).toBe(false);
    expect(validateProviderBaseUrl("groq", "https://10.0.0.5/v1").ok).toBe(false);
    expect(validateProviderBaseUrl("groq", "https://localhost:3000/v1").ok).toBe(false);

    // Allow localhost HTTP only for local Ollama, still blocking cloud metadata IP
    expect(validateProviderBaseUrl("ollama", "http://localhost:11434/v1").ok).toBe(true);
    expect(validateProviderBaseUrl("ollama", "http://169.254.169.254/v1").ok).toBe(false);
  });
});

describe("Security, RBAC & Cache Isolation Hardening", () => {
  it("grants OWNER and SUPER_ADMIN all 8 social.* permissions", () => {
    const socialPerms = [
      "social.view",
      "social.accounts.manage",
      "social.inbox.reply",
      "social.approvals.decide",
      "social.automation.manage",
      "social.personality.manage",
      "social.content.manage",
      "social.content.publish",
    ] as const;

    for (const perm of socialPerms) {
      expect(hasPermission("OWNER", perm)).toBe(true);
      expect(hasPermission("SUPER_ADMIN", perm)).toBe(true);
      expect(hasPermission("VIEWER", perm)).toBe(false);
    }
  });

  it("isolates router cache across different users, roles, and snapshots", async () => {
    clearFreeRouterCache();

    const ownerRun = await runFreeAiRouter({
      preferredProvider: "local-grounded",
      cacheScope: { userId: "owner-1", role: "OWNER", agentId: "executive-overview" },
      systemPrompt: "Role: OWNER\nLIVE SNAPSHOT: {\"vipContact\":\"Secret Corp\"}",
      messages: [{ role: "user", content: "Give me an executive overview." }],
      groundedFallbackContext: {
        snapshot: { vipContact: "Secret Corp" },
      },
    });
    expect(ownerRun.cached).toBe(false);
    expect(ownerRun.content).toContain("Secret Corp");

    const viewerRun = await runFreeAiRouter({
      preferredProvider: "local-grounded",
      cacheScope: { userId: "viewer-2", role: "VIEWER", agentId: "executive-overview" },
      systemPrompt: "Role: VIEWER\nLIVE SNAPSHOT: {\"tasksOpen\":0}",
      messages: [{ role: "user", content: "Give me an executive overview." }],
      groundedFallbackContext: {
        snapshot: { tasksOpen: 0 },
      },
    });
    expect(viewerRun.cached).toBe(false);
    expect(viewerRun.content).not.toContain("Secret Corp");
  });

  it("blocks unauthorized agents and blocks undeclared or write tools for VIEWER", async () => {
    const viewerSession = {
      userId: "viewer-id",
      email: "viewer@alaminn.info",
      name: "Viewer User",
      role: "VIEWER" as const,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    };

    await expect(
      runDashboardAgentChat({
        session: viewerSession,
        agentId: "crm-contacts",
        message: "List recent contacts",
      })
    ).rejects.toBeInstanceOf(AgentPermissionError);

    // Agent without `create_followup_task` declared in `tools` rejects it
    const seoAgent = DASHBOARD_AGENT_BY_ID["system-seo"];
    expect(seoAgent.tools.includes("create_followup_task")).toBe(false);
    const undeclared = await executeAgentTool(
      "create_followup_task",
      { title: "Injected task" },
      {
        session: { ...viewerSession, role: "OWNER" },
        agent: seoAgent,
      }
    );
    expect(undeclared.trace.ok).toBe(false);

    // VIEWER cannot execute `create_followup_task` even on `executive-overview`
    const overviewAgent = DASHBOARD_AGENT_BY_ID["executive-overview"];
    const deniedWrite = await executeAgentTool(
      "create_followup_task",
      { title: "Unauthorized task" },
      {
        session: viewerSession,
        agent: overviewAgent,
      }
    );
    expect(deniedWrite.trace.ok).toBe(false);
  });
});

describe("Free AI Router Helpers, Embeddings & Multimodal Tools", () => {
  it("classifies prompt speed/depth tiers accurately", () => {
    expect(inferSpeedTier("quick status count")).toBe("fast");
    expect(
      inferSpeedTier(
        "Run a comprehensive step-by-step deep reasoning architecture and policy risk audit across all connected channels and compare escalation gates."
      )
    ).toBe("reasoning");
    expect(inferSpeedTier("Draft an executive article outline on enterprise AI governance")).toBe(
      "flagship"
    );
  });

  it("extracts <think> blocks and parses SSE chunks cleanly", () => {
    const raw =
      "<think>First evaluate scholarship deadlines.\nCheck GPA.</think>\n\nHere is your DAAD guide.";
    const parsed = splitReasoningTags(raw);
    expect(parsed.reasoning).toContain("evaluate scholarship deadlines");
    expect(parsed.content).toBe("Here is your DAAD guide.");

    const sse = parseSseChatCompletionStream(
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\ndata: {"choices":[{"delta":{"content":"world!"}}]}\ndata: [DONE]'
    );
    expect(sse.content).toBe("Hello world!");
  });

  it("computes normalized 384d local embeddings with meaningful cosine similarity", () => {
    const v1 = computeLocalHashEmbedding("Full scholarship for Master in Computer Science in Germany");
    const v2 = computeLocalHashEmbedding("Germany Master Computer Science scholarship funding");
    const v3 = computeLocalHashEmbedding("Quarterly server invoice billing receipt overdue");

    expect(v1.length).toBe(384);
    const simRelated = cosineSimilarity(v1, v2);
    const simUnrelated = cosineSimilarity(v1, v3);
    expect(simRelated).toBeGreaterThan(0.35);
    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it("builds sanitized Pollinations FLUX image URLs cleanly", () => {
    const img = buildPollinationsImageUrl(
      "Executive study abroad guide cover https://evil.example/leak secret@alaminn.info",
      "landscape"
    );
    expect(img.width).toBe(1280);
    expect(img.height).toBe(720);
    expect(img.url).toContain("https://image.pollinations.ai/prompt/Executive%20study%20abroad");
    expect(img.url).not.toContain("evil.example");
    expect(img.url).not.toContain("secret%40alaminn.info");
    expect(img.url).toContain("nologo=true");
  });

  it("executes local-grounded synthesis and caches identical scoped requests cleanly", async () => {
    clearFreeRouterCache();
    const scope = { userId: "u-1", role: "OWNER", agentId: "crm-contacts" };
    const first = await runFreeAiRouter({
      preferredProvider: "local-grounded",
      cacheScope: scope,
      messages: [
        { role: "system", content: "You are the Contacts & Relationship Agent (/admin/contacts)." },
        { role: "user", content: "Summarize high-priority CRM contacts and next actions." },
      ],
    });
    expect(first.providerUsed).toBe("local-grounded");
    expect(first.cached).toBe(false);
    expect(first.content.length).toBeGreaterThan(40);

    const second = await runFreeAiRouter({
      preferredProvider: "local-grounded",
      cacheScope: scope,
      messages: [
        { role: "system", content: "You are the Contacts & Relationship Agent (/admin/contacts)." },
        { role: "user", content: "Summarize high-priority CRM contacts and next actions." },
      ],
    });
    expect(second.cached).toBe(true);
    expect(second.content).toBe(first.content);
  });

  it("provides governed workflow prompts for all 17 AI Assistant workflows", () => {
    expect(Object.keys(WORKFLOW_PROMPTS).length).toBeGreaterThanOrEqual(17);
    expect(WORKFLOW_PROMPTS["university-research"].toLowerCase()).toContain("university");
    expect(WORKFLOW_PROMPTS["ielts-lesson"]).toContain("IELTS");
  });
});
