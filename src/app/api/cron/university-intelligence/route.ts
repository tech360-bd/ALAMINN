import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runIntelligenceCycle } from "@/lib/higher-study/intelligence/pipeline";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/**
 * 7-day university & course intelligence cycle. Schedule weekly:
 * `30 4 * * 1` curl -H "x-cron-secret: $CRON_SECRET" https://alaminn.info/api/cron/university-intelligence
 *
 * Permission-gated collection (robots.txt respected, never bypassed) +
 * conflict / duplicate / staleness sweeps + review tasks. Shares the
 * monitoring-run lock with /api/cron/higher-study-monitor so the two
 * cycles never double-run. No catalogue row is mutated by this cycle:
 * every change enters the human review queue.
 */
export async function GET(req: NextRequest) {
  const a = verifyCronAuth(req);
  if (!a.ok) return NextResponse.json({ success: false, message: a.error }, { status: a.status });
  try {
    const r = await runIntelligenceCycle(40);
    return NextResponse.json({
      success: true,
      data: {
        ...r,
        report:
          "UNIVERSITY & COURSE INTELLIGENCE CYCLE — permission-gated collection, conflicts and duplicates preserved for human review at /admin/higher-study/intelligence. No production catalogue data was mutated or auto-published.",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "intelligence cycle failed" },
      { status: 500 }
    );
  }
}
