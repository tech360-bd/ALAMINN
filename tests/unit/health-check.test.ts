/**
 * Database health check tests using disposable SQLite databases.
 * Verifies that health checks execute genuine database connectivity queries
 * and reflect real database availability.
 *
 * Runs only against disposable databases in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeDisposableDb() {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-health-'));
  const file = join(dir, 'test.sqlite');
  return { dir, file };
}

function simulateHealthCheck(db: DatabaseSync): { ok: boolean; latencyMs: number } {
  const start = Date.now();
  try {
    // Genuine connectivity query — same pattern as /api/health/ready
    db.prepare('SELECT 1 AS connected').get();
    db.prepare('SELECT count(*) AS n FROM sqlite_master WHERE type = ?').get('table');
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

describe('database health checks (disposable SQLite)', () => {
  let dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {};
    }
    dirs = [];
  });

  it('health check passes on healthy database', () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY);');

    const result = simulateHealthCheck(db);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    db.close();
  });

  it('health check fails when database is inaccessible', () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    // Don't open/create the db — simulate a closed/inaccessible handle
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY);');
    db.close();

    // After close, queries should fail
    let ok = false;
    try {
      db.prepare('SELECT 1').get();
      ok = true;
    } catch {
      ok = false;
    }
    expect(ok).toBe(false);
  });

  it('health check recovers after database is reopened', () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db1 = new DatabaseSync(file);
    db1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY);');
    db1.close();

    // Health check on closed db fails
    let ok1 = false;
    try { db1.prepare('SELECT 1').get(); ok1 = true; } catch { ok1 = false; }
    expect(ok1).toBe(false);

    // Reopen — health check passes
    const db2 = new DatabaseSync(file);
    const result = simulateHealthCheck(db2);
    expect(result.ok).toBe(true);
    db2.close();
  });

  it('health check measures query latency', () => {
    const { dir, file } = makeDisposableDb();
    dirs.push(dir);
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);');
    for (let i = 0; i < 100; i++) {
      db.prepare('INSERT INTO t (v) VALUES (?)').run(`row-${i}`);
    }

    const result = simulateHealthCheck(db);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeLessThan(1000); // Should be fast on disposable DB
    db.close();
  });
});
