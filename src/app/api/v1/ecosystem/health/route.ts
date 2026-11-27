import { NextResponse, type NextRequest } from "next/server";
import { verifyEcosystemRequest, logEcosystemUsage } from "@/lib/ecosystem/gateway";
import { readConnectionPublic } from "@/lib/integrations/store";
import { INTEGRATION_BY_ID } from "@/lib/integrations/registry";
import type { ApiKeyScope } from "@/lib/api-platform/keys";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ecosystem/health — bridge status for ecosystem services.
 * Auth: any valid API key (env ecosystem key or a scoped ApiKey).
 *
 * Reports each AI-OS service's stored configuration + last recorded
 * connection-test result (run from /admin/integrations). Real records
 * only — no live probing and no fabricated reachability.
 */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const guard = await verifyEcosystemRequest(req, "", { scope: "leads:read" as ApiKeyScope, route: "/api/v1/ecosystem/health" });
  if (!guard.allowed) return guard.response;

  const serviceIds = ["litellm", "librechat", "open-webui", "activepieces", "temporal", "directus", "nocobase"];
  const services: Array<{
    id: string;
    name: string;
    configured: boolean;
    enabled: boolean;
    lastTestOk: boolean | null;
    lastTestAt: string | null;
    lastTestMessage: string | null;
  }> = [];
  for (const id of serviceIds) {
    const def = INTEGRATION_BY_ID[id];
    if (!def) continue;
    const stored = await readConnectionPublic(def).catch(() => null);
    services.push({
      id,
      name: def.name,
      configured: stored?.configured ?? false,
      enabled: stored?.enabled ?? false,
      lastTestOk: stored?.lastTestOk ?? null,
      lastTestAt: stored?.lastTestAt ?? null,
      lastTestMessage: stored?.lastTestMessage ?? null,
    });
  }

  await logEcosystemUsage(guard.credential ?? null, "/api/v1/ecosystem/health", "GET", 200, Date.now() - started);
  return NextResponse.json(
    {
      success: true,
      message: "ALAMINN ecosystem bridge is live.",
      data: {
        key: guard.credential?.name ?? null,
        scopes: guard.credential?.scopes ?? [],
        services,
        llmsTxt: "/llms.txt",
        apiPlatformAdminUi: "/admin/api-platform",
      },
      meta: { rateRemaining: guard.rateRemaining },
      errors: [],
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
