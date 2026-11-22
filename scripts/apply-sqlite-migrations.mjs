/**
 * Apply Prisma sqlite migrations to the local SQLite database using the
 * built-in `node:sqlite` driver (offline-safe: no Prisma CLI engine
 * download from binaries.prisma.sh required).
 *
 * Usage: node scripts/apply-sqlite-migrations.mjs [db-path]
 * Defaults to db/custom.db resolved from the workspace root.
 */
import { DatabaseSync as Database } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

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

let applied = 0;
let skipped = 0;
for (const dir of dirs) {
  const sqlPath = path.join(migDir, dir, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    db.exec(sql);
    console.log(`  [applied] ${dir}`);
    applied++;
  } catch (err) {
    console.error(`  [FAILED] ${dir}: ${err.message}`);
    skipped++;
  }
}

db.close();
console.log(`Done: ${applied} applied, ${skipped} failed.`);
