/**
 * Core messaging engine of the built-in channel. Every send path — REST,
 * socket.io, scheduler dispatch and the AI agent — goes through
 * sendMessage(), so moderation and compliance apply uniformly.
 */
import { db } from '../db';
import { config } from '../config';
import { adapters } from '../adapters/registry';
import { parseMentions } from './mentions';
import {
  audit,
  checkMarketingConsent,
  checkMessagingHours,
  checkSuppression,
  violationReason,
  type Violation,
} from './compliance';
import { generateAiReply } from './ai-agent';
import { emitToConversation, emitToTenant, getIo, onlineUserIds } from './realtime';
import type { OutboundMessage, SendResult } from '../adapters/types';

export type EngineSendInput = OutboundMessage;

export class SendMessageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export async function sendMessage(input: EngineSendInput): Promise<SendResult> {
  const {
    tenantId,
    conversationId,
    senderId,
    body,
    type = 'text',
    payload,
    mentions,
    scheduledFor,
    ttlSeconds,
    marketing,
  } = input;

  if (!tenantId || !conversationId || !senderId) {
    throw new SendMessageError('tenantId, conversationId and senderId are required', 'bad_request', 400);
  }

  const [conversation, sender] = await Promise.all([
    db.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { include: { user: true } } },
    }),
    db.messagingUser.findUnique({ where: { id: senderId } }),
  ]);
  if (!conversation || conversation.tenantId !== tenantId) {
    throw new SendMessageError('Conversation not found in this tenant', 'not_found', 404);
  }
  if (!sender || sender.tenantId !== tenantId) {
    throw new SendMessageError('Sender not found in this tenant', 'not_found', 404);
  }
  if (sender.isBanned) {
    await audit(tenantId, 'message.blocked_banned_sender', { subjectType: 'user', subjectId: senderId }, senderId);
    throw new SendMessageError('Sender is banned', 'sender_banned', 403);
  }

  const membership = conversation.participants.find((p) => p.userId === senderId);
  const isAdmin =
    sender.role === 'admin' ||
    sender.role === 'agent' || // staff roles may post in one-way announcement channels
    membership?.role === 'admin' ||
    membership?.role === 'owner';
  if (!membership && sender.role !== 'ai') {
    throw new SendMessageError('Sender is not a participant', 'forbidden', 403);
  }
  if (conversation.type === 'channel' && conversation.mode === 'one_way' && !isAdmin && sender.role !== 'ai') {
    throw new SendMessageError('Channel is one-way; only admins can post', 'one_way_channel', 403);
  }

  // Attachment size guard (production: object storage).
  const payloadStr = payload === undefined ? null : JSON.stringify(payload);
  if (payloadStr && payloadStr.length > config.compliance.maxAttachmentBytes) {
    throw new SendMessageError('Attachment payload exceeds the configured size limit', 'payload_too_large', 413);
  }

  const customers = conversation.participants.filter((p) => p.user.role === 'customer');
  const recipientRefs = customers
    .map((p) => p.user.externalRef ?? p.userId)
    .filter((v): v is string => Boolean(v));

  // Moderation (vendor-free, deterministic).
  const verdict = await adapters.moderation.screen({ tenantId, senderId, text: body, conversationId });
  if (verdict.action === 'block') {
    await audit(tenantId, 'message.blocked_moderation', { subjectType: 'message', reason: verdict.reason }, senderId);
    throw new SendMessageError(`Blocked by moderation: ${verdict.reason ?? 'policy'}`, 'moderation_blocked', 422);
  }

  // Compliance control plane.
  if (marketing) {
    const v = await checkMarketingConsent(tenantId, recipientRefs);
    if (v) {
      await audit(tenantId, 'consent.missing', { subjectType: 'consent', subjectId: (v as { subjectRef: string }).subjectRef }, senderId);
      throw new SendMessageError(violationReason(v), 'consent_missing', 451);
    }
  }
  const suppress = await checkSuppression(tenantId, recipientRefs);
  if (suppress && suppress.kind === 'suppressed') {
    await audit(tenantId, 'message.blocked_suppression', { subjectType: 'suppression', subjectId: suppress.value }, senderId);
    throw new SendMessageError(violationReason(suppress), 'suppressed', 451);
  }
  const hours = await checkMessagingHours(tenantId, conversationId, sender.role);
  if (hours) {
    await audit(tenantId, 'hours.violation', { subjectType: 'conversation', subjectId: conversationId }, senderId);
    throw new SendMessageError(violationReason(hours), 'hours_violation', 451);
  }

  const mentionIds = mentions ?? parseMentions(body, conversation.participants.map((p) => ({ id: p.userId, displayName: p.user.displayName })));
  const isScheduled = scheduledFor && new Date(scheduledFor).getTime() > Date.now();

  const message = await db.message.create({
    data: {
      tenantId,
      conversationId,
      senderId,
      type,
      body,
      payload: payloadStr,
      mentions: JSON.stringify(mentionIds),
      scheduledFor: isScheduled ? new Date(scheduledFor!) : null,
      sentAt: isScheduled ? null : new Date(),
      expiresAt: !isScheduled && ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null,
    },
  });

  if (isScheduled) {
    return { messageId: message.id, status: 'scheduled' };
  }

  await dispatchMessage(message.id);
  return { messageId: message.id, status: 'sent' };
}

