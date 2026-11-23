/** Verified Meta WhatsApp webhook. Inbound events are persisted through the account-scoped social inbox pipeline. */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/social/classifier";
import { processSocialEvent } from "@/lib/social/pipeline";
import { whatsappConfig, parseInboundWebhookEvents, parseWhatsappDeliveryUpdates, processAgentMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_WEBHOOK_AGE_MS = 15 * 60 * 1000;

export function resolveWhatsappWebhookSecret(): string | null {
  const secret = (process.env.WHATSAPP_WEBHOOK_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "").trim();
  return secret || null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const cfg = whatsappConfig();
  if (!cfg.webhookVerifyToken) return new NextResponse("Webhook verify token not configured", { status: 503 });
  if (mode === "subscribe" && token === cfg.webhookVerifyToken) return new NextResponse(challenge || "", { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const secret = resolveWhatsappWebhookSecret();
  if (!secret) return NextResponse.json({ success: false, error: "webhook_not_configured", errors: ["webhook_secret_not_configured"] }, { status: 503 });

  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ success: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 }); }

  const now = Date.now();
  const inbound = parseInboundWebhookEvents(payload);
  const outcomes: Array<{ messageId: string; account: string | null; outcome: string }> = [];
  for (const event of inbound) {
    if (!event.text.trim()) continue;
    const timestamp = Number(event.timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      const at = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      if (Math.abs(now - at) > MAX_WEBHOOK_AGE_MS) {
        outcomes.push({ messageId: event.messageId, account: event.accountExternalId ?? null, outcome: "stale_event_ignored" });
        continue;
      }
    }
    if (!event.accountExternalId) {
      // Never route a message using a global phone ID or a WABA ID fallback.
      outcomes.push({ messageId: event.messageId, account: null, outcome: "missing_phone_number_id" });
      continue;
    }
    const providerEventId = event.messageId || createHash("sha256")
      .update(`${event.accountExternalId}:${event.from}:${event.timestamp}:${event.text}`)
      .digest("hex").slice(0, 32);
    const result = await processSocialEvent({
      platform: "whatsapp",
      providerEventId,
      accountExternalId: event.accountExternalId,
      participantId: event.from,
      participantName: event.participantName,
      text: event.text,
      kind: event.type,
    }, {
      // Keep the established WhatsApp intent/knowledge/lead/handoff agent, but
      // place its response behind the shared account-scoped approval policy.
      draftFactory: async () => {
        const agent = await processAgentMessage({
          message: event.text,
          from: event.from,
          history: [],
          conversationRef: `wa-${providerEventId}`,
        });
        const action = agent.action as { type: string; message?: string; inquiryId?: string; contactId?: string; taskId?: string; isExisting?: boolean };
        const fromSuffix = event.from.slice(-4);
        await safeAudit("whatsapp_intent_detected", "WhatsApp", providerEventId, {
          fromSuffix, intent: agent.intent, confidence: agent.intentConfidence,
          method: agent.intentMethod, usedLlm: agent.usedLlm, elapsedMs: agent.elapsedMs,
          accountId: event.accountExternalId,
        });
        if (agent.knowledge && agent.knowledge.totalFound > 0) {
          await safeAudit("whatsapp_knowledge_retrieved", "WhatsApp", providerEventId, {
            fromSuffix, totalFound: agent.knowledge.totalFound,
            universities: agent.knowledge.universities.length,
            courses: agent.knowledge.courses.length,
            scholarships: agent.knowledge.scholarships.length,
            countries: agent.knowledge.countries.length,
          });
        }
        if (action.type === "lead_created") {
          await safeAudit("whatsapp_lead_created", "Inquiry", action.inquiryId ?? providerEventId, {
            fromSuffix, isExisting: action.isExisting, contactId: action.contactId, accountId: event.accountExternalId,
          });
        }
        if (action.type === "human_handoff") {
          await safeAudit("whatsapp_human_handoff", "Task", action.taskId ?? providerEventId, {
            fromSuffix, reason: "User requested or AI escalated", accountId: event.accountExternalId,
          });
        }
        return {
          text: action.message?.trim() ?? "",
          modelUsed: agent.usedLlm ? "whatsapp-ai-agent-llm" : "whatsapp-ai-agent-rules",
          forceEscalate: action.type === "human_handoff",
        };
      },
    });
    await safeAudit("whatsapp_message_received", "WhatsApp", providerEventId, {
      fromSuffix: event.from.slice(-4), messageLength: event.text.length,
      messageType: event.type, accountId: event.accountExternalId, outcome: result.outcome,
    });
    if (result.outcome === "auto_sent") {
      await safeAudit("whatsapp_message_sent", "WhatsApp", providerEventId, { fromSuffix: event.from.slice(-4), accountId: event.accountExternalId, actuallySent: true });
    } else if (result.outcome === "send_failed") {
      await safeAudit("whatsapp_message_failed", "WhatsApp", providerEventId, { fromSuffix: event.from.slice(-4), accountId: event.accountExternalId, actuallySent: false });
    }
    outcomes.push({ messageId: providerEventId, account: event.accountExternalId, outcome: result.outcome });
  }

  const delivery = parseWhatsappDeliveryUpdates(payload);
  let deliveryUpdates = 0;
  for (const update of delivery) {
    const status = update.status.toLowerCase();
    const deliveryStatus = status === "read" ? "read"
      : status === "delivered" ? "delivered"
      : status === "failed" ? "failed"
      : status === "sent" ? "sent"
      : null;
    if (!deliveryStatus) continue;
    const result = await db.socialMessage.updateMany({ where: { providerMessageId: update.messageId, direction: "outbound" }, data: { deliveryStatus } });
    deliveryUpdates += result.count;
  }

  if (inbound.some((event) => event.text.trim()) && outcomes.length > 0 && outcomes.every((item) => item.outcome === "stale_event_ignored")) {
    return NextResponse.json({ success: false, error: "stale_webhook_event", errors: ["stale_timestamp"], data: { outcomes } }, { status: 409 });
  }
  return NextResponse.json({ success: true, data: { outcomes, deliveryUpdates } });
}

async function safeAudit(action: string, resource: string, resourceId: string, meta: Record<string, unknown>) {
  try {
    await db.auditLog.create({ data: { actorId: null, action, resource, resourceId, meta: JSON.stringify(meta) } });
  } catch {
    // Keep Meta's webhook acknowledgment independent from optional audit availability.
  }
}
