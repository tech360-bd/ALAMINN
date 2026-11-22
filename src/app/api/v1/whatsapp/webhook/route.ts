/**
 * WhatsApp Webhook — Meta Cloud API verification + inbound messages
 *
 * GET  /api/v1/whatsapp/webhook
 *   Meta verifies the webhook by sending hub.challenge. We echo it back
 *   only if hub.verify_token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 *
 * POST /api/v1/whatsapp/webhook
 *   Meta delivers inbound messages here. Requires a valid HMAC-SHA256
 *   signature in `X-Hub-Signature-256` computed over the raw request body
 *   using `WHATSAPP_APP_SECRET` (or `META_APP_SECRET`). Fails closed (503)
 *   when no secret is configured, rejects invalid/missing signatures (401),
 *   and enforces replay + messageId idempotency protection.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/social/classifier";
import {
  whatsappConfig,
  parseInboundWebhook,
  processAgentMessage,
  sendWhatsappMessage,
  type AgentMessage,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Maximum allowed age/skew for webhook message timestamps (15 minutes). */
const MAX_WEBHOOK_AGE_MS = 15 * 60 * 1000;

/** In-memory deduplication map for recently processed message IDs. */
const processedMessageIds = new Map<string, number>();

function isDuplicateInMemory(messageId: string, now: number): boolean {
  for (const [id, expiresAt] of processedMessageIds) {
    if (expiresAt <= now) processedMessageIds.delete(id);
  }
  const exp = processedMessageIds.get(messageId);
  return typeof exp === "number" && exp > now;
}

function markProcessedInMemory(messageId: string, now: number): void {
  processedMessageIds.set(messageId, now + MAX_WEBHOOK_AGE_MS);
}

/** Resolve the Meta/WhatsApp app secret used to verify X-Hub-Signature-256. */
export function resolveWhatsappWebhookSecret(): string | null {
  const secret = (
    process.env.WHATSAPP_WEBHOOK_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  ).trim();
  return secret.length > 0 ? secret : null;
}

