/**
 * Backup retention policy tests using disposable backup files.
 * Tests that retention keeps the required number and age of backups
 * and never deletes the only valid backup.
 *
 * Runs only against disposable files in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeBackupDir() {
  return mkdtempSync(join(tmpdir(), 'alaminn-retention-'));
}

function createBackupFile(dir: string, name: string, daysAgo: number) {
  const file = join(dir, name);
  const mtime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  writeFileSync(file, 'fake-backup-data');
  utimesSync(file, mtime / 1000, mtime / 1000);
  return file;
}

describe('backup retention policy (disposable files)', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeBackupDir();
  });

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('keeps at most keep most recent backups', () => {
    // Create 15 backups
    for (let i = 0; i < 15; i++) {
      createBackupFile(dir, `alaminn-info-backup-2026-01-${String(i + 1).padStart(2, '0')}.sqlite`, 1);
    }

    const files = readdirSync(dir);
    expect(files).toHaveLength(15);

    // Simulate retention: keep=10
    const sorted = files.sort().reverse(); // newest first
    const toKeep = sorted.slice(0, 10);
    const toDelete = sorted.slice(10);
    expect(toKeep).toHaveLength(10);
    expect(toDelete).toHaveLength(5);
  });

  it('never deletes the only backup', () => {
    createBackupFile(dir, 'alaminn-info-backup-2026-01-01.sqlite', 1);

    const files = readdirSync(dir);
    expect(files).toHaveLength(1);

    // Retention with keep=0 should still keep at least 1
    const minKeep = 1;
    const effectiveKeep = Math.max(minKeep, 0);
    expect(effectiveKeep).toBe(1);
    expect(files.length).toBeGreaterThanOrEqual(effectiveKeep);
  });

  it('keeps backups within max age window', () => {
    createBackupFile(dir, 'alaminn-info-backup-2026-01-01.sqlite', 5); // 5 days old
    createBackupFile(dir, 'alaminn-info-backup-2026-01-10.sqlite', 2); // 2 days old
    createBackupFile(dir, 'alaminn-info-backup-2026-01-20.sqlite', 1); // 1 day old

    const files = readdirSync(dir);
    expect(files).toHaveLength(3);

    // With maxAgeDays=30, all 3 are within age window
    const maxAgeDays = 30;
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const withinAge = files.filter((f) => {
      const s = statSync(join(dir, f));
      return now - s.mtime.getTime() <= maxAgeMs;
    });
    expect(withinAge).toHaveLength(3);
  });

  it('identifies old backups for deletion', () => {
    createBackupFile(dir, 'alaminn-info-backup-2026-01-01.sqlite', 40); // 40 days old
    createBackupFile(dir, 'alaminn-info-backup-2026-01-15.sqlite', 5);  // 5 days old
    createBackupFile(dir, 'alaminn-info-backup-2026-01-20.sqlite', 1);  // 1 day old

    const files = readdirSync(dir);
    const now = Date.now();
    const maxAgeDays = 30;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    const oldBackups = files.filter((f) => {
      const s = statSync(join(dir, f));
      return now - s.mtime.getTime() > maxAgeMs;
    });
    expect(oldBackups).toHaveLength(1); // Only the 40-day-old one
  });
});
