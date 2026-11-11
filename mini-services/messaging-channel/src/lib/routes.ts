/**
 * REST API of the Universal Messaging Channel.
 * All routes are tenant-scoped; nothing is hard-coded to any tenant, brand,
 * project or domain. The query string is ignored for routing so the gateway's
 * XTransformPort parameter passes through transparently.
 */
import { db } from '../db';
import { config } from '../config';
import { adapters } from '../adapters/registry';
import { sendMessage, unreadCounts, markRead, markDelivered, serialiseMessage, SendMessageError } from './engine';
import { getTranslationProvider } from './translate';
import { raiseHandoff, aiSenderId, detectCustomerRequest } from './ai-agent';
import { audit, tenantLocalHour } from './compliance';
import { onlineUserIds, getIo } from './realtime';

type Handler = (req: RequestContext) => Promise<unknown>;
interface RequestContext {
  params: Record<string, string>;
  body: any;
  query: URLSearchParams;
}

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];
function route(method: string, path: string, handler: Handler) {
  const pattern = new RegExp(
    '^' +
      path
        .split('/')
        .map((seg) => (seg.startsWith(':') ? `(?<${seg.slice(1)}>[^/]+)` : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/') +
      '$',
  );
  routes.push({ method, pattern, handler });
}

// ─────────────────────────────── System ───────────────────────────────

route('GET', '/api/umc/health', async () => ({
  ok: true,
  service: 'messaging-channel',
  providers: {
    messaging: adapters.messaging.provider,
    moderation: adapters.moderation.provider,
    telephony: adapters.telephony.provider,
    console: adapters.console.provider,
    translation: config.translationProvider,
  },
  telephonyConfigured: adapters.telephony.isConfigured(),
  onlineUsers: onlineUserIds().length,
  now: new Date().toISOString(),
}));

// ─────────────────────────────── Tenants ──────────────────────────────

route('GET', '/api/umc/tenants', async () => {
  const tenants = await db.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  return { tenants };
});

route('POST', '/api/umc/tenants', async ({ body }) => {
  const tenant = await db.tenant.create({
    data: {
      name: String(body.name ?? '').slice(0, 120),
      slug: String(body.slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      timezone: body.timezone ?? 'Asia/Dhaka',
      messagingStart: Number(body.messagingStart ?? 9),
      messagingEnd: Number(body.messagingEnd ?? 21),
      languages: body.languages ?? 'bn,en,banglish',
      aiAutoReply: body.aiAutoReply ?? true,
    },
  });
  await audit(tenant.id, 'tenant.created', { subjectType: 'tenant', subjectId: tenant.id });
  return { tenant };
});

route('PATCH', '/api/umc/tenants/:tenantId', async ({ params, body }) => {
  const data: Record<string, unknown> = {};
  for (const k of ['name', 'timezone', 'languages']) if (body[k] !== undefined) data[k] = body[k];
  for (const k of ['messagingStart', 'messagingEnd']) if (body[k] !== undefined) data[k] = Number(body[k]);
  if (body.aiAutoReply !== undefined) data.aiAutoReply = Boolean(body.aiAutoReply);
  const tenant = await db.tenant.update({ where: { id: params.tenantId }, data });
  await audit(params.tenantId, 'tenant.updated', { subjectType: 'tenant', subjectId: params.tenantId });
  return { tenant };
});

// ──────────────────────────────── Users ───────────────────────────────

route('GET', '/api/umc/tenants/:tenantId/users', async ({ params }) => ({
  users: await db.messagingUser.findMany({ where: { tenantId: params.tenantId }, orderBy: { createdAt: 'asc' } }),
}));

route('POST', '/api/umc/tenants/:tenantId/users', async ({ params, body }) => {
  const user = await db.messagingUser.create({
    data: {
      tenantId: params.tenantId,
      displayName: String(body.displayName ?? '').slice(0, 120),
      externalRef: body.externalRef ?? null,
      role: body.role ?? 'customer',
      locale: body.locale ?? 'bn',
      isVerifiedBusiness: Boolean(body.isVerifiedBusiness ?? false),
    },
  });
  return { user };
});

route('PATCH', '/api/umc/users/:userId', async ({ params, body }) => {
  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.role !== undefined) data.role = body.role;
  if (body.isBanned !== undefined) data.isBanned = Boolean(body.isBanned);
  if (body.isVerifiedBusiness !== undefined) data.isVerifiedBusiness = Boolean(body.isVerifiedBusiness);
  if (body.blockedIds !== undefined) data.blockedIds = JSON.stringify(body.blockedIds);
  const user = await db.messagingUser.update({ where: { id: params.userId }, data });
  return { user };
});

// ───────────────────────────── Conversations ──────────────────────────

route('GET', '/api/umc/tenants/:tenantId/conversations', async ({ params, query }) => {
  const userId = query.get('userId');
  const conversations = await db.conversation.findMany({
    where: {
      tenantId: params.tenantId,
      ...(userId ? { participants: { some: { userId } } } : {}),
    },
    include: {
      participants: { include: { user: { select: { id: true, displayName: true, role: true, lastSeenAt: true, isVerifiedBusiness: true, isBanned: true } } } },
      tags: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const unread = userId ? await unreadCounts(params.tenantId, userId) : {};
  const openHandoffs = await db.handoffEvent.findMany({
    where: { tenantId: params.tenantId, status: 'open' },
    select: { conversationId: true, trigger: true },
  });
  const handoffByConv = Object.fromEntries(openHandoffs.map((h) => [h.conversationId, h.trigger]));
  return {
    conversations: conversations.map((c) => ({
      ...c,
      unread: unread[c.id] ?? 0,
      handoffTrigger: handoffByConv[c.id] ?? null,
    })),
  };
});

route('POST', '/api/umc/tenants/:tenantId/conversations', async ({ params, body }) => {
  const memberIds: string[] = body.memberIds ?? [];
  const type = body.type ?? (memberIds.length <= 1 ? 'direct' : 'group');
  const conv = await db.conversation.create({
    data: {
      tenantId: params.tenantId,
      type,
      title: body.title ?? null,
      mode: body.mode ?? 'two_way',
      visibility: body.visibility ?? 'private',
      aiMode: body.aiMode ?? true,
      burnoutAfter: body.burnoutSeconds ? new Date(Date.now() + body.burnoutSeconds * 1000) : null,
      participants: { create: memberIds.map((id: string, i: number) => ({ userId: id, role: i === 0 ? 'owner' : 'member' })) },
    },
    include: { participants: { include: { user: true } } },
  });
  await audit(params.tenantId, 'conversation.created', { subjectType: 'conversation', subjectId: conv.id });
  return { conversation: conv };
});

route('POST', '/api/umc/conversations/:conversationId/join', async ({ params, body }) => {
  const conv = await db.conversation.findUnique({ where: { id: params.conversationId } });
  if (!conv) throw new SendMessageError('Conversation not found', 'not_found', 404);
  if (conv.visibility !== 'public') throw new SendMessageError('Conversation is not public', 'forbidden', 403);
  await db.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: conv.id, userId: body.userId } },
    create: { conversationId: conv.id, userId: body.userId },
    update: {},
  });
  getIo().socketsJoin(`conv:${conv.id}`); // connected sockets of that user re-join via auth; direct join keeps room fresh
  return { joined: true };
});

route('PATCH', '/api/umc/conversations/:conversationId', async ({ params, body }) => {
  const data: Record<string, unknown> = {};
  if (body.aiMode !== undefined) data.aiMode = Boolean(body.aiMode);
  if (body.status !== undefined) data.status = body.status;
  if (body.title !== undefined) data.title = body.title;
  if (body.burnoutSeconds !== undefined) {
    data.burnoutAfter = body.burnoutSeconds ? new Date(Date.now() + body.burnoutSeconds * 1000) : null;
  }
  const conv = await db.conversation.update({ where: { id: params.conversationId }, data });
  return { conversation: conv };
});

// ─────────────────────────────── Messages ─────────────────────────────

route('GET', '/api/umc/conversations/:conversationId/messages', async ({ params, query }) => {
  const search = query.get('search');
  const starredBy = query.get('starredBy');
  const limit = Math.min(Number(query.get('limit') ?? 100), 200);

  const starredIds: string[] = [];
  if (starredBy) {
    const stars = await db.star.findMany({ where: { messageId: { not: '' }, userId: starredBy, message: { conversationId: params.conversationId } } });
    starredIds.push(...stars.map((s) => s.messageId));
    if (starredIds.length === 0) return { messages: [] };
  }

  const messages = await db.message.findMany({
    where: {
      conversationId: params.conversationId,
      hidden: false,
      sentAt: { not: null },
      ...(search ? { body: { contains: search } } : {}),
      ...(starredIds.length ? { id: { in: starredIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      sender: { select: { id: true, displayName: true, role: true, isVerifiedBusiness: true } },
      stars: { select: { userId: true } },
      receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
    },
  });
  return { messages: messages.reverse().map((m) => ({ ...serialiseMessage(m), sender: m.sender, starredBy: m.stars.map((s) => s.userId), receipts: m.receipts })) };
});

route('POST', '/api/umc/conversations/:conversationId/messages', async ({ params, body }) => {
  const result = await sendMessage({
    tenantId: body.tenantId,
    conversationId: params.conversationId,
    senderId: body.senderId,
    body: String(body.body ?? ''),
    type: body.type ?? 'text',
    payload: body.payload,
    mentions: body.mentions,
    scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
    ttlSeconds: body.ttlSeconds,
    marketing: Boolean(body.marketing),
  });
  return result;
});

route('POST', '/api/umc/messages/:messageId/star', async ({ params, body }) => {
  const star = await db.star.upsert({
    where: { messageId_userId: { messageId: params.messageId, userId: body.userId } },
    create: { messageId: params.messageId, userId: body.userId, tenantId: body.tenantId },
    update: {},
  });
  return { star };
});

route('DELETE', '/api/umc/messages/:messageId/star', async ({ params, query }) => {
  await db.star.deleteMany({ where: { messageId: params.messageId, userId: query.get('userId') ?? '' } });
  return { removed: true };
});

route('POST', '/api/umc/messages/:messageId/translate', async ({ params, body }) => {
  const message = await db.message.findUnique({ where: { id: params.messageId } });
  if (!message) throw new SendMessageError('Message not found', 'not_found', 404);
  const target = body.target ?? (message.language === 'bn' ? 'en' : 'bn');
  const cached = message.translation ? JSON.parse(message.translation) : null;
  if (cached && cached.lang === target) return { translation: cached, cached: true };
  const result = await getTranslationProvider().translate(message.body, target, message.language ?? undefined);
  await db.message.update({ where: { id: message.id }, data: { translation: JSON.stringify(result) } });
  return { translation: result, cached: false };
});

// Polls (catalogue: "Polls")
route('POST', '/api/umc/messages/:messageId/vote', async ({ params, body }) => {
  const message = await db.message.findUnique({ where: { id: params.messageId } });
  if (!message || message.type !== 'poll' || !message.payload) {
    throw new SendMessageError('Poll not found', 'not_found', 404);
  }
  const poll = JSON.parse(message.payload) as { question: string; options: { text: string; votes: string[] }[] };
  const idx = Number(body.optionIndex);
  if (!Number.isInteger(idx) || !poll.options[idx]) throw new SendMessageError('Invalid option', 'bad_request', 400);
  for (const o of poll.options) o.votes = o.votes.filter((v) => v !== body.userId);
  poll.options[idx].votes.push(body.userId);
  await db.message.update({ where: { id: message.id }, data: { payload: JSON.stringify(poll) } });
  return { poll };
});

// ────────────────────── Read / receipts / presence ────────────────────

route('POST', '/api/umc/conversations/:conversationId/read', async ({ params, body }) => {
  return markRead(body.tenantId, params.conversationId, body.userId, body.upToMessageId);
});

route('POST', '/api/umc/conversations/:conversationId/delivered', async ({ params, body }) => {
  return markDelivered(params.conversationId, body.userId);
});

route('GET', '/api/umc/tenants/:tenantId/unread', async ({ params, query }) => {
  const userId = query.get('userId');
  if (!userId) throw new SendMessageError('userId required', 'bad_request', 400);
  return { unread: await unreadCounts(params.tenantId, userId) };
});

// ─────────────────────── Tags, admin ops, reports ─────────────────────

route('POST', '/api/umc/conversations/:conversationId/tags', async ({ params, body }) => {
  const conv = await db.conversation.findUnique({ where: { id: params.conversationId } });
  if (!conv) throw new SendMessageError('Conversation not found', 'not_found', 404);
  const tag = await db.tag.upsert({
    where: { conversationId_label: { conversationId: params.conversationId, label: body.label } },
    create: { conversationId: params.conversationId, label: body.label, tenantId: conv.tenantId },
    update: {},
  });
  return { tag };
});

route('DELETE', '/api/umc/conversations/:conversationId/tags', async ({ params, query }) => {
  await db.tag.deleteMany({ where: { conversationId: params.conversationId, label: query.get('label') ?? '' } });
  return { removed: true };
});

route('POST', '/api/umc/reports', async ({ body }) => {
  const report = await db.report.create({
    data: {
      tenantId: body.tenantId,
      reporterId: body.reporterId,
      targetUserId: body.targetUserId ?? null,
      messageId: body.messageId ?? null,
      reason: String(body.reason ?? 'unspecified'),
    },
  });
  await audit(body.tenantId, 'report.created', { subjectType: 'report', subjectId: report.id }, body.reporterId);
  return { report };
});

route('GET', '/api/umc/tenants/:tenantId/reports', async ({ params }) => ({
  reports: await db.report.findMany({ where: { tenantId: params.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
}));

// ───────────────────────── Handoff & console ──────────────────────────

route('GET', '/api/umc/tenants/:tenantId/handoffs', async ({ params, query }) => ({
  handoffs: await db.handoffEvent.findMany({
    where: { tenantId: params.tenantId, ...(query.get('status') ? { status: query.get('status')! } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { conversation: { select: { id: true, title: true, type: true } } },
  }),
}));

route('POST', '/api/umc/conversations/:conversationId/handoff', async ({ params, body }) => {
  await raiseHandoff(body.tenantId, params.conversationId, body.trigger ?? 'manual', body.detail ?? 'Manual handoff');
  return { raised: true };
});

route('POST', '/api/umc/handoffs/:handoffId/claim', async ({ params, body }) => {
  const handoff = await db.handoffEvent.update({
    where: { id: params.handoffId },
    data: { status: 'claimed', claimedById: body.agentId },
  });
  await adapters.console.publishHandoffUpdate({
    tenantId: handoff.tenantId,
    conversationId: handoff.conversationId,
    handoffId: handoff.id,
    trigger: handoff.trigger,
    status: 'claimed',
    createdAt: handoff.createdAt,
  });
  return { handoff };
});

route('POST', '/api/umc/handoffs/:handoffId/resolve', async ({ params }) => {
  const handoff = await db.handoffEvent.update({
    where: { id: params.handoffId },
    data: { status: 'resolved', resolvedAt: new Date() },
  });
  await db.conversation.update({ where: { id: handoff.conversationId }, data: { status: 'active' } });
  await adapters.console.publishHandoffUpdate({
    tenantId: handoff.tenantId,
    conversationId: handoff.conversationId,
    handoffId: handoff.id,
    trigger: handoff.trigger,
    status: 'resolved',
    createdAt: handoff.createdAt,
  });
  return { handoff };
});

// ─────────────────────────── Compliance plane ─────────────────────────

route('GET', '/api/umc/tenants/:tenantId/compliance', async ({ params }) => {
  const [consents, suppressions, words, events, reports] = await Promise.all([
    db.consent.findMany({ where: { tenantId: params.tenantId }, orderBy: { id: 'desc' }, take: 100 }),
    db.suppressEntry.findMany({ where: { tenantId: params.tenantId }, orderBy: { addedAt: 'desc' } }),
    db.moderationWord.findMany({ where: { tenantId: params.tenantId } }),
    db.auditEvent.findMany({ where: { tenantId: params.tenantId }, orderBy: { at: 'desc' }, take: 60 }),
    db.report.findMany({ where: { tenantId: params.tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const tenant = await db.tenant.findUnique({ where: { id: params.tenantId } });
  return {
    consents,
    suppressions,
    moderationWords: words,
    auditEvents: events,
    reports,
    tenant,
    localHourNow: tenant ? tenantLocalHour(tenant.timezone) : null,
  };
});

route('POST', '/api/umc/tenants/:tenantId/consents', async ({ params, body }) => {
  const existing = await db.consent.findFirst({
    where: { tenantId: params.tenantId, subjectRef: body.subjectRef, channel: body.channel ?? 'chat', purpose: body.purpose ?? 'marketing' },
  });
  const consent = existing
    ? await db.consent.update({
        where: { id: existing.id },
        data: {
          grantedAt: body.granted === false ? null : new Date(),
          revokedAt: body.granted === false ? new Date() : null,
          proofRef: body.proofRef ?? existing.proofRef,
        },
      })
    : await db.consent.create({
        data: {
          tenantId: params.tenantId,
          subjectRef: body.subjectRef,
          channel: body.channel ?? 'chat',
          purpose: body.purpose ?? 'marketing',
          grantedAt: body.granted === false ? null : new Date(),
          revokedAt: body.granted === false ? new Date() : null,
          proofRef: body.proofRef ?? null,
        },
      });
  await audit(params.tenantId, body.granted === false ? 'consent.revoked' : 'consent.granted', { subjectType: 'consent', subjectId: consent.id }, body.actorId);
  return { consent };
});

route('POST', '/api/umc/tenants/:tenantId/suppressions', async ({ params, body }) => {
  const entry = await db.suppressEntry.upsert({
    where: { tenantId_channel_value: { tenantId: params.tenantId, channel: body.channel ?? 'all', value: body.value } },
    create: { tenantId: params.tenantId, channel: body.channel ?? 'all', value: body.value, reason: body.reason ?? null },
    update: { reason: body.reason ?? null },
  });
  await audit(params.tenantId, 'suppression.added', { subjectType: 'suppression', subjectId: entry.id }, body.actorId);
  return { entry };
});

route('DELETE', '/api/umc/tenants/:tenantId/suppressions', async ({ params, query }) => {
  await db.suppressEntry.deleteMany({ where: { tenantId: params.tenantId, value: query.get('value') ?? '' } });
  return { removed: true };
});

route('POST', '/api/umc/tenants/:tenantId/moderation-words', async ({ params, body }) => {
  const word = await db.moderationWord.upsert({
    where: { tenantId_word: { tenantId: params.tenantId, word: body.word.toLowerCase() } },
    create: { tenantId: params.tenantId, word: body.word.toLowerCase(), severity: body.severity ?? 'block' },
    update: { severity: body.severity ?? 'block' },
  });
  return { word };
});

route('DELETE', '/api/umc/tenants/:tenantId/moderation-words', async ({ params, query }) => {
  await db.moderationWord.deleteMany({ where: { tenantId: params.tenantId, word: query.get('word') ?? '' } });
  return { removed: true };
});

// ─────────────────────────────── Router ───────────────────────────────

export async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  let body: any = null;
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (r.method === method && m) {
      try {
        const result = await r.handler({ params: (m.groups ?? {}) as Record<string, string>, body, query: url.searchParams });
        return Response.json(result ?? { ok: true });
      } catch (err) {
        if (err instanceof SendMessageError) {
          return Response.json({ error: err.message, code: err.code }, { status: err.status });
        }
        console.error('[api]', err);
        return Response.json({ error: String((err as Error)?.message ?? err), code: 'internal' }, { status: 500 });
      }
    }
  }
  return Response.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
}

export { detectCustomerRequest, aiSenderId };
