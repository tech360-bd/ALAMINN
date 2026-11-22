/**
 * Connection leak detection tests for SQLite.
 * Repeatedly opens, uses, and closes database operations to verify
 * resources are released after successful and failed operations.
 *
 * Runs only against disposable databases in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeDisposableDb() {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-leak-'));
  const file = join(dir, 'test.sqlite');
  return { dir, file };
}

function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL;');
  return db;
}

describe('connection leak detection (disposable SQLite)', () => {
  let dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {};
    }
    dirs = [];
  });

  it('releases resources after successful operations', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);');

    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      const tmp = openDb(file);
      tmp.prepare('INSERT INTO t (v) VALUES (?)').run(`val-${i}`);
      const row = tmp.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
      expect(row.n).toBe(i + 1);
      tmp.close();
    }

    // All connections closed — verify DB still accessible and not corrupted
    const verify = openDb(file);
    const count = verify.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
    expect(count.n).toBe(iterations);
    const integrity = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');
    verify.close();
    db.close();
  });

  it('releases resources after failed operations', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT UNIQUE);');
    db.exec("INSERT INTO t (v) VALUES ('existing');");

    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
      const tmp = openDb(file);
      try {
        // This will fail on duplicate 'existing'
        tmp.prepare('INSERT INTO t (v) VALUES (?)').run('existing');
      } catch {
        // Expected — constraint violation
      }
      tmp.close();
    }

    // Verify no leak — DB still works and has exactly 1 row
    const verify = openDb(file);
    const count = verify.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
    expect(count.n).toBe(1);
    const integrity = verify.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');
    verify.close();
    db.close();
  });

  it('no connection limit exhaustion under rapid open/close', async () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = openDb(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY);');

    const iterations = 200;
    let failures = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        const tmp = openDb(file);
        tmp.prepare('INSERT INTO t DEFAULT VALUES').run();
        tmp.close();
      } catch {
        failures++;
      }
    }

    expect(failures).toBe(0);

    const verify = openDb(file);
    const count = verify.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
    expect(count.n).toBe(iterations);
    verify.close();
    db.close();
  });
});
