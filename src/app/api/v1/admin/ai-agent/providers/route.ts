import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { checkAdminRateLimit, ok, fail, readJson, writeAudit } from "@/lib/admin-api";
import {
  FREE_PROVIDER_MAP,
  encryptStoredAiSecret,
  fetchOpenRouterFreeModels,
  invalidateFreeAiSettingsCache,
  maskSecret,
  resolveAllProviderConfigs,
  validateProviderBaseUrl,
  type FreeProviderId,
} from "@/lib/ai/free-providers";
import {
  clearFreeRouterCache,
  getFreeRouterTelemetry,
  testFreeProviderConnection,
} from "@/lib/ai/free-router";

export const dynamic = "force-dynamic";

function looksMasked(val: string): boolean {
  return val.includes("••••") || val === "__KEEP__" || val === "[CONFIGURED_REDACTED]";
}

/**
 * GET /api/v1/admin/ai-agent/providers
 * Load masked AI Provider configuration & router settings.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const { providers, global } = await resolveAllProviderConfigs();
  return ok({
    providers: providers.map((p) => ({
      id: p.spec.id,
      name: p.spec.name,
      enabled: p.enabled,
      configured: p.configured,
      keySource: p.keySource,
      maskedKey: maskSecret(p.apiKey),
      baseUrl: p.baseUrl,
      customModel: p.customModel,
    })),
    global: {
      preferredProvider: global.preferredProvider,
      fallbackOrder: global.fallbackOrder,
      cacheEnabled: global.cacheEnabled,
      cacheTtlSeconds: global.cacheTtlSeconds,
      smartTierRouting: global.smartTierRouting,
      enableExternalFreeTools: global.enableExternalFreeTools,
      enablePollinationsTextFallback: global.enablePollinationsTextFallback,
    },
    telemetry: getFreeRouterTelemetry(),
  });
}

/**
 * PUT /api/v1/admin/ai-agent/providers
 * Save AI Provider API keys (AES-256-GCM encrypted at rest), toggles, models, and global router config.
 */
