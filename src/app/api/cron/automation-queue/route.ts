import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { processDueEnrollments } from "@/lib/automation/sequences";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/automation-queue
 *
 * Processes due email-sequence enrollments: consent-checked sends
 * through the failover email router, step advancement, completion.
 *
 * Recommended schedule: every 15 minutes (cron: 0,15,30,45 * * * *).
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
    const summary = await processDueEnrollments(db as unknown as Parameters<typeof processDueEnrollments>[0], { limit: 50 });
    return NextResponse.json(
      {
        success: true,
        message: `Automation queue processed ${summary.processed} enrollment(s): ${summary.sent} sent, ${summary.completed} completed, ${summary.skippedConsent + summary.skippedSuppressed + summary.skippedInvalid} skipped, ${summary.failed} failed.`,
        data: summary,
        meta: { ranAt: new Date().toISOString() },
        errors: [],
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: `Automation queue failed: ${(e as Error).message}`,
        data: null,
        meta: {},
        errors: ["automation_queue_failed"],
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
