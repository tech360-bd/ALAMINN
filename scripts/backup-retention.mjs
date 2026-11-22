/**
 * scripts/backup-retention.mjs — Configurable SQLite backup retention policy
 *
 * Manages backup retention by keeping a configurable number of recent backups
 * and backups within a configurable age window. Never deletes the only valid
 * backup. All operations use disposable/test backup files — never production.
 *
 * Usage:
 *   node scripts/backup-retention.mjs [--directory <path>] [--keep <count>] [--max-age-days <days>] [--dry-run]
 *
 * Defaults:
 *   --directory: ./backups/
 *   --keep: 10 (keep 10 most recent backups)
 *   --max-age-days: 30 (keep backups up to 30 days old)
 *   --dry-run: false (actually perform deletions)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let dest = './backups';
let keep = 10;
let maxAgeDays = 30;
let dryRun = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--directory' && args[i + 1]) { dest = args[++i]; }
  else if (args[i] === '--keep' && args[i + 1]) { keep = parseInt(args[++i], 10); }
  else if (args[i] === '--max-age-days' && args[i + 1]) { maxAgeDays = parseInt(args[++i], 10); }
  else if (args[i] === '--dry-run') { dryRun = true; }
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node scripts/backup-retention.mjs [--directory <path>] [--keep <count>] [--max-age-days <days>] [--dry-run]');
    process.exit(0);
  }
}

const absDest = path.isAbsolute(dest) ? dest : path.join(root, dest);

if (!fs.existsSync(absDest)) {
  console.log(`No backup directory: ${absDest} — nothing to retain.`);
  process.exit(0);
}

const files = fs
  .readdirSync(absDest)
  .filter((f) => f.startsWith('alaminn-info-backup-') && (f.endsWith('.sqlite') || f.endsWith('.sqlite.gz')))
  .map((f) => {
    const fullPath = path.join(absDest, f);
    const stat = fs.statSync(fullPath);
    return { name: f, path: fullPath, mtime: stat.mtime, size: stat.size };
  })
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first

if (files.length === 0) {
  console.log('No backup files found.');
  process.exit(0);
}

const now = Date.now();
const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

// Always keep at least 1 backup (never delete the only valid backup)
const minKeep = 1;
const effectiveKeep = Math.max(minKeep, keep);

const toDelete = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const ageMs = now - f.mtime.getTime();
  const isWithinKeep = i < effectiveKeep;
  const isWithinAge = ageMs <= maxAgeMs;

  // Keep if within keep count OR within age window
  if (!isWithinKeep && !isWithinAge) {
    toDelete.push(f);
  } else {
    console.log(`  KEEP   ${f.name} (age=${Math.floor(ageMs / 86400000)}d, rank=${i + 1})`);
  }
}

// Never delete everything
if (toDelete.length >= files.length) {
  toDelete.splice(0, files.length - minKeep);
  console.log(`  ⚠️  Retention would delete all backups — keeping ${minKeep} most recent.`);
}

console.log(`\nRetention policy: keep=${effectiveKeep}, maxAge=${maxAgeDays}d, dryRun=${dryRun}`);
console.log(`Total backups: ${files.length}, to delete: ${toDelete.length}`);

for (const f of toDelete) {
  if (dryRun) {
    console.log(`  [DRY-RUN] Would delete: ${f.name}`);
  } else {
    fs.unlinkSync(f.path);
    console.log(`  DELETED: ${f.name}`);
  }
}

if (!dryRun && toDelete.length > 0) {
  console.log(`\nRetention complete: ${toDelete.length} backup(s) removed, ${files.length - toDelete.length} remaining.`);
} else if (dryRun) {
  console.log(`\nDry-run complete: ${toDelete.length} backup(s) would be removed.`);
} else {
  console.log('\nNo backups needed deletion.');
}