/** Broadcast a freshly created (or due) message and create its receipts. */
export async function dispatchMessage(messageId: string): Promise<void> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: { conversation: { include: { participants: { include: { user: true } } } } },
  });
  if (!message || message.sentAt === null) return;
  const participants = message.conversation.participants;

  const online = new Set(onlineUserIds());
  const now = new Date();
  await db.receipt.createMany({
    data: participants
      .filter((p) => p.userId !== message.senderId)
      .map((p) => ({
        tenantId: message.tenantId,
        messageId: message.id,
        userId: p.userId,
        deliveredAt: online.has(p.userId) ? now : null,
      })),
  });

  const payloadMessage = { ...serialiseMessage(message), status: verdictFor(message) };
  emitToConversation(message.conversationId, 'message:new', payloadMessage);
  emitToTenant(message.tenantId, 'notify', {
    kind: 'message',
    conversationId: message.conversationId,
    messageId: message.id,
    title: 'New message',
    body: message.body.slice(0, 80),
  });

  // Mark delivered for participants that are connected right now.
  for (const p of participants) {
    if (online.has(p.userId) && p.userId !== message.senderId) {
      emitToConversation(message.conversationId, 'receipt:update', {
        conversationId: message.conversationId,
        messageId: message.id,
        userId: p.userId,
        deliveredAt: now.toISOString(),
      });
    }
  }

  // Inbound subscription surface (AI agent + future integrations).
  const sender = participants.find((p) => p.userId === message.senderId)?.user;
  if (sender?.role === 'customer') {
    adapters.messaging.emitInbound?.({
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      senderId: message.senderId!,
      body: message.body,
      type: message.type,
      payload: message.payload ? JSON.parse(message.payload) : undefined,
      mentions: JSON.parse(message.mentions || '[]'),
      messageId: message.id,
      language: message.language ?? undefined,
    });
    // AI auto-reply is fire-and-forget; it re-enters through sendMessage().
    void generateAiReply(message.id);
  }
}

function verdictFor(message: { id: string; senderId: string | null; conversation: { participants: { userId: string; lastReadMessageId: string | null }[] } }): 'sent' | 'delivered' | 'read' {
  const others = message.conversation.participants.filter((p) => p.userId !== message.senderId);
  if (others.length > 0 && others.every((p) => p.lastReadMessageId === message.id)) return 'read';
  return 'sent';
}

