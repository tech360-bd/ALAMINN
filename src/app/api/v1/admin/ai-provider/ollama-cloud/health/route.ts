import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok } from "@/lib/admin-api";
import { checkOllamaCloudHealth, getCircuitState } from "@/lib/ai/ollama-cloud";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/ai-provider/ollama-cloud/health
 *
 * Returns the health status of the Ollama Cloud provider.
 * Per spec §8: "health checks" + spec §16: "admin interface for provider health"
 *
 * Requires: ai_providers.view permission (admin-only).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const [health, circuit] = await Promise.all([
    checkOllamaCloudHealth(),
    Promise.resolve(getCircuitState()),
  ]);

  return ok(
    {
      ...health,
      circuitBreaker: {
        failures: circuit.failures,
        tripped: circuit.tripped,
        threshold: 5,
        resetAfterMs: 5 * 60 * 1000,
        lastFailureAt: circuit.lastFailureAt || null,
      },
    },
    "Ollama Cloud health check"
  );
}
