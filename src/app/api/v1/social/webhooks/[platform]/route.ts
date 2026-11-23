import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
import { createHash } from "crypto";
import { verifyMetaSignature } from "@/lib/social/classifier";
import { processSocialEvent } from "@/lib/social/pipeline";
import { parseInboundWebhookEvents, parseWhatsappDeliveryUpdates } from "@/lib/whatsapp/sender";
import { db } from "@/lib/db";
/** GET: Meta webhook verification (facebook/instagram/whatsapp). POST: signature-verified, deduplicated ingestion. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) { await ctx.params;
  const u = new URL(req.url); const token = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!token) return new NextResponse("verify token not configured", { status: 503 });
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) return new NextResponse(u.searchParams.get("hub.challenge") || "", { status: 200 });
  return new NextResponse("Forbidden", { status: 403 }); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) { const { platform } = await ctx.params;
  const raw = await req.text();
  const secret = (process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || "").trim() || null;
  if (!secret) return NextResponse.json({ success: false, error: "webhook_not_configured", message: "META_APP_SECRET not configured — webhook disabled" }, { status: 503 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) return NextResponse.json({ success: false, error: "invalid_signature", message: "Invalid signature" }, { status: 401 });
  let payload: unknown; try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const p = payload as { entry?: { id?: string; changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: unknown[]; comments?: unknown[] } }[] }[] };
  const results: string[] = [];
  if (platform === "whatsapp") {
    for (const inbound of parseInboundWebhookEvents(payload)) {
      if (!inbound.text.trim() || !inbound.accountExternalId) continue;
      const providerEventId = inbound.messageId || createHash("sha256").update(`${inbound.accountExternalId}:${inbound.from}:${inbound.timestamp}:${inbound.text}`).digest("hex").slice(0, 32);
      const result = await processSocialEvent({ platform, providerEventId, accountExternalId: inbound.accountExternalId, participantId: inbound.from, participantName: inbound.participantName, text: inbound.text, kind: inbound.type });
      results.push(result.outcome);
    }
    for (const update of parseWhatsappDeliveryUpdates(payload)) {
      const status = update.status.toLowerCase();
      const deliveryStatus = status === "read" ? "read" : status === "delivered" ? "delivered" : status === "failed" ? "failed" : status === "sent" ? "sent" : null;
      if (deliveryStatus) await db.socialMessage.updateMany({ where: { providerMessageId: update.messageId, direction: "outbound" }, data: { deliveryStatus } });
    }
  } else {
    for (const e of p.entry || []) for (const ch of e.changes || []) { const v = ch.value as { from?: { id?: string; name?: string }; message?: string; text?: string; id?: string };
      const text = v?.message || v?.text || ""; const evId = v?.id || createHash("sha256").update(JSON.stringify(ch)).digest("hex").slice(0, 24);
      if (text && v?.from?.id) { const r = await processSocialEvent({ platform, providerEventId: String(evId), accountExternalId: String(e.id), participantId: String(v.from.id), participantName: v.from.name, text, kind: "comment" }); results.push(r.outcome); } }
  }
  return NextResponse.json({ success: true, data: { results } }); }
