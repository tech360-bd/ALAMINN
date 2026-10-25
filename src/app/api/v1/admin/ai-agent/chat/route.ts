import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { checkAdminRateLimit, ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import { AgentPermissionError, runDashboardAgentChat } from "@/lib/ai/free-router";
import { DASHBOARD_AGENT_BY_ID, resolveDashboardAgent } from "@/lib/ai/dashboard-agents";
import type { FreeProviderId, ModelSpeedTier } from "@/lib/ai/free-providers";

export const dynamic = "force-dynamic";

const ChatBodySchema = z.object({
  agentId: z.string().max(80).optional(),
  pathname: z.string().max(200).optional(),
  message: z.string().min(1, "Message is required").max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12000),
      })
    )
    .max(16)
    .optional(),
  preferredProvider: z.string().max(40).optional(),
  preferredModel: z.string().max(120).optional(),
  tier: z.enum(["auto", "fast", "flagship", "reasoning"]).optional(),
  bypassCache: z.boolean().optional(),
});

/**
 * POST /api/v1/admin/ai-agent/chat
 * Runs the dedicated AI Agent for any Admin Dashboard using the Multi-Provider AI Router.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const rl = checkAdminRateLimit(`ai-chat:${guard.session.userId}`, 30, 60_000);
  if (!rl.allowed) {
    return fail(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`, ["rate_limited"], 429);
  }

  const rawBody = await readJson(req);
  if (!rawBody) return fail("Invalid JSON body.");

  const parsed = ChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail(
      "Invalid chat payload.",
      parsed.error.issues.map((i) => i.message),
      400
    );
  }

  const data = parsed.data;
  const targetAgent =
    (data.agentId && DASHBOARD_AGENT_BY_ID[data.agentId]) ||
    resolveDashboardAgent(data.pathname || "/admin");

  if (!hasPermission(guard.session.role, targetAgent.requiredPermission)) {
    return fail(
      `Forbidden — missing permission: ${targetAgent.requiredPermission}`,
      ["insufficient_permissions"],
      403
    );
  }

  try {
    const result = await runDashboardAgentChat({
      session: guard.session,
      agentId: targetAgent.id,
      pathname: data.pathname,
      message: data.message,
      history: data.history,
      preferredProvider: (data.preferredProvider || undefined) as FreeProviderId | "auto" | undefined,
      preferredModel: data.preferredModel,
      tier: (data.tier || "auto") as ModelSpeedTier | "auto",
      bypassCache: data.bypassCache,
    });

    await writeAudit(
      guard.session,
      "dashboard_ai_agent.chat",
      "DashboardAiAgent",
      result.agent.id,
      {
        route: result.agent.route,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        cached: result.cached,
        latencyMs: result.latencyMs,
        toolsExecuted: result.toolTraces.map((t) => t.tool),
      }
    );

    return ok(result, "Dashboard AI Agent responded.");
  } catch (e) {
    if (e instanceof AgentPermissionError) {
      return fail(e.message, ["insufficient_permissions"], 403);
    }
    return fail(
      "Dashboard AI Agent failed to process message.",
      [e instanceof Error ? e.message : String(e)],
      500
    );
  }
}
