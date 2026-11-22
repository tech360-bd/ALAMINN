import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { processEmailQueue } from "@/lib/kits/email";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) { const auth = verifyCronAuth(req); if (!auth.ok) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status }); try { const result = await processEmailQueue(); return NextResponse.json({ success: true, data: result, message: result.configured ? "Email queue processed." : "Email transport not configured; nothing sent." }); } catch { return NextResponse.json({ success: false, message: "Queue processing failed. Check server logs." }, { status: 500 }); } }
