import { z } from 'zod';
import { db } from '../src/lib/db';
import { approvedSourceUrl } from '../src/lib/uci/source-fetch';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Select the target DATABASE_URL');
  const [key, url, permission] = z.tuple([z.string().min(1).max(191), z.url().max(2048), z.string().trim().min(12).max(2000)]).parse(process.argv.slice(2));
  const approved = approvedSourceUrl(url, new URL(url)).href;
  await db.$transaction(async (tx) => {
    const source = await tx.uciSource.findUniqueOrThrow({ where: { key } });
    if (source.level === 'INTERNAL') throw new Error('Internal evidence is not remotely fetchable');
    const changed = source.url !== approved;
    await tx.uciSource.update({ where: { key }, data: {
      url: approved, identityStatus: 'CONFIRMED', permissionNotes: permission,
      ...(changed ? { lastCheckedAt: null, robotsAllowed: null } : {}),
    } });
    await tx.uciAuditLog.create({ data: {
      actor: 'operator', action: 'SOURCE_APPROVED', entity: 'UciSource', entityId: source.id,
      detail: JSON.stringify({ key, oldUrl: source.url, url: approved, permission }),
    } });
  });
  console.log('Approved source recorded. Every fetch still validates DNS, redirects and robots.txt.');
}
main().catch((error) => { console.error('Source approval refused:', error instanceof z.ZodError ? 'invalid arguments' : (error as Error).name); process.exitCode = 1; }).finally(() => db.$disconnect());
