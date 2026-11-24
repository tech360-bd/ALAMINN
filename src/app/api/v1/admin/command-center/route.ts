import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getCommandCenterMetrics } from "@/lib/command-center/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/command-center
 *
 * Authenticated, DB-backed Command Center counters. No provider is contacted
 * and no credential is returned; health is read from recorded SystemHealth rows.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.view");
  if (guard.denied) return guard.response;

  try {
    const metrics = await getCommandCenterMetrics();
    return NextResponse.json({
      success: true,
      message: "Command Center metrics loaded.",
      data: metrics,
      meta: {},
      errors: [],
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load Command Center metrics.",
        data: null,
        meta: {},
        errors: ["metrics_unavailable"],
      },
      { status: 503 }
    );
  }
}
