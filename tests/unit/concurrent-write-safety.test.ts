/**
 * Concurrent write safety tests for SQLite using disposable databases.
 * Tests simultaneous transactions, locking, busy timeout, rollback behavior,
 * and verifies no lost updates or corrupted records.
 *
 * Runs only against disposable databases in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, rm, writeFile } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeDisposableDb() {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-concurrent-'));
  const file = join(dir, 'test.sqlite');
  return { dir, file };
}

function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA busy_timeout=5000;');
  return db;
}

describe('concurrent write safety (disposable SQLite)', () => {
  let dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {};
    }
    dirs = [];
  });

  it('handles simultaneous writes with WAL and busy_timeout', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec(`
      CREATE TABLE counter (id TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE log (id TEXT PRIMARY KEY, worker TEXT NOT NULL, ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO counter VALUES ('main', 0);
    `);
    db.close();

    const workers = 8;
    const incrementsPerWorker = 50;
    const results = await Promise.all(
      Array.from({ length: workers }, (_, i) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const workerDb = openDb(file);
          try {
            for (let j = 0; j < incrementsPerWorker; j++) {
              workerDb.exec('BEGIN IMMEDIATE;');
              const row = workerDb
                .prepare('SELECT value FROM counter WHERE id = ?')
                .get('main') as { value: number };
              workerDb
                .prepare('UPDATE counter SET value = ? WHERE id = ?')
                .run(row.value + 1, 'main');
              workerDb
                .prepare('INSERT INTO log VALUES (?, ?, CURRENT_TIMESTAMP)')
                .run(`${i}-${j}`, `worker-${i}`);
              workerDb.exec('COMMIT;');
            }
            resolve({ ok: true });
          } catch (e) {
            resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
          } finally {
            workerDb.close();
          }
        }),
      ),
    );

    const failures = results.filter((r) => !r.ok);
    expect(failures).toHaveLength(0);

    const verify = openDb(file);
    const final = verify
      .prepare('SELECT value FROM counter WHERE id = ?')
      .get('main') as { value: number };
    const logCount = verify
      .prepare('SELECT COUNT(*) AS n FROM log')
      .get() as { n: number };
    expect(final.value).toBe(workers * incrementsPerWorker);
    expect(logCount.n).toBe(workers * incrementsPerWorker);
    verify.close();
  });

  it('rollback removes all partial changes', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec(`
      CREATE TABLE account (id TEXT PRIMARY KEY, balance INTEGER NOT NULL);
      INSERT INTO account VALUES ('a', 1000), ('b', 1000);
    `);
    db.close();

    const workerDb = openDb(file);
    let threw = false;
    try {
      workerDb.exec('BEGIN;');
      workerDb
        .prepare('UPDATE account SET balance = balance - 500 WHERE id = ?')
        .run('a');
      workerDb
        .prepare('UPDATE account SET balance = balance + 500 WHERE id = ?')
        .run('b');
      // Simulate failure mid-transaction
      throw new Error('simulated failure');
    } catch {
      threw = true;
      try { workerDb.exec('ROLLBACK;'); } catch {}
    }
    expect(threw).toBe(true);

    const verify = openDb(file);
    const a = verify
      .prepare('SELECT balance FROM account WHERE id = ?')
      .get('a') as { balance: number };
    const b = verify
      .prepare('SELECT balance FROM account WHERE id = ?')
      .get('b') as { balance: number };
    expect(a.balance).toBe(1000);
    expect(b.balance).toBe(1000);
    workerDb.close();
    verify.close();
  });

  it('busy timeout prevents immediate failure under contention', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec(`
      CREATE TABLE lock_test (id TEXT PRIMARY KEY, held_by TEXT NOT NULL);
      INSERT INTO lock_test VALUES ('lock1', '');
    `);
    db.close();

    // Hold a long write lock
    const holder = openDb(file);
    holder.exec('BEGIN IMMEDIATE;');
    holder
      .prepare("UPDATE lock_test SET held_by = 'holder' WHERE id = ?")
      .run('lock1');

    // Another worker should wait (busy_timeout) rather than immediately fail
    const waiter = openDb(file);
    const start = Date.now();
    let result: { ok: boolean; error?: string };
    try {
      waiter.exec('BEGIN IMMEDIATE;');
      waiter.exec('COMMIT;');
      result = { ok: true };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const elapsed = Date.now() - start;

    holder.exec('COMMIT;');
    holder.close();
    waiter.close();

    // Either it succeeded after waiting, or it waited at least some time before failing
    expect(result.ok || elapsed > 100).toBe(true);

    const verify = openDb(file);
    const row = verify
      .prepare("SELECT held_by FROM lock_test WHERE id = ?")
      .get('lock1') as { held_by: string };
    expect(row.held_by).toBe('holder');
    verify.close();
  });
});
