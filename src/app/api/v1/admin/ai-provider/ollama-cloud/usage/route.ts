import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok } from "@/lib/admin-api";
import { getRecentUsage, getUsageStats } from "@/lib/ai/ollama-cloud";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/ai-provider/ollama-cloud/usage
 *
 * Returns recent usage records + aggregate stats.
 * Per spec §15: "Record model, latency, token usage where available, provider
 * errors and actual costs when measurable."
 * Per spec §16: "admin interface for ... budget limits and audit logs"
 *
 * Query params:
 *   - limit: number of recent records (default 100, max 1000)
 *
 * Requires: dashboard.view permission (admin-only).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "100", 10),
    1000
  );

  const [recent, stats] = [getRecentUsage(limit), getUsageStats()];

  return ok(
    {
      recent,
      stats,
    },
    "Ollama Cloud usage"
  );
}
