import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkAdminRateLimit } from "@/lib/admin-api-server";
import { visitorConversation, supportRateKey, sameOrigin } from "@/lib/kits/support";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { const { id } = await ctx.params; const c = await visitorConversation(req, id); if (!c) return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404, headers }); const messages = await db.supportMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, sender: true, senderName: true, body: true, createdAt: true } }); return NextResponse.json({ success: true, data: { status: c.status, messages } }, { headers }); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, message: "Origin rejected." }, { status: 403 });
  const { id } = await ctx.params; const c = await visitorConversation(req, id); if (!c) return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404, headers });
  if (!checkAdminRateLimit(supportRateKey(req), 30).allowed) return NextResponse.json({ success: false, message: "Please slow down." }, { status: 429 });
  if (c.status === "resolved") return NextResponse.json({ success: false, message: "This conversation is resolved. Start a new conversation for more help." }, { status: 409 });
  const raw = await req.text(); if (raw.length > 8000) return NextResponse.json({ success: false, message: "Message too large." }, { status: 413 }); let body: unknown; try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 }); }
  const parsed = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(body); if (!parsed.success) return NextResponse.json({ success: false, message: "Enter a message up to 2,000 characters." }, { status: 422 });
  await db.$transaction([db.supportMessage.create({ data: { conversationId: id, sender: "visitor", senderName: c.visitorName, body: parsed.data.message } }), db.supportConversation.update({ where: { id }, data: { status: "open", lastMessageAt: new Date() } })]);
  return NextResponse.json({ success: true }, { status: 201, headers });
}
