import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { verifyCronAuth } from "@/lib/cron-auth";
import { publishDueContent } from "@/lib/social/publisher";
export async function GET(req: NextRequest) { const a = verifyCronAuth(req); if (!a.ok) return NextResponse.json({ success: false, message: a.error }, { status: a.status });
  const r = await publishDueContent(); return NextResponse.json({ success: true, data: r }); }
