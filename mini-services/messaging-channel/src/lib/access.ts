import { db } from '../db';
import { authenticateStaffToken } from '../../../../src/lib/auth/staff-token-session';
import { SESSION_COOKIE } from '../../../../src/lib/auth/token';
import { can } from '../../../../src/lib/auth/rbac';

export function staffCredential(cookie?: string | null) {
  const prefix = `${SESSION_COOKIE}=`;
  return cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

export async function messagingStaff(cookie?: string | null) {
  const staff = await authenticateStaffToken(db, staffCredential(cookie));
  return staff && can(staff.role, 'umc.use') ? staff : null;
}

export type MessagingStaff = NonNullable<Awaited<ReturnType<typeof messagingStaff>>>;
export const staffRef = (id: string) => `staff:${id}`;

export function tenantActor(staff: MessagingStaff, tenantId: string) {
  return db.messagingUser.findFirst({ where: { tenantId, externalRef: staffRef(staff.accountId), role: { in: ['agent', 'admin'] }, isBanned: false } });
}

export function conversationMember(conversationId: string, userId: string, tenantId: string) {
  return db.conversationParticipant.findFirst({ where: { conversationId, userId, conversation: { tenantId } } });
}
