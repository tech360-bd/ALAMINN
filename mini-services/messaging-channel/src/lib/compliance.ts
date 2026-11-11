/**
 * Compliance control plane — stays inside the program (merge-plan risk R7:
 * consent, suppression and calling hours are NEVER delegated to a vendor).
 *
 * Enforcement surface used by the messaging engine:
 *   - suppression list (channel chat / all)
 *   - marketing consent (granted, not revoked, purpose = marketing)
 *   - tenant messaging window in the tenant's own timezone, applied to
 *     PROACTIVE agent outbound only; replies within an active customer
 *     session are always allowed
 *   - audit trail for every enforcement decision
 */
import { db } from '../db';
import { config } from '../config';

export interface RecipientContext {
  recipientRefs: string[]; // external refs of customer recipients (may be their user ids when externalRef is unset)
  recipientUserIds: string[];
}

export type Violation =
  | { kind: 'suppressed'; value: string }
  | { kind: 'consent_missing'; subjectRef: string }
  | { kind: 'hours_violation'; localHour: number; window: [number, number] }
  | { kind: 'sender_banned' };

/** Local hour (0-23) in the tenant's timezone at the given instant. */
export function tenantLocalHour(tz: string, at: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
    const h = parseInt(fmt.format(at), 10);
    return Number.isFinite(h) ? h % 24 : at.getUTCHours();
  } catch {
    return at.getUTCHours();
  }
}

function hourInWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true; // 24/7
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // window crosses midnight
}

export async function checkSuppression(tenantId: string, refs: string[]): Promise<Violation | null> {
  if (refs.length === 0) return null;
  const entries = await db.suppressEntry.findMany({
    where: { tenantId, channel: { in: ['chat', 'all'] }, value: { in: refs } },
  });
  if (entries.length > 0) return { kind: 'suppressed', value: entries[0].value };
  return null;
}

export async function checkMarketingConsent(tenantId: string, refs: string[]): Promise<Violation | null> {
  if (refs.length === 0) return null;
  const consents = await db.consent.findMany({
    where: { tenantId, subjectRef: { in: refs }, channel: 'chat', purpose: 'marketing' },
  });
  const ok = new Set(consents.filter((c) => c.grantedAt && !c.revokedAt).map((c) => c.subjectRef));
  for (const ref of refs) {
    if (!ok.has(ref)) return { kind: 'consent_missing', subjectRef: ref };
  }
  return null;
}

export async function checkMessagingHours(
  tenantId: string,
  conversationId: string,
  senderRole: string,
): Promise<Violation | null> {
  if (senderRole === 'ai' || senderRole === 'customer') return null;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;

  // Proactive = no inbound customer activity inside the session window.
  const since = new Date(Date.now() - config.compliance.proactiveSessionMinutes * 60_000);
  const recentInbound = await db.message.count({
    where: {
      conversationId,
      hidden: false,
      createdAt: { gte: since },
      sender: { tenantId, role: 'customer' },
    },
  });
  if (recentInbound > 0) return null; // reply inside an active session

  const hour = tenantLocalHour(tenant.timezone);
  if (!hourInWindow(hour, tenant.messagingStart, tenant.messagingEnd)) {
    return { kind: 'hours_violation', localHour: hour, window: [tenant.messagingStart, tenant.messagingEnd] };
  }
  return null;
}

export async function audit(tenantId: string, type: string, detail: Record<string, unknown>, actorId?: string) {
  await db.auditEvent.create({
    data: {
      tenantId,
      type,
      actorId: actorId ?? null,
      subjectType: (detail.subjectType as string) ?? null,
      subjectId: (detail.subjectId as string) ?? null,
      detail: JSON.stringify(detail),
    },
  });
}

export function violationReason(v: Violation): string {
  switch (v.kind) {
    case 'suppressed':
      return `Recipient ${v.value} is on the chat suppression list`;
    case 'consent_missing':
      return `No granted marketing consent (chat) for ${v.subjectRef}`;
    case 'hours_violation':
      return `Outside tenant messaging window ${v.window[0]}:00–${v.window[1]}:00 (local hour ${v.localHour}) and no active customer session`;
    case 'sender_banned':
      return 'Sender is banned';
  }
}
