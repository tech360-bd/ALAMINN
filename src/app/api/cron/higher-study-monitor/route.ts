import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runMonitoringCycle } from "@/lib/higher-study/monitoring/runner";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** 7-day ALO University & Official Data Monitoring Agent. Schedule weekly: `0 4 * * 1` curl -H "x-cron-secret: $CRON_SECRET" https://alaminn.info/api/cron/higher-study-monitor */
export async function GET(req: NextRequest) { const a = verifyCronAuth(req); if (!a.ok) return NextResponse.json({ success: false, message: a.error }, { status: a.status });
  const r = await runMonitoringCycle(50); return NextResponse.json({ success: true, data: { ...r, report: "ALO UNIVERSITY DATA MONITORING REPORT — see /admin/higher-study/monitoring for pending approvals. No production catalogue data was mutated." } }); }
