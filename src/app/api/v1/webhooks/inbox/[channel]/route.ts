/**
 * Signed provider webhooks for the unified inbox.
 *
 * Supported: whatsapp | messenger | instagram. Every request is verified with
 * the official Meta X-Hub-Signature-256 header before any DB write. Events are
 * routed through the same idempotent ingest path as the authenticated admin API.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/social/classifier";
import { parseInboundWebhookEvents } from "@/lib/whatsapp/sender";
import { ingestInboxMessage } from "@/lib/inbox/ingest";
import type { Session } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ channel: string }> };

const WEBHOOK_SESSION: Session = {
  userId: "webhook",
  role: "OWNER",
  email: "webhook@system.local",
  name: "Inbound Webhook",
  expiresAt: 0,
};

type GenericEvent = {
  externalThreadId: string;
  body: string;
  displayName?: string;
  accountExternalId?: string;
  id?: string;
  timestamp?: string;
};

function parseGenericEvents(payload: unknown): GenericEvent[] {
  const events: GenericEvent[] = [];
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          page_id?: string;
          sender?: { id?: string };
          recipient?: { id?: string };
          message?: { text?: string };
          messages?: Array<{ from?: { id?: string }; to?: { id?: string }; id?: string; timestamp?: string; message?: { text?: string } }>;
        };
      }>;
    }>;
  };
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const pageId = value.page_id?.trim() || "";
      for (const message of value.messages ?? []) {
        const text = message.message?.text?.trim();
        if (!text) continue;
        const from = message.from?.id?.trim();
        if (!from) continue;
        events.push({
          externalThreadId: from,
          body: text,
          displayName: from,
          accountExternalId: pageId,
          id: message.id,
          timestamp: message.timestamp,
        });
      }
      const text = value.message?.text?.trim();
      const senderId = value.sender?.id?.trim();
      if (text && senderId) {
        events.push({
          externalThreadId: senderId,
          body: text,
          displayName: senderId,
          accountExternalId: pageId || value.recipient?.id?.trim() || undefined,
        });
      }
    }
  }
  return events;
}

function signatureSecret(channel: string): string | null {
  const value =
    channel === "whatsapp"
      ? process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_APP_SECRET
      : process.env.META_APP_SECRET;
  return value?.trim() || null;
}

function channelPlatform(channel: string): string | null {
  if (channel === "whatsapp") return "whatsapp";
  if (channel === "messenger") return "facebook";
  if (channel === "instagram") return "instagram";
  return null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { channel } = await ctx.params;
  const platform = channelPlatform(channel);
  if (!platform) {
    return NextResponse.json({ success: false, message: "Unsupported inbox webhook channel.", data: null, meta: {}, errors: ["unsupported_channel"] }, { status: 404 });
  }
  const secret = signatureSecret(channel);
  if (!secret) {
    return NextResponse.json({ success: false, message: "Webhook secret is not configured.", data: null, meta: {}, errors: ["webhook_not_configured"] }, { status: 503 });
  }
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ success: false, message: "Invalid webhook signature.", data: null, meta: {}, errors: ["invalid_signature"] }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON.", data: null, meta: {}, errors: ["invalid_json"] }, { status: 400 });
  }

  const events = channel === "whatsapp"
    ? parseInboundWebhookEvents(payload).map((event) => ({
        externalThreadId: event.from,
        body: event.text,
        displayName: event.participantName,
        accountExternalId: event.accountExternalId,
        id: event.messageId,
        timestamp: event.timestamp,
      }))
    : parseGenericEvents(payload);

  const results: { eventId: string | undefined; outcome: string }[] = [];
  for (const event of events) {
    const idempotencyKey = event.id
      ? `${channel}:${event.id}`
      : `${channel}:${createHash("sha256")
          .update(`${event.accountExternalId}:${event.externalThreadId}:${event.body}:${event.timestamp ?? ""}`)
          .digest("hex")
          .slice(0, 40)}`;
    if (!event.accountExternalId) {
      results.push({ eventId: event.id, outcome: "missing_account" });
      continue;
    }
    const account = await db.socialAccount.findFirst({
      where: { platform, externalId: event.accountExternalId },
      select: { id: true },
    });
    if (!account) {
      results.push({ eventId: event.id, outcome: "unknown_account" });
      continue;
    }
    const parsed = z.object({
      externalThreadId: z.string().min(1).max(200),
      body: z.string().min(1).max(8000),
      displayName: z.string().max(120).optional(),
    }).safeParse(event);
    if (!parsed.success) {
      results.push({ eventId: event.id, outcome: "invalid_event" });
      continue;
    }
    const result = await ingestInboxMessage({
      channel: channel as "whatsapp" | "messenger" | "instagram",
      accountId: account.id,
      externalThreadId: parsed.data.externalThreadId,
      body: parsed.data.body,
      displayName: parsed.data.displayName,
      direction: "inbound",
      idempotencyKey,
    }, WEBHOOK_SESSION);
    results.push({ eventId: event.id, outcome: result.duplicate ? "duplicate" : "ingested" });
  }

  return NextResponse.json({ success: true, message: "Webhook processed.", data: { results }, meta: {}, errors: [] });
}
