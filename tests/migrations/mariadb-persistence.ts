import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { createDriverAdapter } from '../../src/lib/prisma-adapter';

const require = createRequire(import.meta.url);
const { getDMMF } = require('@prisma/internals');

/** Expected table count is derived from the schema, never a stale magic number. */
async function expectedTableCount(): Promise<number> {
  const source = readFileSync('prisma/schema.mysql.prisma', 'utf8');
  const dmmf = await getDMMF({ datamodel: source });
  // Guard against accidental schema shrinkage: this platform has carried more
  // than 100 models throughout its audited history.
  assert(dmmf.datamodel.models.length >= 100, 'MySQL schema lost too many models');
  return dmmf.datamodel.models.length;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert(url.protocol === 'mysql:' && url.hostname === '127.0.0.1' && ['/alaminn_ci', '/alaminn_fresh'].includes(url.pathname), 'Disposable MariaDB only');
  const db = new PrismaClient({ adapter: createDriverAdapter() });
  const id = `ci-${randomUUID()}`;
  const rollback = new Error('intentional rollback');
  try {
    const expected = await expectedTableCount();
    const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'`;
    assert.equal(Number(rows[0].count), expected, `MariaDB table count must match ${expected} schema models`);
    if (url.pathname === '/alaminn_ci') {
      const sentinel = await db.staffAccount.findUniqueOrThrow({ where: { id: 'ci-upgrade-keeper' } });
      assert.equal(sentinel.name, 'Upgrade sentinel');
      assert.equal(sentinel.role, 'VIEWER');
    }
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.staffAccount.create({ data: { id, name: 'Migration check', email: `${id}@example.invalid`, role: 'AGENT', passwordHash: 'unused' } });
      await tx.staffSession.create({ data: { accountId: id, tokenHash: id, expiresAt: new Date(Date.now() + 60_000) } });
      assert.equal(await tx.staffSession.count({ where: { accountId: id } }), 1);
      throw rollback;
    }), (error) => error === rollback);
    assert.equal(await db.staffAccount.count({ where: { id } }), 0);
    await assert.rejects(db.staffSession.create({ data: { accountId: id, tokenHash: id, expiresAt: new Date() } }), { code: 'P2003' });
  } finally { await db.$disconnect(); }
  const restarted = new PrismaClient({ adapter: createDriverAdapter() });
  try {
    await restarted.uciRequirementRecord.findFirst({ select: { version: true } });
  } finally { await restarted.$disconnect(); }
  console.log('MariaDB migration, constraints and rollback verified');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
