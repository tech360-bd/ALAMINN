import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { ok, writeAudit } from "@/lib/admin-api-server";
import { exportEvidence, toCsv } from "@/lib/higher-study/intelligence/exporter";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Bulk export with full source attribution: every exported fact carries its status, source, level, academic year and check/verify dates. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, "higher-study.dashboard.view");
  if (g.denied) return g.response;
  const sp = req.nextUrl.searchParams;
  const result = await exportEvidence({
    entityType: sp.get("entityType") ?? undefined,
    status: sp.get("status") ?? undefined,
    entityId: sp.get("entityId") ?? undefined,
  });
  await writeAudit(g.session, "higher_study_intelligence_export", "HigherStudyEvidence", undefined, { rowCount: result.rowCount, format: sp.get("format") ?? "json" });
  if (sp.get("format") === "csv") {
    return new NextResponse(toCsv(result), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="university-intelligence-evidence-${Date.now()}.csv"`,
      },
    });
  }
  return ok(result);
}
