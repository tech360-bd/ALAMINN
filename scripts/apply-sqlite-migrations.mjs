/**
 * Apply Prisma sqlite migrations to the local SQLite database using the
 * built-in `node:sqlite` driver (offline-safe: no Prisma CLI engine
 * download from binaries.prisma.sh required).
 *
 * Also creates and maintains the `_prisma_migrations` ledger so the
 * database carries a reproducible migration history.
 *
 * Idempotent: migrations already recorded as finished are skipped.
 * Migrations whose tables already exist but are not yet recorded in the
 * ledger are recorded as applied without re-running their SQL.
 *
 * Usage: node scripts/apply-sqlite-migrations.mjs [db-path]
 * Defaults to db/custom.db resolved from the workspace root.
 */
import { DatabaseSync as Database } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const dbPath = process.argv[2] || path.join(root, 'db', 'custom.db');
const migDir = path.join(root, 'prisma', 'migrations', 'sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const dirs = fs
  .readdirSync(migDir)
  .filter((d) => fs.statSync(path.join(migDir, d)).isDirectory())
  .sort();

console.log(`Applying ${dirs.length} sqlite migrations -> ${dbPath}`);

const db = new Database(dbPath);
db.exec('PRAGMA journal_mode=WAL;');

// Create the Prisma migration ledger if it does not exist.
// Matches Prisma's _prisma_migrations schema for SQLite.
db.exec(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`);

const cryptoHash = (sql) => createHash('sha256').update(sql).digest('hex');

// Extract CREATE TABLE table names from a migration SQL file.
const tablesInMigration = (sql) => {
  const names = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  let m;
  while ((m = re.exec(sql))) names.push(m[1]);
  return names;
};

// Check whether every table created by a migration already exists.
const tablesExist = (tableNames) => {
  for (const name of tableNames) {
    const row = db
      .prepare(
        'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
      )
      .get('table', name);
    if (!row) return false;
  }
  return true;
};

let applied = 0;
let skipped = 0;
let already = 0;

for (const dir of dirs) {
  const sqlPath = path.join(migDir, dir, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const checksum = cryptoHash(sql);

  // Skip if this migration is already recorded as finished.
  const existing = db
    .prepare(
      'SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ? AND rolled_back_at IS NULL',
    )
    .get(dir);

  if (existing && existing.finished_at) {
    console.log(`  [skipped] ${dir} (already applied)`);
    already++;
    continue;
  }

  // If a previous unfinished attempt exists, roll it back first.
  db.prepare(
    'UPDATE "_prisma_migrations" SET rolled_back_at = CURRENT_TIMESTAMP WHERE migration_name = ? AND rolled_back_at IS NULL',
  ).run(dir);

  const id = `${dir}-${checksum.slice(0, 12)}`;
  const createdTables = tablesInMigration(sql);
  const allTablesExist = createdTables.length > 0 && tablesExist(createdTables);

  try {
    db.exec('BEGIN');
    if (!allTablesExist) {
      // Only run SQL when the tables do not already exist.
      db.exec(sql);
    }
    db.prepare(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1)`,
    ).run(id, checksum, dir);
    db.exec('COMMIT');
    if (allTablesExist) {
      console.log(`  [recorded] ${dir} (tables already present)`);
    } else {
      console.log(`  [applied] ${dir}`);
    }
    applied++;
  } catch (err) {
    const msg = err.message;
    // If the failure is only "already exists" / "duplicate column", the
    // schema change is already in place — record it as applied.
    const isAlreadyExists =
      msg.includes('already exists') ||
      msg.includes('duplicate column') ||
      msg.includes('duplicate table');
    try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
    if (isAlreadyExists) {
      try {
        db.exec('BEGIN');
        db.prepare(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1)`,
        ).run(id, checksum, dir);
        db.exec('COMMIT');
        console.log(`  [recorded] ${dir} (schema already present)`);
        applied++;
      } catch (insertErr) {
        try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
        console.error(`  [FAILED] ${dir}: ${insertErr.message}`);
        skipped++;
      }
    } else {
      console.error(`  [FAILED] ${dir}: ${msg}`);
      skipped++;
    }
  }
}

db.close();
console.log(`Done: ${applied} recorded/applied, ${already} already present, ${skipped} failed.`);
