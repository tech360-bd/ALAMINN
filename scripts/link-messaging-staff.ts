import { db } from '../src/lib/db';
import { z } from 'zod';

async function main() {
  const ids = z.tuple([z.string().min(1), z.string().min(1), z.email()]);
  const [tenantId, messagingUserId, email] = ids.parse(process.argv.slice(2));
  await db.$transaction(async (tx) => {
    const account = await tx.staffAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!account?.isActive || !['ADMIN', 'AGENT'].includes(account.role)) throw new Error('Staff account is not eligible');
    const user = await tx.messagingUser.findFirst({ where: { id: messagingUserId, tenantId, role: { in: ['admin', 'agent'] }, isBanned: false } });
    if (!user || user.externalRef?.startsWith('staff:')) throw new Error('Messaging identity is not eligible');
    const update = await tx.messagingUser.updateMany({
      where: { id: messagingUserId, tenantId, externalRef: user.externalRef },
      data: { externalRef: `staff:${account.id}`, role: account.role === 'ADMIN' ? 'admin' : 'agent' },
    });
    if (update.count !== 1) throw new Error('Ownership changed concurrently');
    await tx.uciAuditLog.create({ data: { actor: 'operator', action: 'messaging.staff_linked', entity: 'MessagingUser', entityId: messagingUserId, detail: JSON.stringify({ tenantId, accountId: account.id, previousExternalRef: user.externalRef }) } });
  });
  console.log('Messaging identity linked; conversation memberships preserved.');
}
main().catch(() => { console.error('Messaging identity link refused. Check tenant, account, and existing ownership.'); process.exitCode = 1; }).finally(() => db.$disconnect());
