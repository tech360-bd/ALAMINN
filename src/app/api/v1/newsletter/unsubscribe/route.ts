import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkAdminRateLimit } from "@/lib/admin-api-server";
import { sameOrigin } from "@/lib/kits/support";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, message: "Origin rejected" }, { status: 403 });
  if (!checkAdminRateLimit(`unsubscribe:${req.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`, 10).allowed) return NextResponse.json({ success: false, message: "Please wait before retrying." }, { status: 429 });
  const body = await req.json().catch(() => null); const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid unsubscribe link." }, { status: 400 });
  await db.newsletterSubscriber.updateMany({ where: { token: parsed.data.token }, data: { status: "unsubscribed", consent: false } });
  return NextResponse.json({ success: true, message: "If this subscription exists, it has been unsubscribed. You will no longer receive campaign emails." });
}