export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;

  const rl = checkAdminRateLimit(`ai-providers-put:${guard.session.userId}`, 20, 60_000);
  if (!rl.allowed) {
    return fail(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`, ["rate_limited"], 429);
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object") return fail("Invalid JSON body.");

  const updates: Array<{ key: string; value: string }> = [];

  if (body.global && typeof body.global === "object") {
    const g = body.global as Record<string, unknown>;
    if (typeof g.preferredProvider === "string") {
      const pref = g.preferredProvider.trim();
      if (pref === "auto" || pref in FREE_PROVIDER_MAP) {
        updates.push({ key: "ai.free.preferredProvider", value: pref });
      } else {
        return fail(`Invalid preferredProvider: ${pref}`);
      }
    }
    if (Array.isArray(g.fallbackOrder)) {
      const validOrder = g.fallbackOrder
        .map((x) => String(x))
        .filter((id) => id in FREE_PROVIDER_MAP);
      updates.push({ key: "ai.free.fallbackOrder", value: JSON.stringify(validOrder) });
    }
    if (typeof g.cacheEnabled === "boolean") {
      updates.push({ key: "ai.free.cacheEnabled", value: String(g.cacheEnabled) });
    }
    if (g.cacheTtlSeconds !== undefined) {
      updates.push({
        key: "ai.free.cacheTtlSeconds",
        value: String(Math.max(15, Math.min(86400, Number(g.cacheTtlSeconds) || 300))),
      });
    }
    if (typeof g.smartTierRouting === "boolean") {
      updates.push({ key: "ai.free.smartTierRouting", value: String(g.smartTierRouting) });
    }
    if (typeof g.enableExternalFreeTools === "boolean") {
      updates.push({ key: "ai.free.enableExternalFreeTools", value: String(g.enableExternalFreeTools) });
    }
    if (typeof g.enablePollinationsTextFallback === "boolean") {
      updates.push({
        key: "ai.free.enablePollinationsTextFallback",
        value: String(g.enablePollinationsTextFallback),
      });
    }
    const toolSecretMap: Array<[string, string]> = [
      ["tavilyApiKey", "ai.free.tool.tavilyApiKey"],
      ["braveSearchApiKey", "ai.free.tool.braveSearchApiKey"],
      ["jinaApiKey", "ai.free.tool.jinaApiKey"],
      ["elevenlabsApiKey", "ai.free.tool.elevenlabsApiKey"],
    ];
    for (const [prop, settingKey] of toolSecretMap) {
      if (typeof g[prop] === "string" && !looksMasked(g[prop] as string)) {
        const plain = (g[prop] as string).trim();
        updates.push({
          key: settingKey,
          value: plain ? encryptStoredAiSecret(plain) : "",
        });
      }
    }
  }

  if (body.providers && typeof body.providers === "object") {
    const provs = body.providers as Record<string, Record<string, unknown>>;
    for (const [providerId, cfg] of Object.entries(provs)) {
      if (!(providerId in FREE_PROVIDER_MAP) || !cfg || typeof cfg !== "object") continue;
      const typedId = providerId as FreeProviderId;

      if (typeof cfg.enabled === "boolean") {
        updates.push({ key: `ai.free.provider.${providerId}.enabled`, value: String(cfg.enabled) });
      }
      if (typeof cfg.apiKey === "string" && !looksMasked(cfg.apiKey)) {
        const plainKey = cfg.apiKey.trim();
        updates.push({
          key: `ai.free.provider.${providerId}.apiKey`,
          value: plainKey ? encryptStoredAiSecret(plainKey) : "",
        });
      }
      if (typeof cfg.accountId === "string" && !looksMasked(cfg.accountId)) {
        const plainAcc = cfg.accountId.trim();
        updates.push({
          key: `ai.free.provider.${providerId}.accountId`,
          value: plainAcc ? encryptStoredAiSecret(plainAcc) : "",
        });
      }
      if (typeof cfg.baseUrl === "string") {
        const urlCheck = validateProviderBaseUrl(typedId, cfg.baseUrl);
        if (!urlCheck.ok) {
          return fail(
            `Invalid baseUrl for ${providerId}: ${urlCheck.error || "blocked URL"}`,
            ["invalid_base_url"],
            400
          );
        }
        updates.push({
          key: `ai.free.provider.${providerId}.baseUrl`,
          value: urlCheck.normalizedUrl,
        });
      }
      const chosenModel =
        typeof cfg.selectedModel === "string"
          ? cfg.selectedModel
          : typeof cfg.customModel === "string"
            ? cfg.customModel
            : undefined;
      if (chosenModel !== undefined) {
        updates.push({ key: `ai.free.provider.${providerId}.model`, value: chosenModel.trim() });
      }
    }
  }

  try {
    if (updates.length > 0) {
      await db.$transaction(
        updates.map((u) =>
          db.setting.upsert({
            where: { key: u.key },
            update: { value: u.value },
            create: { key: u.key, value: u.value },
          })
        )
      );
    }
    invalidateFreeAiSettingsCache();
    clearFreeRouterCache();

    await writeAudit(guard.session, "free_ai.providers.update", "Setting", undefined, {
      updatedCount: updates.length,
    });

    return ok({ updated: updates.length }, "AI Provider configuration saved (secrets encrypted).");
  } catch (e) {
    return fail(
      "Failed to save AI Provider settings.",
      [e instanceof Error ? e.message : String(e)],
      500
    );
  }
}

/**
 * POST /api/v1/admin/ai-agent/providers
 * Live diagnostics: test a provider connection, fetch live OpenRouter `:free` models, or clear router cache.
 * Requires `integration_settings.update` to prevent unauthorized outbound probes / cache eviction.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "integration_settings.update");
  if (guard.denied) return guard.response;

  const rl = checkAdminRateLimit(`ai-providers-post:${guard.session.userId}`, 15, 60_000);
  if (!rl.allowed) {
    return fail(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`, ["rate_limited"], 429);
  }

  const body = await readJson<{
    action?: string;
    providerId?: string;
    model?: string;
    apiKeyOverride?: string;
    baseUrlOverride?: string;
    accountIdOverride?: string;
  }>(req);
  if (!body?.action) return fail("Missing action.");

  if (body.action === "test_provider") {
    const providerId = String(body.providerId || "") as FreeProviderId;
    if (!(providerId in FREE_PROVIDER_MAP)) {
      return fail("Invalid providerId.");
    }
    const res = await testFreeProviderConnection(providerId, {
      model: typeof body.model === "string" ? body.model : undefined,
      apiKeyOverride: typeof body.apiKeyOverride === "string" ? body.apiKeyOverride : undefined,
      baseUrlOverride: typeof body.baseUrlOverride === "string" ? body.baseUrlOverride : undefined,
      accountIdOverride:
        typeof body.accountIdOverride === "string" ? body.accountIdOverride : undefined,
    });
    await writeAudit(guard.session, "free_ai.provider.test", "FreeAiProvider", providerId, {
      ok: res.ok,
      latencyMs: res.latencyMs,
    });
    const message =
      res.sampleReply || res.error || (res.ok ? `${res.providerName} connected.` : "Test failed.");
    return ok(
      { ...res, message },
      res.ok ? `${res.providerName} responded.` : `${res.providerName} test failed.`
    );
  }

  if (body.action === "discover_openrouter_free") {
    const res = await fetchOpenRouterFreeModels();
    return ok(
      { ...res, count: res.models.length },
      `Loaded ${res.models.length} OpenRouter :free models (${res.source}).`
    );
  }

  if (body.action === "clear_cache") {
    const cleared = clearFreeRouterCache();
    await writeAudit(guard.session, "free_ai.cache.clear", "FreeAiRouter", undefined, { cleared });
    return ok({ cleared }, `Cleared ${cleared} cached responses.`);
  }

  return fail(`Unknown action: ${body.action}`);
}
