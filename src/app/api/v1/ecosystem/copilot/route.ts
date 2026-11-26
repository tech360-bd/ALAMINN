import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyEcosystemRequest, logEcosystemUsage } from "@/lib/ecosystem/gateway";
import { readConnectionSecrets } from "@/lib/integrations/store";
import { runFreeAiRouter } from "@/lib/ai/free-router";
import type { ApiKeyScope } from "@/lib/api-platform/keys";

export const dynamic = "force-dynamic";

const copilotSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  context: z.string().trim().max(4000).optional(),
  systemPrompt: z.string().trim().max(4000).optional(),
  maxTokens: z.number().int().min(50).max(2000).default(700),
});

const LITELLM_TIMEOUT_MS = 20000;

/**
 * POST /api/v1/ecosystem/copilot — AI copilot action (scope: copilot:invoke).
 *
 * Routing (real, honest reporting):
 *  1. If LiteLLM is configured in /admin/integrations (baseUrl + master
 *     key), the completion is served through LiteLLM's unified proxy
 *     (model from the stored config, default gpt-4o-mini) — this is the
 *     "master API key" path for Activepieces/Temporal workflows.
 *  2. Otherwise the request falls back to the platform's own free AI
 *     router with its provider failover chain.
 * The response always reports which path served the answer.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const rawBody = await req.text();
  const guard = await verifyEcosystemRequest(req, rawBody, { scope: "copilot:invoke" as ApiKeyScope, route: "/api/v1/ecosystem/copilot" });
  if (!guard.allowed) return guard.response;

  const fail = async (message: string, status: number): Promise<NextResponse> => {
    await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/copilot", "POST", status, Date.now() - started);
    return NextResponse.json(
      { success: false, message, error: message, data: null, meta: {}, errors: ["request_rejected"] },
      { status, headers: { "cache-control": "no-store" } }
    );
  };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return await fail("Request body is not valid JSON.", 400);
  }
  const parsed = copilotSchema.safeParse(payload);
  if (!parsed.success) return await fail(parsed.error.issues[0]?.message || "Invalid copilot payload.", 400);

  const { prompt, context, systemPrompt, maxTokens } = parsed.data;
  const system = systemPrompt || "You are the ALAMINN copilot for study-abroad consulting and CRM operations. Answer concisely and factually. Never invent university names, fees or deadlines — say when you are unsure.";
  const userMessage = context ? `Context:\n${context}\n\nRequest:\n${prompt}` : prompt;

  // ── Path 1: LiteLLM master key (configured via /admin/integrations) ──
  try {
    const cfg = await readConnectionSecrets("litellm");
    const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
    const masterKey = cfg.masterKey || cfg.apiKey || "";
    if (baseUrl && masterKey && cfg.__enabled === "true") {
      const model = cfg.model || "gpt-4o-mini";
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${masterKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMessage },
          ],
        }),
        signal: AbortSignal.timeout(LITELLM_TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> };
        const answer = body.choices?.[0]?.message?.content?.trim();
        if (answer) {
          await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/copilot", "POST", 200, Date.now() - started);
          return NextResponse.json(
            {
              success: true,
              message: "Copilot completion served by LiteLLM.",
              data: { answer, servedBy: "litellm", model, usage: body.usage ?? null },
              meta: {},
              errors: [],
            },
            { status: 200, headers: { "cache-control": "no-store" } }
          );
        }
      }
      // LiteLLM misbehaving → fall through to the platform router (failover).
    }
  } catch {
    // LiteLLM unreachable → fall through to the platform router (failover).
  }

  // ── Path 2: platform free AI router (provider failover chain) ──
  try {
    const result = await runFreeAiRouter({
      systemPrompt: system,
      messages: [{ role: "user", content: userMessage }],
      maxTokens,
      bypassCache: true,
    });
    if (result.content?.trim()) {
      await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/copilot", "POST", 200, Date.now() - started);
      return NextResponse.json(
        {
          success: true,
          message: "Copilot completion served by the platform free AI router (LiteLLM not configured or unreachable).",
          data: {
            answer: result.content,
            servedBy: "free-router",
            model: result.modelUsed,
            provider: result.providerName,
            fallbackTrail: result.fallbackTrail,
          },
          meta: {},
          errors: [],
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }
    return await fail("No AI provider is currently available. Configure LiteLLM in /admin/integrations or check the AI provider status.", 503);
  } catch (e) {
    return await fail(`Copilot failed: ${(e as Error).message}`.slice(0, 200), 502);
  }
}
