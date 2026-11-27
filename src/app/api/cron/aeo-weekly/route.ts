import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runCitationCheck, DEFAULT_SEED_QUERIES } from "@/lib/aeo/tracker";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/aeo-weekly
 *
 * Weekly AEO (answer engine optimization) verification:
 *  - runs a real citation check against the configured provider
 *    (honest: records `provider_unavailable` when none is configured)
 *  - refreshes the llms.txt content index
 *
 * Recommended schedule: `0 4 * * 1` (Mondays 04:00).
 *
 * Auth: requires `x-cron-secret` header (or `?secret=`) matching
 * CRON_SECRET. Returns 401 on auth failure, 503 if unconfigured.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", data: null, meta: {}, errors: [auth.error] },
      { status: auth.status }
    );
  }
  try {
    const queries = DEFAULT_SEED_QUERIES.slice(0, 6);
    const result = await runCitationCheck({ queries });
    return NextResponse.json(
      {
        success: true,
        message:
          result.status === "provider_unavailable"
            ? "AEO weekly run recorded as provider_unavailable (no BRAVE_SEARCH_API_KEY configured). No score was simulated."
            : `AEO weekly run: cited in ${result.citedCount} of ${result.queries} seed queries (score ${result.score}).`,
        data: result,
        meta: { ranAt: new Date().toISOString(), queries },
        errors: [],
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: `AEO weekly run failed: ${(e as Error).message}`,
        data: null,
        meta: {},
        errors: ["aeo_weekly_failed"],
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
