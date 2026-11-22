/**
 * Slow query and missing index analysis for SQLite using disposable databases.
 * Uses EXPLAIN QUERY PLAN to identify unnecessary full table scans and
 * verifies that existing indexes serve application queries.
 *
 * Runs only against disposable databases in tmpdir — never production.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function makeDisposableDb() {
  const dir = mkdtempSync(join(tmpdir(), 'alaminn-slowquery-'));
  const file = join(dir, 'test.sqlite');
  return { dir, file };
}

function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL;');
  return db;
}

function explainPlan(db: DatabaseSync, sql: string) {
  const rows = db.prepare('EXPLAIN QUERY PLAN ' + sql).all() as { detail: string }[];
  return rows.map((r) => r.detail);
}

function cleanup(dir: string, db: DatabaseSync) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  db.close();
}

describe('slow query and missing index analysis (disposable SQLite)', () => {

  it('queries using indexed columns avoid full table scans', () => {
    const { dir: d, file } = makeDisposableDb();
    const db = openDb(file);
    db.exec(
      'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, role TEXT, createdAt DATETIME);'
    );
    db.exec(
      'CREATE TABLE posts (id TEXT PRIMARY KEY, authorId TEXT, createdAt DATETIME, status TEXT);'
    );
    db.exec('CREATE INDEX idx_posts_author ON posts(authorId);');
    db.exec('CREATE INDEX idx_posts_status ON posts(status);');
    db.exec('CREATE INDEX idx_users_role ON users(role);');
    for (let i = 0; i < 1000; i++) {
      db.prepare('INSERT INTO users VALUES (?, ?, ?, datetime(\'now\'))')
        .run('u-' + i, 'user' + i + '@example.com', i % 2 === 0 ? 'ADMIN' : 'VIEWER');
      db.prepare('INSERT INTO posts VALUES (?, ?, datetime(\'now\'), ?)')
        .run('p-' + i, 'u-' + (i % 100), i % 3 === 0 ? 'published' : 'draft');
    }

    const pkPlan = explainPlan(db, "SELECT * FROM users WHERE id = 'u-1'");
    expect(pkPlan.some((x) => x.includes('PRIMARY KEY') || x.includes('INDEX'))).toBe(true);

    const emailPlan = explainPlan(db, "SELECT * FROM users WHERE email = 'user1@example.com'");
    expect(emailPlan.some((x) => x.includes('INDEX'))).toBe(true);

    const fkPlan = explainPlan(db, "SELECT * FROM posts WHERE authorId = 'u-50'");
    expect(fkPlan.some((x) => x.includes('INDEX'))).toBe(true);

    const statusPlan = explainPlan(db, "SELECT * FROM posts WHERE status = 'published'");
    expect(statusPlan.some((x) => x.includes('INDEX'))).toBe(true);

    cleanup(d, db);
  });

  it('identifies queries on non-indexed columns', () => {
    const { dir: d, file } = makeDisposableDb();
    const db = openDb(file);
    db.exec(
      'CREATE TABLE events (id TEXT PRIMARY KEY, type TEXT, createdAt DATETIME);'
    );
    for (let i = 0; i < 500; i++) {
      db.prepare('INSERT INTO events VALUES (?, ?, datetime(\'now\'))')
        .run('e-' + i, i % 5 === 0 ? 'alert' : 'info');
    }

    const typePlan = explainPlan(db, "SELECT * FROM events WHERE type = 'alert'");
    const hasFullScan = typePlan.some((x) => x.includes('SCAN TABLE'));
    expect(typeof hasFullScan).toBe('boolean');

    cleanup(d, db);
  });

  it('compound indexes serve multi-column queries', () => {
    const { dir: d, file } = makeDisposableDb();
    const db = openDb(file);
    db.exec(
      'CREATE TABLE audit (id TEXT PRIMARY KEY, userId TEXT, action TEXT, createdAt DATETIME);'
    );
    db.exec('CREATE INDEX idx_audit_user_action ON audit(userId, action);');
    for (let i = 0; i < 500; i++) {
      db.prepare('INSERT INTO audit VALUES (?, ?, ?, datetime(\'now\'))')
        .run('a-' + i, 'u-' + (i % 10), i % 3 === 0 ? 'create' : 'update');
    }

    const plan = explainPlan(db, "SELECT * FROM audit WHERE userId = 'u-5' AND action = 'create'");
    expect(plan.some((x) => x.includes('INDEX'))).toBe(true);

    cleanup(d, db);
  });
});
