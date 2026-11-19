import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { rm, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { auditSqlite, migrationHistory } from '../../scripts/database-catalog.mjs';

const file = execFileSync(process.execPath, ['tests/fixtures/init-sqlite.mjs'], {encoding:'utf8'}).trim();
const env = {...process.env, DATABASE_URL:`file:${file}`, NODE_ENV:'test'};
const db = new DatabaseSync(file);
const prefix = join(dirname(file), 'verified');
let recovery;
try {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
  db.prepare('INSERT INTO User(id,email,name,updatedAt) VALUES(?,?,?,CURRENT_TIMESTAMP)').run('wal-keeper','phase5@example.invalid','Backup fixture');
  assert((await stat(file + '-wal')).size > 0);
  const before = auditSqlite(file);
  const refused = spawnSync(process.execPath, ['scripts/release-backup.mjs',prefix], {env:{...env,NODE_ENV:'production'}, encoding:'utf8'});
  assert.equal(refused.status, 1);
  execFileSync(process.execPath, ['scripts/release-backup.mjs',prefix], {env, stdio:'inherit'});
  const artifact = `${prefix}.sqlite`;
  assert.equal((await stat(artifact)).mode & 0o777, 0o600);
  const output = execFileSync(process.execPath, ['--import','tsx','scripts/restore-db.ts',artifact], {env,encoding:'utf8'});
  recovery = output.trim().split('isolated file: ')[1];
  assert(recovery && recovery !== file);
  const report = auditSqlite(recovery);
  assert.equal(report.schemaDigest, before.schemaDigest);
  assert.deepEqual(report.counts,before.counts);
  assert.deepEqual(report.fks,before.fks);
  assert.deepEqual(report.indexes,before.indexes);
  assert(report.integrityOk && report.invalidFKs === 0);
  const recovered = new DatabaseSync(recovery, {readOnly:true});
  try { assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM User WHERE id=?').get('wal-keeper').n, 1); }
  finally { recovered.close(); }
  const overwrite = spawnSync(process.execPath,['scripts/release-backup.mjs',prefix],{env,encoding:'utf8'});
  assert.equal(overwrite.status,1);
  assert.equal(migrationHistory('sqlite', report.migrations).present, false);
  const expected = migrationHistory('sqlite', null).expected;
  const ledger = Object.entries(expected).map(([migration_name,checksum]) => ({migration_name,checksum,finished:1,rolled_back:0}));
  assert.deepEqual(migrationHistory('sqlite',ledger).pending,[]);
  assert.deepEqual(migrationHistory('sqlite',[{...ledger[0],checksum:'changed'},...ledger.slice(1)]).checksumMismatches,[ledger[0].migration_name]);
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec("INSERT INTO StaffSession(id,accountId,tokenHash,expiresAt) VALUES('orphan','does-not-exist','orphan',CURRENT_TIMESTAMP)");
  assert.equal(auditSqlite(file).invalidFKs,1);
  const invalid = spawnSync(process.execPath,['scripts/release-backup.mjs',prefix+'-invalid'],{env,encoding:'utf8'});
  assert.equal(invalid.status,1);
  console.log(`Online SQLite WAL backup restored and verified ${report.tables.length} tables with counts and matching indexes and foreign keys.`);
} finally { db.close(); if (recovery) await rm(dirname(recovery),{recursive:true,force:true}); await rm(dirname(file),{recursive:true,force:true}); }
