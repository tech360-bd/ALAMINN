import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ok } from "@/lib/admin-api";
import { DASHBOARD_AGENTS, DASHBOARD_AGENT_GROUPS } from "@/lib/ai/dashboard-agents";
import {
  maskSecret,
  resolveAllProviderConfigs,
} from "@/lib/ai/free-providers";
import { getFreeRouterTelemetry } from "@/lib/ai/free-router";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/ai-agent
 * Returns the full directory of all 52 Admin Dashboard AI Agents,
 * configured 100% Free AI Providers (keys masked), global router settings,
 * and live router cache/cooldown telemetry.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const { providers, global } = await resolveAllProviderConfigs();

  const agents = DASHBOARD_AGENTS.map((a) => ({
    id: a.id,
    route: a.route,
    group: a.group,
    name: a.name,
    roleTitle: a.roleTitle,
    accent: a.accent,
    description: a.description,
    requiredPermission: a.requiredPermission,
    hasAccess: hasPermission(guard.session.role, a.requiredPermission),
    defaultTier: a.recommendedTier,
    recommendedTier: a.recommendedTier,
    tools: a.tools,
    quickPrompts: a.quickPrompts,
  }));

  const safeProviders = providers.map((p) => {
    const modelEntries = Array.from(
      new Set([
        p.spec.models.flagship,
        p.spec.models.fast,
        p.spec.models.reasoning,
        ...(p.spec.models.all || []),
      ])
    ).map((mId) => ({
      id: mId,
      label: mId.split("/").pop() || mId,
      tier:
        mId === p.spec.models.fast
          ? "fast"
          : mId === p.spec.models.reasoning
          ? "reasoning"
          : "flagship",
      contextWindow: "128k",
      supportsTools: p.spec.supportsToolCalling,
    }));

    return {
      id: p.spec.id,
      name: p.spec.name,
      badge: p.spec.badge || null,
      category: p.spec.category,
      recommended: Boolean(p.spec.badge?.includes("⭐")),
      noCreditCard:
        !p.spec.requiresKey ||
        p.spec.category === "no-card" ||
        p.spec.category === "zero-key" ||
        p.spec.category === "aggregator",
      requiresKey: p.spec.requiresKey,
      requiresAccountId: Boolean(p.spec.requiresAccountId),
      signupUrl: p.spec.signupUrl,
      freeLimitsSummary: p.spec.rateLimitNote,
      rateLimitNote: p.spec.rateLimitNote,
      supportsToolCalling: p.spec.supportsToolCalling,
      supportsEmbeddings: p.spec.supportsEmbeddings,
      supportsImageGen: Boolean(p.spec.supportsImageGen),
      supportsStt: Boolean(p.spec.supportsStt),
      supportsTts: Boolean(p.spec.supportsTts),
      models: modelEntries,
      modelTiers: p.spec.models,
      notes: p.spec.notes,
      enabled: p.enabled,
      ready: p.configured,
      configured: p.configured,
      hasApiKey: Boolean(p.apiKey),
      keySource: p.keySource,
      maskedApiKey: maskSecret(p.apiKey),
      maskedKey: maskSecret(p.apiKey),
      baseUrl: p.baseUrl,
      accountId: p.accountId ? maskSecret(p.accountId) : "",
      selectedModel: p.customModel || p.spec.models.flagship,
      customModel: p.customModel,
    };
  });

  const canManageProviders =
    hasPermission(guard.session.role, "integration_settings.update") ||
    hasPermission(guard.session.role, "security_settings.update");

  return ok(
    {
      agents,
      groups: DASHBOARD_AGENT_GROUPS,
      providers: safeProviders,
      global: {
        preferredProvider: global.preferredProvider,
        fallbackOrder: global.fallbackOrder,
        cacheEnabled: global.cacheEnabled,
        cacheTtlSeconds: global.cacheTtlSeconds,
        smartTierRouting: global.smartTierRouting,
        enableExternalFreeTools: global.enableExternalFreeTools,
        enablePollinationsTextFallback: global.enablePollinationsTextFallback,
        hasTavilyKey: Boolean(global.tavilyApiKey),
        hasBraveKey: Boolean(global.braveSearchApiKey),
        hasJinaKey: Boolean(global.jinaApiKey),
        hasElevenlabsKey: Boolean(global.elevenlabsApiKey),
        tavilyApiKeyMasked: maskSecret(global.tavilyApiKey),
        braveSearchApiKeyMasked: maskSecret(global.braveSearchApiKey),
        maskedTavilyKey: maskSecret(global.tavilyApiKey),
        maskedBraveKey: maskSecret(global.braveSearchApiKey),
        maskedJinaKey: maskSecret(global.jinaApiKey),
        maskedElevenlabsKey: maskSecret(global.elevenlabsApiKey),
      },
      telemetry: getFreeRouterTelemetry(),
      canManageProviders,
    },
    "Admin Dashboard AI Agents & Free AI Providers loaded."
  );
}
