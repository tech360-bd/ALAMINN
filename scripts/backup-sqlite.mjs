/**
 * scripts/backup-sqlite.mjs — Safe SQLite backup using `VACUUM INTO`
 *
 * Replaces deploy/backup-sqlite.sh which requires the sqlite3 CLI (not
 * available in all environments). Uses SQLite's `VACUUM INTO` command for
 * a consistent, point-in-time snapshot into a standalone file.
 *
 * Usage:
 *   node scripts/backup-sqlite.mjs [--destination <path>] [--compress]
 *
 * Defaults:
 *   Source:      $DATABASE_URL (file: path) or db/custom.db
 *   Destination: ./backups/
 *
 * Safety:
 *   - Uses SQLite's built-in VACUUM INTO (consistent snapshot, no long write lock)
 *   - Never copies the live database file directly
 *   - Verifies integrity and foreign keys after backup
 *   - Optional gzip compression
 */
import fs from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync as Database } from 'node:sqlite';

const root = process.cwd();
const sourceUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
const sourcePath = sourceUrl.startsWith('file:') ? sourceUrl.slice(5) : path.join(root, 'db', 'custom.db');
const absSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(root, sourcePath);

let dest = './backups';
let compress = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--destination' && args[i + 1]) { dest = args[++i]; }
  else if (args[i] === '--compress') { compress = true; }
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node scripts/backup-sqlite.mjs [--destination <path>] [--compress]');
    process.exit(0);
  }
}

fs.mkdirSync(dest, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const baseName = `alaminn-info-backup-${timestamp}.sqlite`;
const tempFile = path.join(dest, baseName);

console.log('===== SQLite Backup (VACUUM INTO) =====');
console.log('Source:      ' + absSource);
console.log('Destination: ' + dest);
console.log('Compress:    ' + compress);

if (!fs.existsSync(absSource)) {
  console.error('❌ Database not found: ' + absSource);
  process.exit(1);
}

// Create consistent backup using SQLite's VACUUM INTO command
const source = new Database(absSource, { readOnly: true });
try {
  source.exec(`VACUUM INTO '${tempFile.replace(/'/g, "''")}'`);
} finally {
  source.close();
}

if (!fs.existsSync(tempFile)) {
  console.error('❌ Backup file not created: ' + tempFile);
  process.exit(1);
}

// Verify backup integrity and foreign keys on a fresh read-only handle
const verify = new Database(tempFile, { readOnly: true });
try {
  const integrity = verify.prepare('PRAGMA integrity_check').all();
  const invalidFKs = verify.prepare('PRAGMA foreign_key_check').all().length;
  const tables = verify.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().length;
  console.log('✅ Integrity check: ' + integrity[0].integrity_check);
  console.log('✅ Invalid foreign keys: ' + invalidFKs);
  console.log('✅ Tables in backup: ' + tables);
  if (integrity[0].integrity_check !== 'ok' || invalidFKs > 0) {
    console.error('❌ Backup verification failed');
    process.exit(1);
  }
} finally {
  verify.close();
}

let backupFile = tempFile;
if (compress) {
  const gzFile = tempFile + '.gz';
  await pipeline(createReadStream(tempFile), createGzip(), createWriteStream(gzFile));
  fs.unlinkSync(tempFile);
  backupFile = gzFile;
}

const size = fs.statSync(backupFile).size;
console.log('✅ Backup complete:');
console.log('  File: ' + backupFile);
console.log('  Size: ' + (size / 1024 / 1024).toFixed(2) + ' MB');
console.log('  Timestamp: ' + new Date().toISOString());
