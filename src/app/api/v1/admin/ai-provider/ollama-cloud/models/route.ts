import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, fail } from "@/lib/admin-api";
import { discoverOllamaCloudModels, isOllamaCloudAvailable } from "@/lib/ai/ollama-cloud";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/ai-provider/ollama-cloud/models
 *
 * Discover available models through the Ollama Cloud API.
 * Per spec §4: "Discover available models through the provider API.
 * Never assume a model is available."
 *
 * Per spec §16: "admin interface for ... model selection"
 *
 * Requires: dashboard.view permission (admin-only).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  if (!isOllamaCloudAvailable()) {
    return fail(
      "Ollama Cloud is not enabled or API key is not configured. Set OLLAMA_CLOUD_ENABLED=true and OLLAMA_CLOUD_API_KEY in your environment.",
      ["not_configured"],
      503
    );
  }

  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "true";
  const result = await discoverOllamaCloudModels(forceRefresh);

  if (!result.ok) {
    return fail(
      `Failed to discover models: ${result.error}`,
      ["discovery_failed"],
      502
    );
  }

  return ok(
    {
      models: result.models,
      fetchedAt: result.fetchedAt,
      count: result.models.length,
    },
    "Ollama Cloud models discovered"
  );
}
