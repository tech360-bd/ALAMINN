/**
 * Concurrent database operations tests using disposable SQLite databases.
 * Tests concurrent reads and writes with realistic workloads, verifying
 * transaction consistency and error handling.
 *
 * Runs only against disposable databases in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeDisposableDb() {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-concurrent-ops-'));
  const file = join(dir, 'test.sqlite');
  return { dir, file };
}

function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA busy_timeout=5000;');
  return db;
}

describe('concurrent database operations (disposable SQLite)', () => {
  let dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {};
    }
    dirs = [];
  });

  it('concurrent reads do not block writes', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO items (name) VALUES ('item-0');
    `);
    db.close();

    const readResults: number[] = [];
    const writeErrors: string[] = [];

    // Concurrent readers
    const readers = Array.from({ length: 5 }, (_, i) =>
      new Promise<void>((resolve) => {
        const rdb = openDb(file);
        try {
          for (let j = 0; j < 20; j++) {
            const row = rdb.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number };
            readResults.push(row.n);
          }
          resolve();
        } catch (e) {
          resolve();
        } finally {
          rdb.close();
        }
      }),
    );

    // Concurrent writer
    const writer = new Promise<void>((resolve) => {
      const wdb = openDb(file);
      try {
        for (let j = 0; j < 10; j++) {
          wdb.exec('BEGIN IMMEDIATE;');
          wdb.prepare('INSERT INTO items (name) VALUES (?)').run(`concurrent-${j}`);
          wdb.exec('COMMIT;');
        }
        resolve();
      } catch (e) {
        writeErrors.push(e instanceof Error ? e.message : String(e));
        resolve();
      } finally {
        wdb.close();
      }
    });

    await Promise.all([...readers, writer]);
    expect(writeErrors).toHaveLength(0);

    const verify = openDb(file);
    const count = verify.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number };
    expect(count.n).toBe(11); // 1 initial + 10 written
    verify.close();
  });

  it('transaction consistency under concurrent writes', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec(`
      CREATE TABLE ledger (id INTEGER PRIMARY KEY, account TEXT, amount INTEGER, balance INTEGER);
      INSERT INTO ledger VALUES (1, 'acc-a', 0, 1000), (2, 'acc-b', 0, 1000);
    `);
    db.close();

    const transfers = 20;
    const results = await Promise.all(
      Array.from({ length: transfers }, (_, i) =>
        new Promise<{ ok: boolean }>((resolve) => {
          const tdb = openDb(file);
          try {
            tdb.exec('BEGIN IMMEDIATE;');
            const a = tdb
              .prepare('SELECT balance FROM ledger WHERE account = ?')
              .get('acc-a') as { balance: number };
            const b = tdb
              .prepare('SELECT balance FROM ledger WHERE account = ?')
              .get('acc-b') as { balance: number };
            if (a.balance >= 10) {
              tdb
                .prepare('UPDATE ledger SET balance = balance - 10 WHERE account = ?')
                .run('acc-a');
              tdb
                .prepare('UPDATE ledger SET balance = balance + 10 WHERE account = ?')
                .run('acc-b');
              tdb
                .prepare('INSERT INTO ledger (account, amount, balance) VALUES (?, ?, ?)')
                .run(`transfer-${i}`, 10, a.balance - 10);
              tdb.exec('COMMIT;');
              resolve({ ok: true });
            } else {
              tdb.exec('ROLLBACK;');
              resolve({ ok: true }); // Insufficient funds is a valid outcome
            }
          } catch (e) {
            try { tdb.exec('ROLLBACK;'); } catch {}
            resolve({ ok: false });
          } finally {
            tdb.close();
          }
        }),
      ),
    );

    const failures = results.filter((r) => !r.ok);
    expect(failures).toHaveLength(0);

    const verify = openDb(file);
    const a = verify
      .prepare('SELECT balance FROM ledger WHERE account = ?')
      .get('acc-a') as { balance: number };
    const b = verify
      .prepare('SELECT balance FROM ledger WHERE account = ?')
      .get('acc-b') as { balance: number };
    // Total must be conserved: 2000
    expect(a.balance + b.balance).toBe(2000);
    verify.close();
  });
});
