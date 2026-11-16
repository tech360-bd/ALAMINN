import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkAdminRateLimit } from "@/lib/admin-api-server";
import { newSupportToken, hashSupportToken, supportRateKey, sameOrigin } from "@/lib/kits/support";
export const dynamic = "force-dynamic";
const schema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(254).optional().or(z.literal("")), message: z.string().trim().min(1).max(2000) });
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, message: "Origin rejected." }, { status: 403 });
  if (!checkAdminRateLimit(supportRateKey(req), 8).allowed) return NextResponse.json({ success: false, message: "Please wait a minute before starting another conversation." }, { status: 429 });
  const raw = await req.text(); if (raw.length > 8000) return NextResponse.json({ success: false, message: "Message too large." }, { status: 413 });
  let body: unknown; try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, message: "Enter your name and a message (up to 2,000 characters)." }, { status: 422 });
  const token = newSupportToken(); const data = parsed.data;
  try { const row = await db.supportConversation.create({ data: { visitorName: data.name, visitorEmail: data.email || null, tokenHash: hashSupportToken(token), messages: { create: { sender: "visitor", senderName: data.name, body: data.message } } } }); return NextResponse.json({ success: true, data: { id: row.id, token } }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch { return NextResponse.json({ success: false, message: "Support is temporarily unavailable. Please try again later." }, { status: 503 }); }
}