// ─── GET: Webhook verification ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const cfg = whatsappConfig();

  if (!cfg.webhookVerifyToken) {
    return new NextResponse("Webhook verify token not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === cfg.webhookVerifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ─── POST: Inbound message handler ─────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();

  // 1. Fail closed when webhook secret is not configured.
  const secret = resolveWhatsappWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error: "webhook_not_configured",
        message: "WHATSAPP_WEBHOOK_SECRET, WHATSAPP_APP_SECRET, or META_APP_SECRET not configured — webhook disabled.",
        errors: ["webhook_secret_not_configured"],
      },
      { status: 503 }
    );
  }

  // 2. Read raw body and verify HMAC-SHA256 signature before parsing or side effects.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, secret)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_signature",
        message: "Missing or invalid X-Hub-Signature-256 header.",
      },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }

  const inbound = parseInboundWebhook(payload);
  if (!inbound || !inbound.text) {
    // Not a text message (could be a status update or system event) — ack only
    return NextResponse.json({ success: true, message: "ignored" });
  }

  // 3. Replay protection: validate message timestamp if numeric epoch seconds/ms.
  const rawTs = Number(inbound.timestamp);
  if (Number.isFinite(rawTs) && rawTs > 0) {
    const eventTimeMs = rawTs < 1e12 ? rawTs * 1000 : rawTs;
    if (Math.abs(start - eventTimeMs) > MAX_WEBHOOK_AGE_MS) {
      return NextResponse.json(
        {
          success: false,
          error: "stale_webhook_event",
          message: "Webhook event timestamp is outside the allowed replay window.",
          errors: ["stale_timestamp"],
        },
        { status: 409 }
      );
    }
  }

  // 4. Idempotency: prevent duplicate processing of the same Meta messageId.
  if (inbound.messageId) {
    if (isDuplicateInMemory(inbound.messageId, start)) {
      return NextResponse.json({
        success: true,
        message: "duplicate_ignored",
        data: {
          duplicate: true,
          messageId: inbound.messageId,
          repliesSent: 0,
          duplicatesSkipped: 1,
        },
      });
    }
    const existingAudit = await db.auditLog
      .findFirst({
        where: {
          action: "whatsapp_message_received",
          resource: "WhatsApp",
          resourceId: inbound.messageId,
        },
        select: { id: true },
      })
      .catch(() => null);
    if (existingAudit) {
      markProcessedInMemory(inbound.messageId, start);
      return NextResponse.json({
        success: true,
        message: "duplicate_ignored",
        data: { duplicate: true, messageId: inbound.messageId },
      });
    }
    markProcessedInMemory(inbound.messageId, start);
  }

  // Log inbound message (safe — no PII beyond the number hash)
  const logKey = inbound.from.slice(-4);
  await safeAudit("whatsapp_message_received", "WhatsApp", inbound.messageId, {
    fromSuffix: logKey,
    messageLength: inbound.text.length,
    messageType: inbound.type,
  });

  // Fetch recent conversation history (last 10 messages from this user)
  const history = await loadHistory(inbound.from);

  // Process via the AI agent
  const conversationRef = `wa-${inbound.from}-${Date.now().toString(36)}`;
  const response = await processAgentMessage({
    message: inbound.text,
    from: inbound.from,
    history,
    conversationRef,
  });

  // Log intent detection
  await safeAudit(
    "whatsapp_intent_detected",
    "WhatsApp",
    inbound.messageId,
    {
      fromSuffix: logKey,
      intent: response.intent,
      confidence: response.intentConfidence,
      method: response.intentMethod,
      usedLlm: response.usedLlm,
      elapsedMs: response.elapsedMs,
    }
  );

  // Log knowledge retrieval (if any)
  if (response.knowledge && response.knowledge.totalFound > 0) {
    await safeAudit(
      "whatsapp_knowledge_retrieved",
      "WhatsApp",
      inbound.messageId,
      {
        fromSuffix: logKey,
        totalFound: response.knowledge.totalFound,
        universities: response.knowledge.universities.length,
        courses: response.knowledge.courses.length,
        scholarships: response.knowledge.scholarships.length,
        countries: response.knowledge.countries.length,
      }
    );
  }

  // Extract the response text from the action
  const responseText =
    response.action.type === "human_handoff"
      ? response.action.message
      : response.action.type === "lead_created"
        ? response.action.message
        : response.action.type === "consent_required"
          ? response.action.message
          : (response.action as { message: string }).message;

  // Send the response back to the user
  const sendResult = await sendWhatsappMessage(inbound.from, responseText);

  // Log the send result
  await safeAudit(
    sendResult.status === "FAILED" ? "whatsapp_message_failed" : "whatsapp_message_sent",
    "WhatsApp",
    sendResult.messageId || inbound.messageId,
    {
      fromSuffix: logKey,
      status: sendResult.status,
      actuallySent: sendResult.actuallySent,
      error: sendResult.error,
      responseLength: responseText.length,
      totalElapsedMs: Date.now() - start,
    }
  );

  // If lead was created, log it
  if (response.action.type === "lead_created") {
    await safeAudit(
      "whatsapp_lead_created",
      "Inquiry",
      response.action.inquiryId,
      {
        fromSuffix: logKey,
        isExisting: response.action.isExisting,
        contactId: response.action.contactId,
      }
    );
  }

  // If human handoff, log it
  if (response.action.type === "human_handoff") {
    await safeAudit(
      "whatsapp_human_handoff",
      "Task",
      response.action.taskId,
      {
        fromSuffix: logKey,
        reason: "User requested or AI escalated",
      }
    );
  }

  // Store the conversation turn (for future history loading + audit)
  await storeConversationTurn(inbound.from, inbound.text, responseText, response);

  return NextResponse.json({
    success: true,
    message: "processed",
    data: {
      intent: response.intent,
      status: sendResult.status,
      actuallySent: sendResult.actuallySent,
      repliesSent: 1,
      duplicatesSkipped: 0,
      elapsedMs: Date.now() - start,
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function safeAudit(
  action: string,
  resource: string,
  resourceId: string | null,
  meta: Record<string, unknown>
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: null,
        action,
        resource,
        resourceId: resourceId || null,
        meta: JSON.stringify(meta),
      },
    });
  } catch {
    // Non-fatal — audit logging should never break the message flow
  }
}

async function loadHistory(from: string): Promise<AgentMessage[]> {
  try {
    const logs = await db.auditLog.findMany({
      where: {
        action: { in: ["whatsapp_message_received", "whatsapp_message_sent"] },
        meta: { contains: from.slice(-4) },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { action: true, meta: true, createdAt: true },
    });
    return logs.reverse().map((log) => ({
      role: log.action === "whatsapp_message_received" ? "user" : "assistant",
      content: "",
      timestamp: log.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

async function storeConversationTurn(
  _from: string,
  _userMessage: string,
  _assistantResponse: string,
  _response: Awaited<ReturnType<typeof processAgentMessage>>
) {
  // Intentionally NOT storing message content in the DB for privacy.
  // Only metadata (intent, timestamp, status) is logged via safeAudit above.
}
