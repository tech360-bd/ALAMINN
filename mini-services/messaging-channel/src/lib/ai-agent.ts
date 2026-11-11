/**
 * AI chat agent (catalogue: "Chatbot") wired to the messaging channel via
 * the MessagingChannel.onInbound adapter subscription — the AI runtime never
 * touches transport internals.
 *
 * Language policy: reply in the customer's own language — Bengali, English
 * or Banglish (Bengali in Latin script). Identity comes from tenant config
 * only; nothing is hard-coded.
 *
 * Human handoff triggers (program master prompt, 7 conditions) implemented
 * here where a chat runtime can observe them:
 *   customer_request   — customer explicitly asks for a human
 *   negative_sentiment — LLM-judged strong negative sentiment
 *   low_confidence     — LLM signals it cannot answer reliably
 *   manual             — raised by agents from the console
 * (vip / compliance / repeated_failure are raised by the voice/CRM side.)
 */
import { db } from '../db';
import { config } from '../config';
import { adapters } from '../adapters/registry';
import { audit } from './compliance';

export const HANDOFF_TRIGGERS = [
  'customer_request',
  'low_confidence',
  'negative_sentiment',
  'repeated_failure',
  'vip',
  'compliance',
  'manual',
] as const;

const HUMAN_KEYWORDS = [
  // en
  'human', 'agent', 'representative', 'real person', 'talk to someone', 'manager',
  // bn
  'মানুষ', 'এজেন্ট', 'কর্মকর্তা', 'ম্যানেজার', 'প্রতিনিধি',
  // banglish (transliterated)
  'manush', 'manusher sathe', 'kotha bola', 'ejent', 'onumoto', 'maneger',
];

export function detectCustomerRequest(text: string): boolean {
  const t = text.toLowerCase();
  return HUMAN_KEYWORDS.some((k) => t.includes(k));
}

interface AiDecision {
  reply: string;
  handoff: boolean;
  trigger?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

function safeParseJson(raw: string): AiDecision | null {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AiDecision>;
    if (typeof parsed.reply !== 'string') return null;
    return {
      reply: parsed.reply,
      handoff: Boolean(parsed.handoff),
      trigger: HANDOFF_TRIGGERS.includes(parsed.trigger as never) ? parsed.trigger : undefined,
      sentiment: parsed.sentiment,
    };
  } catch {
    return null;
  }
}

export async function raiseHandoff(
  tenantId: string,
  conversationId: string,
  trigger: (typeof HANDOFF_TRIGGERS)[number],
  detail: string,
): Promise<void> {
  const handoff = await db.handoffEvent.create({
    data: { tenantId, conversationId, trigger, detail: detail.slice(0, 500) },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { status: 'needs_human' } });
  await adapters.console.publishHandoff({
    tenantId,
    conversationId,
    handoffId: handoff.id,
    trigger,
    detail: handoff.detail ?? undefined,
    createdAt: handoff.createdAt,
  });
  await audit(tenantId, 'handoff.raised', { subjectType: 'handoff', subjectId: handoff.id, trigger }, undefined);
}

export async function generateAiReply(messageId: string): Promise<void> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: {
      sender: true,
      conversation: { include: { tenant: true, participants: { include: { user: true } } } },
    },
  });
  if (!message?.sender || !message.conversation || !message.conversation.tenant) return;
  const tenant = message.conversation.tenant;
  if (!tenant.aiAutoReply || !message.conversation.aiMode) return;
  if (message.conversation.status === 'needs_human') return; // humans own it now

  const history = await db.message.findMany({
    where: { conversationId: message.conversationId, hidden: false, sentAt: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: config.ai.maxHistoryMessages,
    include: { sender: { select: { displayName: true, role: true } } },
  });

  const agentName = `AI assistant of ${tenant.name}`;
  const transcript = history
    .reverse()
    .map((m) => `${m.sender?.role ?? 'system'} ${m.sender?.displayName ?? ''}: ${m.body}`)
    .join('\n');

  const systemPrompt =
    `You are "${agentName}" for the "${tenant.name}" customer conversation workspace. ` +
    `Supported languages: ${tenant.languages}. ALWAYS reply in the language the customer last used: ` +
    `Bengali, English, or Banglish (Bengali written in Latin letters). ` +
    `Be concise, factual and helpful. Never invent prices, dates or commitments. ` +
    `If the customer asks for a human, or the question is beyond your knowledge, or the sentiment is ` +
    `strongly negative, set handoff=true. ` +
    `Respond with STRICT JSON only: {"reply": string, "handoff": boolean, ` +
    `"trigger": "customer_request"|"low_confidence"|"negative_sentiment"|null, ` +
    `"sentiment": "positive"|"neutral"|"negative"}`;

  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: `Conversation transcript:\n${transcript}\n\nProduce the JSON decision now.` },
      ],
      thinking: { type: 'disabled' },
    });
    const decision = safeParseJson(completion.choices[0]?.message?.content ?? '');
    if (!decision) {
      await audit(tenant.id, 'ai.parse_error', { subjectType: 'message', subjectId: messageId });
      return;
    }

    if (decision.reply.trim()) {
      // AI reply goes through the same engine path as any other message,
      // so moderation and compliance apply to it identically.
      await adapters.messaging.send({
        tenantId: tenant.id,
        conversationId: message.conversationId,
        senderId: await aiSenderId(tenant.id),
        body: decision.reply.trim(),
        type: 'text',
      });
    }

    const keywordRequest = detectCustomerRequest(message.body);
    if (decision.handoff || keywordRequest) {
      const trigger = (keywordRequest ? 'customer_request' : (decision.trigger ?? 'low_confidence')) as Parameters<typeof raiseHandoff>[2];
      await raiseHandoff(tenant.id, message.conversationId, trigger, `AI flagged after message ${message.id}`);
    }
  } catch (err) {
    console.error('[ai-agent] generation failed', err);
    await audit(tenant.id, 'ai.error', {
      subjectType: 'message',
      subjectId: messageId,
      error: String(err).slice(0, 300),
    });
  }
}

/** Lazily provisioned per-tenant AI agent user (role 'ai'). */
export async function aiSenderId(tenantId: string): Promise<string> {
  const existing = await db.messagingUser.findFirst({ where: { tenantId, role: 'ai', displayName: 'AI Assistant' } });
  if (existing) return existing.id;
  const created = await db.messagingUser.create({
    data: { tenantId, displayName: 'AI Assistant', role: 'ai', locale: 'bn' },
  });
  return created.id;
}
