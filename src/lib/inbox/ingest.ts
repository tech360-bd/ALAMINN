/**
 * Shared ingestion path for the unified inbox.
 *
 * Used by the authenticated admin API and by signed provider webhooks so that
 * both routes apply the same validation, contact matching, idempotency and
 * audit behaviour. No provider is contacted here.
 */
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/admin-api-server";
import { findContactMatch, makeExternalRef } from "@/lib/inbox/contacts";

export interface IngestInboxInput {
  channel: "email" | "whatsapp" | "messenger" | "instagram" | "website_chat" | "social";
  accountId: string;
  externalThreadId: string;
  body: string;
  direction: "inbound" | "outbound";
  subject?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  idempotencyKey?: string;
  attachments?: { name: string; url: string; mimeType?: string; size?: number }[];
}

export interface IngestResult {
  conversationId: string;
  messageId: string;
  contactId: string | null;
  duplicate: boolean;
}

/** Idempotent upsert of a conversation/message pair. */
export async function ingestInboxMessage(
  input: IngestInboxInput,
  session: Session
): Promise<IngestResult> {
  if (input.idempotencyKey) {
    const existing = await db.inboxMessage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { conversationId: existing.conversationId, messageId: existing.id, contactId: null, duplicate: true };
    }
  }

  const externalRef = makeExternalRef(input.channel, input.externalThreadId);
  const contacts = await db.inboxContact.findMany({
    where: {
      OR: [
        { externalRef },
        ...(input.email ? [{ email: input.email.trim().toLowerCase() }] : []),
      ],
    },
    take: 50,
  });
  const matched = findContactMatch(contacts, { ...input, externalRef });
  let contactId = matched?.id ?? null;
  if (!contactId && (input.email || input.phone || input.displayName)) {
    const created = await db.inboxContact.create({
      data: {
        displayName: input.displayName || input.email || input.phone || externalRef,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        externalRef,
      },
    });
    contactId = created.id;
  }

  const conversation = await db.inboxConversation.upsert({
    where: {
      channel_accountId_externalThreadId: {
        channel: input.channel,
        accountId: input.accountId,
        externalThreadId: input.externalThreadId,
      },
    },
    create: {
      channel: input.channel,
      accountId: input.accountId,
      externalThreadId: input.externalThreadId,
      contactId,
      subject: input.subject,
      status: input.direction === "inbound" ? "unread" : "open",
      unreadCount: input.direction === "inbound" ? 1 : 0,
      lastMessageAt: new Date(),
    },
    update: {
      contactId: contactId ?? undefined,
      lastMessageAt: new Date(),
      ...(input.direction === "inbound" ? { unreadCount: { increment: 1 }, status: "unread" } : {}),
    },
  });

  const message = await db.inboxMessage.create({
    data: {
      conversationId: conversation.id,
      providerMessageId: input.idempotencyKey || null,
      idempotencyKey: input.idempotencyKey || null,
      direction: input.direction,
      body: input.body,
      attachments: JSON.stringify(input.attachments ?? []),
      senderType: input.direction === "inbound" ? "contact" : "agent",
      deliveryStatus: "received",
    },
  });
  await db.inboxAudit.create({
    data: {
      conversationId: conversation.id,
      action: "inbox_message_ingested",
      actorId: session.userId,
      meta: JSON.stringify({ channel: input.channel, messageId: message.id }),
    },
  });
  await writeAudit(session, "inbox_conversation_ingested", "InboxConversation", conversation.id, {
    channel: input.channel,
  });
  return { conversationId: conversation.id, messageId: message.id, contactId, duplicate: false };
}