export function serialiseMessage(m: {
  id: string;
  tenantId: string;
  conversationId: string;
  senderId: string | null;
  type: string;
  body: string;
  payload: string | null;
  mentions: string;
  language: string | null;
  translation: string | null;
  scheduledFor: Date | null;
  sentAt: Date | null;
  expiresAt: Date | null;
  hidden: boolean;
  createdAt: Date;
}) {
  return {
    id: m.id,
    tenantId: m.tenantId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    body: m.body,
    payload: m.payload ? JSON.parse(m.payload) : null,
    mentions: JSON.parse(m.mentions || '[]'),
    language: m.language,
    translation: m.translation ? JSON.parse(m.translation) : null,
    scheduledFor: m.scheduledFor?.toISOString() ?? null,
    sentAt: m.sentAt?.toISOString() ?? null,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    hidden: m.hidden,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Unread counts per conversation for a participant (catalogue: "Unread Message Counts"). */
export async function unreadCounts(tenantId: string, userId: string): Promise<Record<string, number>> {
  const parts = await db.conversationParticipant.findMany({
    where: { userId, conversation: { tenantId } },
    include: { conversation: { select: { id: true } } },
  });
  const result: Record<string, number> = {};
  for (const p of parts) {
    const anchor = p.lastReadMessageId
      ? await db.message.findUnique({ where: { id: p.lastReadMessageId }, select: { createdAt: true } })
      : null;
    const count = await db.message.count({
      where: {
        conversationId: p.conversationId,
        hidden: false,
        sentAt: { not: null },
        createdAt: { gt: anchor ? anchor.createdAt : p.joinedAt },
        senderId: { not: userId },
      },
    });
    result[p.conversationId] = count;
  }
  return result;
}

/** Mark a conversation read up to a message (catalogue: "Read Receipts"). */
export async function markRead(tenantId: string, conversationId: string, userId: string, upToMessageId?: string) {
  const member = await db.conversationParticipant.findFirst({ where: { conversationId, userId } });
  if (!member) throw new SendMessageError('Not a participant', 'forbidden', 403);

  const anchor = upToMessageId
    ? await db.message.findFirst({ where: { id: upToMessageId, conversationId } })
    : await db.message.findFirst({
        where: { conversationId, hidden: false, sentAt: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
  if (!anchor) return { marked: 0 };

  await db.conversationParticipant.update({ where: { id: member.id }, data: { lastReadMessageId: anchor.id } });
  const updated = await db.receipt.updateMany({
    where: { messageId: { in: [anchor.id] }, userId, readAt: null },
    data: { deliveredAt: new Date(), readAt: new Date() },
  });
  // Also mark everything before the anchor read (true "read up to" semantics).
  const earlier = await db.message.findMany({
    where: { conversationId, hidden: false, sentAt: { not: null }, createdAt: { lte: anchor.createdAt } },
    select: { id: true },
  });
  const res2 = await db.receipt.updateMany({
    where: { messageId: { in: earlier.map((m) => m.id) }, userId, readAt: null },
    data: { deliveredAt: new Date(), readAt: new Date() },
  });
  emitToConversation(conversationId, 'receipt:update', {
    conversationId,
    userId,
    messageIds: earlier.map((m) => m.id),
    readAt: new Date().toISOString(),
  });
  return { marked: updated.count + res2.count };
}

/** Mark delivery receipts for everyone currently connected (catalogue: "Delivery Receipts"). */
export async function markDelivered(conversationId: string, userId: string) {
  const online = new Set(onlineUserIds());
  if (!online.has(userId)) return { marked: 0 };
  const res = await db.receipt.updateMany({
    where: { userId, deliveredAt: null, message: { conversationId, sentAt: { not: null } } },
    data: { deliveredAt: new Date() },
  });
  return { marked: res.count };
}

export function broadcastPresenceSnapshot() {
  emitToTenant('*' as never, 'noop', null); // placeholder no-op; presence is event-driven
  void getIo();
}

export function violationFromError(err: unknown): Violation | null {
  if (err instanceof SendMessageError && ['suppressed', 'consent_missing', 'hours_violation'].includes(err.code)) {
    return { kind: err.code as never, value: err.message } as unknown as Violation;
  }
  return null;
}
