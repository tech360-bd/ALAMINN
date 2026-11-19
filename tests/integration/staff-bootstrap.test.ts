import { execFile, execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

it('permits exactly one concurrent operator bootstrap and records its audit entry', async () => {
  const file = execFileSync(process.execPath, ['tests/fixtures/init-sqlite.mjs'], { encoding: 'utf8' }).trim();
  const bootstrap = (email: string) => new Promise<boolean>((resolve) => {
    execFile(process.execPath, ['--import', 'tsx', 'scripts/bootstrap-staff.ts'], {
      env: { ...process.env, DATABASE_URL: `file:${file}`, STAFF_BOOTSTRAP_EMAIL: email,
        STAFF_BOOTSTRAP_NAME: 'Initial operator', STAFF_BOOTSTRAP_PASSWORD: 'Integration-only-password-51!' },
      timeout: 12_000,
    }, (error) => resolve(!error));
  });
  try {
    const attempts = await Promise.all([bootstrap('first@example.invalid'), bootstrap('second@example.invalid')]);
    expect(attempts.sort()).toEqual([false, true]);
    expect(await bootstrap('third@example.invalid')).toBe(false);
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const account = db.prepare('SELECT id, role FROM StaffAccount').all();
      expect(account).toEqual([{ id: 'staff-bootstrap-admin', role: 'ADMIN' }]);
      expect(db.prepare('SELECT entityId FROM UciAuditLog WHERE action=?').all('auth.bootstrap_admin')).toEqual([{ entityId: 'staff-bootstrap-admin' }]);
    } finally { db.close(); }
  } finally { await rm(dirname(file), { recursive: true, force: true }); }
}, 25_000);
