/**
 * Scheduler: dispatches scheduled messages when due (catalogue: "Scheduled
 * messages"), expires disappearing messages (catalogue: "Disappearing
 * messages") and clears burned-out conversations (catalogue: "Burnout").
 */
import { db } from '../db';
import { config } from '../config';
import { dispatchMessage } from './engine';
import { emitToConversation } from './realtime';

async function dispatchScheduled(): Promise<void> {
  const due = await db.message.findMany({
    where: { sentAt: null, scheduledFor: { lte: new Date() } },
    select: { id: true },
  });
  for (const m of due) {
    await db.message.update({ where: { id: m.id }, data: { sentAt: new Date() } });
    try {
      await dispatchMessage(m.id);
    } catch (err) {
      console.error('[scheduler] dispatch failed', m.id, err);
    }
  }
}

async function expireDisappearing(): Promise<void> {
  const expired = await db.message.findMany({
    where: { hidden: false, expiresAt: { lte: new Date() } },
    select: { id: true, conversationId: true },
  });
  for (const m of expired) {
    await db.message.delete({ where: { id: m.id } });
    emitToConversation(m.conversationId, 'message:expired', { messageId: m.id, conversationId: m.conversationId });
  }
}

async function applyBurnout(): Promise<void> {
  const due = await db.conversation.findMany({
    where: { burnoutAfter: { lte: new Date() } },
    select: { id: true, tenantId: true },
  });
  for (const c of due) {
    await db.message.deleteMany({ where: { conversationId: c.id } });
    await db.conversation.update({ where: { id: c.id }, data: { burnoutAfter: null } });
    emitToConversation(c.id, 'conversation:burnout', { conversationId: c.id });
  }
}

export function startScheduler(): void {
  const tick = async () => {
    try {
      await dispatchScheduled();
      await expireDisappearing();
      await applyBurnout();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    }
  };
  setInterval(tick, config.schedulerIntervalMs);
  console.log(`[scheduler] started, interval=${config.schedulerIntervalMs}ms`);
}
